import { predictionMarketCache } from "@/cache/predictionMarketCache";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import type { UmbrellaExchangeMatching } from "@/services/api/umbrellaDataService";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";

export type MoneylineLeg = "home" | "draw" | "away";

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
	exchangeMatching?: UmbrellaExchangeMatching;
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
	/**
	 * Source-agnostic market taxonomy (esports / FIFA / MLB). Present on questions
	 * served by GET /umbrellas and GET /questions/:id. Optional for back-compat
	 * with rows created before the taxonomy migration.
	 */
	marketType?: "moneyline" | "winner" | "total" | "spread" | "prop";
	segment?: string;
	line?: number;
	/** Headline market the home page + canonical routing key off. */
	isPrimary?: boolean;
	/** LevelUp runs an on-chain order book (moneyline true, aggregator subs false). */
	tradeable?: boolean;
	sortOrder?: number;
	/** PandaScore market id; per-sub lookup key for venue prices / orderbooks / chart. */
	pandascore_marketId?: string | number;
	pandascore_template?: string;
	/** PandaScore market kind. `"game"` = per-map; `"match"` = series winner. */
	pandascore_eventType?: string;
	/**
	 * Map index for `pandascore_eventType === "game"` (Map 1, Map 2, ...). Absent
	 * or 0 on series winner. Wire key for venue prices is `${matchId}-map-${pos}`.
	 */
	pandascore_gamePosition?: number;
	/**
	 * Polymarket Gamma market id. For Polymarket-sourced sports (FIFA World Cup
	 * 3-way moneyline) this is the per-leg cross-venue lookup key, used in place
	 * of the umbrella's `pandascore_matchId` for venue prices / orderbooks / SOR.
	 */
	polymarketMarketId?: string;
	/** 3-way moneyline leg (Team A win / Draw / Team B win) when `marketType === "moneyline"`. */
	moneylineLeg?: "home" | "away" | "draw";
	status?: string;
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

/** Dedupes concurrent `fetchMatchFromPandascore` (e.g. StrictMode / sibling mounts). */
const pandascoreMatchInFlight = new Map<string, Promise<PandaScoreMatch | null>>();

class PredictionMarketDataService {
	// NOTE: API_BASE_URL is now fetched dynamically via getter to prevent
	// stale URL caching issues that caused production bugs
	private get API_BASE_URL(): string {
		return getPredictionApiBaseUrl();
	}

	async fetchMarketById(id: string): Promise<PredictionMarket | null> {
		try {
			const response = await fetch(`${this.API_BASE_URL}/questions/${id}`);
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
		accessToken?: string | null,
	): Promise<PandaScoreMatch | null> {
		const key = String(matchId);
		const inflight = pandascoreMatchInFlight.get(key);
		if (inflight) return inflight;

		const promise = (async (): Promise<PandaScoreMatch | null> => {
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
			} finally {
				pandascoreMatchInFlight.delete(key);
			}
		})();

		pandascoreMatchInFlight.set(key, promise);
		return promise;
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
		}>,
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
		predictionMarketCache.storeHistoricalPrices(questionId, transformedPrices);
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
					}>,
				);
				return true;
			}

			return false;
		} catch (error) {
			console.error("❌ Error refreshing historical data for", questionId, ":", error);
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
