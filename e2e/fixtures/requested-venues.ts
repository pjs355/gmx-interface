import type { RequiredVenueKey } from "./matched-market";

/**
 * Single source of truth for which venues the E2E suite *attempts*.
 *
 * Comment a venue out to omit it entirely.
 *
 * Deployment is **not** blocked when no single upcoming matched row lists every
 * venue: `scripts/predeploy.ts` only logs per-venue coverage. Each venue is
 * evaluated separately: if there is no upcoming `exchangeMatching.{venue}` plus
 * live bid/ask in `venue-prices`, that venue’s tests are **skipped** with a log
 * line (`00-spread-cap.spec.ts`, `per-venue-trade-cycle.spec.ts`).
 *
 * Before each venue’s browser block, `evaluateVenueLiquidityBeforeTrade` GETs
 * fresh `/venue-prices/:panda` and may skip if best-case round-trip loss on
 * `E2E_TRADE_NOTIONAL_USD` exceeds `MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD`, or
 * (without ladders) top-of-book spread is too wide — see
 * `e2e/fixtures/e2e-venue-liquidity-at-test.ts`.
 *
 * Local dev: if every row is skipped because matched-markets `eventDate` is missing
 * or venue-prices uses `status: "no_liquidity"` while TOB still exists, see
 * `venueSnapshotStatusAllowsBookProbe` in `e2e-venue-book-depth.ts`. To run a
 * specific umbrella, set `E2E_PIN_UMBRELLA_ID=<mongo _id>` when invoking Playwright
 * (row must still appear in GET `{PREDICTIONS_API_URL}/matched-markets`). When set,
 * only **levelup** per-venue row selection is restricted to that umbrella; other
 * venues still search the full upcoming candidate set for the tightest book.
 */
export const REQUESTED_VENUES: RequiredVenueKey[] = [
	"polymarket",
	"predictFun",
	"dflow",
	"limitless",
	"levelup",
];
