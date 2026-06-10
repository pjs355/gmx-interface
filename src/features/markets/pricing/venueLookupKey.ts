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
 * Polymarket-sourced sports (FIFA 3-way legs, spreads, totals) each have their
 * own Gamma market id on the Question. The venue-prices feed keys those rows by
 * `polymarketMarketId` (see backend `buildPolymarketMatchedUmbrellaDocsFromQuestions`),
 * even when the umbrella also carries a `pandascore_matchId` for SOR routing.
 *
 * Prefer the active question's `polymarketMarketId` whenever it is set (after the
 * esports per-map fan-out), so orderbooks / trade box / subscriptions target the
 * same wire row as the prop ladder cells — not the umbrella moneyline book.
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
	}
	const poly =
		typeof activeQuestion?.polymarketMarketId === "string"
			? activeQuestion.polymarketMarketId.trim()
			: "";
	if (poly) return poly;
	return panda;
}

/**
 * True when the venue key is a per-leg key whose lookup must NOT pass an
 * umbrellaId to `findOddsMatchedMarket` (it would fall back to another leg's row).
 * Three cases:
 *  1. Any question with its own `polymarketMarketId` (FIFA legs, spreads, totals).
 *  2. Umbrellas with no umbrella-level `pandascore_matchId`.
 *  3. Esports per-map legs: backend fans out `${pandascore_matchId}-map-${slot}`
 *     rows in addition to the umbrella's series row, so looking up by umbrellaId
 *     would still resolve the series row instead of the map row.
 */
export function isPerLegVenueKey(
	umbrella: Pick<Umbrella, "pandascore_matchId"> | null | undefined,
	activeQuestion?: Pick<
		PredictionMarket,
		"polymarketMarketId" | "pandascore_eventType" | "pandascore_gamePosition"
	> | null,
): boolean {
	const poly =
		typeof activeQuestion?.polymarketMarketId === "string"
			? activeQuestion.polymarketMarketId.trim()
			: "";
	if (poly.length > 0) return true;

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
