import React, { useState, useEffect, useCallback, useRef } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useUserData } from "@/context/UserDataContext";
import { useCollateralTokens } from "@/context/CollateralTokenContext";
import {
	getPredictionWebSocketUrl,
	getPredictionApiBaseUrl,
	getPredictionOrderApiBaseUrl,
} from "@/config/predictionApiBase";
import { EXCHANGE_ADDRESS } from "@/config/addresses";
import { MarketSelector } from "./MarketSelector";
import { TradeExecutor, type TradeTestConfig, type TradeResult, type SettlementVerification } from "./TradeExecutor";
import { TradeResultsLog } from "./TradeResultsLog";
import OrderbookDisplay from "@/components/OrderbookDisplay/OrderbookDisplay";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import {
	adminErrorMessage,
	formatAdminHttpError,
	ADMIN_TRADE_TEST_NO_TOKEN_ID,
} from "@/errors";
import "./TradeTesting.scss";

// Error classification types
export type ErrorCategory = "expected" | "unexpected" | "warning";

export interface ClassifiedError {
	message: string;
	category: ErrorCategory;
	reason: string;
	tradeIndex: number;
}

// Patterns for classifying errors
const EXPECTED_ERROR_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	// Validation errors
	{ pattern: /missing.*required.*field/i, reason: "Order missing required fields (expected for malformed orders)" },
	{ pattern: /invalid.*field/i, reason: "Order has invalid field value" },
	{ pattern: /validation.*failed/i, reason: "Server validation failed" },
	{ pattern: /HTTP 400/i, reason: "Bad request - order validation failed" },
	// Balance/funds issues
	{ pattern: /insufficient.*balance/i, reason: "User doesn't have enough USDC" },
	{ pattern: /insufficient.*funds/i, reason: "User doesn't have enough funds" },
	{ pattern: /not enough.*balance/i, reason: "Balance too low for order" },
	{ pattern: /not enough.*usdc/i, reason: "USDC balance insufficient" },
	{ pattern: /exceeds.*balance/i, reason: "Order amount exceeds available balance" },
	// Token/share issues
	{ pattern: /insufficient.*tokens/i, reason: "User doesn't have enough tokens to sell" },
	{ pattern: /insufficient.*shares/i, reason: "User doesn't have enough shares to sell" },
	{ pattern: /not enough.*tokens/i, reason: "Token balance too low" },
	// Price issues
	{ pattern: /invalid.*price/i, reason: "Price outside valid range (0-1)" },
	{ pattern: /price.*out.*range/i, reason: "Price must be between 0 and 1" },
	{ pattern: /price.*invalid/i, reason: "Invalid price value" },
	{ pattern: /price.*too/i, reason: "Price validation failed" },
	// Order validation
	{ pattern: /order.*too.*small/i, reason: "Order amount below minimum" },
	{ pattern: /minimum.*order/i, reason: "Order doesn't meet minimum requirements" },
	{ pattern: /order.*expired/i, reason: "Order expiration time passed" },
	// Liquidity issues
	{ pattern: /no.*liquidity/i, reason: "No liquidity available in orderbook" },
	{ pattern: /insufficient.*liquidity/i, reason: "Not enough liquidity to fill order" },
	{ pattern: /no.*asks/i, reason: "No sell orders available" },
	{ pattern: /no.*bids/i, reason: "No buy orders available" },
	// Self-crossing
	{ pattern: /self.*cross/i, reason: "Order would cross user's own order" },
	{ pattern: /crossing.*own/i, reason: "Cannot trade against yourself" },
	// Rate limiting
	{ pattern: /rate.*limit/i, reason: "Too many requests - rate limited" },
	{ pattern: /too.*many.*requests/i, reason: "Rate limit exceeded" },
	// Authentication (expected if testing without proper auth)
	{ pattern: /unauthorized/i, reason: "Authentication required" },
	{ pattern: /missing.*auth/i, reason: "Missing authentication token" },
	{ pattern: /missing.*profile/i, reason: "User profile not found" },
	// Nonce issues
	{ pattern: /nonce/i, reason: "Order nonce conflict" },
	// Market closed
	{ pattern: /market.*closed/i, reason: "Market is not accepting orders" },
	{ pattern: /market.*resolved/i, reason: "Market has been resolved" },
	{ pattern: /trading.*disabled/i, reason: "Trading is disabled" },
];

const WARNING_ERROR_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	// User cancelled
	{ pattern: /user.*rejected/i, reason: "User rejected the signature request" },
	{ pattern: /user.*denied/i, reason: "User denied the transaction" },
	{ pattern: /user.*cancelled/i, reason: "User cancelled the operation" },
	// Timeout (could be network or user delay)
	{ pattern: /timeout/i, reason: "Operation timed out" },
];

const UNEXPECTED_ERROR_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
	// Server errors
	{ pattern: /500/i, reason: "⚠️ SERVER ERROR - Backend issue" },
	{ pattern: /502/i, reason: "⚠️ BAD GATEWAY - Server unreachable" },
	{ pattern: /503/i, reason: "⚠️ SERVICE UNAVAILABLE - Server down" },
	{ pattern: /internal.*error/i, reason: "⚠️ Internal server error" },
	// Network issues
	{ pattern: /network.*error/i, reason: "⚠️ Network connectivity issue" },
	{ pattern: /failed.*fetch/i, reason: "⚠️ Could not reach server" },
	{ pattern: /cors/i, reason: "⚠️ CORS policy blocking request" },
	// Contract/signature issues
	{ pattern: /invalid.*signature/i, reason: "⚠️ Signature verification failed" },
	{ pattern: /signature.*invalid/i, reason: "⚠️ Invalid order signature" },
	// Unexpected type errors
	{ pattern: /cannot read/i, reason: "⚠️ Code error - missing property" },
	{ pattern: /undefined.*not/i, reason: "⚠️ Code error - undefined value" },
	{ pattern: /null.*not/i, reason: "⚠️ Code error - null value" },
];

function classifyError(errorMessage: string, tradeIndex: number): ClassifiedError {
	const msg = errorMessage.toLowerCase();
	
	// Check for unexpected errors first (these are higher priority)
	for (const { pattern, reason } of UNEXPECTED_ERROR_PATTERNS) {
		if (pattern.test(msg)) {
			return { message: errorMessage, category: "unexpected", reason, tradeIndex };
		}
	}
	
	// Check for warning errors
	for (const { pattern, reason } of WARNING_ERROR_PATTERNS) {
		if (pattern.test(msg)) {
			return { message: errorMessage, category: "warning", reason, tradeIndex };
		}
	}
	
	// Check for expected errors
	for (const { pattern, reason } of EXPECTED_ERROR_PATTERNS) {
		if (pattern.test(msg)) {
			return { message: errorMessage, category: "expected", reason, tradeIndex };
		}
	}
	
	// Default to unexpected if we don't recognize the error
	return { 
		message: errorMessage, 
		category: "unexpected", 
		reason: "⚠️ Unrecognized error - needs investigation",
		tradeIndex 
	};
}

export interface TradeTestState {
	isRunning: boolean;
	currentPhase: string;
	results: TradeResult[];
	errors: string[];
	classifiedErrors: ClassifiedError[];
	settlementVerification: SettlementVerification | null;
}

// Market type with possible extra fields from context
type MarketData = any; // Using any since context returns different shapes

export default function TradeTesting() {
	const { authenticated, getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();
	const { account, signer } = useSignerContext();
	const { refreshTokenPositions } = useUserData();
	const collateralTokens = useCollateralTokens();
	const usdcBalance = collateralTokens.baseUsdc;
	const { umbrellas, getAllQuestionsForUmbrella } = usePredictionData();

	const [selectedMarket, setSelectedMarket] = useState<MarketData | null>(null);
	const [orderbook, setOrderbook] = useState<OrderbookSnapshot | null>(null);
	const [wsConnected, setWsConnected] = useState(false);
	const wsRef = useRef<WebSocket | null>(null);

	const [testState, setTestState] = useState<TradeTestState>({
		isRunning: false,
		currentPhase: "Idle",
		results: [],
		errors: [],
		classifiedErrors: [],
		settlementVerification: null,
	});

	const [config, setConfig] = useState<TradeTestConfig>({
		marketBuyYesCount: 1,
		marketBuyNoCount: 1,
		marketSellYesCount: 0,
		marketSellNoCount: 0,
		limitBuyYesCount: 1,
		limitBuyNoCount: 1,
		limitSellYesCount: 0,
		limitSellNoCount: 0,
		minTradeAmount: 1,
		maxTradeAmount: 3,
		delayBetweenTrades: 2000, // 2 seconds - need time for Privy wallet
	});

	// Stress test config
	const [stressTestConfig, setStressTestConfig] = useState({
		totalRandomOrders: 10,
		minAmount: 0.01,
		maxAmount: 1000, // Intentionally high to trigger failures
		delayBetweenOrders: 500,
		includeInvalidPrices: true, // Prices like 0, 1.5, -0.5
		includeHugeAmounts: true, // Amounts way beyond balance
	});

	// Book seeding config (using Privy wallet)
	const [seedConfig, setSeedConfig] = useState({
		bidMin: 0.20,
		bidMax: 0.45,
		askMin: 0.55,
		askMax: 0.80,
		amountPerLevel: 100, // USDC per price level
		levels: 10, // Number of price levels
		delayBetweenOrders: 300, // ms between orders
	});
	const [seedState, setSeedState] = useState({
		isSeeding: false,
		currentPhase: "",
		seededCount: 0,
		totalToSeed: 0,
		errors: [] as string[],
	});

	// Get all unsettled markets
	const unsettledMarkets = React.useMemo(() => {
		const markets: any[] = [];
		umbrellas.forEach((umbrella) => {
			const questions = getAllQuestionsForUmbrella(umbrella._id) || [];
			questions.forEach((q: any) => {
				// Only include markets that are not resolved
				// Markets might not have explicit 'settled' field, so we check status
				const status = q.status || "active";
				if (status !== "resolved" && !q.settled) {
					markets.push(q);
				}
			});
		});
		return markets;
	}, [umbrellas, getAllQuestionsForUmbrella]);

	// Get the market ID the same way as the trading page
	const marketId = selectedMarket?._id || selectedMarket?.questionId || selectedMarket?.marketId;

	// Connect to orderbook websocket when market is selected
	useEffect(() => {
		if (!marketId) {
			setOrderbook(null);
			setWsConnected(false);
			return;
		}

		const wsBaseUrl = getPredictionWebSocketUrl();
		const wsUrl = `${wsBaseUrl}/orderbook/${marketId}`;

		console.log("[TradeTesting] Connecting to orderbook WS:", wsUrl);
		console.log("[TradeTesting] Market ID used:", marketId);
		console.log("[TradeTesting] Selected market:", selectedMarket);

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			console.log("[TradeTesting] WS connected");
			setWsConnected(true);
		};

		ws.onmessage = (event) => {
			try {
				const message = JSON.parse(event.data);
				console.log("[TradeTesting] Raw WS message:", message);
				// Extract orderbook the same way as the trading page
				const orderbookData = message.snapshot || message;
				console.log("[TradeTesting] Extracted orderbook:", orderbookData);
				console.log("[TradeTesting] Bids:", orderbookData?.bids?.length || 0);
				console.log("[TradeTesting] Asks:", orderbookData?.asks?.length || 0);
				setOrderbook(orderbookData);
			} catch (e) {
				console.error("[TradeTesting] WS parse error:", e);
			}
		};

		ws.onerror = (err) => {
			console.error("[TradeTesting] WS error:", err);
			setWsConnected(false);
		};

		ws.onclose = () => {
			console.log("[TradeTesting] WS closed");
			setWsConnected(false);
		};

		return () => {
			ws.close();
			wsRef.current = null;
		};
	}, [marketId, selectedMarket]);

	// Run the test suite
	const runTests = useCallback(async () => {
		if (!selectedMarket || !account || !signer || !orderbook) {
			setTestState((prev) => ({
				...prev,
				errors: [...prev.errors, "Missing required data: market, account, signer, or orderbook"],
			}));
			return;
		}

		setTestState({
			isRunning: true,
			currentPhase: "Initializing...",
			results: [],
			errors: [],
			classifiedErrors: [],
			settlementVerification: null,
		});

		try {
			// Get access token for API calls
			const accessToken = await getAccessToken();

			const executor = new TradeExecutor(
				selectedMarket,
				account,
				signer,
				() => orderbook, // Get latest orderbook
				(phase) => setTestState((prev) => ({ ...prev, currentPhase: phase })),
				(result) => setTestState((prev) => ({ ...prev, results: [...prev.results, result] })),
				(error) => setTestState((prev) => ({ ...prev, errors: [...prev.errors, error] }))
			);

			// Set the tokens for API authentication
			executor.setTokens(accessToken, identityToken || null);

			// Set settlement verification callback
			executor.setSettlementCallback((verification) => {
				console.log("[TradeTesting] Received settlement verification:", verification);
				setTestState((prev) => ({ ...prev, settlementVerification: verification }));
			});

			await executor.runTestSuite(config);

			// Refresh balances after all trades — collateral tokens + share positions in parallel.
			await Promise.all([
				collateralTokens.refetch(),
				refreshTokenPositions(),
			]);

			setTestState((prev) => ({
				...prev,
				isRunning: false,
				currentPhase: prev.settlementVerification?.settlementMatches ? "✅ Complete - Verified!" : "Complete",
			}));
		} catch (error) {
			const errorMsg = error instanceof Error ? error.message : String(error);
			setTestState((prev) => ({
				...prev,
				isRunning: false,
				currentPhase: "Failed",
				errors: [...prev.errors, errorMsg],
			}));
		}
	}, [selectedMarket, account, signer, orderbook, config, refreshTokenPositions, collateralTokens, getAccessToken, identityToken]);

	// Run random stress test - BLAST random orders without any pre-checks
	// The point is to test edge cases and server error handling
	const runStressTest = useCallback(async () => {
		if (!selectedMarket || !account || !signer) {
			setTestState((prev) => ({
				...prev,
				errors: [...prev.errors, "Missing required data: market, account, or signer"],
			}));
			return;
		}

		setTestState({
			isRunning: true,
			currentPhase: "🔥 STRESS TEST - BLASTING ORDERS...",
			results: [],
			errors: [],
			classifiedErrors: [],
			settlementVerification: null,
		});

		const accessToken = await getAccessToken();
		const { ethers } = await import("ethers");

		// Generate completely random trades - no validation, no liquidity checks
		const totalOrders = stressTestConfig.totalRandomOrders;
		console.log(`[StressTest] 🔥 BLASTING ${totalOrders} random orders...`);

		for (let i = 0; i < totalOrders; i++) {
			const tradeNum = i + 1;
			
			// Random parameters
			const type: "market" | "limit" = Math.random() > 0.5 ? "market" : "limit";
			const side: "buy" | "sell" = Math.random() > 0.5 ? "buy" : "sell";
			const position: "yes" | "no" = Math.random() > 0.5 ? "yes" : "no";
			
			// Random amount (0.5 to maxAmount, or huge if enabled)
			let amount: number;
			if (stressTestConfig.includeHugeAmounts && Math.random() > 0.7) {
				amount = Math.random() * 50000 + 1000; // $1k to $51k
			} else {
				amount = 0.5 + Math.random() * stressTestConfig.maxAmount;
			}
			amount = Math.round(amount * 100) / 100;

			// Random price - ALWAYS valid format (0.01 to 0.99, exactly 2 decimals)
			// Even for "weird" prices, keep them valid format - we're testing amounts, not syntax
			let price: number;
			if (stressTestConfig.includeInvalidPrices && Math.random() > 0.8) {
				// Edge case prices that are still valid format
				const edgePrices = [0.01, 0.02, 0.05, 0.10, 0.50, 0.90, 0.95, 0.98, 0.99];
				price = edgePrices[Math.floor(Math.random() * edgePrices.length)];
			} else {
				// Random valid price between 0.05 and 0.95
				price = 0.05 + Math.random() * 0.90;
			}
			// ALWAYS ensure exactly 2 decimal places between 0.01 and 0.99
			price = Math.max(0.01, Math.min(0.99, Math.round(price * 100) / 100));

			setTestState((prev) => ({
				...prev,
				currentPhase: `🔥 BLAST ${tradeNum}/${totalOrders}: ${type} ${side} ${position} $${amount.toFixed(2)} @ ${price}`,
			}));

			const resultId = `stress-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			const timestamp = new Date();

			try {
				// Get token ID
				const tokenId = position === "yes" ? selectedMarket.yesTokenId : selectedMarket.noTokenId;
				const marketId = selectedMarket._id || selectedMarket.questionId;
				
				if (!tokenId) {
					throw new Error(adminErrorMessage(ADMIN_TRADE_TEST_NO_TOKEN_ID));
				}

				// Calculate amounts - MUST use whole number of shares (no fractional shares)
				// Round token amount to whole number first, then calculate USDC from that
				const wholeTokens = Math.max(1, Math.round(amount)); // At least 1 share
				const totalUsd = wholeTokens * price;
				
				// Token amount is whole shares * 1e6 (6 decimals for the contract)
				const tokenAmount = (BigInt(wholeTokens) * BigInt(1_000_000)).toString();
				// USDC amount is totalUsd * 1e6
				const usdcAmount = ethers.parseUnits(totalUsd.toFixed(6), 6).toString();
				
				// Get signer address
				const signerAddress = await signer.getAddress();
				const isSmart = account.toLowerCase() !== signerAddress.toLowerCase();

				// Build order matching TradeExecutor format exactly
				const order = {
					salt: ethers.id(`stress-${Date.now()}-${Math.random()}`),
					maker: account,
					signer: signerAddress,
					taker: ethers.ZeroAddress,
					tokenId: tokenId,
					makerAmount: side === "buy" ? usdcAmount : tokenAmount,
					takerAmount: side === "buy" ? tokenAmount : usdcAmount,
					expiration: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
					nonce: 0,
					feeRateBps: side === "buy" ? 0 : 200,
					side: side, // String for server
					signatureType: isSmart ? 3 : 0,
					numericSide: side === "buy" ? 0 : 1,
				};

				// Sign the order
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
				const orderForSigning = {
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
					signatureType: order.signatureType,
				};

				const signature = await signer.signTypedData(domain, types, orderForSigning);
				console.log(`[StressTest] ✅ Signed order ${tradeNum}`);

				// Build payload matching TradeExecutor.submitOrder exactly
				// Calculate price from order amounts (same as TradeExecutor.calculatePriceFromOrder)
				const makerAmt = BigInt(order.makerAmount);
				const takerAmt = BigInt(order.takerAmount);
				const calculatedPrice = side === "buy" 
					? Number(makerAmt) / Number(takerAmt)
					: Number(takerAmt) / Number(makerAmt);
				
				// Size should be whole number of shares
				const payload = {
					...order,
					maker: isSmart ? order.maker : signerAddress,
					signer: isSmart ? order.signer : signerAddress,
					signature,
					type: type,
					size: wholeTokens.toString(), // Whole shares, not micro-units
					price: calculatedPrice.toFixed(2), // Must be decimal string like "0.65"
				};
				delete (payload as any).numericSide;

				// Submit to server
				const apiUrl = getPredictionApiBaseUrl();
				const response = await fetch(`${apiUrl}/orders/${marketId}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
						...(identityToken ? { "privy-id-token": identityToken } : {}),
					},
					body: JSON.stringify(payload),
				});

				const responseData = await response.json();
				console.log(`[StressTest] Response ${tradeNum}:`, response.ok ? "✅ SUCCESS" : `❌ ${response.status}`, responseData);

				const errorMsg = response.ok
					? null
					: formatAdminHttpError(
							response.status,
							typeof responseData?.error === "string"
								? responseData.error
								: typeof responseData?.message === "string"
									? responseData.message
									: undefined,
						);
				const classifiedError = errorMsg ? classifyError(errorMsg, tradeNum) : null;

				setTestState((prev) => ({
					...prev,
					results: [...prev.results, {
						id: resultId,
						timestamp,
						tradeType: type,
						side: side,
						position: position,
						amount: amount,
						price: price,
						expectedCost: amount,
						expectedReceive: 0,
						expectedFee: amount * 0.02,
						expectedContracts: amount / price,
						actualCost: null,
						actualReceive: null,
						actualFee: null,
						actualContracts: null,
						success: response.ok,
						error: errorMsg,
						orderId: responseData?.orderId || responseData?.data?.log?.o?.id || responseData?.id || null,
						serverResponse: responseData,
					}],
					classifiedErrors: classifiedError 
						? [...prev.classifiedErrors, classifiedError]
						: prev.classifiedErrors,
				}));

			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				console.error(`[StressTest] ❌ Trade ${tradeNum} error:`, errorMsg);
				
				const classifiedError = classifyError(errorMsg, tradeNum);

				setTestState((prev) => ({
					...prev,
					results: [...prev.results, {
						id: resultId,
						timestamp,
						tradeType: type,
						side: side,
						position: position,
						amount: amount,
						price: price,
						expectedCost: amount,
						expectedReceive: 0,
						expectedFee: amount * 0.02,
						expectedContracts: amount / price,
						actualCost: null,
						actualReceive: null,
						actualFee: null,
						actualContracts: null,
						success: false,
						error: errorMsg,
						orderId: null,
						serverResponse: null,
					}],
					errors: [...prev.errors, `Trade ${tradeNum}: ${errorMsg}`],
					classifiedErrors: [...prev.classifiedErrors, classifiedError],
				}));
			}

			// Small delay between orders
			if (i < totalOrders - 1) {
				await new Promise(resolve => setTimeout(resolve, stressTestConfig.delayBetweenOrders));
			}
		}

		// ========== ORDER VERIFICATION ==========
		// Get all successful order IDs
		const successfulResults = testState.results.filter(r => r.success && r.orderId);
		
		// Also check current state for any we just added
		setTestState((prev) => {
			const allSuccessful = prev.results.filter(r => r.success && r.orderId);
			console.log(`[StressTest] 📋 ${allSuccessful.length} successful orders to verify`);
			return { ...prev, currentPhase: `📋 Verifying ${allSuccessful.length} orders against server...` };
		});

		// Wait for orders to be recorded on server
		await new Promise(resolve => setTimeout(resolve, 3000));

		// Fetch user orders from server
		try {
			const apiUrl = getPredictionApiBaseUrl();
			const ordersEndpoint = `${apiUrl}/orders/${account}`;
			
			console.log(`[StressTest] Fetching orders from: ${ordersEndpoint}`);
			
			const ordersResponse = await fetch(ordersEndpoint, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
				},
			});

			if (ordersResponse.ok) {
				const ordersData = await ordersResponse.json();
				
				// Handle different response formats
				let serverOrders: any[] = [];
				if (Array.isArray(ordersData)) {
					serverOrders = ordersData;
				} else if (ordersData?.orders) {
					serverOrders = ordersData.orders;
				} else if (ordersData?.data) {
					serverOrders = ordersData.data;
				}

				// Filter to this market
				const marketId = selectedMarket._id || selectedMarket.questionId;
				const marketOrders = serverOrders.filter((o: any) => o.questionId === marketId);
				
				console.log(`[StressTest] ========== ORDER VERIFICATION ==========`);
				console.log(`[StressTest] Total server orders for user: ${serverOrders.length}`);
				console.log(`[StressTest] Orders for this market: ${marketOrders.length}`);

				// Check each successful result
				setTestState((prev) => {
					const successfulOrders = prev.results.filter(r => r.success && r.orderId);
					let foundCount = 0;
					let filledCount = 0;
					let pendingCount = 0;
					let notFoundCount = 0;

					const verificationDetails: Array<{
						orderId: string;
						status: "FILLED" | "PENDING" | "NOT_FOUND";
						serverData: any;
					}> = [];

					for (const result of successfulOrders) {
						const serverOrder = marketOrders.find((o: any) => 
							o.orderId === result.orderId || 
							o.id === result.orderId ||
							o._id === result.orderId
						);

						if (serverOrder) {
							foundCount++;
							if (serverOrder.filled || serverOrder.status === "filled" || serverOrder.filledAt) {
								filledCount++;
								verificationDetails.push({ orderId: result.orderId!, status: "FILLED", serverData: serverOrder });
								console.log(`[StressTest] ✅ Order ${result.orderId?.slice(0, 10)}... FILLED`);
							} else {
								pendingCount++;
								verificationDetails.push({ orderId: result.orderId!, status: "PENDING", serverData: serverOrder });
								console.log(`[StressTest] ⏳ Order ${result.orderId?.slice(0, 10)}... PENDING`);
							}
						} else {
							notFoundCount++;
							verificationDetails.push({ orderId: result.orderId!, status: "NOT_FOUND", serverData: null });
							console.log(`[StressTest] ❌ Order ${result.orderId?.slice(0, 10)}... NOT FOUND on server`);
						}
					}

					console.log(`[StressTest] ========== VERIFICATION SUMMARY ==========`);
					console.log(`[StressTest] Successful submissions: ${successfulOrders.length}`);
					console.log(`[StressTest] Found on server: ${foundCount}`);
					console.log(`[StressTest] - Filled: ${filledCount}`);
					console.log(`[StressTest] - Pending: ${pendingCount}`);
					console.log(`[StressTest] Not found: ${notFoundCount}`);
					console.log(`[StressTest] ==========================================`);

					return {
						...prev,
						isRunning: false,
						currentPhase: `🔥 COMPLETE - ${filledCount} filled, ${pendingCount} pending, ${notFoundCount} not found`,
						// Store verification in settlementVerification for display
						settlementVerification: {
							initialBalances: { usdc: 0, yesTokens: 0, noTokens: 0, timestamp: new Date() },
							finalBalances: { usdc: 0, yesTokens: 0, noTokens: 0, timestamp: new Date() },
							usdcChange: 0,
							yesTokenChange: 0,
							noTokenChange: 0,
							expectedUsdcChange: 0,
							expectedYesTokenChange: 0,
							expectedNoTokenChange: 0,
							settlementMatches: notFoundCount === 0,
							orderVerification: {
								submittedOrders: successfulOrders.map(r => ({
									orderId: r.orderId!,
									tradeType: r.tradeType,
									side: r.side,
									position: r.position,
									expectedAmount: r.amount,
									expectedFee: r.expectedFee,
								})),
								serverOrders: marketOrders,
								matchedOrders: verificationDetails.map(d => ({
									orderId: d.orderId,
									filled: d.status === "FILLED",
									filledAt: d.serverData?.filledAt || null,
									actualUsdcValue: d.serverData?.usdcTotalMicro ? d.serverData.usdcTotalMicro / 1_000_000 : null,
									actualTokenValue: d.serverData?.tokenTotalMicro ? d.serverData.tokenTotalMicro / 1_000_000 : null,
								})),
								filledCount,
								pendingCount,
								notFoundCount,
							},
						},
					};
				});
			} else {
				console.error(`[StressTest] Failed to fetch orders: ${ordersResponse.status}`);
				setTestState((prev) => ({
					...prev,
					isRunning: false,
					currentPhase: `🔥 COMPLETE - Could not verify orders (${ordersResponse.status})`,
				}));
			}
		} catch (verifyError) {
			console.error(`[StressTest] Verification error:`, verifyError);
			setTestState((prev) => ({
				...prev,
				isRunning: false,
				currentPhase: `🔥 COMPLETE - Verification failed`,
				errors: [...prev.errors, `Verification error: ${verifyError}`],
			}));
		}

	}, [selectedMarket, account, signer, stressTestConfig, getAccessToken, identityToken, testState.results]);

	// Seed orderbook with Privy wallet
	const seedBookWithPrivy = useCallback(async () => {
		if (!selectedMarket || !account || !signer) {
			setSeedState((prev) => ({
				...prev,
				errors: [...prev.errors, "Missing required data: market, account, or signer"],
			}));
			return;
		}

		const { ethers } = await import("ethers");
		const accessToken = await getAccessToken();

		// Generate price levels for both sides
		const bidPrices: number[] = [];
		const askPrices: number[] = [];
		const bidStep = (seedConfig.bidMax - seedConfig.bidMin) / (seedConfig.levels - 1);
		const askStep = (seedConfig.askMax - seedConfig.askMin) / (seedConfig.levels - 1);

		for (let i = 0; i < seedConfig.levels; i++) {
			bidPrices.push(Math.round((seedConfig.bidMin + (bidStep * i)) * 100) / 100);
			askPrices.push(Math.round((seedConfig.askMin + (askStep * i)) * 100) / 100);
		}

		// Total orders = (YES bids + YES asks + NO bids + NO asks) = 4 * levels
		// But we want: YES bids (buy YES), YES asks (sell YES), NO bids (buy NO), NO asks (sell NO)
		// For seeding: BUY YES at bid prices, SELL YES at ask prices (or BUY NO which shows as SELL YES)
		// Actually simpler: For each price level, place:
		// - BUY YES order (shows as bid on YES side)
		// - BUY NO order (shows as ask on YES side, bid on NO side)
		const totalOrders = seedConfig.levels * 2; // BUY YES + BUY NO at each level

		setSeedState({
			isSeeding: true,
			currentPhase: "🌱 Starting seeding...",
			seededCount: 0,
			totalToSeed: totalOrders,
			errors: [],
		});

		console.log(`[SeedBook] 🌱 Starting to seed ${totalOrders} orders...`);
		console.log(`[SeedBook] Bid prices (BUY YES):`, bidPrices);
		console.log(`[SeedBook] Ask prices (BUY NO for YES asks):`, askPrices.map(p => (1 - p).toFixed(2)));

		const signerAddress = await signer.getAddress();
		const isSmart = account.toLowerCase() !== signerAddress.toLowerCase();

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

		let seededCount = 0;

		// BUY YES orders at bid prices (to populate YES bids)
		for (let i = 0; i < seedConfig.levels; i++) {
			const price = bidPrices[i];
			const tokenId = selectedMarket.yesTokenId;
			
			// Calculate amounts: user pays USDC, receives tokens
			// tokens = amount / price
			const usdcAmount = seedConfig.amountPerLevel;
			const tokenAmount = Math.floor(usdcAmount / price);
			
			const usdcMicro = (BigInt(Math.floor(usdcAmount * 1_000_000))).toString();
			const tokenMicro = (BigInt(tokenAmount) * BigInt(1_000_000)).toString();

			setSeedState((prev) => ({
				...prev,
				currentPhase: `🌱 BUY YES @ ${price.toFixed(2)} (${i + 1}/${seedConfig.levels})`,
			}));

			const order = {
				salt: ethers.id(`seed-yes-${Date.now()}-${Math.random()}`),
				maker: account,
				signer: signerAddress,
				taker: ethers.ZeroAddress,
				tokenId: tokenId,
				makerAmount: usdcMicro, // USDC paying
				takerAmount: tokenMicro, // Tokens receiving
				expiration: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
				nonce: 0,
				feeRateBps: 0, // BUY = 0 fee in signature
				side: "buy",
				signatureType: isSmart ? 3 : 0,
				numericSide: 0, // BUY
			};

			try {
				const orderForSigning = {
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
					signatureType: order.signatureType,
				};

				const signature = await signer.signTypedData(domain, types, orderForSigning);
				
				const marketId = selectedMarket._id || selectedMarket.questionId;
				const apiUrl = getPredictionApiBaseUrl();
				
				const payload = {
					...order,
					maker: isSmart ? order.maker : signerAddress,
					signer: isSmart ? order.signer : signerAddress,
					signature,
					type: "limit",
					size: tokenAmount.toString(),
					price: price.toFixed(2),
				};
				delete (payload as any).numericSide;

				const response = await fetch(`${apiUrl}/orders/${marketId}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
						...(identityToken ? { "privy-id-token": identityToken } : {}),
					},
					body: JSON.stringify(payload),
				});

				if (response.ok) {
					seededCount++;
					setSeedState((prev) => ({ ...prev, seededCount }));
					console.log(`[SeedBook] ✅ BUY YES @ ${price.toFixed(2)}`);
				} else {
					const errData = await response.json().catch(() => ({}));
					console.error(`[SeedBook] ❌ BUY YES @ ${price.toFixed(2)}:`, errData);
					setSeedState((prev) => ({
						...prev,
						errors: [...prev.errors, `BUY YES @ ${price}: ${errData?.error || response.status}`],
					}));
				}
			} catch (error) {
				console.error(`[SeedBook] ❌ Error:`, error);
				setSeedState((prev) => ({
					...prev,
					errors: [...prev.errors, `BUY YES @ ${price}: ${error}`],
				}));
			}

			await new Promise(resolve => setTimeout(resolve, seedConfig.delayBetweenOrders));
		}

		// BUY NO orders at (1 - askPrice) to show as YES asks
		// When you BUY NO at price X, it shows as SELL YES at (1-X)
		for (let i = 0; i < seedConfig.levels; i++) {
			const yesAskPrice = askPrices[i]; // The YES ask price we want to show
			const noPrice = Math.round((1 - yesAskPrice) * 100) / 100; // Price for NO order
			const tokenId = selectedMarket.noTokenId;
			
			// Calculate amounts
			const usdcAmount = seedConfig.amountPerLevel;
			const tokenAmount = Math.floor(usdcAmount / noPrice);
			
			const usdcMicro = (BigInt(Math.floor(usdcAmount * 1_000_000))).toString();
			const tokenMicro = (BigInt(tokenAmount) * BigInt(1_000_000)).toString();

			setSeedState((prev) => ({
				...prev,
				currentPhase: `🌱 BUY NO @ ${noPrice.toFixed(2)} (shows as YES ask @ ${yesAskPrice.toFixed(2)}) (${i + 1}/${seedConfig.levels})`,
			}));

			const order = {
				salt: ethers.id(`seed-no-${Date.now()}-${Math.random()}`),
				maker: account,
				signer: signerAddress,
				taker: ethers.ZeroAddress,
				tokenId: tokenId,
				makerAmount: usdcMicro,
				takerAmount: tokenMicro,
				expiration: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
				nonce: 0,
				feeRateBps: 0,
				side: "buy",
				signatureType: isSmart ? 3 : 0,
				numericSide: 0,
			};

			try {
				const orderForSigning = {
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
					signatureType: order.signatureType,
				};

				const signature = await signer.signTypedData(domain, types, orderForSigning);
				
				const marketId = selectedMarket._id || selectedMarket.questionId;
				const apiUrl = getPredictionApiBaseUrl();
				
				const payload = {
					...order,
					maker: isSmart ? order.maker : signerAddress,
					signer: isSmart ? order.signer : signerAddress,
					signature,
					type: "limit",
					size: tokenAmount.toString(),
					price: noPrice.toFixed(2),
				};
				delete (payload as any).numericSide;

				const response = await fetch(`${apiUrl}/orders/${marketId}`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
						...(identityToken ? { "privy-id-token": identityToken } : {}),
					},
					body: JSON.stringify(payload),
				});

				if (response.ok) {
					seededCount++;
					setSeedState((prev) => ({ ...prev, seededCount }));
					console.log(`[SeedBook] ✅ BUY NO @ ${noPrice.toFixed(2)} (YES ask @ ${yesAskPrice.toFixed(2)})`);
				} else {
					const errData = await response.json().catch(() => ({}));
					console.error(`[SeedBook] ❌ BUY NO @ ${noPrice.toFixed(2)}:`, errData);
					setSeedState((prev) => ({
						...prev,
						errors: [...prev.errors, `BUY NO @ ${noPrice}: ${errData?.error || response.status}`],
					}));
				}
			} catch (error) {
				console.error(`[SeedBook] ❌ Error:`, error);
				setSeedState((prev) => ({
					...prev,
					errors: [...prev.errors, `BUY NO @ ${noPrice}: ${error}`],
				}));
			}

			await new Promise(resolve => setTimeout(resolve, seedConfig.delayBetweenOrders));
		}

		setSeedState((prev) => ({
			...prev,
			isSeeding: false,
			currentPhase: `✅ Seeding complete - ${seededCount}/${totalOrders} orders placed`,
		}));

		console.log(`[SeedBook] ✅ Seeding complete - ${seededCount}/${totalOrders} orders placed`);

	}, [selectedMarket, account, signer, seedConfig, getAccessToken, identityToken]);

	// Calculate summary stats
	const summary = React.useMemo(() => {
		const results = testState.results;
		const classifiedErrors = testState.classifiedErrors;
		
		const totalTrades = results.length;
		const successful = results.filter((r) => r.success).length;
		const failed = results.filter((r) => !r.success).length;
		const totalFeesExpected = results.reduce((sum, r) => sum + (r.expectedFee || 0), 0);
		const totalFeesActual = results.reduce((sum, r) => sum + (r.actualFee || 0), 0);
		const totalSpentExpected = results.reduce((sum, r) => sum + (r.expectedCost || 0), 0);
		const totalSpentActual = results.reduce((sum, r) => sum + (r.actualCost || 0), 0);
		
		// Error classification counts
		const expectedErrors = classifiedErrors.filter((e) => e.category === "expected").length;
		const unexpectedErrors = classifiedErrors.filter((e) => e.category === "unexpected").length;
		const warningErrors = classifiedErrors.filter((e) => e.category === "warning").length;

		return {
			totalTrades,
			successful,
			failed,
			totalFeesExpected,
			totalFeesActual,
			totalSpentExpected,
			totalSpentActual,
			expectedErrors,
			unexpectedErrors,
			warningErrors,
		};
	}, [testState.results, testState.classifiedErrors]);

	if (!authenticated) {
		return (
			<div className="trade-testing">
				<h2>Trade Testing</h2>
				<p style={{ color: "#ef4444" }}>Please log in to use trade testing.</p>
			</div>
		);
	}

	return (
		<div className="trade-testing">
			<h2>🧪 Trade Testing</h2>
			<p style={{ color: "#9ca3af", marginBottom: 16 }}>
				Stress test the trading system with multiple orders. Uses your connected wallet.
			</p>

			{/* Wallet Info */}
			<div className="wallet-info">
				<div className="info-row">
					<span className="label">Wallet:</span>
					<span className="value">{account || "Not connected"}</span>
				</div>
				<div className="info-row">
					<span className="label">USDC Balance:</span>
					<span className="value">${usdcBalance.toFixed(2)}</span>
				</div>
				<div className="info-row">
					<span className="label">Signer Ready:</span>
					<span className={`value ${signer ? "ready" : "not-ready"}`}>
						{signer ? "✅ Yes" : "❌ No"}
					</span>
				</div>
			</div>

			{/* Market Selection */}
			<div className="section">
				<h3>1. Select Market</h3>
				<MarketSelector
					markets={unsettledMarkets}
					selectedMarket={selectedMarket}
					onSelect={setSelectedMarket}
				/>
			</div>

			{/* Orderbook Display */}
			{selectedMarket && (
				<div className="section">
					<h3>2. Live Orderbook</h3>
					<div className="ws-status">
						WebSocket: {wsConnected ? "🟢 Connected" : "🔴 Disconnected"}
					</div>
					<OrderbookDisplay 
						orderbook={orderbook} 
						loading={!wsConnected}
						error={null}
						isCollapsed={false}
					/>
				</div>
			)}

			{/* Book Seeding with Privy Wallet */}
			{selectedMarket && (
				<div className="section seed-book-section">
					<h3>🌱 Seed Order Book (Privy Wallet)</h3>
					<p className="seed-desc">
						Place limit orders from your Privy wallet to populate the orderbook. 
						Creates BUY YES orders (bids) and BUY NO orders (which show as YES asks).
					</p>

					<div className="seed-config">
						<div className="seed-config-row">
							<div className="seed-config-group">
								<h4>YES Bid Range</h4>
								<div className="seed-inputs">
									<label>
										<span>Min</span>
										<input
											type="number"
											step="0.01"
											min="0.01"
											max="0.99"
											value={seedConfig.bidMin}
											onChange={(e) => setSeedConfig(c => ({ ...c, bidMin: parseFloat(e.target.value) || 0.2 }))}
										/>
									</label>
									<label>
										<span>Max</span>
										<input
											type="number"
											step="0.01"
											min="0.01"
											max="0.99"
											value={seedConfig.bidMax}
											onChange={(e) => setSeedConfig(c => ({ ...c, bidMax: parseFloat(e.target.value) || 0.45 }))}
										/>
									</label>
								</div>
							</div>
							<div className="seed-config-group">
								<h4>YES Ask Range</h4>
								<div className="seed-inputs">
									<label>
										<span>Min</span>
										<input
											type="number"
											step="0.01"
											min="0.01"
											max="0.99"
											value={seedConfig.askMin}
											onChange={(e) => setSeedConfig(c => ({ ...c, askMin: parseFloat(e.target.value) || 0.55 }))}
										/>
									</label>
									<label>
										<span>Max</span>
										<input
											type="number"
											step="0.01"
											min="0.01"
											max="0.99"
											value={seedConfig.askMax}
											onChange={(e) => setSeedConfig(c => ({ ...c, askMax: parseFloat(e.target.value) || 0.8 }))}
										/>
									</label>
								</div>
							</div>
						</div>
						<div className="seed-config-row">
							<label className="seed-config-item">
								<span>Amount per Level ($)</span>
								<input
									type="number"
									min="1"
									max="10000"
									value={seedConfig.amountPerLevel}
									onChange={(e) => setSeedConfig(c => ({ ...c, amountPerLevel: parseInt(e.target.value) || 100 }))}
								/>
							</label>
							<label className="seed-config-item">
								<span>Price Levels</span>
								<input
									type="number"
									min="1"
									max="20"
									value={seedConfig.levels}
									onChange={(e) => setSeedConfig(c => ({ ...c, levels: parseInt(e.target.value) || 10 }))}
								/>
							</label>
							<label className="seed-config-item">
								<span>Delay (ms)</span>
								<input
									type="number"
									min="100"
									max="2000"
									step="100"
									value={seedConfig.delayBetweenOrders}
									onChange={(e) => setSeedConfig(c => ({ ...c, delayBetweenOrders: parseInt(e.target.value) || 300 }))}
								/>
							</label>
						</div>
					</div>

					<div className="seed-preview">
						<strong>Preview:</strong> {seedConfig.levels * 2} orders total 
						(~${seedConfig.levels * 2 * seedConfig.amountPerLevel} USDC)
						<br />
						<span className="seed-preview-detail">
							• YES bids: {seedConfig.bidMin.toFixed(2)} → {seedConfig.bidMax.toFixed(2)}
							<br />
							• YES asks: {seedConfig.askMin.toFixed(2)} → {seedConfig.askMax.toFixed(2)} 
							(via BUY NO @ {(1 - seedConfig.askMax).toFixed(2)} → {(1 - seedConfig.askMin).toFixed(2)})
						</span>
					</div>

					<div className="seed-actions">
						<button
							className="seed-btn"
							onClick={seedBookWithPrivy}
							disabled={seedState.isSeeding || !signer || testState.isRunning}
						>
							{seedState.isSeeding 
								? `🌱 ${seedState.currentPhase}` 
								: "🌱 Seed with Privy Wallet"}
						</button>
						{seedState.isSeeding && (
							<div className="seed-progress">
								Progress: {seedState.seededCount} / {seedState.totalToSeed}
							</div>
						)}
					</div>

					{seedState.seededCount > 0 && !seedState.isSeeding && (
						<div className="seed-result success">
							✅ {seedState.currentPhase}
						</div>
					)}

					{seedState.errors.length > 0 && (
						<div className="seed-errors">
							<strong>Errors ({seedState.errors.length}):</strong>
							<ul>
								{seedState.errors.slice(0, 5).map((err, i) => (
									<li key={i}>{err}</li>
								))}
								{seedState.errors.length > 5 && (
									<li>...and {seedState.errors.length - 5} more</li>
								)}
							</ul>
						</div>
					)}
				</div>
			)}

			{/* Test Configuration */}
			{selectedMarket && orderbook && (
				<div className="section">
					<h3>3. Test Configuration</h3>
					
					{/* Order Count Table */}
					<div className="config-table-container">
						<table className="config-table">
							<thead>
								<tr>
									<th></th>
									<th className="yes-header">YES</th>
									<th className="no-header">NO</th>
								</tr>
							</thead>
							<tbody>
								<tr>
									<td className="row-label">Market Buy</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketBuyYesCount: Math.max(0, c.marketBuyYesCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.marketBuyYesCount}
												onChange={(e) => setConfig(c => ({ ...c, marketBuyYesCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketBuyYesCount: Math.min(10, c.marketBuyYesCount + 1) }))}>+</button>
										</div>
									</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketBuyNoCount: Math.max(0, c.marketBuyNoCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.marketBuyNoCount}
												onChange={(e) => setConfig(c => ({ ...c, marketBuyNoCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketBuyNoCount: Math.min(10, c.marketBuyNoCount + 1) }))}>+</button>
										</div>
									</td>
								</tr>
								<tr>
									<td className="row-label">Market Sell</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketSellYesCount: Math.max(0, c.marketSellYesCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.marketSellYesCount}
												onChange={(e) => setConfig(c => ({ ...c, marketSellYesCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketSellYesCount: Math.min(10, c.marketSellYesCount + 1) }))}>+</button>
										</div>
									</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketSellNoCount: Math.max(0, c.marketSellNoCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.marketSellNoCount}
												onChange={(e) => setConfig(c => ({ ...c, marketSellNoCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, marketSellNoCount: Math.min(10, c.marketSellNoCount + 1) }))}>+</button>
										</div>
									</td>
								</tr>
								<tr>
									<td className="row-label">Limit Buy</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitBuyYesCount: Math.max(0, c.limitBuyYesCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.limitBuyYesCount}
												onChange={(e) => setConfig(c => ({ ...c, limitBuyYesCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitBuyYesCount: Math.min(10, c.limitBuyYesCount + 1) }))}>+</button>
										</div>
									</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitBuyNoCount: Math.max(0, c.limitBuyNoCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.limitBuyNoCount}
												onChange={(e) => setConfig(c => ({ ...c, limitBuyNoCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitBuyNoCount: Math.min(10, c.limitBuyNoCount + 1) }))}>+</button>
										</div>
									</td>
								</tr>
								<tr>
									<td className="row-label">Limit Sell</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitSellYesCount: Math.max(0, c.limitSellYesCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.limitSellYesCount}
												onChange={(e) => setConfig(c => ({ ...c, limitSellYesCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitSellYesCount: Math.min(10, c.limitSellYesCount + 1) }))}>+</button>
										</div>
									</td>
									<td>
										<div className="stepper-input">
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitSellNoCount: Math.max(0, c.limitSellNoCount - 1) }))}>−</button>
											<input
												type="text"
												value={config.limitSellNoCount}
												onChange={(e) => setConfig(c => ({ ...c, limitSellNoCount: Math.max(0, parseInt(e.target.value) || 0) }))}
											/>
											<button type="button" onClick={() => setConfig(c => ({ ...c, limitSellNoCount: Math.min(10, c.limitSellNoCount + 1) }))}>+</button>
										</div>
									</td>
								</tr>
							</tbody>
						</table>
					</div>

					{/* Other Settings */}
					<div className="config-row">
						<div className="config-item">
							<label>Min Amount ($)</label>
							<input
								type="number"
								min={0.5}
								max={100}
								step={0.5}
								value={config.minTradeAmount}
								onChange={(e) => setConfig((c) => ({ ...c, minTradeAmount: Number(e.target.value) || 0.5 }))}
							/>
						</div>
						<div className="config-item">
							<label>Max Amount ($)</label>
							<input
								type="number"
								min={1}
								max={100}
								step={0.5}
								value={config.maxTradeAmount}
								onChange={(e) => setConfig((c) => ({ ...c, maxTradeAmount: Number(e.target.value) || 1 }))}
							/>
						</div>
						<div className="config-item">
							<label>Delay (ms)</label>
							<input
								type="number"
								min={100}
								max={5000}
								step={100}
								value={config.delayBetweenTrades}
								onChange={(e) => setConfig((c) => ({ ...c, delayBetweenTrades: Number(e.target.value) || 500 }))}
							/>
						</div>
					</div>
				</div>
			)}

			{/* Run Button */}
			{selectedMarket && orderbook && (
				<div className="section">
					<button
						className="run-tests-btn"
						onClick={runTests}
						disabled={testState.isRunning || !signer}
					>
						{testState.isRunning ? `Running: ${testState.currentPhase}` : "🚀 Run Test Suite"}
					</button>
				</div>
			)}

			{/* Stress Test Section */}
			{selectedMarket && (
				<div className="section stress-test-section">
					<h3>🔥 Random Stress Test</h3>
					<p className="stress-test-desc">
						Sends completely random orders to stress test the system. 
						Includes invalid amounts, weird prices, buying without balance, selling without shares.
						<strong> Expects failures!</strong>
					</p>
					
					<div className="stress-config">
						<div className="stress-config-item">
							<label>Total Random Orders</label>
							<input
								type="number"
								min={1}
								max={100}
								value={stressTestConfig.totalRandomOrders}
								onChange={(e) => setStressTestConfig(c => ({ ...c, totalRandomOrders: parseInt(e.target.value) || 10 }))}
							/>
						</div>
						<div className="stress-config-item">
							<label>Delay (ms)</label>
							<input
								type="number"
								min={100}
								max={5000}
								step={100}
								value={stressTestConfig.delayBetweenOrders}
								onChange={(e) => setStressTestConfig(c => ({ ...c, delayBetweenOrders: parseInt(e.target.value) || 500 }))}
							/>
						</div>
						<div className="stress-config-item checkbox">
							<label>
								<input
									type="checkbox"
									checked={stressTestConfig.includeHugeAmounts}
									onChange={(e) => setStressTestConfig(c => ({ ...c, includeHugeAmounts: e.target.checked }))}
								/>
								Include huge amounts ($10k+)
							</label>
						</div>
						<div className="stress-config-item checkbox">
							<label>
								<input
									type="checkbox"
									checked={stressTestConfig.includeInvalidPrices}
									onChange={(e) => setStressTestConfig(c => ({ ...c, includeInvalidPrices: e.target.checked }))}
								/>
								Include invalid prices (0, 1.5, etc)
							</label>
						</div>
					</div>

					<button
						className="stress-test-btn"
						onClick={runStressTest}
						disabled={testState.isRunning || !signer}
					>
						{testState.isRunning && testState.currentPhase.includes("STRESS") 
							? `Running: ${testState.currentPhase}` 
							: "🔥 Run Stress Test"}
					</button>
				</div>
			)}

			{/* Results Summary */}
			{testState.results.length > 0 && (
				<div className="section">
					<h3>📊 Summary</h3>
					<div className="summary-grid">
						<div className="summary-card">
							<span className="label">Total Trades</span>
							<span className="value">{summary.totalTrades}</span>
						</div>
						<div className="summary-card success">
							<span className="label">Successful</span>
							<span className="value">{summary.successful}</span>
						</div>
						<div className="summary-card error">
							<span className="label">Failed</span>
							<span className="value">{summary.failed}</span>
						</div>
						<div className="summary-card">
							<span className="label">Expected Fees</span>
							<span className="value">${summary.totalFeesExpected.toFixed(2)}</span>
						</div>
						<div className="summary-card">
							<span className="label">Actual Fees</span>
							<span className="value">${summary.totalFeesActual.toFixed(2)}</span>
						</div>
						<div className="summary-card">
							<span className="label">Expected Cost</span>
							<span className="value">${summary.totalSpentExpected.toFixed(2)}</span>
						</div>
						<div className="summary-card">
							<span className="label">Actual Cost</span>
							<span className="value">${summary.totalSpentActual.toFixed(2)}</span>
						</div>
					</div>
				</div>
			)}

			{/* Settlement Verification */}
			{testState.settlementVerification && (
				<div className="section">
					<h3>
						{testState.settlementVerification.settlementMatches 
							? "✅ Settlement Verification - VERIFIED" 
							: "⚠️ Settlement Verification - DISCREPANCY DETECTED"}
					</h3>
					<div className="settlement-grid">
						<div className="settlement-section">
							<h4>Balance Changes</h4>
							<table className="settlement-table">
								<thead>
									<tr>
										<th>Asset</th>
										<th>Initial</th>
										<th>Final</th>
										<th>Change</th>
										<th>Expected</th>
										<th>Match</th>
									</tr>
								</thead>
								<tbody>
									<tr>
										<td><strong>USDC</strong></td>
										<td>${testState.settlementVerification.initialBalances.usdc.toFixed(2)}</td>
										<td>${testState.settlementVerification.finalBalances.usdc.toFixed(2)}</td>
										<td className={testState.settlementVerification.usdcChange >= 0 ? "positive" : "negative"}>
											{testState.settlementVerification.usdcChange >= 0 ? "+" : ""}
											${testState.settlementVerification.usdcChange.toFixed(2)}
										</td>
										<td>
											{testState.settlementVerification.expectedUsdcChange >= 0 ? "+" : ""}
											${testState.settlementVerification.expectedUsdcChange.toFixed(2)}
										</td>
										<td>
											{Math.abs(testState.settlementVerification.usdcChange - testState.settlementVerification.expectedUsdcChange) < 0.05 
												? "✅" : "❌"}
										</td>
									</tr>
									<tr>
										<td><strong>YES Tokens</strong></td>
										<td>{testState.settlementVerification.initialBalances.yesTokens.toFixed(4)}</td>
										<td>{testState.settlementVerification.finalBalances.yesTokens.toFixed(4)}</td>
										<td className={testState.settlementVerification.yesTokenChange >= 0 ? "positive" : "negative"}>
											{testState.settlementVerification.yesTokenChange >= 0 ? "+" : ""}
											{testState.settlementVerification.yesTokenChange.toFixed(4)}
										</td>
										<td>
											{testState.settlementVerification.expectedYesTokenChange >= 0 ? "+" : ""}
											{testState.settlementVerification.expectedYesTokenChange.toFixed(4)}
										</td>
										<td>
											{Math.abs(testState.settlementVerification.yesTokenChange - testState.settlementVerification.expectedYesTokenChange) < 0.01 
												? "✅" : "❌"}
										</td>
									</tr>
									<tr>
										<td><strong>NO Tokens</strong></td>
										<td>{testState.settlementVerification.initialBalances.noTokens.toFixed(4)}</td>
										<td>{testState.settlementVerification.finalBalances.noTokens.toFixed(4)}</td>
										<td className={testState.settlementVerification.noTokenChange >= 0 ? "positive" : "negative"}>
											{testState.settlementVerification.noTokenChange >= 0 ? "+" : ""}
											{testState.settlementVerification.noTokenChange.toFixed(4)}
										</td>
										<td>
											{testState.settlementVerification.expectedNoTokenChange >= 0 ? "+" : ""}
											{testState.settlementVerification.expectedNoTokenChange.toFixed(4)}
										</td>
										<td>
											{Math.abs(testState.settlementVerification.noTokenChange - testState.settlementVerification.expectedNoTokenChange) < 0.01 
												? "✅" : "❌"}
										</td>
									</tr>
								</tbody>
							</table>
						</div>
						<div className="settlement-notes">
							<p><strong>Note:</strong> Limit orders may not execute immediately and will show as discrepancies until filled. Market orders should match expected values closely.</p>
							<p><strong>Fee Contracts:</strong></p>
							<ul>
								<li>BUY fees: FeeWrapper (0xf4cb...78Df)</li>
								<li>SELL fees: FeeModule (0x06d9...3983)</li>
							</ul>
						</div>

						{/* Order Verification from Server */}
						{testState.settlementVerification.orderVerification && (
							<div className="settlement-section order-verification">
								<h4>📋 Order Verification (from Server API)</h4>
								<div className="order-summary-cards">
									<div className="summary-mini-card">
										<span className="label">Submitted</span>
										<span className="value">{testState.settlementVerification.orderVerification.submittedOrders.length}</span>
									</div>
									<div className="summary-mini-card success">
										<span className="label">Filled</span>
										<span className="value">{testState.settlementVerification.orderVerification.filledCount}</span>
									</div>
									<div className="summary-mini-card warning">
										<span className="label">Pending</span>
										<span className="value">{testState.settlementVerification.orderVerification.pendingCount}</span>
									</div>
									<div className="summary-mini-card error">
										<span className="label">Not Found</span>
										<span className="value">{testState.settlementVerification.orderVerification.notFoundCount}</span>
									</div>
								</div>
								<table className="settlement-table order-table">
									<thead>
										<tr>
											<th>Order ID</th>
											<th>Type</th>
											<th>Side</th>
											<th>Position</th>
											<th>Expected $</th>
											<th>Actual USDC</th>
											<th>Actual Tokens</th>
											<th>Status</th>
										</tr>
									</thead>
									<tbody>
										{testState.settlementVerification.orderVerification.matchedOrders.map((order, idx) => {
											const submitted = testState.settlementVerification?.orderVerification?.submittedOrders[idx];
											return (
												<tr key={order.orderId} className={order.filled ? "filled-row" : "pending-row"}>
													<td className="monospace" title={order.orderId}>
														{order.orderId.slice(0, 10)}...
													</td>
													<td>{submitted?.tradeType?.toUpperCase() || "—"}</td>
													<td>{submitted?.side?.toUpperCase() || "—"}</td>
													<td>{submitted?.position?.toUpperCase() || "—"}</td>
													<td>${submitted?.expectedAmount?.toFixed(2) || "—"}</td>
													<td>{order.actualUsdcValue !== null ? `$${order.actualUsdcValue.toFixed(2)}` : "—"}</td>
													<td>{order.actualTokenValue !== null ? order.actualTokenValue.toFixed(4) : "—"}</td>
													<td>
														{order.filled ? (
															<span className="status-badge filled">✅ FILLED</span>
														) : (
															<span className="status-badge pending">⏳ PENDING</span>
														)}
													</td>
												</tr>
											);
										})}
									</tbody>
								</table>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Detailed Results Log */}
			{testState.results.length > 0 && (
				<div className="section">
					<h3>📋 Detailed Results</h3>
					<TradeResultsLog results={testState.results} />
				</div>
			)}

			{/* Error Analysis */}
			{testState.classifiedErrors.length > 0 && (
				<div className="section error-analysis-section">
					<h3>🔍 Error Analysis</h3>
					
					{/* Error Summary Cards */}
					<div className="error-summary-grid">
						<div className={`error-summary-card expected ${summary.expectedErrors > 0 ? "has-errors" : ""}`}>
							<span className="icon">✅</span>
							<span className="count">{summary.expectedErrors}</span>
							<span className="label">Expected Rejections</span>
							<span className="description">Server correctly rejected invalid orders</span>
						</div>
						<div className={`error-summary-card warning ${summary.warningErrors > 0 ? "has-errors" : ""}`}>
							<span className="icon">⚠️</span>
							<span className="count">{summary.warningErrors}</span>
							<span className="label">Warnings</span>
							<span className="description">User actions or timeouts</span>
						</div>
						<div className={`error-summary-card unexpected ${summary.unexpectedErrors > 0 ? "has-errors" : ""}`}>
							<span className="icon">🚨</span>
							<span className="count">{summary.unexpectedErrors}</span>
							<span className="label">Unexpected Errors</span>
							<span className="description">Potential bugs - needs investigation!</span>
						</div>
					</div>

					{/* Overall Assessment */}
					<div className={`error-assessment ${summary.unexpectedErrors === 0 ? "all-good" : "needs-attention"}`}>
						{summary.unexpectedErrors === 0 ? (
							<>
								<span className="assessment-icon">✅</span>
								<span className="assessment-text">
									<strong>All errors are expected!</strong> The system is correctly rejecting invalid orders.
									{summary.expectedErrors > 0 && ` (${summary.expectedErrors} expected rejections)`}
								</span>
							</>
						) : (
							<>
								<span className="assessment-icon">🚨</span>
								<span className="assessment-text">
									<strong>{summary.unexpectedErrors} unexpected error{summary.unexpectedErrors > 1 ? "s" : ""} detected!</strong> 
									These may indicate bugs that need investigation.
								</span>
							</>
						)}
					</div>

					{/* Grouped Error Details */}
					{summary.unexpectedErrors > 0 && (
						<div className="error-group unexpected-group">
							<h4>🚨 Unexpected Errors (Need Investigation)</h4>
							<div className="error-list">
								{testState.classifiedErrors
									.filter(e => e.category === "unexpected")
									.map((err, i) => (
										<div key={i} className="classified-error-item unexpected">
											<div className="error-header">
												<span className="trade-num">Trade #{err.tradeIndex}</span>
												<span className="error-reason">{err.reason}</span>
											</div>
											<div className="error-message">{err.message}</div>
										</div>
									))}
							</div>
						</div>
					)}

					{summary.warningErrors > 0 && (
						<div className="error-group warning-group">
							<h4>⚠️ Warnings</h4>
							<div className="error-list">
								{testState.classifiedErrors
									.filter(e => e.category === "warning")
									.map((err, i) => (
										<div key={i} className="classified-error-item warning">
											<div className="error-header">
												<span className="trade-num">Trade #{err.tradeIndex}</span>
												<span className="error-reason">{err.reason}</span>
											</div>
											<div className="error-message">{err.message}</div>
										</div>
									))}
							</div>
						</div>
					)}

					{summary.expectedErrors > 0 && (
						<div className="error-group expected-group">
							<h4>✅ Expected Rejections (System Working Correctly)</h4>
							<details>
								<summary>{summary.expectedErrors} expected error{summary.expectedErrors > 1 ? "s" : ""} - click to expand</summary>
								<div className="error-list">
									{testState.classifiedErrors
										.filter(e => e.category === "expected")
										.map((err, i) => (
											<div key={i} className="classified-error-item expected">
												<div className="error-header">
													<span className="trade-num">Trade #{err.tradeIndex}</span>
													<span className="error-reason">{err.reason}</span>
												</div>
												<div className="error-message">{err.message}</div>
											</div>
										))}
								</div>
							</details>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

