/**
 * Cross-venue **display** adapters: MatchedMarket Panda A/B books → Basic tab strip,
 * home listing YES/NO, sell-strip bids. One registry; consumers call `buildVenuePriceRows` only.
 *
 * ## Adding a new venue (checklist)
 *
 * 1. **Wire / types** (`types/odds-monitor.ts`, `useOddsMonitorWebSocket.ts`)
 *    - Add `exchangeMatching.<venue>` on GET /matched-markets (predictions-api).
 *    - Add `<venue>PriceA` / `<venue>PriceB` on `MatchedMarket`.
 *    - Map `venue: "<wireId>"` in `VENUE_PRICE_FIELDS` + `venueWireNameToKey` so venue-prices
 *      WS snapshots merge into those fields (must match predictions-api `VenueConnectionManager`).
 *
 * 2. **Display adapter** (this folder)
 *    - Add `<venue>.ts` exporting a `VenuePriceAdapter` (copy `polymarket.ts` for standard BBO).
 *    - `id` — row key (e.g. `"poly"`); used by trade-box sell strip via `PRICE_ROW_TO_VENUE_SHARE_KEY`.
 *    - `label` — UI column name in EsportsVenueBooksPanel.
 *    - `sortPriority` — lower = higher in strip (LevelUp uses `0`).
 *    - `bboPolicy` — `"standard"` | `"ladderFirst"` | `"restingOnly"` (see `types.ts`).
 *    - `isMapped` — match linked from REST mapping (e.g. `Boolean(m.limitless)`).
 *    - `books` — `{ bookA, bookB }` from `MatchedMarket` Panda sides.
 *    - `shouldShowRow` — optional; omit row after quotes (see `dflow.ts`, `levelup.ts`).
 *
 * 3. **Register** — import adapter below and append to `VENUE_PRICE_ADAPTERS`.
 *
 * 4. **Test** — `pricing/tests/buildVenuePriceRows.test.ts` (linked, BBO policy, hide rules).
 *
 * 5. **Execution (separate)** — trade box / SOR still need venue modules under
 *    `features/trading/venues/<venue>/` (full orderbook walk, token ids). Display adapters
 *    do not replace those.
 *
 * Strip + home cards update automatically once steps 1–3 are done; no hook/component edits.
 */
import { dflowPriceAdapter } from "./dflow";
import { levelUpPriceAdapter } from "./levelup";
import { limitlessPriceAdapter } from "./limitless";
import { polymarketPriceAdapter } from "./polymarket";
import { predictPriceAdapter } from "./predict";
import type { VenuePriceAdapter } from "./types";

export type { BboPolicy, VenueMonitorBooks, VenuePriceAdapter, VenueQuotes } from "./types";
export { applyBboPolicy } from "./applyBboPolicy";
export { dflowPriceAdapter } from "./dflow";
export { levelUpPriceAdapter } from "./levelup";
export { limitlessPriceAdapter } from "./limitless";
export { polymarketPriceAdapter } from "./polymarket";
export { predictPriceAdapter } from "./predict";

/** Ordered registry — append new adapters here (see file header for full checklist). */
export const VENUE_PRICE_ADAPTERS: VenuePriceAdapter[] = [
	levelUpPriceAdapter,
	polymarketPriceAdapter,
	dflowPriceAdapter,
	limitlessPriceAdapter,
	predictPriceAdapter,
].sort((a, b) => a.sortPriority - b.sortPriority);
