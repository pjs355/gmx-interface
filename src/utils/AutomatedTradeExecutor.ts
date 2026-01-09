import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { OrderbookSnapshot } from "lib/orderbookService";
import type { TestScenario } from "./TradeBoxTestRunner";
import { predictionMarketService } from "lib/predictionMarketService";
import { EXCHANGE_ADDRESS } from "@/config/addresses";

/**
 * Automated trade executor that programmatically executes trades
 * This reuses the same logic as the PredictionMarketTradeBox component
 */
export class AutomatedTradeExecutor {
	/**
	 * Execute a trade scenario programmatically
	 * Uses SignerContext signer - same as production
	 */
	static async executeTrade(
		scenario: TestScenario,
		market: PredictionMarket,
		orderbook: OrderbookSnapshot,
		account: string,
		signer: any // Signer from SignerContext
	): Promise<void> {
		console.log("🤖 Automated trade execution:", scenario);

		// Calculate the actual price and amount based on order type
		let orderPrice: number;
		let orderAmount: number;

		if (scenario.orderType === "market") {
			if (scenario.side === "buy") {
				// For market buy: amount is USD, calculate contracts and price
				const calc = this.calculateMarketBuyParams(
					scenario.amount,
					scenario.position,
					orderbook
				);
				orderAmount = Math.floor(calc.contracts);
				orderPrice = calc.maxPrice;

				console.log("📊 Market BUY calculation:", {
					usdAmount: scenario.amount,
					contracts: orderAmount,
					maxPrice: orderPrice,
				});
			} else {
				// For market sell: amount is shares
				orderAmount = scenario.amount;
				const calc = this.calculateMarketSellParams(
					scenario.amount,
					scenario.position,
					orderbook
				);
				orderPrice = calc.minPrice;

				console.log("📊 Market SELL calculation:", {
					shares: orderAmount,
					minPrice: orderPrice,
				});
			}
		} else {
			// Limit order: use provided price and amount
			if (!scenario.price) {
				throw new Error("Price is required for limit orders");
			}
			orderAmount = scenario.amount;
			orderPrice = scenario.price / 100; // Convert cents to dollars

			console.log("📊 Limit order:", {
				shares: orderAmount,
				price: orderPrice,
			});
		}

		// Validate calculated values
		if (!orderAmount || !isFinite(orderAmount) || orderAmount <= 0) {
			throw new Error(`Invalid order amount: ${orderAmount}`);
		}
		if (!orderPrice || !isFinite(orderPrice) || orderPrice <= 0) {
			throw new Error(`Invalid order price: ${orderPrice}`);
		}

		// Create the order using the prediction market service
		// This matches exactly what TradeExecutionService does
		const orderData = await predictionMarketService.createOrder(
			market.marketId || market._id,
			scenario.position,
			orderAmount,
			orderPrice,
			account,
			market,
			scenario.side,
			account // For simplicity, using same address as signer
		);

		console.log("📝 Order created:", orderData);

		// Use signer from SignerContext (same as production)
		if (!signer) {
			throw new Error("No signer available from SignerContext");
		}

		// EIP-712 domain and types
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
			salt: orderData.salt,
			maker: orderData.maker,
			signer: orderData.signer,
			taker: orderData.taker,
			tokenId: orderData.tokenId,
			makerAmount: orderData.makerAmount,
			takerAmount: orderData.takerAmount,
			expiration: orderData.expiration,
			nonce: orderData.nonce,
			feeRateBps: orderData.feeRateBps,
			side: orderData.numericSide,
			signatureType: orderData.signatureType,
		};

		console.log("🔐 Signing order...");
		const signature = await signer.signTypedData(
			domain,
			types,
			orderDataForSigning
		);
		console.log("✅ Order signed:", signature);

		// Add signature to order
		const signedOrder = {
			...orderData,
			signature,
			type: scenario.orderType,
			size: orderAmount.toString(),
			price: orderPrice.toString(),
		};

		// Submit to API
		console.log("🌐 Submitting to API...");
		const result = await predictionMarketService.submitOrderToAPI(
			signedOrder,
			market.questionId || market.marketId,
			undefined,
			undefined
		);

		console.log("✅ Trade executed:", result);
	}

	/**
	 * Calculate market buy parameters (matches MarketOrderHandler logic)
	 */
	private static calculateMarketBuyParams(
		usdAmount: number,
		position: "yes" | "no",
		orderbook: OrderbookSnapshot
	): { contracts: number; maxPrice: number } {
		const S_cents = Math.floor(usdAmount * 100);
		let filled_shares = 0;
		let remaining_cents = S_cents;
		let maxPriceSeen = 0;

		const relevantOrders =
			position === "yes" ? orderbook.asks : orderbook.bids;
		const sortedOrders =
			position === "yes"
				? [...relevantOrders].sort((a, b) => a.price - b.price)
				: [...relevantOrders].sort((a, b) => b.price - a.price);

		for (const order of sortedOrders) {
			if (remaining_cents <= 0) break;

			const costPerContract =
				position === "no" ? 1 - order.price : order.price;
			const p_cents = Math.round(costPerContract * 100);

			let totalAvailableSize = 0;
			if (order.orders && Array.isArray(order.orders)) {
				totalAvailableSize = order.orders.reduce(
					(sum, nestedOrder) =>
						sum +
						(nestedOrder.size ||
							nestedOrder.makerQty ||
							nestedOrder.origSize ||
							0),
					0
				);
			} else {
				totalAvailableSize = order.size || 0;
			}

			const availableWhole = Math.floor(totalAvailableSize);
			if (availableWhole <= 0 || p_cents <= 0) continue;

			const row_total_cents = availableWhole * p_cents;

			if (remaining_cents >= row_total_cents) {
				filled_shares += availableWhole;
				remaining_cents -= row_total_cents;
				if (costPerContract > maxPriceSeen)
					maxPriceSeen = costPerContract;
			} else {
				const affordableShares = Math.floor(remaining_cents / p_cents);
				const takeShares = Math.min(
					availableWhole,
					Math.max(0, affordableShares)
				);
				if (takeShares > 0) {
					filled_shares += takeShares;
					remaining_cents -= takeShares * p_cents;
					if (costPerContract > maxPriceSeen)
						maxPriceSeen = costPerContract;
				}
				break;
			}
		}

		return {
			contracts: filled_shares,
			maxPrice: Math.round(maxPriceSeen * 100) / 100,
		};
	}

	/**
	 * Calculate market sell parameters (matches MarketOrderHandler logic)
	 */
	private static calculateMarketSellParams(
		sharesAmount: number,
		position: "yes" | "no",
		orderbook: OrderbookSnapshot
	): { minPrice: number } {
		const sharesToSell = Math.floor(sharesAmount);
		let remainingShares = sharesToSell;
		let minPriceSeen = Infinity;

		const relevantOrders =
			position === "yes" ? orderbook.bids : orderbook.asks;
		const sortedOrders =
			position === "yes"
				? [...relevantOrders].sort((a, b) => b.price - a.price)
				: [...relevantOrders].sort((a, b) => a.price - b.price);

		for (const order of sortedOrders) {
			if (remainingShares <= 0) break;

			const orderPrice =
				position === "no" ? 1 - order.price : order.price;
			let availableSize = 0;

			if (order.orders && Array.isArray(order.orders)) {
				availableSize = order.orders.reduce(
					(sum, nestedOrder) => sum + (nestedOrder.size || 0),
					0
				);
			} else {
				availableSize = order.size || 0;
			}

			const availableWhole = Math.floor(availableSize);
			const sharesAtThisPrice = Math.min(availableWhole, remainingShares);

			if (sharesAtThisPrice > 0) {
				remainingShares -= sharesAtThisPrice;
				if (orderPrice < minPriceSeen) minPriceSeen = orderPrice;
			}
		}

		return {
			minPrice:
				Math.round(
					(minPriceSeen === Infinity ? 0 : minPriceSeen) * 100
				) / 100,
		};
	}
}
