# Stable baseline — LevelUp_Predictions

**As of 2026-04-28**, this tree was treated as a **reviewed, technically stable** state before larger follow-up edits.

Use this file as a checkpoint: compare diffs against it when refactoring, and consider tagging or branching in git when you use version control (`git tag predictions-stable-2026-04-28` or similar).

## What was in good shape at this baseline (high level)

- **LevelUp CTF balances**: Loaded via Base JSON-RPC `balanceOf` on the CTF contract for known outcome token IDs from prediction market data — not from The Graph.
- **Positions hook**: Portfolio perf logging / effects run **after** `isHistoryTabContentReady` / `venueTradeHistoryLoading` so React does not hit a TDZ (`Cannot access before initialization`).
- **Post-claim portfolio math**: `handleClaimSuccess` calls **`acknowledgeClearedPayouts`** with the same payout keys as `claimedMarkets`, so the header `PortfolioContext` does not double-count venue winnings while queries refetch.
- **DFlow + loading gates**: Header `portfolioLoading` and Positions readiness wait on DFlow **proof** when the user has a linked Solana funding address (`authenticated && solanaLinked && !dflowProof.isFetched` blocks the positions gate). Once proof is fetched, the positions query is waited on only when **`dflowRpcEnabled`** (verified Kalshi / DFlow RPC path). `fundingHydrated` is part of the positions strict gate so Solana does not flip on after an early paint. The old timed shell bypass was removed in favor of tab-scoped skeletons.

## Intent

Large edits are expected from here; this document marks **where stability was last asserted** so you can bisect, review, or reset deliberately.
