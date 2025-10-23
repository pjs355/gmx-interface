import { predictionMarketCache } from "./predictionMarketCache";

export interface PredictionMarket {
	_id: string;
	conditionId: string;
	marketId: string;
	question: string;
	questionId: string;
	yesTokenId: string;
	noTokenId: string;
	registered: boolean;
	createdAt: string;
	updatedAt: string;
	__v: number;
	displayName?: string;
	image?: string;
	historicalPricesYes: Array<{
		ts: number | string;
		price: number;
	}>;
	historicalPricesNo: Array<{
		ts: number | string;
		price: number;
	}>;
	historicalPrices: Array<{
		ts: number | string;
		price: number;
		volume?: number;
	}>;
}

interface ApiResponse {
	success: boolean;
	data: PredictionMarket[];
}

class PredictionMarketDataService {
	private readonly API_BASE_URL =
		"https://prediction-api-production.up.railway.app";

	async fetchAllMarkets(): Promise<PredictionMarket[]> {
		try {
			const response = await fetch(`${this.API_BASE_URL}/umbrellas`);
			if (!response.ok) {
				throw new Error(
					`HTTP error! status: ${response.status} - ${response.statusText}`
				);
			}
			const apiResponse: ApiResponse = await response.json();
			if (!apiResponse.success || !Array.isArray(apiResponse.data)) {
				throw new Error("Invalid API response structure");
			}
			const markets = apiResponse.data;
			markets.forEach((market) => {
				predictionMarketCache.setMarketData(market);
			});
			return markets;
		} catch (error) {
			throw error;
		}
	}

	async fetchMarketById(id: string): Promise<PredictionMarket | null> {
		try {
			const response = await fetch(
				`${this.API_BASE_URL}/questions/${id}`
			);
			if (!response.ok) {
				if (response.status === 404) {
					// Quiet missing market warning
					return null;
				}
				throw new Error(`HTTP error! status: ${response.status}`);
			}
			const apiResponse = await response.json();
			if (apiResponse.success && apiResponse.data) {
				const questionData = apiResponse.data;
				predictionMarketCache.setMarketData(questionData);
				return questionData;
			} else if (apiResponse._id) {
				predictionMarketCache.setMarketData(apiResponse);
				return apiResponse;
			} else {
				return null;
			}
		} catch (error) {
			// Quiet fetch error warning
			return null; // Return null instead of throwing to prevent breaking the UI
		}
	}

	getCachedMarketData(questionId: string): PredictionMarket | null {
		const cached = predictionMarketCache.getMarketData(questionId);
		return cached?.market || null;
	}

	getCachedMarkets(): PredictionMarket[] {
		return predictionMarketCache.getAllMarkets();
	}

	getHistoricalPrices(questionId: string): Array<{
		timestamp: number;
		price: number;
		volume?: number;
	}> {
		const prices = predictionMarketCache.getHistoricalPrices(questionId);

		return prices;
	}

	storeHistoricalPrices(
		questionId: string,
		historicalPrices: Array<{
			timestamp?: number;
			ts?: number;
			price: number;
			volume?: number;
		}>
	): void {
		const transformedPrices = historicalPrices.map((price) => {
			let timestamp = price.timestamp || price.ts || Date.now();
			if (timestamp > 1e12) {
				timestamp = Math.floor(timestamp / 1000);
			}
			const now = Math.floor(Date.now() / 1000);
			const oneYearAgo = now - 365 * 24 * 60 * 60;
			const oneYearFuture = now + 365 * 24 * 60 * 60;
			if (timestamp < oneYearAgo || timestamp > oneYearFuture) {
				timestamp = now;
			}
			return {
				timestamp,
				price: price.price,
				volume: price.volume,
			};
		});
		predictionMarketCache.storeHistoricalPrices(
			questionId,
			transformedPrices
		);
	}

	getCacheStats() {
		return predictionMarketCache.getStats();
	}

	/**
	 * Refresh historical data for a specific market
	 */
	async refreshHistoricalData(questionId: string): Promise<boolean> {
		try {
			// Quiet historical refresh start log
			const market = await this.fetchMarketById(questionId);

			if (
				market &&
				market.historicalPrices &&
				market.historicalPrices.length > 0
			) {
				this.storeHistoricalPrices(
					market._id || market.questionId,
					market.historicalPrices as unknown as Array<{
						timestamp?: number;
						ts?: number;
						price: number;
						volume?: number;
					}>
				);
				// Quiet historical refresh success log
				return true;
			}

			// Quiet no historical data log
			return false;
		} catch (error) {
			console.error(
				"❌ Error refreshing historical data for",
				questionId,
				":",
				error
			);
			return false;
		}
	}

	async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.API_BASE_URL}/health`);
			return response.ok;
		} catch (error) {
			return false;
		}
	}
}

export const predictionMarketDataService = new PredictionMarketDataService();
export default PredictionMarketDataService;
