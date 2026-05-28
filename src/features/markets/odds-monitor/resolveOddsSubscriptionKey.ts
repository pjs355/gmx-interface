import type {
	Umbrella,
	UmbrellaExchangeMatchingLimitless,
} from "@/services/api/umbrellaDataService";

export type OddsSubscriptionQuestion = {
	polymarketMarketId?: string | null;
};

/**
 * Wire key for venue-prices WS subscribe + GET /matched-markets row lookup.
 * - pandascore: umbrella.pandascore_matchId (match-level)
 * - polymarket: active question polymarketMarketId (per moneyline leg)
 */
export function resolveOddsSubscriptionKey(
	umbrella: Umbrella | null | undefined,
	activeQuestion: OddsSubscriptionQuestion | null | undefined,
): string | null {
	if (umbrella === null || umbrella === undefined) return null;

	const sourceRaw = (umbrella as { source?: unknown }).source;
	const source = typeof sourceRaw === "string" ? sourceRaw.trim() : "";

	if (source === "polymarket") {
		const marketIdRaw = activeQuestion?.polymarketMarketId;
		if (marketIdRaw === null || marketIdRaw === undefined) return null;
		const marketId = marketIdRaw.trim();
		if (marketId.length === 0) return null;
		return marketId;
	}

	if (source.length > 0 && source !== "pandascore") {
		throw new Error(`Unsupported umbrella source for odds subscription: ${source}`);
	}

	const pandaRaw = umbrella.pandascore_matchId;
	if (pandaRaw === null || pandaRaw === undefined) return null;
	const panda = pandaRaw.trim();
	if (panda.length === 0) return null;
	return panda;
}

export function hasCrossVenueOddsSubscription(
	umbrella: Umbrella | null | undefined,
	activeQuestion: OddsSubscriptionQuestion | null | undefined,
): boolean {
	return resolveOddsSubscriptionKey(umbrella, activeQuestion) !== null;
}

/** Limitless routing for odds monitor merge — question-level for polymarket, umbrella fallback for esports. */
export function resolveLimitlessRoutingForOdds(
	umbrella: Umbrella | null | undefined,
	activeQuestion: unknown | null | undefined,
): UmbrellaExchangeMatchingLimitless | null | undefined {
	const qEm = (
		activeQuestion as { exchangeMatching?: { limitless?: UmbrellaExchangeMatchingLimitless } }
	)?.exchangeMatching;
	if (qEm?.limitless !== undefined) {
		return qEm.limitless;
	}
	return umbrella?.exchangeMatching?.limitless;
}
