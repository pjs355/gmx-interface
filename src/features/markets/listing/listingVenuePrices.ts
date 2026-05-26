/**
 * Cross-venue best YES/NO asks for home listing cards from OddsMonitor `MatchedMarket`.
 * Uses the same row builder as the Basic tab strip (`buildVenuePriceRows`).
 */

import type { MatchedMarket } from "@/types/odds-monitor";
import { bestCrossVenueYesNoFromRows } from "@/features/markets/pricing/bestCrossVenueYesNo";
import { buildVenuePriceRows } from "@/features/markets/pricing/buildVenuePriceRows";

export function listingBestYesNoFromMatched(m: MatchedMarket | null): {
	yes: number | null;
	no: number | null;
} {
	if (!m) return { yes: null, no: null };
	return bestCrossVenueYesNoFromRows(buildVenuePriceRows(m));
}
