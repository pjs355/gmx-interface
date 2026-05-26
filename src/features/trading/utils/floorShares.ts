/**
 * Floor a share quantity to `dp` decimal places.
 *
 * Share quantities must NEVER round up at any decimal position — half-up
 * rounding (`toFixed`, `Math.round`, `Intl.NumberFormat` defaults) on a value
 * like `3.3799999` produces `3.38`, which can exceed the user's actual
 * on-chain balance and cause venues to reject the order with errors like
 * Predict.fun's `create_order_insufficient_shares_balance`.
 *
 * Polymarket already enforces this on the on-chain submission side via
 * `clampMarketSellSharesToCtfBalance`. This helper centralises the same
 * floor-only rule for every other call site (Predict / Limitless submission,
 * Positions table / TradeHistory display).
 *
 * Throws on invalid `dp` per the project's no-fallback rule rather than
 * silently substituting a default precision.
 */
export function floorSharesAtDecimals(shares: number, dp: number): number {
	if (!Number.isFinite(shares) || shares <= 0) return 0;
	if (!Number.isInteger(dp) || dp < 0) {
		throw new Error(`floorSharesAtDecimals: invalid dp ${dp}`);
	}
	const scale = 10 ** dp;
	return Math.floor(shares * scale) / scale;
}

/**
 * String form padded to exactly `dp` fractional digits. Safe to feed to
 * `viem.parseUnits(s, decimals)` because the value is already floored —
 * `toFixed` only re-formats an exactly-representable decimal at this point
 * and cannot round it up.
 */
export function floorSharesAtDecimalsAsString(shares: number, dp: number): string {
	return floorSharesAtDecimals(shares, dp).toFixed(dp);
}
