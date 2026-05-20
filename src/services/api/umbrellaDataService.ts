import {
	predictionMarketDataService,
	PredictionMarket,
} from "./predictionMarketDataService";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import type { UmbrellaUpdatePayload } from "@/types/market-types";
export interface UmbrellaQuestion {
	questionId: string;
	displayName: string;
	marketId: string;
    tagIds?: string[];
	eventDate?: string | null;
}

export interface UmbrellaTeamMapping {
	teamId?: string;
	displayName: string;
	slug: string;
	shortCode?: string;
	pandaId?: number;
	logoUrl?: string | null;
	backgroundUrl?: string | null;
	primaryColor?: string | null;
	secondaryColor?: string | null;
	/** When true, UI inverts remote PNG (e.g. dark logo on dark background). From `teams.invertLogo` at read time. */
	invertLogo?: boolean;
}

/** Mirrors predictions-api / DB `ExchangeMatching.limitless` when present on the umbrella. */
export interface UmbrellaExchangeMatchingLimitless {
	slug: string;
	tokenIdA: string;
	tokenIdB: string;
	orderbookSlugA?: string;
	orderbookSlugB?: string;
}

/**
 * Cross-venue matching blob on the umbrella document (predictions-api).
 * Limitless UI (Basic tab, trade box, chart) is driven separately by odds-monitor
 * state built from GET /matched-markets + venue-prices WS — compare both when debugging.
 */
export interface UmbrellaExchangeMatching {
	matchedAt?: number;
	matchConfidence?: number;
	matchMethod?: string;
	pandaTeamA?: string;
	pandaTeamB?: string;
	limitless?: UmbrellaExchangeMatchingLimitless;
	polymarket?: unknown;
	kalshi?: unknown;
	dflow?: unknown;
	/** Predict.fun keys when persisted on the umbrella (GET /umbrellas); same ids as Predict REST / positions. */
	predictFun?: {
		marketIdA?: string;
		marketIdB?: string;
		tokenIdA?: string;
		tokenIdB?: string;
		decimalPrecision?: number;
		singleMarket?: boolean;
	};
	levelup?: unknown;
}

export interface UmbrellaCrossVenueVolumeByVenue {
	polymarket?: number;
	dflow?: number;
	kalshi?: number;
	predictFun?: number;
	limitless?: number;
}

/** All-time cumulative external venue volume (USD); refreshed server-side. */
export interface UmbrellaCrossVenueVolume {
	totalUsd: number;
	updatedAt: string;
	byVenue?: UmbrellaCrossVenueVolumeByVenue;
}

export interface Umbrella {
	_id: string;
	displayName: string;
	description?: string;
	image?: string;
	streamUrl?: string;
	streamEnabled?: boolean;
	children: UmbrellaQuestion[];
	originalChildren?: UmbrellaQuestion[];
	createdAt: string;
	updatedAt: string;
	__v: number;
	game?: string;
	pandascore_matchId?: string;
	teamMappings?: UmbrellaTeamMapping[];
	eventDate?: string | null;
	/** When API returns it — not used for Limitless venue row; see odds monitor + matched-markets. */
	exchangeMatching?: UmbrellaExchangeMatching;
	/** Cross-venue all-time volume (Polymarket, DFlow/Kalshi, Predict, Limitless). */
	volume?: UmbrellaCrossVenueVolume;
}

interface UmbrellaApiResponse {
	success: boolean;
	data: Umbrella[];
}

class UmbrellaDataService {
	private static CACHE_KEY = "umbrellas_cache_v1";
	private static CACHE_TS_KEY = "umbrellas_cache_ts";
	private static STALE_TTL_MS = 5 * 60 * 1000; // treat cache as stale after 5 min

	private get API_BASE_URL(): string {
		return getPredictionApiBaseUrl();
	}
	private umbrellasCache: Umbrella[] | null = null;
	private questionsCacheActive = new Map<string, PredictionMarket[]>();
	private questionsCacheAll = new Map<string, PredictionMarket[]>();
	private refreshInFlight = false;
	private onRefreshListeners: Array<(data: Umbrella[]) => void> = [];

	onRefresh(listener: (data: Umbrella[]) => void): () => void {
		this.onRefreshListeners.push(listener);
		return () => {
			this.onRefreshListeners = this.onRefreshListeners.filter(
				(l) => l !== listener
			);
		};
	}

	invalidateCache() {
		this.umbrellasCache = null;
		this.questionsCacheActive.clear();
		this.questionsCacheAll.clear();
		try {
			localStorage.removeItem(UmbrellaDataService.CACHE_KEY);
			localStorage.removeItem(UmbrellaDataService.CACHE_TS_KEY);
		} catch {}
	}

	private readLocalStorageCache(): Umbrella[] | null {
		try {
			const raw = localStorage.getItem(UmbrellaDataService.CACHE_KEY);
			if (!raw) return null;
			const parsed = JSON.parse(raw);
			if (Array.isArray(parsed) && parsed.length > 0) return parsed;
		} catch {}
		return null;
	}

	private writeLocalStorageCache(data: Umbrella[]): void {
		try {
			localStorage.setItem(
				UmbrellaDataService.CACHE_KEY,
				JSON.stringify(data)
			);
			localStorage.setItem(
				UmbrellaDataService.CACHE_TS_KEY,
				String(Date.now())
			);
		} catch {}
	}

	private async fetchFromNetwork(): Promise<Umbrella[]> {
		const response = await fetch(`${this.API_BASE_URL}/umbrellas`);

		if (!response.ok) {
			throw new Error(
				`HTTP error! status: ${response.status} - ${response.statusText}`
			);
		}

		const rawText = await response.text();
		const apiResponse: UmbrellaApiResponse = await new Promise(
			(resolve, reject) => {
				const parse = () => {
					try {
						resolve(JSON.parse(rawText) as UmbrellaApiResponse);
					} catch (e) {
						reject(e);
					}
				};
				if (typeof requestIdleCallback !== "undefined") {
					requestIdleCallback(parse, { timeout: 3000 });
				} else {
					queueMicrotask(parse);
				}
			},
		);

		if (!apiResponse.success || !Array.isArray(apiResponse.data)) {
			throw new Error("Invalid API response structure");
		}

		this.umbrellasCache = apiResponse.data;
		this.writeLocalStorageCache(apiResponse.data);
		return apiResponse.data;
	}

	private refreshInBackground(): void {
		if (this.refreshInFlight) return;
		this.refreshInFlight = true;
		this.fetchFromNetwork()
			.then((data) => {
				for (const listener of this.onRefreshListeners) {
					try {
						listener(data);
					} catch {}
				}
			})
			.catch((err) => {
				console.error("[SWR] Background refresh failed:", err);
			})
			.finally(() => {
				this.refreshInFlight = false;
			});
	}

	async fetchAllUmbrellas(): Promise<Umbrella[]> {
		try {
			if (this.umbrellasCache && this.umbrellasCache.length > 0) {
				return this.umbrellasCache;
			}

			// Serve stale localStorage cache instantly, refresh in background
			const stale = this.readLocalStorageCache();
			if (stale) {
				this.umbrellasCache = stale;
				this.refreshInBackground();
				return stale;
			}

			// No cache at all -- must wait for network
			return await this.fetchFromNetwork();
		} catch (error) {
			console.error("❌ Error fetching umbrellas:", error);

			// Last resort: try localStorage even if it's very old. Stale data
			// is still better than a blank front page when the API is down.
			const fallback = this.readLocalStorageCache();
			if (fallback) {
				this.umbrellasCache = fallback;
				return fallback;
			}

			// No network AND no cache — there is genuinely nothing to render.
			// Throw instead of returning `[]` so the caller can show an outage
			// banner. Returning `[]` here used to make the home page look like
			// "no markets" during real Predictions API downtime.
			throw error instanceof Error
				? error
				: new Error(String(error ?? "Failed to load umbrellas"));
		}
	}

	/**
	 * Fetch a specific umbrella by ID
	 */
	async fetchUmbrellaById(id: string): Promise<Umbrella | null> {
		try {
			const response = await fetch(
				`${this.API_BASE_URL}/umbrellas/${id}`
			);

			if (!response.ok) {
				if (response.status === 404) {
					return null;
				}
				throw new Error(`HTTP error! status: ${response.status}`);
			}

		const json = await response.json();
		// Server returns { success: true, data: umbrella }
		if (json.success && json.data) {
			return json.data;
		}
		return json;
		} catch (error) {
			console.error("❌ Error fetching umbrella by ID:", error);
			throw error;
		}
	}

	/**
	 * Fetch all questions for a specific umbrella
	 * This fetches the actual question data from the API, just like the original approach
	 */
	async fetchQuestionsForUmbrella(
		umbrella: Umbrella,
		options?: { includeResolved?: boolean }
	): Promise<PredictionMarket[]> {
		const includeResolved = options?.includeResolved === true;
		const cache = includeResolved
			? this.questionsCacheAll
			: this.questionsCacheActive;
		const cached = cache.get(umbrella._id);
		if (cached) return cached;

		const results = await Promise.all(
			umbrella.children.map(async (questionRef) => {
				try {
					const question =
						await predictionMarketDataService.fetchMarketById(
							questionRef.questionId
						);
					if (
						question &&
						question.historicalPrices &&
						question.historicalPrices.length > 0
					) {
						predictionMarketDataService.storeHistoricalPrices(
							question._id || question.questionId,
							question.historicalPrices as unknown as Array<{
								timestamp?: number;
								ts?: number;
								price: number;
								volume?: number;
							}>
						);
					}
					if (question) {
						question.displayName = questionRef.displayName;
						if (!question.marketId) {
							question.marketId = questionRef.marketId;
						}
						// Quiet per-question aggregation logs to keep console clean
						return question as PredictionMarket;
					}
				} catch (error) {
					// ignore and continue
				}
				return null;
			})
		);
		const filtered = results.filter(Boolean) as PredictionMarket[];
		if (includeResolved) {
			this.questionsCacheAll.set(umbrella._id, filtered);
			return filtered;
		}
		// Exclude markets that are already resolved
		const activeMarkets = filtered.filter(
			(q) => (q as any).status !== "resolved"
		);
		this.questionsCacheActive.set(umbrella._id, activeMarkets);
		return activeMarkets;
	}

	/**
	 * Health check to verify the API is accessible
	 */
	async healthCheck(): Promise<boolean> {
		try {
			const response = await fetch(`${this.API_BASE_URL}/health`);
			return response.ok;
		} catch (error) {
			console.error("❌ Umbrella service health check failed:", error);
			return false;
		}
	}

	async updateUmbrella(
		id: string,
		payload: UmbrellaUpdatePayload,
		token?: string
	) {
		try {
			const response = await fetch(`${this.API_BASE_URL}/umbrellas/${id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify(payload),
			});
			const json = await response.json().catch(() => ({} as any));
			if (!response.ok || json?.success === false) {
				throw new Error(json?.error || `HTTP ${response.status}`);
			}
			this.invalidateCache();
			return json;
		} catch (err) {
			console.error("error", err);
			throw err;
		}
	}
}

// Export a singleton instance
export const umbrellaDataService = new UmbrellaDataService();

// Also export the class for testing purposes
export default UmbrellaDataService;
