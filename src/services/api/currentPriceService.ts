import { OrderbookService, type OrderbookSnapshot } from "./orderbookService";
import { predictionMarketDataService } from "./predictionMarketDataService";

export interface CurrentPrice {
	value: number | null;
	source: "live" | "historical" | "none";
	timestamp: number;
}

export interface MarketPrices {
	yes: CurrentPrice;
	no: CurrentPrice;
}

export interface PriceCache {
	[marketId: string]: MarketPrices;
}

/**
 * Clean, focused service for getting current prices
 * Handles live orderbook + historical fallback logic
 */
class CurrentPriceService {
	private orderbookService = new OrderbookService();
	private cache: PriceCache = {};
	private readonly CACHE_DURATION = 30000; // 30 seconds

	/**
	 * Get current price for a specific market and position
	 */
	async getCurrentPrice(
		marketId: string,
		position: "yes" | "no"
	): Promise<number | null> {
		const cached = this.cache[marketId];

		// Return cached data if fresh
		if (
			cached &&
			Date.now() - cached[position].timestamp < this.CACHE_DURATION
		) {
			return cached[position].value;
		}

		// If we have stale data, return it while refreshing in background
		if (cached && cached[position].value !== null) {
			// Trigger background refresh but return stale data
			this.refreshMarketPrices(marketId).catch(console.error);
			return cached[position].value;
		}

		// No cached data, fetch fresh data
		await this.refreshMarketPrices(marketId);

		return this.cache[marketId]?.[position]?.value || null;
	}

	/**
	 * Get both YES and NO prices for a market
	 */
	async getMarketPrices(marketId: string): Promise<MarketPrices> {
		const cached = this.cache[marketId];

		// Return cached data if fresh
		if (
			cached &&
			Date.now() - cached.yes.timestamp < this.CACHE_DURATION &&
			Date.now() - cached.no.timestamp < this.CACHE_DURATION
		) {
			return cached;
		}

		// If we have stale data, return it while refreshing in background
		if (cached && (cached.yes.value !== null || cached.no.value !== null)) {
			// Trigger background refresh but return stale data
			this.refreshMarketPrices(marketId).catch(console.error);
			return cached;
		}

		// No cached data, fetch fresh data
		await this.refreshMarketPrices(marketId);

		return this.cache[marketId] || this.getEmptyPrices();
	}

	/**
	 * Refresh prices for multiple markets in parallel
	 */
	async refreshMarkets(marketIds: string[]): Promise<void> {
		if (marketIds.length === 0) return;

		const concurrency = 4;
		let idx = 0;

		const worker = async () => {
			while (idx < marketIds.length) {
				const marketId = marketIds[idx++];
				await this.refreshMarketPrices(marketId);
			}
		};

		await Promise.all(
			Array.from(
				{ length: Math.min(concurrency, marketIds.length) },
				() => worker()
			)
		);
	}

	/**
	 * Get cached prices without triggering refresh
	 */
	getCachedPrices(marketId: string): MarketPrices | null {
		return this.cache[marketId] || null;
	}

	/**
	 * Clear cache
	 */
	clearCache(): void {
		this.cache = {};
	}

	/**
	 * Get cache statistics
	 */
	getCacheStats(): {
		totalMarkets: number;
		liveCount: number;
		historicalCount: number;
		noneCount: number;
	} {
		const markets = Object.values(this.cache);
		return {
			totalMarkets: markets.length,
			liveCount: markets.filter(
				(m) => m.yes.source === "live" || m.no.source === "live"
			).length,
			historicalCount: markets.filter(
				(m) =>
					m.yes.source === "historical" ||
					m.no.source === "historical"
			).length,
			noneCount: markets.filter(
				(m) => m.yes.source === "none" && m.no.source === "none"
			).length,
		};
	}

	/**
	 * Refresh prices for a single market
	 */
	private async refreshMarketPrices(marketId: string): Promise<void> {
		const existingData = this.cache[marketId];

		try {
			// Try live orderbook first
			const orderbook = await this.orderbookService.fetchOrderbook(
				marketId
			);
			const livePrices = orderbook
				? this.calculateLivePrices(orderbook)
				: null;

			if (livePrices && this.hasCompleteLiveData(livePrices)) {
				// We have complete live data
				this.cache[marketId] = livePrices;
				return;
			}

			// Try historical fallback
			const historicalPrices = this.getHistoricalPrices(marketId);
			const historicalData = historicalPrices
				? this.calculateHistoricalPrices(historicalPrices)
				: null;

			if (livePrices && historicalData) {
				// Merge live and historical data
				this.cache[marketId] = this.mergePrices(
					livePrices,
					historicalData
				);
			} else if (livePrices) {
				// Only live data available, preserve existing data for missing prices
				this.cache[marketId] = this.mergeWithExisting(
					livePrices,
					existingData
				);
			} else if (historicalData) {
				// Only historical data available, preserve existing data for missing prices
				this.cache[marketId] = this.mergeWithExisting(
					historicalData,
					existingData
				);
			} else if (existingData) {
				// No new data available, keep existing data but mark as stale
				this.cache[marketId] = {
					yes: { ...existingData.yes, source: "none" as const },
					no: { ...existingData.no, source: "none" as const },
				};
			} else {
				// No data available
				this.cache[marketId] = this.getEmptyPrices();
			}
		} catch (error) {
			console.warn(`Failed to refresh prices for ${marketId}:`, error);
			// Preserve existing data if available, otherwise set to empty
			if (existingData) {
				this.cache[marketId] = {
					yes: { ...existingData.yes, source: "none" as const },
					no: { ...existingData.no, source: "none" as const },
				};
			} else {
				this.cache[marketId] = this.getEmptyPrices();
			}
		}
	}

	/**
	 * Calculate prices from live orderbook data
	 */
	private calculateLivePrices(orderbook: OrderbookSnapshot): MarketPrices {
		let yesPrice: number | null = null;
		let noPrice: number | null = null;

		// YES price = best ask (lowest ask price)
		if (orderbook.asks && orderbook.asks.length > 0) {
			yesPrice = Math.min(...orderbook.asks.map((a) => a.price));
		}

		// NO price = 1 - best bid (highest bid price)
		if (orderbook.bids && orderbook.bids.length > 0) {
			const bestBid = Math.max(...orderbook.bids.map((b) => b.price));
			noPrice = 1 - bestBid;
		}

		return {
			yes: {
				value: yesPrice,
				source: yesPrice !== null ? "live" : "none",
				timestamp: Date.now(),
			},
			no: {
				value: noPrice,
				source: noPrice !== null ? "live" : "none",
				timestamp: Date.now(),
			},
		};
	}

	/**
	 * Calculate prices from historical data
	 */
	private calculateHistoricalPrices(
		historicalPrices: Array<{
			timestamp: number;
			price: number;
			volume?: number;
		}>
	): MarketPrices {
		if (historicalPrices.length === 0) {
			return this.getEmptyPrices();
		}

		// Use most recent historical price (assumed to be YES price)
		const mostRecent = historicalPrices[historicalPrices.length - 1];
		const historicalPrice = mostRecent.price;

		return {
			yes: {
				value: historicalPrice,
				source: "historical",
				timestamp: Date.now(),
			},
			no: {
				value: 1 - historicalPrice,
				source: "historical",
				timestamp: Date.now(),
			},
		};
	}

	/**
	 * Get historical prices for a market
	 */
	private getHistoricalPrices(marketId: string): Array<{
		timestamp: number;
		price: number;
		volume?: number;
	}> | null {
		try {
			// Try primary ID
			let prices =
				predictionMarketDataService.getHistoricalPrices(marketId);
			if (prices && prices.length > 0) {
				return prices;
			}

			// Try alternative ID formats
			const alternativeIds = [
				marketId.replace(/^[a-f0-9]{24}$/, ""), // Remove MongoDB ObjectId prefix
				marketId.split("_")[0], // First part if underscore separated
			].filter((id) => id && id !== marketId);

			for (const altId of alternativeIds) {
				prices = predictionMarketDataService.getHistoricalPrices(altId);
				if (prices && prices.length > 0) {
					return prices;
				}
			}

			return null;
		} catch (error) {
			console.warn(
				`Failed to get historical prices for ${marketId}:`,
				error
			);
			return null;
		}
	}

	/**
	 * Check if live data is complete (both YES and NO prices available)
	 */
	private hasCompleteLiveData(prices: MarketPrices): boolean {
		return prices.yes.value !== null && prices.no.value !== null;
	}

	/**
	 * Merge live and historical prices, preferring live when available
	 */
	private mergePrices(
		live: MarketPrices,
		historical: MarketPrices
	): MarketPrices {
		return {
			yes: {
				value:
					live.yes.value !== null
						? live.yes.value
						: historical.yes.value,
				source: live.yes.value !== null ? "live" : "historical",
				timestamp: Date.now(),
			},
			no: {
				value:
					live.no.value !== null
						? live.no.value
						: historical.no.value,
				source: live.no.value !== null ? "live" : "historical",
				timestamp: Date.now(),
			},
		};
	}

	/**
	 * Merge new data with existing data, preserving existing values where new data is null
	 */
	private mergeWithExisting(
		newData: MarketPrices,
		existingData: MarketPrices | undefined
	): MarketPrices {
		if (!existingData) {
			return newData;
		}

		return {
			yes: {
				value:
					newData.yes.value !== null
						? newData.yes.value
						: existingData.yes.value,
				source:
					newData.yes.value !== null
						? newData.yes.source
						: existingData.yes.source,
				timestamp: Date.now(),
			},
			no: {
				value:
					newData.no.value !== null
						? newData.no.value
						: existingData.no.value,
				source:
					newData.no.value !== null
						? newData.no.source
						: existingData.no.source,
				timestamp: Date.now(),
			},
		};
	}

	/**
	 * Get empty prices structure
	 */
	private getEmptyPrices(): MarketPrices {
		return {
			yes: { value: null, source: "none", timestamp: Date.now() },
			no: { value: null, source: "none", timestamp: Date.now() },
		};
	}
}

// Export singleton instance
export const currentPriceService = new CurrentPriceService();
export default currentPriceService;
