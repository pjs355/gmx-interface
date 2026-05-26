import type { RouteLeg, SorVenue } from "./sor-types";

/**
 * USD wire amount we pass to a venue's `placeMarketOrder` for a BUY leg.
 *
 * The optimizer's `leg.executionAmountUsd = notional + leg.fee` (`alloc.cost`
 * in `optimizer.ts`'s greedyFill). What we pass to the venue depends on how
 * the venue collects the fee:
 *
 * - **Token-side fee** (Polymarket, Predict.fun, Limitless): on-chain pulls
 *   `wire amount` USDC from the user and deducts the protocol fee from the
 *   outcome tokens delivered (`taking - fee` in `Trading.sol`). The CLOB API's
 *   pre-trade balance check requires `wallet >= wire + fee`. To stay within the
 *   user's typed `request.amount` we set `wire = max(0, executionAmountUsd - fee)`
 *   (= notional). Bridging `executionAmountUsd` to dest leaves exactly `fee` of
 *   headroom for the API check; on-chain pulls `wire`, leaves ~`fee` as dust.
 *
 * - **Collateral-side fee** (DFlow / Pond / Kalshi): the partner aggregator
 *   already incorporates the fee into the settlement amount
 *   (`dflowBuyCostUsd = notional + fee`), and `executionAmountUsd` represents
 *   `signingUsd` (max USDC the partner is allowed to consume). Wire amount is
 *   `executionAmountUsd` unchanged.
 *
 * - **LevelUp**: this helper is **not** called for LevelUp — the wire param is
 *   `shares` (not USD). The contract pulls `notional + fee` USDC against the
 *   user's allowance directly. See [useSorLegExecutor.ts](./useSorLegExecutor.ts)
 *   `case "levelup"`.
 */
export function wireAmountUsdForVenue(
	leg: Pick<RouteLeg, "venue" | "executionAmountUsd" | "fee">,
): number {
	const exec = Number.isFinite(leg.executionAmountUsd) ? Math.max(0, leg.executionAmountUsd) : 0;
	const fee = Number.isFinite(leg.fee) ? Math.max(0, leg.fee) : 0;
	if (isTokenSideFeeVenue(leg.venue)) {
		return Math.max(0, exec - fee);
	}
	return exec;
}

/**
 * `true` iff the venue's protocol fee is taken from outcome tokens (not from
 * collateral). For these venues the wire `amount` we send to the venue must
 * be smaller than `executionAmountUsd` by exactly `leg.fee` so the API balance
 * check passes without bridging extra collateral.
 */
export function isTokenSideFeeVenue(venue: SorVenue): boolean {
	return venue === "polymarket" || venue === "predictfun" || venue === "limitless";
}
