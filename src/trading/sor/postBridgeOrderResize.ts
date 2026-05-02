/**
 * Post-bridge order-amount resize for SOR market buys.
 *
 * Even with the prefund anchor exactly equal to `executionAmountUsd` and the
 * per-corridor `budgetUsd` cap on `sendHuman`, LI.FI may still under-deliver
 * vs `estimate.toAmountMin` on `FASTEST` routes — leaving the venue wallet a
 * few cents short of what the venue's API balance check requires
 * (`wallet >= wireAmount + fee` for token-side fee venues like Polymarket /
 * Predict.fun / Limitless). Without a clamp the venue rejects the order with
 * HTTP 400 `not enough balance / allowance: ... required total: ...`.
 *
 * This helper is the secondary route: read the actual on-chain spendable
 * balance after bridge + wrap, then size the wire amount down so
 * `wireAmount + fee + dust <= walletUsd`. It can only ever shrink the order
 * (never grow it), so it cannot push source-wallet debit past the optimizer's
 * planned `executionAmountUsd + bridge_cost`.
 */

/**
 * USD safety floor between (wallet − fee) and the wire amount. Covers float
 * rounding between our balance read and the venue's match-time fee math
 * (Polymarket rounds fees to 5dp; CLOB makerAmount is 6dp). Smaller than the
 * venue minimum so we never block a legitimate small trade.
 */
export const POST_BRIDGE_RESIZE_DUST_USD = 0.005;

export type PostBridgeClampInput = {
	/**
	 * Wire amount the executor plans to pass to the venue's `placeMarketOrder`.
	 * For token-side fee venues this is `max(0, leg.executionAmountUsd - leg.fee)`
	 * (= notional). For DFlow / collateral-side it's `leg.executionAmountUsd`
	 * (signing budget). Returned `amountUsd` is the resized wire amount, never
	 * larger than this input.
	 */
	plannedExecutionUsd: number;
	/** Spendable stable on the venue wallet, in human USD (after wrap / sweep). */
	walletUsd: number;
	/**
	 * Estimated venue protocol fee for this trade (`leg.fee`, USDC). Subtracted
	 * from `walletUsd` to ensure the venue's API balance check
	 * (`wallet >= wireAmount + fee`) passes after the resize.
	 */
	feeEstimateUsd: number;
	/** Venue market-buy minimum in USD (e.g. $1). Below this we refuse to size down. */
	minOrderUsd: number;
};

export type PostBridgeClampResult =
	| {
			ok: true;
			amountUsd: number;
			/**
			 * Ratio of resized wire amount to planned wire amount (1.0 when not resized,
			 * 0 in the error path). Multiply `leg.shares` by `scale` to get the
			 * post-resize fill estimate; the actual venue receipt overrides this when
			 * the portfolio reconciler syncs.
			 */
			scale: number;
			resized: boolean;
	  }
	| {
			ok: false;
			error: string;
			walletUsd: number;
			scale: 0;
	  };

/**
 * Returns the largest market-buy USD amount that fits in the venue wallet
 * after subtracting the protocol fee + dust safety. When the planned amount
 * already fits, returns `{ resized: false, amountUsd: plannedExecutionUsd, scale: 1 }`
 * verbatim so we never *increase* the user's intended spend.
 *
 * The clamped amount is floored to 2 decimal places (1¢) — Polymarket /
 * Predict / Limitless all round market-buy `makerAmount` down to 2dp before
 * signing, and overshooting by a fractional cent re-introduces the original
 * "balance < makerAmount + fee" failure.
 */
export function clampMarketBuyAmountToWallet(
	args: PostBridgeClampInput,
): PostBridgeClampResult {
	const wallet = Number.isFinite(args.walletUsd) ? Math.max(0, args.walletUsd) : 0;
	const fee = Number.isFinite(args.feeEstimateUsd) ? Math.max(0, args.feeEstimateUsd) : 0;
	const planned = Number.isFinite(args.plannedExecutionUsd)
		? Math.max(0, args.plannedExecutionUsd)
		: 0;
	const minOrder = Number.isFinite(args.minOrderUsd)
		? Math.max(0, args.minOrderUsd)
		: 0;

	if (planned <= 0) {
		return {
			ok: false,
			walletUsd: wallet,
			scale: 0,
			error: `Wire amount is 0 (executionAmountUsd <= leg.fee). Refusing to place an empty order.`,
		};
	}

	const cap = Math.max(0, wallet - fee - POST_BRIDGE_RESIZE_DUST_USD);

	if (cap + 1e-9 >= planned) {
		return { ok: true, amountUsd: planned, scale: 1, resized: false };
	}

	const flooredCap = Math.floor(cap * 100) / 100;

	if (flooredCap + 1e-9 < minOrder) {
		return {
			ok: false,
			walletUsd: wallet,
			scale: 0,
			error: `Wallet ~$${wallet.toFixed(4)} after bridge cannot cover venue fee ~$${fee.toFixed(4)} plus minimum order $${minOrder.toFixed(2)}.`,
		};
	}

	const scale = planned > 0 ? flooredCap / planned : 0;
	return { ok: true, amountUsd: flooredCap, scale, resized: true };
}
