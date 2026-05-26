import type { TestScenario } from "./TradeBoxTestRunner";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { ExpectedOutcomeCalculator } from "./ExpectedOutcomeCalculator";

/**
 * Generate test scenarios for a given market and orderbook
 */
export class TradeBoxTestScenarios {
	/**
	 * Generate all test scenarios for market and limit orders
	 */
	static generateAllScenarios(orderbook: OrderbookSnapshot): TestScenario[] {
		const scenarios: TestScenario[] = [];

		// Market Buy Orders - ALTERNATING YES/NO
		const yesMarketBuy = this.generateMarketBuyScenarios("yes", orderbook);
		const noMarketBuy = this.generateMarketBuyScenarios("no", orderbook);
		const maxBuyLength = Math.max(yesMarketBuy.length, noMarketBuy.length);
		for (let i = 0; i < maxBuyLength; i++) {
			if (i < yesMarketBuy.length) scenarios.push(yesMarketBuy[i]);
			if (i < noMarketBuy.length) scenarios.push(noMarketBuy[i]);
		}

		// Market Sell Orders - ALTERNATING YES/NO
		const yesMarketSell = this.generateMarketSellScenarios("yes", orderbook);
		const noMarketSell = this.generateMarketSellScenarios("no", orderbook);
		const maxSellLength = Math.max(yesMarketSell.length, noMarketSell.length);
		for (let i = 0; i < maxSellLength; i++) {
			if (i < yesMarketSell.length) scenarios.push(yesMarketSell[i]);
			if (i < noMarketSell.length) scenarios.push(noMarketSell[i]);
		}

		// Limit Buy Orders - ALTERNATING YES/NO
		const yesLimitBuy = this.generateLimitBuyScenarios("yes", orderbook);
		const noLimitBuy = this.generateLimitBuyScenarios("no", orderbook);
		const maxLimitBuyLength = Math.max(yesLimitBuy.length, noLimitBuy.length);
		for (let i = 0; i < maxLimitBuyLength; i++) {
			if (i < yesLimitBuy.length) scenarios.push(yesLimitBuy[i]);
			if (i < noLimitBuy.length) scenarios.push(noLimitBuy[i]);
		}

		// Limit Sell Orders - ALTERNATING YES/NO
		const yesLimitSell = this.generateLimitSellScenarios("yes", orderbook);
		const noLimitSell = this.generateLimitSellScenarios("no", orderbook);
		const maxLimitSellLength = Math.max(yesLimitSell.length, noLimitSell.length);
		for (let i = 0; i < maxLimitSellLength; i++) {
			if (i < yesLimitSell.length) scenarios.push(yesLimitSell[i]);
			if (i < noLimitSell.length) scenarios.push(noLimitSell[i]);
		}

		return scenarios;
	}

	/**
	 * Generate market buy test scenarios for a specific position
	 */
	private static generateMarketBuyScenarios(
		position: "yes" | "no",
		orderbook: OrderbookSnapshot,
	): TestScenario[] {
		const scenarios: TestScenario[] = [];
		const dollarAmounts = [5, 10, 25, 50, 100]; // Different USD amounts to test

		for (const amount of dollarAmounts) {
			const expectedOutcome = ExpectedOutcomeCalculator.calculateMarketBuy(
				amount,
				position,
				orderbook,
			);

			scenarios.push({
				id: `market-buy-${position}-${amount}`,
				name: `Market Buy ${position.toUpperCase()} - $${amount}`,
				description: `Execute a market buy order for ${position.toUpperCase()} tokens with $${amount}`,
				orderType: "market",
				side: "buy",
				position,
				amount,
				expectedOutcome,
			});
		}

		return scenarios;
	}

	/**
	 * Generate market sell test scenarios for a specific position
	 */
	private static generateMarketSellScenarios(
		position: "yes" | "no",
		orderbook: OrderbookSnapshot,
	): TestScenario[] {
		const scenarios: TestScenario[] = [];
		const shareAmounts = [10, 25, 50, 100]; // Different share amounts to test

		for (const amount of shareAmounts) {
			const expectedOutcome = ExpectedOutcomeCalculator.calculateMarketSell(
				amount,
				position,
				orderbook,
			);

			scenarios.push({
				id: `market-sell-${position}-${amount}`,
				name: `Market Sell ${position.toUpperCase()} - ${amount} shares`,
				description: `Execute a market sell order for ${amount} ${position.toUpperCase()} tokens`,
				orderType: "market",
				side: "sell",
				position,
				amount,
				expectedOutcome,
			});
		}

		return scenarios;
	}

	/**
	 * Generate limit buy test scenarios for a specific position
	 */
	private static generateLimitBuyScenarios(
		position: "yes" | "no",
		orderbook: OrderbookSnapshot,
	): TestScenario[] {
		const scenarios: TestScenario[] = [];

		// Get best ask to determine good prices
		const relevantOrders = position === "yes" ? orderbook.asks : orderbook.bids;
		if (!relevantOrders || relevantOrders.length === 0) {
			return scenarios;
		}

		const bestAsk =
			position === "yes"
				? Math.min(...relevantOrders.map((o) => o.price))
				: Math.min(...relevantOrders.map((o) => 1 - o.price));

		// Test prices: at best ask (immediate fill), and below (partial/no fill)
		// MUST be between 0.01 and 0.99 with 2 decimal places
		const testPrices = [
			Math.min(99, Math.max(1, Math.floor(bestAsk * 100))), // At best ask (should fill immediately)
			Math.min(99, Math.max(1, Math.floor(bestAsk * 0.95 * 100))), // 5% below (might partially fill or sit)
			Math.min(99, Math.max(1, Math.floor(bestAsk * 0.9 * 100))), // 10% below (likely to sit in book)
		];

		const shareAmounts = [10, 50]; // Test with different share amounts

		for (const shares of shareAmounts) {
			for (const price of testPrices) {
				const expectedOutcome = ExpectedOutcomeCalculator.calculateLimitBuy(
					shares,
					price,
					position,
					orderbook,
				);

				scenarios.push({
					id: `limit-buy-${position}-${shares}-${price}`,
					name: `Limit Buy ${position.toUpperCase()} - ${shares} shares @ $${(price / 100).toFixed(2)}`,
					description: `Execute a limit buy order for ${shares} ${position.toUpperCase()} tokens at $${(price / 100).toFixed(2)}`,
					orderType: "limit",
					side: "buy",
					position,
					amount: shares,
					price,
					expectedOutcome,
				});
			}
		}

		return scenarios;
	}

	/**
	 * Generate limit sell test scenarios for a specific position
	 */
	private static generateLimitSellScenarios(
		position: "yes" | "no",
		orderbook: OrderbookSnapshot,
	): TestScenario[] {
		const scenarios: TestScenario[] = [];

		// Get best bid to determine good prices
		const relevantOrders = position === "yes" ? orderbook.bids : orderbook.asks;
		if (!relevantOrders || relevantOrders.length === 0) {
			return scenarios;
		}

		const bestBid =
			position === "yes"
				? Math.max(...relevantOrders.map((o) => o.price))
				: Math.max(...relevantOrders.map((o) => 1 - o.price));

		// Test prices: at best bid (immediate fill), and above (partial/no fill)
		// MUST be between 0.01 and 0.99 with 2 decimal places
		const testPrices = [
			Math.min(99, Math.max(1, Math.floor(bestBid * 100))), // At best bid (should fill immediately)
			Math.min(99, Math.max(1, Math.floor(bestBid * 1.05 * 100))), // 5% above (might partially fill or sit)
			Math.min(99, Math.max(1, Math.floor(bestBid * 1.1 * 100))), // 10% above (likely to sit in book)
		];

		const shareAmounts = [10, 50]; // Test with different share amounts

		for (const shares of shareAmounts) {
			for (const price of testPrices) {
				const expectedOutcome = ExpectedOutcomeCalculator.calculateLimitSell(
					shares,
					price,
					position,
					orderbook,
				);

				scenarios.push({
					id: `limit-sell-${position}-${shares}-${price}`,
					name: `Limit Sell ${position.toUpperCase()} - ${shares} shares @ $${(price / 100).toFixed(2)}`,
					description: `Execute a limit sell order for ${shares} ${position.toUpperCase()} tokens at $${(price / 100).toFixed(2)}`,
					orderType: "limit",
					side: "sell",
					position,
					amount: shares,
					price,
					expectedOutcome,
				});
			}
		}

		return scenarios;
	}

	/**
	 * Generate a minimal set of essential test scenarios
	 */
	static generateEssentialScenarios(orderbook: OrderbookSnapshot): TestScenario[] {
		const scenarios: TestScenario[] = [];

		// Essential market orders only - one for each combination
		scenarios.push({
			id: "market-buy-yes-10",
			name: "Market Buy YES - $10",
			description: "Execute a market buy order for YES tokens with $10",
			orderType: "market",
			side: "buy",
			position: "yes",
			amount: 10,
			expectedOutcome: ExpectedOutcomeCalculator.calculateMarketBuy(10, "yes", orderbook),
		});

		scenarios.push({
			id: "market-buy-no-10",
			name: "Market Buy NO - $10",
			description: "Execute a market buy order for NO tokens with $10",
			orderType: "market",
			side: "buy",
			position: "no",
			amount: 10,
			expectedOutcome: ExpectedOutcomeCalculator.calculateMarketBuy(10, "no", orderbook),
		});

		scenarios.push({
			id: "market-sell-yes-10",
			name: "Market Sell YES - 10 shares",
			description: "Execute a market sell order for 10 YES tokens",
			orderType: "market",
			side: "sell",
			position: "yes",
			amount: 10,
			expectedOutcome: ExpectedOutcomeCalculator.calculateMarketSell(10, "yes", orderbook),
		});

		scenarios.push({
			id: "market-sell-no-10",
			name: "Market Sell NO - 10 shares",
			description: "Execute a market sell order for 10 NO tokens",
			orderType: "market",
			side: "sell",
			position: "no",
			amount: 10,
			expectedOutcome: ExpectedOutcomeCalculator.calculateMarketSell(10, "no", orderbook),
		});

		// Add one limit order test for each combination
		const yesAsks = orderbook.asks || [];
		const yesBids = orderbook.bids || [];

		if (yesAsks.length > 0) {
			const bestYesAsk = Math.min(...yesAsks.map((o) => o.price));
			const yesLimitPrice = Math.floor(bestYesAsk * 100);

			scenarios.push({
				id: "limit-buy-yes-10",
				name: `Limit Buy YES - 10 shares @ $${(yesLimitPrice / 100).toFixed(2)}`,
				description: `Execute a limit buy order for 10 YES tokens at $${(yesLimitPrice / 100).toFixed(2)}`,
				orderType: "limit",
				side: "buy",
				position: "yes",
				amount: 10,
				price: yesLimitPrice,
				expectedOutcome: ExpectedOutcomeCalculator.calculateLimitBuy(
					10,
					yesLimitPrice,
					"yes",
					orderbook,
				),
			});
		}

		if (yesBids.length > 0) {
			const bestYesBid = Math.max(...yesBids.map((o) => o.price));
			const yesLimitSellPrice = Math.floor(bestYesBid * 100);

			scenarios.push({
				id: "limit-sell-yes-10",
				name: `Limit Sell YES - 10 shares @ $${(yesLimitSellPrice / 100).toFixed(2)}`,
				description: `Execute a limit sell order for 10 YES tokens at $${(yesLimitSellPrice / 100).toFixed(2)}`,
				orderType: "limit",
				side: "sell",
				position: "yes",
				amount: 10,
				price: yesLimitSellPrice,
				expectedOutcome: ExpectedOutcomeCalculator.calculateLimitSell(
					10,
					yesLimitSellPrice,
					"yes",
					orderbook,
				),
			});
		}

		return scenarios;
	}

	/**
	 * Generate custom test scenarios based on user preferences
	 */
	static generateCustomScenarios(
		config: {
			includeMarketBuy?: boolean;
			includeMarketSell?: boolean;
			includeLimitBuy?: boolean;
			includeLimitSell?: boolean;
			positions?: ("yes" | "no")[];
			dollarAmounts?: number[];
			shareAmounts?: number[];
		},
		orderbook: OrderbookSnapshot,
	): TestScenario[] {
		const scenarios: TestScenario[] = [];
		const positions = config.positions || ["yes", "no"];

		if (config.includeMarketBuy) {
			for (const position of positions) {
				const amounts = config.dollarAmounts || [10, 25, 50];
				for (const amount of amounts) {
					const expectedOutcome = ExpectedOutcomeCalculator.calculateMarketBuy(
						amount,
						position,
						orderbook,
					);

					scenarios.push({
						id: `market-buy-${position}-${amount}`,
						name: `Market Buy ${position.toUpperCase()} - $${amount}`,
						description: `Execute a market buy order for ${position.toUpperCase()} tokens with $${amount}`,
						orderType: "market",
						side: "buy",
						position,
						amount,
						expectedOutcome,
					});
				}
			}
		}

		if (config.includeMarketSell) {
			for (const position of positions) {
				const amounts = config.shareAmounts || [10, 25, 50];
				for (const amount of amounts) {
					const expectedOutcome = ExpectedOutcomeCalculator.calculateMarketSell(
						amount,
						position,
						orderbook,
					);

					scenarios.push({
						id: `market-sell-${position}-${amount}`,
						name: `Market Sell ${position.toUpperCase()} - ${amount} shares`,
						description: `Execute a market sell order for ${amount} ${position.toUpperCase()} tokens`,
						orderType: "market",
						side: "sell",
						position,
						amount,
						expectedOutcome,
					});
				}
			}
		}

		// Limit orders would follow similar pattern...
		// Simplified for now

		return scenarios;
	}
}
