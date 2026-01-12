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
}

export interface Umbrella {
	_id: string;
	displayName: string;
	description?: string;
	image?: string;
	streamUrl?: string;
	streamEnabled?: boolean;
	children: UmbrellaQuestion[];
	createdAt: string;
	updatedAt: string;
	__v: number;
	game?: string;
	pandascore_matchId?: string;
	teamMappings?: UmbrellaTeamMapping[];
	eventDate?: string | null;
}

interface UmbrellaApiResponse {
	success: boolean;
	data: Umbrella[];
}

class UmbrellaDataService {
	// NOTE: API_BASE_URL is now fetched dynamically via getter to prevent
	// stale URL caching issues that caused production bugs
	private get API_BASE_URL(): string {
		return getPredictionApiBaseUrl();
	}
	private umbrellasCache: Umbrella[] | null = null;
	// Separate caches for active-only and all (including resolved)
	private questionsCacheActive = new Map<string, PredictionMarket[]>();
	private questionsCacheAll = new Map<string, PredictionMarket[]>();

	invalidateCache() {
		this.umbrellasCache = null;
		this.questionsCacheActive.clear();
		this.questionsCacheAll.clear();
	}

	/**
	 * Fetch all umbrellas from the server
	 */
	async fetchAllUmbrellas(): Promise<Umbrella[]> {
		try {
			if (this.umbrellasCache && this.umbrellasCache.length > 0) {
				return this.umbrellasCache;
			}
			// Quiet fetch start log to keep console clean

			const response = await fetch(`${this.API_BASE_URL}/umbrellas`);

			if (!response.ok) {
				console.error("❌ HTTP Error Details:", {
					status: response.status,
					statusText: response.statusText,
					url: response.url,
					headers: Object.fromEntries(response.headers.entries()),
				});
				throw new Error(
					`HTTP error! status: ${response.status} - ${response.statusText}`
				);
			}

			const apiResponse: UmbrellaApiResponse = await response.json();

			if (!apiResponse.success || !Array.isArray(apiResponse.data)) {
				console.error(
					"❌ Unexpected API response structure:",
					apiResponse
				);
				throw new Error("Invalid API response structure");
			}

			this.umbrellasCache = apiResponse.data;
			return this.umbrellasCache;
		} catch (error) {
			console.error("❌ Error fetching umbrellas:", error);

			// Fallback to sample data for testing
			const sample: Umbrella[] = [];
			this.umbrellasCache = sample;
			return sample;
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
