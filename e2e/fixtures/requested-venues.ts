import type { RequiredVenueKey } from "./matched-market";

/**
 * Single source of truth for which venues every E2E spec should gate on.
 *
 * Comment a venue out here to skip it across the suite — both
 * `00-spread-cap.spec.ts` (liquidity diagnostics) and `per-venue-trade-cycle.spec.ts`
 * (full buy/sell round-trip) read from this list.
 *
 * Listed venues must have a live bid/ask in matched-markets + venue-prices,
 * or the spec setup throws naming the missing venue. **Before each venue’s**
 * browser tests, the suite GETs fresh `/venue-prices/:panda` and may skip if
 * best-case round-trip loss exceeds the configured max, or (without ladders)
 * if top-of-book spread is too wide — see `e2e/fixtures/e2e-venue-liquidity-at-test.ts`.
 */
export const REQUESTED_VENUES: RequiredVenueKey[] = [
	"polymarket",
	"predictFun",
	"limitless",
	//"dflow",
	"levelup",
];
