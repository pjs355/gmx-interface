import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/**
 * Cross-venue lookup key for an umbrella's market.
 *
 * Esports / PandaScore markets key at the umbrella level by `pandascore_matchId`
 * (one match, one binary winner book shared across the umbrella). Polymarket-sourced
 * sports (FIFA World Cup 3-way moneyline) have no pandascore match: each leg
 * (Team A win / Draw / Team B win) is its own binary market, so we fall back to the
 * active question's `polymarketMarketId`.
 *
 * This mirrors the backend `resolveMatchId` fallback in `src/sor/market-matcher.ts`,
 * so the same trade box / venue books / SOR path works per-leg with no FIFA-specific
 * branching.
 */
export function resolveUmbrellaVenueKey(
	umbrella: Pick<Umbrella, "pandascore_matchId"> | null | undefined,
	activeQuestion?: Pick<PredictionMarket, "polymarketMarketId"> | null,
): string {
	const panda =
		typeof umbrella?.pandascore_matchId === "string" ? umbrella.pandascore_matchId.trim() : "";
	if (panda) return panda;
	const poly =
		typeof activeQuestion?.polymarketMarketId === "string"
			? activeQuestion.polymarketMarketId.trim()
			: "";
	return poly;
}

/**
 * True when the venue key is a per-leg Polymarket key (no umbrella-level pandascore
 * match). Per the aggregator-sub precedent, lookups for such keys must NOT pass an
 * umbrellaId to `findOddsMatchedMarket` (it would fall back to another leg's row).
 */
export function isPerLegVenueKey(
	umbrella: Pick<Umbrella, "pandascore_matchId"> | null | undefined,
): boolean {
	const panda =
		typeof umbrella?.pandascore_matchId === "string" ? umbrella.pandascore_matchId.trim() : "";
	return panda.length === 0;
}
