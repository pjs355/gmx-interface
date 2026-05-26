/**
 * Single source of truth for SOR prefund / bridge wall-time budgets so the outer
 * `withTimeout` in `useSorExecution` never fires while inner steps are still within
 * their own caps (see plan: Limitless → SCW → LI.FI).
 */

export const LIMITLESS_SCW_WITHDRAW_TIMEOUT_MS = 90_000;

export const SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS = 210_000;

export const SOR_LIFI_PREFUND_POLL_CONFIG = {
	maxAttempts: 15,
	intervalMs: 4_000,
} as const;

export const SOR_LIFI_PREFUND_POLL_MAX_SLEEP_MS =
	SOR_LIFI_PREFUND_POLL_CONFIG.maxAttempts * SOR_LIFI_PREFUND_POLL_CONFIG.intervalMs;

/**
 * Must match the iteration cap in `lifiPrefundQuoteSolve` — the quote loop has no
 * per-request application timeout, so we reserve wall time for six HTTP round-trips.
 */
export const SOR_PREFUND_QUOTE_MAX_ITERS = 6;

/** Headroom for up to `SOR_PREFUND_QUOTE_MAX_ITERS` sequential `postFundingLifiQuote` calls. */
export const SOR_PREFUND_QUOTE_HTTP_BUDGET_MS = 120_000;

export const SOR_BASE_USDC_TRANSFER_TIMEOUT_MS = 120_000;

/** Bounds viem `waitForTransactionReceipt` after SCW → Limitless maker sweep (send is capped separately). */
export const SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS = 120_000;

/**
 * Sequential prefund path: Limitless consolidate wait, quote iterations, LI.FI on-chain,
 * LI.FI status poll sleeps (worst case never-terminal status).
 */
export const SOR_PREFUND_SEQUENTIAL_MAX_MS =
	LIMITLESS_SCW_WITHDRAW_TIMEOUT_MS +
	SOR_PREFUND_QUOTE_HTTP_BUDGET_MS +
	SOR_LIFI_PREFUND_ONCHAIN_TIMEOUT_MS +
	SOR_LIFI_PREFUND_POLL_MAX_SLEEP_MS;

const SOR_PARALLEL_SWEEP_MAX_MS =
	SOR_BASE_USDC_TRANSFER_TIMEOUT_MS + SOR_BASE_SWEEP_RECEIPT_TIMEOUT_MS;

const SOR_LEG_OR_BRIDGE_MARGIN_MS = 30_000;

/**
 * Max wall time for `executeBridge`, post-bridge venue legs, and other SOR steps wrapped
 * with the same guard. Uses `max(prefund sequential, parallel sweep)` plus margin
 * because prefund may run `Promise.all(sweep, prefundSteps)`.
 */
export const LEG_OR_BRIDGE_TIMEOUT_MS =
	Math.max(SOR_PREFUND_SEQUENTIAL_MAX_MS, SOR_PARALLEL_SWEEP_MAX_MS) + SOR_LEG_OR_BRIDGE_MARGIN_MS;
