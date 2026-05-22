# Polymarket trading in this app

This document explains **how** Polymarket is wired in LevelUp Predictions and **why** key choices were made (wallet model, collateral, APIs, UX staleness, and testing). For contract addresses, see `constants.ts`.

---

## 1. Two-wallet model (EOA + Safe)

Polymarket’s CLOB expects orders to be attributed to a **Gnosis Safe** that holds collateral (“funder”), while authentication and signing still flow through the user’s **embedded EOA** (Privy).

| Role | Responsibility |
|------|----------------|
| **Embedded EOA** | Signs messages to **derive L2 API credentials** (`createOrDeriveApiKey`) and to **authorize orders** for the Safe path (`SignatureTypeV2.POLY_GNOSIS_SAFE`). |
| **Polymarket Safe** | On Polygon; holds **pUSD** / outcome tokens; address is what Polymarket’s **Data API** (`/positions?user=…`) indexes for open positions. |

**Why we built it this way:** `@polymarket/clob-client-v2` is designed for this split: we construct `ClobClient` with `signatureType: POLY_GNOSIS_SAFE` and `funderAddress: safe`. The app must resolve the same Safe address everywhere (Transfers, funding cards, SOR) via `useTradingWallets` + Polymarket builder profile data.

**Session caching:** API keys are stored in `sessionStorage` keyed by EOA + Safe (`usePolymarketClobTradingSession.ts`) so we don’t re-prompt for derivation on every navigation. If keys are invalid, we clear and re-derive.

---

## 2. Where orders go (CLOB host + builder)

- **CLOB API:** `clob.polymarket.com`, or same-origin proxy when `VITE_POLYMARKET_CLOB_PROXY` is enabled (avoids CORS / simplifies dev).
- **Chain:** `Chain.POLYGON` — all settlement is Polygon mainnet.
- **Builder code:** `POLYMARKET_BUILDER_CODE` is passed as `builderConfig` so Polymarket can attribute volume to the integration.

**Why:** Official client + Polygon matches Polymarket production; proxy is optional for local/dev ergonomics only.

---

## 3. Collateral: USDC.e → pUSD before buys

On Polygon, users often hold **bridged USDC (USDC.e)** in the Safe. The CLOB spends **pUSD** (Polymarket’s collateral token). The **Collateral Onramp** contract wraps USDC.e → pUSD inside the Safe.

**SOR leg executor** (`useSorLegExecutor.ts`, `polymarket` case):

1. Optionally run **JIT approvals** (Safe deploy + token approvals) so the CLOB doesn’t fail with opaque “not approved” errors.
2. On **buy**, if the Safe still has USDC.e balance, batch **wrap to pUSD** via the Polymarket **relay** (`executePolygonRelayAndWait`) before `createAndPostMarketOrder`.

**Why:** Routing assumes “can trade”; funding reality is “USDC.e might still need wrapping.” Doing wrap immediately before the order avoids spending pUSD the Safe doesn’t have yet.

See `polygonCollateralWrap.ts`, `safeActions.ts`, and `constants.ts` (`POLYGON_COLLATERAL_ONRAMP`, `POLYGON_USDC_E`, `POLYGON_PUSD`).

---

## 4. Fees and trade-box budget (venue config)

In `venueConfig.ts`, **Polymarket** uses:

- **Sports/Esports taker fee** (default rate in `estimateFee`): \(C \times \text{feeRate} \times p \times (1-p)\) — see `feePolymarket.ts` and the tooltip copy.
- **`effectiveBuyBudget`:** reserves part of the user’s typed USD for fees so **estimated cost (including fee)** stays within what they entered — aligned with the trade box’s local book walk (`PredictionMarketTradeBox`).

**Why:** Polymarket’s fee is **price-dependent**; a flat “subtract X%” would mis-estimate near 0¢/100¢. The budget split matches product intent: don’t show “$5 notional” then debit materially more than that without reflecting it in **Cost** / SOR total.

---

## 5. Live venue prices (cross-venue strip / orderbooks)

Cross-venue Polymarket **display** prices and depth come only from the LevelUp prediction service **`/ws/venue-prices`** (`MatchedMarket` in `OddsMonitorContext`). The browser does **not** open Polymarket’s public CLOB WebSocket for listing or umbrella trade UI.

**Why:** One controlled connection to LevelUp infrastructure; if the server stream lacks books, trading UI is gated until ingest catches up.

---

## 6. Positions: Data API lag vs optimistic UI

**Source of truth (eventually):** `https://data-api.polymarket.com/positions?user=<safe>` — public, no auth.

**Problem:** After a fill, the indexer often **lags** the chain by seconds (sometimes longer). Naïve refetch would **drop or under-report** the new position.

**What we built:**

1. **`applyOptimisticPolymarketFillToQueryCache`** (`optimisticPolymarketPositionsCache.ts`) — after a successful SOR execution, merge filled legs into the React Query cache immediately.
2. **`registerPolymarketShareFloorFromRow` + `mergePolymarketFetchWithFloors`** (`polymarketPositionsRefetchMerge.ts`) — keep a **per-token share floor** (with TTL) so stale API responses cannot shrink the row below what we know we just bought.

**Why:** Users see correct holdings in the trade box and portfolio without waiting for Polymarket’s API; floors decay so truth converges when the indexer catches up.

---

## 7. SOR execution quirks (Polymarket branch)

- CLOB session must be **ready** (`polyClob.ready`); otherwise we return a clear error about initializing Polymarket.
- **Approvals** are run just-in-time even if the user already saw Polymarket in the route — eligibility and “can sign” are not the same as “on-chain allowances complete.”
- **Relay** operations use generous timeouts (see comments near relay wait budgets) because Polygon + Safe batches can be slow.

---

## 8. Funding from Base (Transfers UI)

`PolymarketVenueCard.tsx` quotes and executes **LI.FI** routes from Base → Polygon into the Polymarket Safe, then verifies builder state. That path is **funding**, not the same as per-market CLOB orders in the umbrella trade box.

---

## 9. E2E / QA notes

Playwright specs that assert **MyPositionsRow** vs **quoted leg** use **share deltas** (before/after submit), not cumulative vs quote, because the row is **cumulative** per outcome. After fills, **hard reload** of the umbrella page is used where the Data API / React state lags real balances — same idea as `PredictionsPage.openUmbrellaTradingPageById` (reload + settle). See `e2e/specs/per-venue-trade-cycle.spec.ts` and `PredictionsPage.reloadUmbrellaPageForE2eBalances`.

---

## File map (starting points)

| Area | Files |
|------|--------|
| CLOB session & orders | `usePolymarketClobTradingSession.ts`, `polymarketClobOrderResult.ts` |
| SOR Polygon leg | `useSorLegExecutor.ts` (`case "polymarket"`) |
| Collateral / relay | `polygonCollateralWrap.ts`, `safeActions.ts`, `approvalTxs.ts` |
| Positions + floors | `usePolymarketPositions.ts`, `optimisticPolymarketPositionsCache.ts`, `polymarketPositionsRefetchMerge.ts` |
| Cross-venue venue-prices UI | `OddsMonitorContext`, `useTradingPagePrices`, `useUmbrellaTradePricing` |
| Venue fees / chain | `../../config/venueConfig.ts`, `constants.ts` |
| Funding bridge UI | `../venues/polymarket/PolymarketVenueCard.tsx` |

When changing behavior, update this doc if the **reason** for a constraint changes (new API, new fee model, different collateral path).
