import { formatUnits } from "viem";
import { floorSharesAtDecimals } from "@/trading/utils/floorShares";
import { PREDICT_MIN_SHARES } from "@/trading/sor/route/sorPreflight";

/**
 * Pre-flight share-amount clamp for SOR Predict.fun SELL legs.
 *
 * Predict's REST positions feed (which seeds `sorVenuePositions` →
 * `optimizeSell` → `leg.shares`) is an indexer view that can briefly report
 * MORE shares than the wallet's actual ERC-1155 outcome balance:
 *
 *   1. Indexer lag immediately after a buy/sell.
 *   2. Float-noise from the SOR optimizer pushing `leg.shares` a hair above
 *      the user's true balance (`3.3799999...` → `toFixed(6)` → `"3.380000"`).
 *   3. Resting limit orders that escrow CTF balance against the Predict CTF
 *      Exchange but still appear in the API's `size`.
 *
 * The Predict CTF Exchange pre-trade hook is
 * `ConditionalTokens.balanceOf(maker, tokenId) >= makerAmount`, so any
 * over-count surfaces as `create_order_insufficient_shares_balance`. This
 * helper takes the planned `leg.shares` and the just-read on-chain ERC-1155
 * balance and returns a clamped, floor-at-6 dp share count that the API
 * `parseUnits(amount, 18)` cannot push above the on-chain balance. It only
 * ever shrinks (never grows) the order, mirroring Polymarket's
 * `clampMarketSellSharesToCtfBalance` pattern.
 */

/**
 * Smallest submission unit Predict accepts via `parseUnits(amount, 18)` once
 * we floor the human string at 6 dp. Subtracting one of these once before
 * the floor makes "clamp == balance" boundary calls always land strictly
 * below the chain balance, the same way Polymarket subtracts one micro-share
 * of CTF dust before its tick-floor.
 */
const PREDICT_DUST_HUMAN = 1e-6;

/** Submission precision matches the existing `leg.shares.toFixed(6)` pattern in the SOR executor. */
const SUBMIT_DP = 6;

export type ClampPredictSellSharesArgs = {
	/** Shares the SOR plan wants to sell on Predict (`leg.shares`). */
	plannedShares: number;
	/** On-chain `balanceOf(account, tokenId)` for the outcome ERC-1155, raw 18-decimal units. */
	erc1155BalanceWei: bigint;
};

export type ClampPredictSellSharesResult =
	| {
			ok: true;
			/** Shares to pass to `placeMarketOrder({ amount })` — never > planned. */
			amountShares: number;
			/** `amountShares / plannedShares` (1.0 when no clamp, in [0, 1] otherwise). */
			scale: number;
			resized: boolean;
	  }
	| {
			ok: false;
			/** Human-readable reason — surfaces directly as the leg error message. */
			error: string;
			outcomeBalanceShares: number;
	  };

export function clampPredictSellSharesToOutcomeBalance(
	args: ClampPredictSellSharesArgs,
): ClampPredictSellSharesResult {
	const planned = Number.isFinite(args.plannedShares)
		? Math.max(0, args.plannedShares)
		: 0;

	if (planned <= 0) {
		return {
			ok: false,
			outcomeBalanceShares: 0,
			error: "Refusing to place an empty Predict sell.",
		};
	}

	const balRaw =
		args.erc1155BalanceWei < 0n ? 0n : args.erc1155BalanceWei;
	const balanceShares = Number(formatUnits(balRaw, 18));

	if (balanceShares <= 0) {
		return {
			ok: false,
			outcomeBalanceShares: 0,
			error:
				"Predict has no shares of this outcome on this wallet. Refresh positions and try again.",
		};
	}

	// Floor planned and balance independently to the submission precision so
	// no path can produce an amount whose 18-decimal `parseUnits` value
	// exceeds the on-chain balance.
	const plannedFloored = floorSharesAtDecimals(planned, SUBMIT_DP);
	const balanceMinusDust = Math.max(0, balanceShares - PREDICT_DUST_HUMAN);
	const balanceFloored = floorSharesAtDecimals(balanceMinusDust, SUBMIT_DP);

	const amountShares = Math.min(plannedFloored, balanceFloored);

	if (amountShares + 1e-12 < PREDICT_MIN_SHARES) {
		return {
			ok: false,
			outcomeBalanceShares: balanceShares,
			error: `Predict has only ${balanceShares.toFixed(4)} shares available — below the ${PREDICT_MIN_SHARES.toFixed(2)}-share minimum sell. Try again after positions refresh.`,
		};
	}

	const resized = amountShares + 1e-12 < planned;
	const scale = planned > 0 ? amountShares / planned : 0;
	return { ok: true, amountShares, scale, resized };
}
