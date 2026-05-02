/**
 * Pre-flight share-amount clamp for SOR Polymarket SELL legs.
 *
 * Polymarket's `/data-api/positions` (which feeds `usePolymarketPositions` →
 * `sorVenuePositions` → server `optimizeSell`) is an indexer view that can
 * report MORE shares than the Safe's actual ERC-1155 CTF balance for a few
 * reasons that all surface as the same on-chain failure:
 *
 *   1. Indexer lag right after a buy/sell (writeable for ~30s).
 *   2. Resting limit SELL orders escrow CTF balance against the Exchange but
 *      stay counted in the API's `size`.
 *   3. Partial fills / cancellations not yet reconciled.
 *
 * The CTF Exchange pre-trade hook is
 * `ConditionalTokens.balanceOf(maker, tokenId) >= makerAmount`, so any
 * over-count immediately produces HTTP 400
 * `not enough balance / allowance: balance: <onChain>, order amount: <maker>`.
 *
 * This helper takes the planned `leg.shares` and the just-read on-chain CTF
 * balance and returns a clamped share count that the CLOB SDK's tick-floored
 * `makerAmount` will fit into. It only ever shrinks (never grows) the order
 * so the executor can still report `filledShares` ≤ `leg.shares`.
 */

/**
 * Smallest share unit Polymarket's CLOB tracks (`makerAmount` is `shares *
 * 10^6`). Subtracting this once before tick-flooring covers float→bigint
 * rounding between our `formatUnits(bal, 6)` read and the SDK's internal
 * decimal math, which is otherwise the only way a "clamp == balance" call
 * can still round up by one micro-share into balance + 1.
 */
const CTF_DUST_MICRO_SHARES = 1;

export type SellShareClampInput = {
	/** Shares the SOR plan wants to sell on Polymarket (`leg.shares`). */
	plannedShares: number;
	/** On-chain `balanceOf(safe, tokenId)` for the outcome token, in raw 1e6 units. */
	ctfBalanceWei: bigint;
	/**
	 * Polymarket tick size for this market (e.g. 0.01 / 0.001). Used to floor
	 * the clamp to a value the SDK's `makerAmount = round(shares / tick) * tick`
	 * cannot push above the on-chain balance. Defaults to 0.01 — the same
	 * `DEFAULT_TICK_SIZE` the CLOB SDK uses when the market's metadata is
	 * unknown.
	 */
	tickSize?: number;
	/** Refuse to send a sell smaller than this (Polymarket rejects sub-cent SELLs). */
	minShares?: number;
};

export type SellShareClampResult =
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
			ctfBalanceShares: number;
	  };

const DEFAULT_TICK_SIZE = 0.01;
const DEFAULT_MIN_SHARES = 0.01;

/** floor(value / step) * step, computed in integer micro-share space to dodge fp drift. */
function floorToStep(valueShares: number, step: number): number {
	if (!Number.isFinite(valueShares) || valueShares <= 0) return 0;
	if (!Number.isFinite(step) || step <= 0) return valueShares;
	const microStep = Math.max(1, Math.round(step * 1_000_000));
	const microValue = Math.floor(valueShares * 1_000_000);
	const flooredMicro = Math.floor(microValue / microStep) * microStep;
	return flooredMicro / 1_000_000;
}

export function clampMarketSellSharesToCtfBalance(
	args: SellShareClampInput,
): SellShareClampResult {
	const planned = Number.isFinite(args.plannedShares)
		? Math.max(0, args.plannedShares)
		: 0;
	const tick = args.tickSize ?? DEFAULT_TICK_SIZE;
	const minShares = args.minShares ?? DEFAULT_MIN_SHARES;

	if (planned <= 0) {
		return {
			ok: false,
			ctfBalanceShares: 0,
			error: "Refusing to place an empty Polymarket sell.",
		};
	}

	const balRaw = args.ctfBalanceWei < 0n ? 0n : args.ctfBalanceWei;
	const balanceShares = Number(balRaw) / 1_000_000;

	if (balanceShares <= 0) {
		return {
			ok: false,
			ctfBalanceShares: 0,
			error:
				"Polymarket has no shares of this outcome on this Safe. Refresh positions and try again.",
		};
	}

	// Already fits — pass through with a tiny ε for fp-equality at the boundary.
	if (planned <= balanceShares + 1e-9) {
		return { ok: true, amountShares: planned, scale: 1, resized: false };
	}

	// Subtract dust BEFORE the tick-floor so the floored amount is always
	// strictly below the on-chain raw balance even after the SDK's own
	// makerAmount rounding inside `buildOrderV2`.
	const balanceMinusDust = Math.max(
		0,
		balanceShares - CTF_DUST_MICRO_SHARES / 1_000_000,
	);
	const flooredShares = floorToStep(balanceMinusDust, tick);

	if (flooredShares + 1e-9 < minShares) {
		return {
			ok: false,
			ctfBalanceShares: balanceShares,
			error: `Polymarket has only ${balanceShares.toFixed(4)} shares available — below the ${minShares.toFixed(2)}-share minimum sell. Try again after positions refresh.`,
		};
	}

	const scale = planned > 0 ? flooredShares / planned : 0;
	return {
		ok: true,
		amountShares: flooredShares,
		scale,
		resized: true,
	};
}
