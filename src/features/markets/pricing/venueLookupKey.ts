import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/**
 * Cross-venue lookup key for an umbrella's market.
 *
 * Esports / PandaScore markets key at the umbrella level by `pandascore_matchId`
 * (one match, one binary winner book shared across the umbrella). For per-map
 * legs (`pandascore_eventType === "game"` with `pandascore_gamePosition >= 1`)
 * the server fans out a dedicated wire key `${pandascore_matchId}-map-${pos}`
 * so the trade page can rewire chart / orderbook / trade box to that map's book
 * when the user expands its accordion section.
 *
 * Polymarket-sourced sports (FIFA World Cup 3-way moneyline) have no pandascore
 * match: each leg (Team A win / Draw / Team B win) is its own binary market, so
 * we fall back to the active question's `polymarketMarketId`.
 *
 * This mirrors the backend `resolveMatchId` + per-map fan-out in
 * `src/sor/market-matcher.ts`, so the same trade box / venue books / SOR path
 * works per-leg with no FIFA-specific branching.
 */
export function resolveUmbrellaVenueKey(
	umbrella: Pick<Umbrella, "pandascore_matchId"> | null | undefined,
	activeQuestion?: Pick<
		PredictionMarket,
		"polymarketMarketId" | "pandascore_eventType" | "pandascore_gamePosition"
	> | null,
): string {
	const panda =
		typeof umbrella?.pandascore_matchId === "string" ? umbrella.pandascore_matchId.trim() : "";
	if (panda) {
		const eventType = String(activeQuestion?.pandascore_eventType ?? "")
			.trim()
			.toLowerCase();
		const pos = activeQuestion?.pandascore_gamePosition;
		const hasMapPos = typeof pos === "number" && Number.isFinite(pos) && pos >= 1;
		if (eventType === "game" && hasMapPos) {
			return `${panda}-map-${Math.trunc(pos as number)}`;
		}
		return panda;
	}
	const poly =
		typeof activeQuestion?.polymarketMarketId === "string"
			? activeQuestion.polymarketMarketId.trim()
			: "";
	return poly;
}

/**
 * True when the venue key is a per-leg key whose lookup must NOT pass an
 * umbrellaId to `findOddsMatchedMarket` (it would fall back to another leg's row).
 * Two cases:
 *  1. Polymarket-sourced sports (FIFA): no umbrella-level `pandascore_matchId`,
 *     each leg keyed by its own `polymarketMarketId`.
 *  2. Esports per-map legs: backend fans out `${pandascore_matchId}-map-${slot}`
 *     rows in addition to the umbrella's series row, so looking up by umbrellaId
 *     would still resolve the series row instead of the map row.
 */
export function isPerLegVenueKey(
	umbrella: Pick<Umbrella, "pandascore_matchId"> | null | undefined,
	activeQuestion?: Pick<
		PredictionMarket,
		"pandascore_eventType" | "pandascore_gamePosition"
	> | null,
): boolean {
	const panda =
		typeof umbrella?.pandascore_matchId === "string" ? umbrella.pandascore_matchId.trim() : "";
	if (panda.length === 0) return true;
	const eventType = String(activeQuestion?.pandascore_eventType ?? "")
		.trim()
		.toLowerCase();
	const pos = activeQuestion?.pandascore_gamePosition;
	const hasMapPos = typeof pos === "number" && Number.isFinite(pos) && pos >= 1;
	return eventType === "game" && hasMapPos;
}
