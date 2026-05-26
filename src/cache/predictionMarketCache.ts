import { PredictionMarket } from "@/services/api/predictionMarketDataService";

interface CachedMarketData {
	market: PredictionMarket;
	lastUpdated: number;
	historicalPrices: Array<{
		timestamp: number;
		price: number;
		volume?: number;
	}>;
}

class PredictionMarketCache {
	private cache: Map<string, CachedMarketData> = new Map();
	private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

	/**
	 * Store prediction market data in cache
	 */
	setMarketData(market: PredictionMarket): void {
		const rawPrices =
			(market.historicalPrices?.length ? market.historicalPrices : null) ??
			(market.historicalPricesYes?.length ? market.historicalPricesYes : null) ??
			[];
		const historicalPrices = this.transformHistoricalPrices(rawPrices);

		// Use consistent key - prefer _id, fallback to questionId, then marketId
		const cacheKey = market._id || market.questionId || market.marketId;
		if (!cacheKey) {
			console.warn("Cannot cache market - no valid ID found:", market);
			return;
		}

		const cachedData = {
			market,
			lastUpdated: Date.now(),
			historicalPrices,
		};

		// Store under all possible IDs to ensure lookups work
		this.cache.set(cacheKey, cachedData);
		if (market._id && market._id !== cacheKey) {
			this.cache.set(market._id, cachedData);
		}
		if (market.questionId && market.questionId !== cacheKey) {
			this.cache.set(market.questionId, cachedData);
		}
		if (market.marketId && market.marketId !== cacheKey) {
			this.cache.set(market.marketId, cachedData);
		}
	}

	/**
	 * Get cached market data by questionId
	 */
	getMarketData(questionId: string): CachedMarketData | null {
		const cached = this.cache.get(questionId);
		if (!cached) return null;

		// Check if cache is expired
		if (Date.now() - cached.lastUpdated > this.CACHE_DURATION) {
			this.cache.delete(questionId);
			return null;
		}

		return cached;
	}

	/**
	 * Get all cached markets
	 */
	getAllMarkets(): PredictionMarket[] {
		const markets: PredictionMarket[] = [];
		for (const [questionId, cached] of this.cache.entries()) {
			if (Date.now() - cached.lastUpdated <= this.CACHE_DURATION) {
				markets.push(cached.market);
			} else {
				this.cache.delete(questionId);
			}
		}
		return markets;
	}

	/**
	 * Get historical price data for a specific market
	 */
	getHistoricalPrices(questionId: string): Array<{
		timestamp: number;
		price: number;
		volume?: number;
	}> {
		const cached = this.getMarketData(questionId);
		return cached?.historicalPrices || [];
	}

	/**
	 * Store historical price data for a specific market
	 */
	storeHistoricalPrices(
		questionId: string,
		historicalPrices: Array<{
			timestamp: number;
			price: number;
			volume?: number;
		}>,
	): void {
		const transformedPrices = this.transformHistoricalPrices(historicalPrices as any[]);

		const existing = this.cache.get(questionId);
		if (existing) {
			existing.historicalPrices = transformedPrices;
			existing.lastUpdated = Date.now();
			// Quiet cache update log to keep console clean
		} else {
			// Create placeholder entry if market not cached yet
			const placeholderData = {
				market: { questionId } as PredictionMarket,
				lastUpdated: Date.now(),
				historicalPrices: transformedPrices,
			};
			this.cache.set(questionId, placeholderData);
			// Quiet initial store log to keep console clean
		}
	}

	/**
	 * Transform historical prices from API format to chart format
	 */
	private transformHistoricalPrices(historicalPrices: any[]): Array<{
		timestamp: number;
		price: number;
		volume?: number;
	}> {
		const now = Math.floor(Date.now() / 1000);
		const oneYearAgo = now - 365 * 24 * 60 * 60;
		const oneYearFuture = now + 365 * 24 * 60 * 60;

		const transformed = historicalPrices
			.map((item) => {
				let timestamp: number;
				let price: number;
				let volume: number | undefined;

				if (typeof item === "object" && item !== null) {
					if (item.timestamp && typeof item.timestamp === "number") {
						timestamp = item.timestamp;
					} else if (item.time && typeof item.time === "number") {
						timestamp = item.time;
					} else if (item.date && typeof item.date === "number") {
						timestamp = item.date;
					} else if (item.ts && typeof item.ts === "number") {
						timestamp = item.ts > 1e12 ? Math.floor(item.ts / 1000) : item.ts;
					} else {
						const date = new Date(
							item.timestamp || item.time || item.date || item.ts || Date.now(),
						);
						timestamp = Math.floor(date.getTime() / 1000);
					}

					price = parseFloat(item.price || item.value || item.close || 0);
					volume = item.volume ? parseFloat(item.volume) : undefined;
				} else {
					// Skip invalid items instead of using current time
					return null;
				}

				// Validate timestamp range - drop invalid entries instead of coercing
				if (timestamp < oneYearAgo || timestamp > oneYearFuture) {
					return null;
				}

				// Validate price - allow zero; clamp to [0,1]; drop NaN
				if (isNaN(price)) {
					return null;
				}

				// Normalize common percent inputs (e.g., 0-100) to 0-1 if needed
				if (price > 1 && price <= 100) {
					price = price / 100;
				}

				// Clamp to [0,1]
				if (price < 0) price = 0;
				if (price > 1) price = 1;

				const entry: {
					timestamp: number;
					price: number;
					volume?: number;
				} = {
					timestamp,
					price,
				};
				if (typeof volume === "number" && !isNaN(volume)) {
					entry.volume = volume;
				}
				return entry;
			})
			.filter(
				(
					item,
				): item is {
					timestamp: number;
					price: number;
					volume?: number;
				} => item !== null,
			)
			.sort((a, b) => a.timestamp - b.timestamp);

		return transformed;
	}

	/**
	 * Clear all cached data
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Get cache statistics
	 */
	getStats(): {
		totalMarkets: number;
		validMarkets: number;
		expiredMarkets: number;
	} {
		const now = Date.now();
		let validMarkets = 0;
		let expiredMarkets = 0;

		for (const cached of this.cache.values()) {
			if (now - cached.lastUpdated <= this.CACHE_DURATION) {
				validMarkets++;
			} else {
				expiredMarkets++;
			}
		}

		return {
			totalMarkets: this.cache.size,
			validMarkets,
			expiredMarkets,
		};
	}

	/**
	 * Debug method to inspect cache contents
	 */
	debugCache(): void {
		console.log("🔍 CACHE DEBUG - Total entries:", this.cache.size);
		const now = Date.now();

		for (const [key, cached] of this.cache.entries()) {
			const age = Math.round((now - cached.lastUpdated) / 1000);
			const isExpired = now - cached.lastUpdated > this.CACHE_DURATION;

			console.log(`📦 ${key}:`, {
				name: cached.market?.displayName || cached.market?.question || "Unknown",
				ageSeconds: age,
				expired: isExpired,
				historicalPoints: cached.historicalPrices?.length || 0,
				marketIds: {
					_id: cached.market?._id,
					questionId: cached.market?.questionId,
					marketId: cached.market?.marketId,
				},
			});
		}
	}
}

// Export singleton instance
export const predictionMarketCache = new PredictionMarketCache();
