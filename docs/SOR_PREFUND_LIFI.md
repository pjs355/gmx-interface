# SOR prefund + LI.FI status (pointer)

SOR **prefund** (multi-chain LI.FI into a venue wallet) and **status polling** hardening are documented in the **predictions** service repo so they sit next to `lifiGetStatus` and the private API routes.

## Canonical runbook

**File:** `PREFUND_LIFI_STATUS_RUNBOOK.md` in the `predictions` repo, under `docs/`.

**Relative path (typical layout):** if `predictions` and `LevelUp` are **siblings** under the same parent (e.g. `…/LevelUp/LevelUp_Predictions` and `…/predictions`), open:

[`../../../predictions/docs/PREFUND_LIFI_STATUS_RUNBOOK.md`](../../../predictions/docs/PREFUND_LIFI_STATUS_RUNBOOK.md)

If your checkout layout differs, navigate to `predictions/docs/PREFUND_LIFI_STATUS_RUNBOOK.md` from your machine.

## What lives in this (LevelUp) repo

- `src/trading/sor/useSorLegExecutor.ts` — prefund loop, quote solve, `executeLifiSteps`, `pollLifiUntilTerminal`
- `src/trading/sor/prefundPlan.ts` — `buildPrefundSteps`
- `src/trading/sor/lifiPrefundQuoteSolve.ts` — `ensurePrefundQuoteMeetsDestMin`, cap slack
- `src/trading/lifi/prefundFromAmountHuman.ts` — floored `amountHuman` + BNB `maxFromWei` cap (no round-up past `balanceOf`)
- `src/trading/lifi/pollLifiStatus.ts` — transient status errors, terminal assertions
- `src/services/privateApi/client.ts` — `getFundingLifiStatus`, error envelope parsing

Details, math, mermaid flow, and “do not touch” tables are **only** in the runbook above—edit that file when behavior changes.
