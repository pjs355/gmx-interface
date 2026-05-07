import type { RequiredVenueKey } from "./matched-market";

/**
 * Single source of truth for which venues every E2E spec should gate on.
 *
 * Comment a venue out here to skip it across the suite — both
 * `00-spread-cap.spec.ts` (spread diagnostics) and `per-venue-trade-cycle.spec.ts`
 * (full buy/sell round-trip) read from this list.
 *
 * Listed venues must have a live bid/ask in matched-markets + venue-prices,
 * or the spec setup throws naming the missing venue. If the best book’s
 * tightest spread is ≥ 20¢ (`MAX_E2E_VENUE_SPREAD_USD` in matched-market.ts),
 * trade tests are skipped with a console warning (suite still passes).
 */
export const REQUESTED_VENUES: RequiredVenueKey[] = [
	"polymarket",
	"predictFun",
	// "limitless",
	"dflow",
	"levelup",
];
