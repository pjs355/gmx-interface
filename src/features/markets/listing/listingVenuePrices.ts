/**
 * Cross-venue best YES/NO asks for home listing cards from OddsMonitor `MatchedMarket`.
 * Uses the same row builder as the Basic tab strip (`buildVenuePriceRows`).
 */

import type { MatchedMarket } from "@/types/odds-monitor";
import { bestCrossVenueYesNoFromRows } from "@/features/markets/pricing/bestCrossVenueYesNo";
import { buildVenuePriceRows } from "@/features/markets/pricing/buildVenuePriceRows";

/** Lookup a venue-prices row keyed by Polymarket Gamma market id. */
export function findMatchedByPolymarketMarketId(
	markets: MatchedMarket[] | null | undefined,
	polymarketMarketId: string | null | undefined,
): MatchedMarket | null {
	const id = String(polymarketMarketId ?? "").trim();
	if (!id || !markets?.length) return null;
	return markets.find((m) => String(m.pandaMatchId ?? "").trim() === id) ?? null;
}

export function listingBestYesNoFromMatched(m: MatchedMarket | null): {
	yes: number | null;
	no: number | null;
} {
	if (!m) return { yes: null, no: null };
	return bestCrossVenueYesNoFromRows(buildVenuePriceRows(m));
}
