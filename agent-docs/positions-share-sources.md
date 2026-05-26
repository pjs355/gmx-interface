# Positions: share count sources (product decision)

**Status:** Accepted as-is for now. **Do not unify LevelUp onto server/API without an explicit product pass** (fills consistency risk).

**Last updated:** May 2026

---

## Question this answers

When the Positions UI shows **how many shares** a user holds on a venue, does that number come from **on-chain RPC** or from a **JSON HTTP REST** response?

**Short answer:** It depends on the venue. The UI always renders `VenuePosition.shares`, but the **source of truth** behind that field is not the same everywhere.

---

## Summary table (Positions tab)

| Venue          | `shares` source of truth                         | Client transport                                                   | RPC in the path?     |
| -------------- | ------------------------------------------------ | ------------------------------------------------------------------ | -------------------- |
| **Predict**    | Predict.fun REST `GET /v1/positions/:wallet`     | `GET /api/predict/positions/:wallet` (private API proxy)           | No                   |
| **Polymarket** | Polymarket Data API `GET /positions?user={safe}` | `GET /api/polymarket/positions` (private API proxy)                | No                   |
| **Limitless**  | Limitless partner `GET /portfolio/positions`     | `GET /api/limitless/portfolio/positions-venue` (private API proxy) | No                   |
| **LevelUp**    | Base CTF `balanceOf(wallet, tokenId)`            | `GET /api/levelup/positions` (private API; server Base RPC)        | **Yes (server RPC)** |
| **DFlow**      | Solana Token-2022 outcome mint balances          | `POST /api/dflow/token-balances` (+ metadata HTTP)                 | **Yes (server RPC)** |

All venues register rows through `AccountDataContext` → `positions.*.rows` → Positions assemblers.

---

## Per-venue detail

### Predict

- **Hook:** `usePredictPositions` → `api.getPredictPositions(addr)`
- **Server:** `predictions-api` proxies Predict.fun `GET /v1/positions/:addr`
- **Mapping:** `predictPositionsApi.mapPredictPositionRows` (`amount` / 1e18 → `shares`)
- **Caveat:** Indexer/API lag after fills; post-trade refetch applies

### Polymarket

- **Hook:** `usePolymarketPositions`
- **Client:** `GET /api/polymarket/positions` → predictions-api → Polymarket Data API
- **History:** `usePolymarketTradeHistory` → `GET /api/polymarket/activity` (TRADE + REDEEM pages)
- **Field:** Data API `size` → `VenuePosition.shares`
- **Caveat:** Public third-party API; bypasses our server; stale/indexer delay handled via optimistic cache merge after trades

### Limitless

- **Positions tab hook:** `useLimitlessVenuePositions` → `GET /api/limitless/portfolio/positions-venue`
- **Trade-box sell clamp (slim):** `useLimitlessPositions` → `GET /api/limitless/positions` (`tokenId` + `shares` only)
- **Server:** Both proxy Limitless partner `/portfolio/positions` (CLOB positions JSON)
- **Caveat:** Partner API is source of truth, not on-chain read in this path

### LevelUp

- **Hook:** `useLevelUpPositions` in `AccountDataContext`
- **Client:** `GET /api/levelup/positions` → predictions-api batch `balanceOf` on Base via `BASE_RPC_URL`
- **Catalog:** server loads token IDs from Mongo `Question`; client still uses `PredictionDataContext` for display metadata (`getMarketBalance`)

### DFlow (Kalshi)

- **Hook:** `useDflowPositions`
- **Pipeline:**
  1. `GET /api/dflow/onchain-trades` — DFlow Metadata API (trade history, cost, mint candidates)
  2. `POST /api/dflow/filter-outcome-mints` — server filter
  3. **`POST /api/dflow/token-balances`** — server `SOLANA_RPC_URL` Token-2022 reads → **authoritative share count**
  4. `POST /api/dflow/markets-batch` — DFlow Metadata API (labels, yes/no mapping)
- **Caveat:** RPC balance is truth for known mints; mint list is not a full wallet scan

---

## Related but separate: collateral (cash)

**Not outcome shares.** Header “Cash” / funding uses `GET /portfolio/cash-summary` → server `cash-rpc-clients` (Base, Polygon, BSC, Solana **USDC/USDT**). See [architecture.md § Per-user data flow](./architecture.md#4-per-user-data-flow).

---

## Consistency target (future — not approved for LevelUp yet)

**Uniform client shape:** every venue → HTTP to our private API → server chooses venue REST **or** private RPC.

| Direction                     | Status                                                                                 |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| DFlow balances                | Already server RPC via API                                                             |
| Predict / Limitless positions | Already REST via our API                                                               |
| Polymarket positions          | Proxied via `GET /api/polymarket/positions` + `/activity`                              |
| LevelUp positions             | Proxied via `GET /api/levelup/positions` (server Base CTF RPC)                         |
| Approval **reads**            | Done — CHAIN-reads (`POST /chain/read`); see update log / `coding-standards` era notes |

---

## Do not change without user approval

- Switching LevelUp Positions back to client Base RPC
- Changing Polymarket proxy response shape or moving back to direct Data API (behavior + caching implications)
- Replacing DFlow token-balances RPC with a metadata-only positions API unless DFlow guarantees on-chain parity

---

## Key code paths

```
src/context/AccountDataContext.tsx
src/features/positions/hooks/usePositionsData.ts
src/features/trading/venues/predict/portfolio/usePredictPositions.ts
src/features/trading/venues/polymarket/portfolio/usePolymarketPositions.ts
src/features/trading/venues/limitless/portfolio/useLimitlessPortfolioVenue.ts
src/features/trading/venues/levelup/portfolio/useLevelUpPositions.ts
src/features/trading/venues/dflow/portfolio/useDflowPositions.ts
```

Server (predictions-api): `domain/dflow/token-2022-balances.ts`, `domain/portfolio/cash-rpc-clients.ts`
