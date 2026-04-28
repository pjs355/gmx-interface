# Stable baseline — LevelUp_Predictions

**As of 2026-04-28**, this tree was treated as a **reviewed, technically stable** state before larger follow-up edits.

Use this file as a checkpoint: compare diffs against it when refactoring, and consider tagging or branching in git when you use version control (`git tag predictions-stable-2026-04-28` or similar).

## What was in good shape at this baseline (high level)

- **Subgraph**: `getSubgraphUrl()` defaults to The Graph Studio; optional `VITE_LEVELUP_SUBGRAPH_URL` with known-removed Goldsky slug `s111630` falls back to the default with a console warning.
- **Positions hook**: Portfolio perf logging / effects run **after** `isHistoryTabContentReady` / `venueTradeHistoryLoading` so React does not hit a TDZ (`Cannot access before initialization`).
- **Post-claim portfolio math**: `handleClaimSuccess` calls **`acknowledgeClearedPayouts`** with the same payout keys as `claimedMarkets`, so the header `PortfolioContext` does not double-count venue winnings while queries refetch.
- **DFlow + loading gates**: Header `portfolioLoading` and Positions `dflowVenueSettled` only wait on DFlow when **`dflowRpcEnabled`** (Solana + auth + proof fetched + verified) and the positions query is **`isPending`**, not for every Privy-linked Solana wallet or ambiguous `isLoading` stalls.

## Intent

Large edits are expected from here; this document marks **where stability was last asserted** so you can bisect, review, or reset deliberately.
