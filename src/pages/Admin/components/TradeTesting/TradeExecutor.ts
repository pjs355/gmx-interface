import { ethers } from "ethers";
import { 
	EXCHANGE_ADDRESS, 
	FEE_RATE_BPS,
	FEE_RATE_DECIMAL,
	CTF_ADDRESS,
	USDC_ADDRESS,
} from "config/addresses";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { DEFAULT_RPC_URL } from "config/rpc";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import {
	adminErrorMessage,
	formatAdminHttpError,
	ADMIN_TRADE_TEST_FETCH_ORDERS_FAILED,
	ADMIN_TRADE_TEST_MISSING_TOKEN,
} from "@/errors";

// ABIs for balance checking
const USDC_ABI = ["function balanceOf(address) view returns (uint256)"];
const CTF_ABI = ["function balanceOf(address, uint256) view returns (uint256)"];

export interface BalanceSnapshot {
	usdc: number;
	yesTokens: number;
	noTokens: number;
	timestamp: Date;
}

// Order verification from server
export interface OrderMeta {
	orderId: string;
	questionId: string;
	tokenId: string;
	side: "buy" | "sell";
	position?: string;
	price?: number;
	size?: number;
	filled: boolean;
	filledAt: string | null;
	createdAt: string;
	usdcTotalMicro?: number;
	tokenTotalMicro?: number;
}

export interface OrderVerification {
	submittedOrders: Array<{
		orderId: string;
		tradeType: "market" | "limit";
		side: "buy" | "sell";
		position: "yes" | "no";
		expectedAmount: number;
		expectedFee: number;
	}>;
	serverOrders: OrderMeta[];
	matchedOrders: Array<{
		orderId: string;
		filled: boolean;
		filledAt: string | null;
		actualUsdcValue: number | null;
		actualTokenValue: number | null;
	}>;
	filledCount: number;
	pendingCount: number;
	notFoundCount: number;
}

export interface SettlementVerification {
	initialBalances: BalanceSnapshot;
	finalBalances: BalanceSnapshot;
	usdcChange: number;
	yesTokenChange: number;
	noTokenChange: number;
	expectedUsdcChange: number;
	expectedYesTokenChange: number;
	expectedNoTokenChange: number;
	settlementMatches: boolean;
	// Order verification
	orderVerification: OrderVerification | null;
}

export interface TradeTestConfig {
	marketBuyYesCount: number;
	marketBuyNoCount: number;
	marketSellYesCount: number;
	marketSellNoCount: number;
	limitBuyYesCount: number;
	limitBuyNoCount: number;
	limitSellYesCount: number;
	limitSellNoCount: number;
	minTradeAmount: number;
	maxTradeAmount: number;
	delayBetweenTrades: number; // ms
}

export interface TradeResult {
	id: string;
	timestamp: Date;
	tradeType: "market" | "limit";
	side: "buy" | "sell";
	position: "yes" | "no";
	amount: number;
	price: number;
	// Expected values (calculated before execution)
	expectedCost: number;
	expectedReceive: number;
	expectedFee: number;
	expectedContracts: number;
	// Actual values (from server response)
	actualCost: number | null;
	actualReceive: number | null;
	actualFee: number | null;
	actualContracts: number | null;
	// Status
	success: boolean;
	error: string | null;
	orderId: string | null;
	serverResponse: any;
}

interface TestTrade {
	type: "market" | "limit";
	side: "buy" | "sell";
	position: "yes" | "no";
	amount: number;
	price: number;
}

// Fee calculation matching backend exactly
function calculateFeeMatchingBackend(amountInDollars: number): number {
	const amountMicro = Math.floor(amountInDollars * 1_000_000);
	const feeBeforeRounding = Math.floor(amountMicro * 2 / 100);
	const feeRoundedUp = Math.ceil(feeBeforeRounding / 10000) * 10000;
	return feeRoundedUp / 1_000_000;
}

// Sleep helper
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Generate random amount between min and max
function randomAmount(min: number, max: number): number {
	const amount = min + Math.random() * (max - min);
	return Math.round(amount * 100) / 100; // Round to 2 decimals
}

export class TradeExecutor {
	private market: PredictionMarket;
	private account: string;
	private signer: ethers.Signer;
	private getOrderbook: () => OrderbookSnapshot | null;
	private onPhaseChange: (phase: string) => void;
	private onResult: (result: TradeResult) => void;
	private onError: (error: string) => void;
	private accessToken: string | null = null;
	private identityToken: string | null = null;

	// Track our own orders to avoid self-crossing
	private ourLimitOrders: Map<string, { side: "buy" | "sell"; position: "yes" | "no"; price: number }> = new Map();

	// Track submitted orders for verification
	private submittedOrders: Array<{
		orderId: string;
		tradeType: "market" | "limit";
		side: "buy" | "sell";
		position: "yes" | "no";
		expectedAmount: number;
		expectedFee: number;
		timestamp: Date;
	}> = [];

	constructor(
		market: PredictionMarket,
		account: string,
		signer: ethers.Signer,
		getOrderbook: () => OrderbookSnapshot | null,
		onPhaseChange: (phase: string) => void,
		onResult: (result: TradeResult) => void,
		onError: (error: string) => void
	) {
		this.market = market;
		this.account = account;
		this.signer = signer;
		this.getOrderbook = getOrderbook;
		this.onPhaseChange = onPhaseChange;
		this.onResult = onResult;
		this.onError = onError;
	}

	setTokens(accessToken: string | null, identityToken: string | null) {
		this.accessToken = accessToken;
		this.identityToken = identityToken;
	}

	// Callback for settlement verification results
	private onSettlementVerification: ((verification: SettlementVerification) => void) | null = null;

	setSettlementCallback(callback: (verification: SettlementVerification) => void) {
		this.onSettlementVerification = callback;
	}

	// Fetch current balances via RPC
	private async fetchBalances(): Promise<BalanceSnapshot> {
		const provider = new ethers.JsonRpcProvider(DEFAULT_RPC_URL);
		
		const usdcContract = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
		const ctfContract = new ethers.Contract(CTF_ADDRESS, CTF_ABI, provider);

		const yesTokenId = this.market.yesTokenId;
		const noTokenId = this.market.noTokenId;

		console.log(`[TradeExecutor] Fetching balances for account: ${this.account}`);
		console.log(`[TradeExecutor] YES Token ID: ${yesTokenId}`);
		console.log(`[TradeExecutor] NO Token ID: ${noTokenId}`);

		const [usdcBalance, yesBalance, noBalance] = await Promise.all([
			usdcContract.balanceOf(this.account),
			ctfContract.balanceOf(this.account, yesTokenId),
			ctfContract.balanceOf(this.account, noTokenId),
		]);

		const snapshot: BalanceSnapshot = {
			usdc: Number(ethers.formatUnits(usdcBalance, 6)),
			yesTokens: Number(ethers.formatUnits(yesBalance, 6)),
			noTokens: Number(ethers.formatUnits(noBalance, 6)),
			timestamp: new Date(),
		};

		console.log(`[TradeExecutor] Balance Snapshot:`, {
			usdc: `$${snapshot.usdc.toFixed(2)}`,
			yesTokens: snapshot.yesTokens.toFixed(4),
			noTokens: snapshot.noTokens.toFixed(4),
			timestamp: snapshot.timestamp.toLocaleTimeString(),
		});

		return snapshot;
	}

	// Fetch user orders from server API
	private async fetchUserOrdersFromServer(): Promise<OrderMeta[]> {
		const apiUrl = getPredictionApiBaseUrl();
		const endpoint = `${apiUrl}/orders/${this.account}`;
		
		console.log(`[TradeExecutor] Fetching user orders from: ${endpoint}`);

		try {
			const response = await fetch(endpoint, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
				},
			});

			if (!response.ok) {
				throw new Error(
					adminErrorMessage(ADMIN_TRADE_TEST_FETCH_ORDERS_FAILED),
				);
			}

			const responseData = await response.json();
			
			// Handle different response formats
			let rawOrders: OrderMeta[];
			if (Array.isArray(responseData)) {
				rawOrders = responseData;
			} else if (responseData && Array.isArray(responseData.orders)) {
				rawOrders = responseData.orders;
			} else if (responseData && Array.isArray(responseData.data)) {
				rawOrders = responseData.data;
			} else {
				console.warn("[TradeExecutor] Unexpected API response format:", responseData);
				return [];
			}

			console.log(`[TradeExecutor] Fetched ${rawOrders.length} orders from server`);
			return rawOrders;
		} catch (error) {
			console.error("[TradeExecutor] Error fetching orders:", error);
			return [];
		}
	}

	// Verify submitted orders against server order history
	private async verifyOrdersFromServer(): Promise<OrderVerification> {
		console.log(`[TradeExecutor] ========== VERIFYING ORDERS FROM SERVER ==========`);
		console.log(`[TradeExecutor] Submitted ${this.submittedOrders.length} orders to verify`);

		const serverOrders = await this.fetchUserOrdersFromServer();
		
		// Filter server orders to only this market
		const marketId = this.market._id || this.market.questionId || this.market.marketId;
		const marketOrders = serverOrders.filter(o => o.questionId === marketId);
		console.log(`[TradeExecutor] Found ${marketOrders.length} orders for this market`);

		const matchedOrders: OrderVerification["matchedOrders"] = [];
		let filledCount = 0;
		let pendingCount = 0;
		let notFoundCount = 0;

		for (const submitted of this.submittedOrders) {
			const serverOrder = marketOrders.find(o => o.orderId === submitted.orderId);
			
			if (!serverOrder) {
				console.log(`[TradeExecutor] ❌ Order ${submitted.orderId} NOT FOUND on server`);
				notFoundCount++;
				matchedOrders.push({
					orderId: submitted.orderId,
					filled: false,
					filledAt: null,
					actualUsdcValue: null,
					actualTokenValue: null,
				});
			} else {
				const actualUsdcValue = serverOrder.usdcTotalMicro 
					? serverOrder.usdcTotalMicro / 1_000_000 
					: null;
				const actualTokenValue = serverOrder.tokenTotalMicro 
					? serverOrder.tokenTotalMicro / 1_000_000 
					: null;

				if (serverOrder.filled) {
					console.log(`[TradeExecutor] ✅ Order ${submitted.orderId} FILLED`);
					console.log(`    Type: ${submitted.tradeType.toUpperCase()}`);
					console.log(`    Side: ${submitted.side.toUpperCase()}`);
					console.log(`    Position: ${submitted.position.toUpperCase()}`);
					console.log(`    Expected Amount: $${submitted.expectedAmount.toFixed(2)}`);
					console.log(`    Actual USDC: $${actualUsdcValue?.toFixed(2) || 'N/A'}`);
					console.log(`    Actual Tokens: ${actualTokenValue?.toFixed(4) || 'N/A'}`);
					console.log(`    Expected Fee: $${submitted.expectedFee.toFixed(4)}`);
					console.log(`    Filled At: ${serverOrder.filledAt}`);
					filledCount++;
				} else {
					console.log(`[TradeExecutor] ⏳ Order ${submitted.orderId} PENDING (not yet filled)`);
					pendingCount++;
				}

				matchedOrders.push({
					orderId: submitted.orderId,
					filled: serverOrder.filled,
					filledAt: serverOrder.filledAt,
					actualUsdcValue,
					actualTokenValue,
				});
			}
		}

		console.log(`[TradeExecutor] ========== ORDER VERIFICATION SUMMARY ==========`);
		console.log(`  Total Submitted: ${this.submittedOrders.length}`);
		console.log(`  Filled: ${filledCount}`);
		console.log(`  Pending: ${pendingCount}`);
		console.log(`  Not Found: ${notFoundCount}`);
		console.log(`[TradeExecutor] ================================================`);

		return {
			submittedOrders: this.submittedOrders.map(o => ({
				orderId: o.orderId,
				tradeType: o.tradeType,
				side: o.side,
				position: o.position,
				expectedAmount: o.expectedAmount,
				expectedFee: o.expectedFee,
			})),
			serverOrders: marketOrders,
			matchedOrders,
			filledCount,
			pendingCount,
			notFoundCount,
		};
	}

	// Calculate expected balance changes from all trades
	private calculateExpectedChanges(trades: TestTrade[]): { usdc: number; yes: number; no: number } {
		let usdcChange = 0;
		let yesChange = 0;
		let noChange = 0;

		for (const trade of trades) {
			if (trade.side === "buy") {
				// BUY: spend USDC, receive tokens
				const effectiveBudget = trade.amount / (1 + FEE_RATE_DECIMAL);
				const fee = calculateFeeMatchingBackend(effectiveBudget);
				const usdcSpent = effectiveBudget + fee;
				const tokensReceived = effectiveBudget / trade.price;

				usdcChange -= usdcSpent;
				if (trade.position === "yes") {
					yesChange += tokensReceived;
				} else {
					noChange += tokensReceived;
				}
			} else {
				// SELL: give tokens, receive USDC minus fee
				const grossReceive = trade.amount * trade.price;
				const fee = calculateFeeMatchingBackend(grossReceive);
				const netReceive = grossReceive - fee;

				usdcChange += netReceive;
				if (trade.position === "yes") {
					yesChange -= trade.amount;
				} else {
					noChange -= trade.amount;
				}
			}
		}

		return { usdc: usdcChange, yes: yesChange, no: noChange };
	}

	async runTestSuite(config: TradeTestConfig): Promise<void> {
		const trades: TestTrade[] = [];

		// Reset submitted orders tracker
		this.submittedOrders = [];
		this.ourLimitOrders.clear();

		// Generate all test trades based on config
		this.onPhaseChange("Generating test trades with liquidity checks...");

		// Helper to generate a market order with liquidity verification
		const addMarketOrderWithLiquidityCheck = (
			side: "buy" | "sell", 
			position: "yes" | "no",
			requestedAmount: number
		): boolean => {
			// Check liquidity first
			const liquidityCheck = this.checkLiquidityForMarketOrder(side, position, requestedAmount);
			
			if (!liquidityCheck.hasLiquidity || !liquidityCheck.bestPrice) {
				console.log(`[TradeGen] ⚠️ Skipping ${side} ${position} - insufficient liquidity`);
				this.onError(`Skipped ${side} ${position}: Only $${liquidityCheck.availableLiquidity.toFixed(2)} liquidity available`);
				return false;
			}

			// Use the adjusted amount (may be less than requested if liquidity is tight)
			const finalAmount = Math.min(requestedAmount, liquidityCheck.adjustedAmount);
			if (finalAmount < 0.50) {
				console.log(`[TradeGen] ⚠️ Skipping ${side} ${position} - adjusted amount too small ($${finalAmount.toFixed(2)})`);
				this.onError(`Skipped ${side} ${position}: Adjusted amount too small ($${finalAmount.toFixed(2)})`);
				return false;
			}

			console.log(`[TradeGen] ✅ Adding ${side} ${position}: $${finalAmount.toFixed(2)} @ ${liquidityCheck.bestPrice.toFixed(2)}`);
			trades.push({ 
				type: "market", 
				side, 
				position, 
				amount: finalAmount, 
				price: liquidityCheck.bestPrice 
			});
			return true;
		};

		// Market BUY YES
		for (let i = 0; i < config.marketBuyYesCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			addMarketOrderWithLiquidityCheck("buy", "yes", amount);
		}

		// Market BUY NO
		for (let i = 0; i < config.marketBuyNoCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			addMarketOrderWithLiquidityCheck("buy", "no", amount);
		}

		// Market SELL YES
		for (let i = 0; i < config.marketSellYesCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			addMarketOrderWithLiquidityCheck("sell", "yes", amount);
		}

		// Market SELL NO
		for (let i = 0; i < config.marketSellNoCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			addMarketOrderWithLiquidityCheck("sell", "no", amount);
		}

		// Limit BUY YES - place below best ask to avoid immediate fill
		for (let i = 0; i < config.limitBuyYesCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			const price = this.getLimitPriceForOrder("buy", "yes");
			if (price) {
				trades.push({ type: "limit", side: "buy", position: "yes", amount, price });
			}
		}

		// Limit BUY NO
		for (let i = 0; i < config.limitBuyNoCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			const price = this.getLimitPriceForOrder("buy", "no");
			if (price) {
				trades.push({ type: "limit", side: "buy", position: "no", amount, price });
			}
		}

		// Limit SELL YES - place above best bid to avoid immediate fill
		for (let i = 0; i < config.limitSellYesCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			const price = this.getLimitPriceForOrder("sell", "yes");
			if (price) {
				trades.push({ type: "limit", side: "sell", position: "yes", amount, price });
			}
		}

		// Limit SELL NO
		for (let i = 0; i < config.limitSellNoCount; i++) {
			const amount = randomAmount(config.minTradeAmount, config.maxTradeAmount);
			const price = this.getLimitPriceForOrder("sell", "no");
			if (price) {
				trades.push({ type: "limit", side: "sell", position: "no", amount, price });
			}
		}

		// Don't shuffle - execute in order for easier debugging
		// this.shuffleArray(trades);

		console.log(`[TradeExecutor] Generated ${trades.length} test trades:`, trades);

		// ========== STEP 1: Capture initial balances ==========
		this.onPhaseChange("📊 Capturing initial balances...");
		let initialBalances: BalanceSnapshot;
		try {
			initialBalances = await this.fetchBalances();
			console.log(`[TradeExecutor] ========== INITIAL BALANCES ==========`);
			console.log(`  USDC: $${initialBalances.usdc.toFixed(2)}`);
			console.log(`  YES Tokens: ${initialBalances.yesTokens.toFixed(4)}`);
			console.log(`  NO Tokens: ${initialBalances.noTokens.toFixed(4)}`);
			console.log(`[TradeExecutor] =====================================`);
		} catch (error) {
			this.onError(`Failed to fetch initial balances: ${error}`);
			return;
		}

		// Initial warm-up delay to ensure Privy wallet iframe is ready
		this.onPhaseChange("⏳ Warming up wallet...");
		await sleep(1000);

		// Calculate expected changes from all trades
		const expectedChanges = this.calculateExpectedChanges(trades);
		console.log(`[TradeExecutor] ========== EXPECTED CHANGES (if all settle) ==========`);
		console.log(`  USDC Change: ${expectedChanges.usdc >= 0 ? '+' : ''}$${expectedChanges.usdc.toFixed(2)}`);
		console.log(`  YES Token Change: ${expectedChanges.yes >= 0 ? '+' : ''}${expectedChanges.yes.toFixed(4)}`);
		console.log(`  NO Token Change: ${expectedChanges.no >= 0 ? '+' : ''}${expectedChanges.no.toFixed(4)}`);
		console.log(`[TradeExecutor] ====================================================`);

		// ========== STEP 2: Execute all trades ==========
		for (let i = 0; i < trades.length; i++) {
			const trade = trades[i];
			this.onPhaseChange(`🔄 Executing trade ${i + 1}/${trades.length}: ${trade.type} ${trade.side} ${trade.position}`);

			try {
				await this.executeTrade(trade);
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				this.onError(`Trade ${i + 1} failed: ${errorMsg}`);
			}

			// Delay between trades to let Privy wallet recover
			if (i < trades.length - 1) {
				this.onPhaseChange(`⏳ Waiting ${config.delayBetweenTrades}ms before next trade...`);
				await sleep(config.delayBetweenTrades);
			}
		}

		// ========== STEP 3: Wait for settlements ==========
		this.onPhaseChange("⏳ All trades submitted. Waiting 15 seconds for settlements...");
		console.log(`[TradeExecutor] Waiting 15 seconds for trades to settle on-chain...`);
		await sleep(15000);

		// ========== STEP 4: Poll RPC 5 times every 5 seconds ==========
		let finalBalances: BalanceSnapshot = initialBalances;
		for (let poll = 1; poll <= 5; poll++) {
			this.onPhaseChange(`📡 Checking balances (poll ${poll}/5)...`);
			console.log(`[TradeExecutor] ========== BALANCE CHECK ${poll}/5 ==========`);
			
			try {
				finalBalances = await this.fetchBalances();
				
				// Calculate current changes
				const usdcChange = finalBalances.usdc - initialBalances.usdc;
				const yesChange = finalBalances.yesTokens - initialBalances.yesTokens;
				const noChange = finalBalances.noTokens - initialBalances.noTokens;
				
				console.log(`[TradeExecutor] Current Changes:`);
				console.log(`  USDC: ${usdcChange >= 0 ? '+' : ''}$${usdcChange.toFixed(2)} (expected: ${expectedChanges.usdc >= 0 ? '+' : ''}$${expectedChanges.usdc.toFixed(2)})`);
				console.log(`  YES: ${yesChange >= 0 ? '+' : ''}${yesChange.toFixed(4)} (expected: ${expectedChanges.yes >= 0 ? '+' : ''}${expectedChanges.yes.toFixed(4)})`);
				console.log(`  NO: ${noChange >= 0 ? '+' : ''}${noChange.toFixed(4)} (expected: ${expectedChanges.no >= 0 ? '+' : ''}${expectedChanges.no.toFixed(4)})`);
				
				// Check if any changes detected
				if (Math.abs(usdcChange) > 0.001 || Math.abs(yesChange) > 0.0001 || Math.abs(noChange) > 0.0001) {
					console.log(`[TradeExecutor] ✅ Balance changes detected!`);
				} else {
					console.log(`[TradeExecutor] ⏳ No balance changes yet...`);
				}
				console.log(`[TradeExecutor] ================================================`);
			} catch (error) {
				console.error(`[TradeExecutor] Failed to fetch balances on poll ${poll}:`, error);
			}
			
			if (poll < 5) {
				await sleep(5000);
			}
		}

		// ========== STEP 5: Final settlement verification ==========
		const usdcChange = finalBalances.usdc - initialBalances.usdc;
		const yesChange = finalBalances.yesTokens - initialBalances.yesTokens;
		const noChange = finalBalances.noTokens - initialBalances.noTokens;

		// Calculate percentage match
		const usdcMatch = expectedChanges.usdc !== 0 
			? Math.abs(usdcChange / expectedChanges.usdc) * 100 
			: (usdcChange === 0 ? 100 : 0);
		const yesMatch = expectedChanges.yes !== 0 
			? Math.abs(yesChange / expectedChanges.yes) * 100 
			: (yesChange === 0 ? 100 : 0);
		const noMatch = expectedChanges.no !== 0 
			? Math.abs(noChange / expectedChanges.no) * 100 
			: (noChange === 0 ? 100 : 0);

		console.log(`[TradeExecutor] ========== SETTLEMENT VERIFICATION ==========`);
		console.log(`INITIAL BALANCES:`);
		console.log(`  USDC: $${initialBalances.usdc.toFixed(2)}`);
		console.log(`  YES Tokens: ${initialBalances.yesTokens.toFixed(4)}`);
		console.log(`  NO Tokens: ${initialBalances.noTokens.toFixed(4)}`);
		console.log(`FINAL BALANCES:`);
		console.log(`  USDC: $${finalBalances.usdc.toFixed(2)}`);
		console.log(`  YES Tokens: ${finalBalances.yesTokens.toFixed(4)}`);
		console.log(`  NO Tokens: ${finalBalances.noTokens.toFixed(4)}`);
		console.log(`ACTUAL CHANGES:`);
		console.log(`  USDC: ${usdcChange >= 0 ? '+' : ''}$${usdcChange.toFixed(2)}`);
		console.log(`  YES: ${yesChange >= 0 ? '+' : ''}${yesChange.toFixed(4)}`);
		console.log(`  NO: ${noChange >= 0 ? '+' : ''}${noChange.toFixed(4)}`);
		console.log(`EXPECTED CHANGES:`);
		console.log(`  USDC: ${expectedChanges.usdc >= 0 ? '+' : ''}$${expectedChanges.usdc.toFixed(2)}`);
		console.log(`  YES: ${expectedChanges.yes >= 0 ? '+' : ''}${expectedChanges.yes.toFixed(4)}`);
		console.log(`  NO: ${expectedChanges.no >= 0 ? '+' : ''}${expectedChanges.no.toFixed(4)}`);
		console.log(`SETTLEMENT MATCH:`);
		console.log(`  USDC: ${usdcMatch.toFixed(1)}% of expected`);
		console.log(`  YES: ${yesMatch.toFixed(1)}% of expected`);
		console.log(`  NO: ${noMatch.toFixed(1)}% of expected`);
		
		// Determine overall settlement status
		const settlementMatches = 
			Math.abs(usdcChange - expectedChanges.usdc) < 0.05 &&
			Math.abs(yesChange - expectedChanges.yes) < 0.01 &&
			Math.abs(noChange - expectedChanges.no) < 0.01;
		
		console.log(`OVERALL: ${settlementMatches ? '✅ SETTLEMENTS VERIFIED' : '⚠️ SETTLEMENTS DO NOT MATCH EXPECTED'}`);
		console.log(`[TradeExecutor] =============================================`);

		// ========== STEP 6: Verify orders from server API ==========
		this.onPhaseChange("📋 Verifying orders from server...");
		const orderVerification = await this.verifyOrdersFromServer();

		// Callback with verification results
		if (this.onSettlementVerification) {
			this.onSettlementVerification({
				initialBalances,
				finalBalances,
				usdcChange,
				yesTokenChange: yesChange,
				noTokenChange: noChange,
				expectedUsdcChange: expectedChanges.usdc,
				expectedYesTokenChange: expectedChanges.yes,
				expectedNoTokenChange: expectedChanges.no,
				settlementMatches,
				orderVerification,
			});
		}

		this.onPhaseChange(settlementMatches ? "✅ Complete - Settlements Verified!" : "⚠️ Complete - Check Settlement Logs");
	}

	/**
	 * Check available liquidity for a market order
	 * Returns the total USDC value available across all price levels
	 */
	private checkLiquidityForMarketOrder(
		side: "buy" | "sell", 
		position: "yes" | "no",
		requestedAmountUsd: number
	): { hasLiquidity: boolean; availableLiquidity: number; bestPrice: number | null; adjustedAmount: number } {
		const orderbook = this.getOrderbook();
		if (!orderbook) {
			return { hasLiquidity: false, availableLiquidity: 0, bestPrice: null, adjustedAmount: 0 };
		}

		// Helper to safely get size from an orderbook entry
		const getSize = (entry: { price: number; size?: number }): number => entry.size ?? 0;

		let levels: Array<{ price: number; size: number }> = [];
		let bestPrice: number | null = null;

		// Get the appropriate side of the orderbook
		// For BUY: we take from asks (people selling to us)
		// For SELL: we take from bids (people buying from us)
		if (position === "yes") {
			if (side === "buy") {
				levels = (orderbook.asks || []).map(l => ({ price: l.price, size: getSize(l) }));
				bestPrice = levels[0]?.price || null;
			} else {
				levels = (orderbook.bids || []).map(l => ({ price: l.price, size: getSize(l) }));
				bestPrice = levels[0]?.price || null;
			}
		} else {
			// NO position - complement the prices
			if (side === "buy") {
				// Buying NO = taking from YES bids
				levels = (orderbook.bids || []).map(l => ({ price: 1 - l.price, size: getSize(l) }));
				bestPrice = levels[0]?.price || null;
			} else {
				// Selling NO = taking from YES asks
				levels = (orderbook.asks || []).map(l => ({ price: 1 - l.price, size: getSize(l) }));
				bestPrice = levels[0]?.price || null;
			}
		}

		// Filter out levels with no size
		levels = levels.filter(l => l.size > 0);

		if (levels.length === 0) {
			console.log(`[Liquidity] No ${side === "buy" ? "asks" : "bids"} available for ${position.toUpperCase()}`);
			return { hasLiquidity: false, availableLiquidity: 0, bestPrice: null, adjustedAmount: 0 };
		}

		// Calculate total liquidity (USDC value) across all levels
		let totalLiquidityUsd = 0;

		for (const level of levels) {
			// Size is in tokens, price is per token
			// For BUY: USDC needed = tokens * price (+ fees applied later)
			// For SELL: USDC received = tokens * price (- fees applied later)
			const levelUsdValue = level.size * level.price;
			totalLiquidityUsd += levelUsdValue;
		}

		// For BUY orders, we need to account for the fee in our budget
		// effectiveBudget = requestedAmount / 1.02
		const effectiveBudgetNeeded = side === "buy" 
			? requestedAmountUsd / (1 + FEE_RATE_DECIMAL) 
			: requestedAmountUsd;

		// Calculate how much we can actually trade given available liquidity
		let adjustedAmount = requestedAmountUsd;
		if (totalLiquidityUsd < effectiveBudgetNeeded) {
			// Not enough liquidity - adjust amount down to what's available
			// Add a small buffer (90% of available) to ensure we don't hit edge cases
			adjustedAmount = totalLiquidityUsd * 0.90 * (side === "buy" ? (1 + FEE_RATE_DECIMAL) : 1);
			// Round down to nearest cent
			adjustedAmount = Math.floor(adjustedAmount * 100) / 100;
		}

		const hasLiquidity = adjustedAmount >= 0.50; // Minimum viable trade

		console.log(`[Liquidity] ${side.toUpperCase()} ${position.toUpperCase()} check:`);
		console.log(`  Requested: $${requestedAmountUsd.toFixed(2)}`);
		console.log(`  Available liquidity: $${totalLiquidityUsd.toFixed(2)} across ${levels.length} levels`);
		console.log(`  Best price: ${bestPrice?.toFixed(2) || 'N/A'}`);
		console.log(`  Adjusted amount: $${adjustedAmount.toFixed(2)}`);
		console.log(`  Has sufficient liquidity: ${hasLiquidity ? '✅ YES' : '❌ NO'}`);

		return { hasLiquidity, availableLiquidity: totalLiquidityUsd, bestPrice, adjustedAmount };
	}

	private getBestPriceForMarketOrder(side: "buy" | "sell", position: "yes" | "no"): number | null {
		const orderbook = this.getOrderbook();
		if (!orderbook) {
			this.onError("No orderbook available");
			return null;
		}

		// Orderbook is for the YES token
		// For BUY YES: look at asks (selling YES to us)
		// For SELL YES: look at bids (buying YES from us)
		// For BUY NO: look at bids (people buying YES = selling NO to us), invert price
		// For SELL NO: look at asks (people selling YES = buying NO from us), invert price
		
		if (position === "yes") {
			if (side === "buy") {
				if (orderbook.asks && orderbook.asks.length > 0) {
					return orderbook.asks[0].price;
				}
			} else {
				if (orderbook.bids && orderbook.bids.length > 0) {
					return orderbook.bids[0].price;
				}
			}
		} else {
			// NO position - use complement of YES prices
			if (side === "buy") {
				if (orderbook.bids && orderbook.bids.length > 0) {
					return 1 - orderbook.bids[0].price;
				}
			} else {
				if (orderbook.asks && orderbook.asks.length > 0) {
					return 1 - orderbook.asks[0].price;
				}
			}
		}

		// Fallback to a reasonable price if no liquidity
		return 0.50;
	}

	private getLimitPriceForOrder(side: "buy" | "sell", position: "yes" | "no"): number | null {
		const orderbook = this.getOrderbook();
		if (!orderbook) {
			this.onError("No orderbook available for limit order pricing");
			return null;
		}

		// Randomly decide: 50% chance to place "in the money" (will fill), 50% "out of the money" (will sit)
		const shouldFill = Math.random() < 0.5;
		const smallOffset = 0.01 + Math.random() * 0.02; // 1-3 cent offset for fills
		const largeOffset = 0.05 + Math.random() * 0.10; // 5-15 cent offset for misses

		console.log(`[TradeExecutor] Limit ${side} ${position}: ${shouldFill ? 'IN THE MONEY (will fill)' : 'OUT OF MONEY (will sit)'}`);
		
		if (position === "yes") {
			if (side === "buy") {
				if (orderbook.asks && orderbook.asks.length > 0) {
					const bestAsk = orderbook.asks[0].price;
					if (shouldFill) {
						// IN THE MONEY: Place at or slightly above best ask to take liquidity
						const price = Math.min(0.99, Math.round((bestAsk + smallOffset) * 100) / 100);
						console.log(`  Best Ask: ${bestAsk}, Placing at: ${price} (will hit)`);
						return price;
					} else {
						// OUT OF MONEY: Place well below best bid
						const bestBid = orderbook.bids?.[0]?.price || bestAsk - 0.10;
						const price = Math.max(0.01, Math.round((bestBid - largeOffset) * 100) / 100);
						console.log(`  Best Bid: ${bestBid}, Placing at: ${price} (will sit)`);
						return price;
					}
				}
				return shouldFill ? 0.60 : 0.20;
			} else {
				// SELL YES
				if (orderbook.bids && orderbook.bids.length > 0) {
					const bestBid = orderbook.bids[0].price;
					if (shouldFill) {
						// IN THE MONEY: Place at or slightly below best bid to take liquidity
						const price = Math.max(0.01, Math.round((bestBid - smallOffset) * 100) / 100);
						console.log(`  Best Bid: ${bestBid}, Placing at: ${price} (will hit)`);
						return price;
					} else {
						// OUT OF MONEY: Place well above best ask
						const bestAsk = orderbook.asks?.[0]?.price || bestBid + 0.10;
						const price = Math.min(0.99, Math.round((bestAsk + largeOffset) * 100) / 100);
						console.log(`  Best Ask: ${bestAsk}, Placing at: ${price} (will sit)`);
						return price;
					}
				}
				return shouldFill ? 0.40 : 0.80;
			}
		} else {
			// NO position - prices are complements of YES
			if (side === "buy") {
				// Buying NO = Selling YES equivalent
				if (orderbook.bids && orderbook.bids.length > 0) {
					const yesBid = orderbook.bids[0].price;
					const noAsk = 1 - yesBid; // Best ask for NO
					if (shouldFill) {
						// IN THE MONEY: Place at or slightly above NO ask (below YES bid)
						const price = Math.min(0.99, Math.round((noAsk + smallOffset) * 100) / 100);
						console.log(`  NO Ask (1-YesBid): ${noAsk.toFixed(2)}, Placing at: ${price} (will hit)`);
						return price;
					} else {
						// OUT OF MONEY: Place well below NO bid
						const yesAsk = orderbook.asks?.[0]?.price || yesBid + 0.10;
						const noBid = 1 - yesAsk;
						const price = Math.max(0.01, Math.round((noBid - largeOffset) * 100) / 100);
						console.log(`  NO Bid (1-YesAsk): ${noBid.toFixed(2)}, Placing at: ${price} (will sit)`);
						return price;
					}
				}
				return shouldFill ? 0.60 : 0.20;
			} else {
				// SELL NO = Buying YES equivalent
				if (orderbook.asks && orderbook.asks.length > 0) {
					const yesAsk = orderbook.asks[0].price;
					const noBid = 1 - yesAsk; // Best bid for NO
					if (shouldFill) {
						// IN THE MONEY: Place at or slightly below NO bid (above YES ask)
						const price = Math.max(0.01, Math.round((noBid - smallOffset) * 100) / 100);
						console.log(`  NO Bid (1-YesAsk): ${noBid.toFixed(2)}, Placing at: ${price} (will hit)`);
						return price;
					} else {
						// OUT OF MONEY: Place well above NO ask
						const yesBid = orderbook.bids?.[0]?.price || yesAsk - 0.10;
						const noAsk = 1 - yesBid;
						const price = Math.min(0.99, Math.round((noAsk + largeOffset) * 100) / 100);
						console.log(`  NO Ask (1-YesBid): ${noAsk.toFixed(2)}, Placing at: ${price} (will sit)`);
						return price;
					}
				}
				return shouldFill ? 0.40 : 0.80;
			}
		}
	}

	private wouldCrossOwnOrder(trade: TestTrade): boolean {
		// Check if this trade would cross any of our existing limit orders
		for (const [, order] of this.ourLimitOrders) {
			if (order.position !== trade.position) continue;
			
			if (trade.side === "buy" && order.side === "sell") {
				// Buy crosses sell if buy price >= sell price
				if (trade.price >= order.price) {
					return true;
				}
			} else if (trade.side === "sell" && order.side === "buy") {
				// Sell crosses buy if sell price <= buy price
				if (trade.price <= order.price) {
					return true;
				}
			}
		}
		return false;
	}

	private async executeTrade(trade: TestTrade): Promise<void> {
		const resultId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		const timestamp = new Date();

		// Check for self-crossing (only for limit orders)
		if (trade.type === "limit" && this.wouldCrossOwnOrder(trade)) {
			this.onResult({
				id: resultId,
				timestamp,
				tradeType: trade.type,
				side: trade.side,
				position: trade.position,
				amount: trade.amount,
				price: trade.price,
				expectedCost: 0,
				expectedReceive: 0,
				expectedFee: 0,
				expectedContracts: 0,
				actualCost: null,
				actualReceive: null,
				actualFee: null,
				actualContracts: null,
				success: false,
				error: "Skipped: Would cross own order",
				orderId: null,
				serverResponse: null,
			});
			return;
		}

		// Calculate expected values
		let expectedCost = 0;
		let expectedReceive = 0;
		let expectedFee = 0;
		let expectedContracts = 0;

		if (trade.side === "buy") {
			// BUY: user pays USDC, receives tokens
			const effectiveBudget = trade.amount / (1 + FEE_RATE_DECIMAL);
			expectedCost = effectiveBudget;
			expectedFee = calculateFeeMatchingBackend(effectiveBudget);
			expectedContracts = effectiveBudget / trade.price;
			expectedReceive = expectedContracts; // Tokens received
		} else {
			// SELL: user gives tokens, receives USDC minus fee
			const grossReceive = trade.amount * trade.price;
			expectedFee = calculateFeeMatchingBackend(grossReceive);
			expectedReceive = grossReceive - expectedFee;
			expectedCost = trade.amount; // Tokens given
			expectedContracts = trade.amount;
		}

		try {
			// Create the order
			const order = await this.createOrder(trade);
			
			// Sign the order
			const signedOrder = await this.signOrder(order, trade.side);

			// Submit to server
			const response = await this.submitOrder(signedOrder, trade.type);

			// ========== DETAILED LOGGING ==========
			console.log(`[TradeExecutor] ========== TRADE RESULT ==========`);
			console.log(`[TradeExecutor] Trade Type: ${trade.type}`);
			console.log(`[TradeExecutor] Side: ${trade.side}`);
			console.log(`[TradeExecutor] Position: ${trade.position}`);
			console.log(`[TradeExecutor] Amount: $${trade.amount}`);
			console.log(`[TradeExecutor] Price: ${trade.price}`);
			console.log(`[TradeExecutor] Expected Fee: $${expectedFee.toFixed(4)}`);
			console.log(`[TradeExecutor] Full Server Response:`, JSON.stringify(response, null, 2));
			
			// Log all possible fee-related fields in response
			console.log(`[TradeExecutor] Checking for fee fields in response:`);
			console.log(`  - response.fee: ${response.fee}`);
			console.log(`  - response.feeAmount: ${response.feeAmount}`);
			console.log(`  - response.takerFee: ${response.takerFee}`);
			console.log(`  - response.tradeFee: ${response.tradeFee}`);
			console.log(`  - response.data?.fee: ${response.data?.fee}`);
			console.log(`  - response.order?.fee: ${response.order?.fee}`);
			console.log(`  - response.fill?.fee: ${response.fill?.fee}`);
			console.log(`  - response.txHash: ${response.txHash || response.transactionHash || response.hash}`);
			
			// Fee contract addresses from centralized config (config/addresses.ts)
			// BUY fees: FeeWrapper | SELL fees: FeeModule
			// Note: Actual fees may only be visible on-chain after tx is mined
			console.log(`[TradeExecutor] Fee Contract: ${trade.side === 'buy' ? 'FeeWrapper' : 'FeeModule'}`);
			console.log(`[TradeExecutor] =====================================`);

			// Track limit orders to prevent self-crossing
			const orderId = response.orderId || response.id || response.data?.orderId || 
				response.data?.log?.o?.id || null;
			
			if (trade.type === "limit" && orderId) {
				this.ourLimitOrders.set(orderId, {
					side: trade.side,
					position: trade.position,
					price: trade.price,
				});
			}

			// Track submitted order for later verification
			if (orderId) {
				this.submittedOrders.push({
					orderId,
					tradeType: trade.type,
					side: trade.side,
					position: trade.position,
					expectedAmount: trade.amount,
					expectedFee,
					timestamp: new Date(),
				});
				console.log(`[TradeExecutor] 📝 Tracked order ${orderId} for verification`);
			}

			// Parse actual values from response - try multiple possible field names
			const actualCost = response.actualCost ?? response.cost ?? response.data?.cost ?? null;
			const actualReceive = response.actualReceive ?? response.receive ?? response.data?.receive ?? null;
			const actualFee = response.fee ?? response.feeAmount ?? response.takerFee ?? response.tradeFee ?? 
				response.data?.fee ?? response.order?.fee ?? response.fill?.fee ?? null;
			const actualContracts = response.fillAmount ?? response.filled ?? response.amount ?? 
				response.data?.fillAmount ?? null;

			this.onResult({
				id: resultId,
				timestamp,
				tradeType: trade.type, // Explicitly set tradeType
				side: trade.side,
				position: trade.position,
				amount: trade.amount,
				price: trade.price,
				expectedCost,
				expectedReceive,
				expectedFee,
				expectedContracts,
				actualCost,
				actualReceive,
				actualFee,
				actualContracts,
				success: true,
				error: null,
				orderId: response.orderId || response.id || response.data?.orderId || null,
				serverResponse: response,
			});
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			console.error(`[TradeExecutor] Trade failed:`, error);

			this.onResult({
				id: resultId,
				timestamp,
				tradeType: trade.type, // Explicitly set tradeType
				side: trade.side,
				position: trade.position,
				amount: trade.amount,
				price: trade.price,
				expectedCost,
				expectedReceive,
				expectedFee,
				expectedContracts,
				actualCost: null,
				actualReceive: null,
				actualFee: null,
				actualContracts: null,
				success: false,
				error: errorMsg,
				orderId: null,
				serverResponse: null,
			});
		}
	}

	private async createOrder(trade: TestTrade): Promise<any> {
		const tokenId = trade.position === "yes" 
			? this.market.yesTokenId 
			: this.market.noTokenId;

		if (!tokenId) {
			throw new Error(adminErrorMessage(ADMIN_TRADE_TEST_MISSING_TOKEN));
		}

		const expiration = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60 * 100; // ~100 years

		// Calculate amounts based on trade side
		const roundToDecimals = (value: number, decimals: number): string => {
			const factor = Math.pow(10, decimals);
			const rounded = Math.round(value * factor) / factor;
			return rounded.toFixed(decimals);
		};

		const totalUsd = trade.amount * trade.price;
		const usdcAmount = ethers.parseUnits(roundToDecimals(totalUsd, 6), 6).toString();
		const tokenAmount = ethers.parseUnits(roundToDecimals(trade.amount, 6), 6).toString();

		const signerAddress = await this.signer.getAddress();

		const order = {
			salt: ethers.id(`order-${Date.now()}-${Math.random()}`),
			maker: this.account,
			signer: signerAddress,
			taker: ethers.ZeroAddress,
			tokenId: tokenId,
			makerAmount: trade.side === "buy" ? usdcAmount : tokenAmount,
			takerAmount: trade.side === "buy" ? tokenAmount : usdcAmount,
			expiration,
			nonce: 0,
			feeRateBps: trade.side === "buy" ? 0 : FEE_RATE_BPS,
			side: trade.side,
			signatureType: 3, // Smart wallet
			numericSide: trade.side === "buy" ? 0 : 1,
		};

		// Fetch on-chain nonce
		try {
			const provider = (this.signer as any).provider ?? new ethers.JsonRpcProvider(
				"https://api.developer.coinbase.com/rpc/v1/base/WMQ4Y6b5ZsqmO9MTCfyjZG2aQXG9T1Ih"
			);
			const abi = ["function nonces(address) view returns (uint256)"];
			const exchange = new ethers.Contract(EXCHANGE_ADDRESS, abi, provider);
			const nonce = await exchange.nonces(signerAddress);
			order.nonce = Number(nonce);
		} catch (e) {
			console.warn("[TradeExecutor] Failed to fetch nonce, using 0:", e);
		}

		return order;
	}

	private async signOrder(order: any, side: "buy" | "sell"): Promise<any> {
		const signerAddress = await this.signer.getAddress();
		
		// Determine if using smart wallet
		const isSmart = this.account.toLowerCase() !== signerAddress.toLowerCase();

		const domain = {
			name: "Polymarket CTF Exchange",
			version: "1",
			chainId: 8453,
			verifyingContract: EXCHANGE_ADDRESS,
		};

		const types = {
			Order: [
				{ name: "salt", type: "uint256" },
				{ name: "maker", type: "address" },
				{ name: "signer", type: "address" },
				{ name: "taker", type: "address" },
				{ name: "tokenId", type: "uint256" },
				{ name: "makerAmount", type: "uint256" },
				{ name: "takerAmount", type: "uint256" },
				{ name: "expiration", type: "uint256" },
				{ name: "nonce", type: "uint256" },
				{ name: "feeRateBps", type: "uint256" },
				{ name: "side", type: "uint8" },
				{ name: "signatureType", type: "uint8" },
			],
		};

		const orderDataForSigning = {
			salt: order.salt,
			maker: isSmart ? order.maker : signerAddress,
			signer: isSmart ? order.signer : signerAddress,
			taker: order.taker,
			tokenId: order.tokenId,
			makerAmount: order.makerAmount,
			takerAmount: order.takerAmount,
			expiration: order.expiration,
			nonce: order.nonce,
			feeRateBps: order.feeRateBps,
			side: order.numericSide,
			signatureType: isSmart ? 3 : 0,
		};

		// Retry signing up to 3 times with delays (Privy iframe may not be ready)
		let lastError: Error | null = null;
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				if (attempt > 0) {
					console.log(`[TradeExecutor] Signing retry attempt ${attempt + 1}...`);
					await sleep(1000 * attempt); // Increasing delay for retries
				}
				const signature = await (this.signer as any).signTypedData(domain, types, orderDataForSigning);
				
				return {
					...order,
					maker: isSmart ? order.maker : signerAddress,
					signer: isSmart ? order.signer : signerAddress,
					signatureType: isSmart ? 3 : 0,
					signature,
				};
			} catch (e: any) {
				lastError = e;
				// If it's an "iframe not initialized" error, retry
				if (e.message?.includes("iframe not initialized") || e.message?.includes("coalesce error")) {
					console.log(`[TradeExecutor] Signing failed (iframe issue), will retry...`);
					continue;
				}
				// For other errors, throw immediately
				throw e;
			}
		}
		throw lastError || new Error("Signing failed after 3 attempts");
	}

	private async submitOrder(signedOrder: any, orderType: "market" | "limit"): Promise<any> {
		const apiUrl = getPredictionApiBaseUrl();
		// Use MongoDB _id for the API endpoint, not questionId (which is a hex hash)
		const marketId = (this.market as any)._id || this.market.questionId;
		const endpoint = `${apiUrl}/orders/${marketId}`;

		const payload = {
			...signedOrder,
			type: orderType,
			size: signedOrder.side === "buy" 
				? ethers.formatUnits(signedOrder.makerAmount, 6)
				: ethers.formatUnits(signedOrder.makerAmount, 6),
			price: this.calculatePriceFromOrder(signedOrder),
		};

		// Remove internal fields
		delete payload.numericSide;

		console.log(`[TradeExecutor] Submitting order to ${endpoint}:`, payload);

		const headers: HeadersInit = {
			"Content-Type": "application/json",
		};

		if (this.accessToken) {
			headers["Authorization"] = `Bearer ${this.accessToken}`;
		}

		if (this.identityToken) {
			headers["privy-id-token"] = this.identityToken;
		}

		const response = await fetch(endpoint, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const errorText = await response.text();
			console.error("[admin trade test] API error", {
				status: response.status,
				body: errorText.slice(0, 500),
			});
			throw new Error(formatAdminHttpError(response.status, errorText));
		}

		return await response.json();
	}

	private calculatePriceFromOrder(order: any): string {
		const makerAmount = BigInt(order.makerAmount);
		const takerAmount = BigInt(order.takerAmount);
		
		// For BUY: price = USDC / tokens = makerAmount / takerAmount
		// For SELL: price = USDC / tokens = takerAmount / makerAmount
		if (order.side === "buy") {
			const price = Number(makerAmount) / Number(takerAmount);
			return price.toFixed(2);
		} else {
			const price = Number(takerAmount) / Number(makerAmount);
			return price.toFixed(2);
		}
	}

	private shuffleArray<T>(array: T[]): void {
		for (let i = array.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[array[i], array[j]] = [array[j], array[i]];
		}
	}
}

