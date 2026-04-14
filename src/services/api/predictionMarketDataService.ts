import { predictionMarketCache } from "@/cache/predictionMarketCache";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";

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

interface PandaMatchTeam {
	id: number | null;
	name: string;
	slug?: string | null;
	acronym?: string | null;
}

export interface PandaScoreMatch {
	id: number;
	name: string;
	status?: string;
	scheduled_at?: string | null;
	winner?: PandaMatchTeam | null;
	tournament?: {
		id: number;
		name: string;
	};
	serie?: {
		id: number;
		name: string;
	};
	league?: {
		id: number;
		name: string;
	};
	opponents?: Array<{
		opponent: PandaMatchTeam;
	}>;
}

class PredictionMarketDataService {
	// NOTE: API_BASE_URL is now fetched dynamically via getter to prevent
	// stale URL caching issues that caused production bugs
	private get API_BASE_URL(): string {
		return getPredictionApiBaseUrl();
	}

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

	async fetchMatchFromPandascore(
		matchId: string | number,
		accessToken?: string | null
	): Promise<PandaScoreMatch | null> {
		try {
			const requestedUrl = `${this.API_BASE_URL}/admin/pandascore/matches/${matchId}`;
			const headers: Record<string, string> = {};
			if (accessToken) {
				headers.Authorization = `Bearer ${accessToken}`;
			}
			const response = await fetch(requestedUrl, {
				headers,
			});
			if (!response.ok) {
				return null;
			}
			const json = await response.json().catch(() => null);
			if (json && (json.success === undefined || json.success === true)) {
				const payload = json.data ?? json;
				if (payload) {
					const teams = payload.opponents || payload.teams;
					if (Array.isArray(teams) && teams.length > 0) {
						return payload;
					}
				}
				return payload;
			}
			return null;
		} catch (error) {
			console.error("error", error);
			return null;
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
			const market = await this.fetchMarketById(questionId);

			if (isPredictionPricingDebugEnabled()) {
				const url = `${this.API_BASE_URL}/questions/${questionId}`;
				priceDebugLog("predictionMarketDataService.refreshHistoricalData", {
					requestUrl: url,
					predictionApiBase: this.API_BASE_URL,
					gotMarket: Boolean(market),
					historicalPricesLen: market?.historicalPrices?.length ?? 0,
					historicalPricesYesLen: market?.historicalPricesYes?.length ?? 0,
					historicalPricesNoLen: market?.historicalPricesNo?.length ?? 0,
				});
			}

			if (!market) return false;

			const prices =
				(market.historicalPrices?.length ? market.historicalPrices : null) ??
				(market.historicalPricesYes?.length ? market.historicalPricesYes : null);

			if (prices && prices.length > 0) {
				this.storeHistoricalPrices(
					market._id || market.questionId,
					prices as unknown as Array<{
						timestamp?: number;
						ts?: number;
						price: number;
						volume?: number;
					}>
				);
				return true;
			}

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
