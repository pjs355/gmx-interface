import type { FundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";

/**
 * Optimistic per-chain cash overlays applied on top of the
 * `[COLLATERAL_TOKENS_QUERY_KEY, ...]` query result. Buys produce a CEILING
 * (cash went down — never display higher than the post-trade value until the
 * RPC read catches up). Sells produce a FLOOR (cash went up — never display
 * lower than the post-trade value).
 *
 * Module-scoped (not in React state) so the overlay survives `setQueryData`
 * roundtrips and provider remounts. Cleared per-chain when the live RPC
 * reading converges past the threshold or the TTL expires.
 */
export type CollateralChainKey =
	| "base"
	| "polygon"
	| "bnb"
	| "solana"
	| "limitlessMakerBase";

type OverlayEntry = {
	/** Buy ceiling — observed cash never displayed above this. */
	ceiling?: number;
	/** Sell floor — observed cash never displayed below this. */
	floor?: number;
	expiresAt: number;
};

const OVERLAY_TTL_MS = 120_000;

const overlays = new Map<CollateralChainKey, OverlayEntry>();

function pruneExpired(): void {
	const now = Date.now();
	for (const [k, e] of overlays) {
		if (e.expiresAt <= now) overlays.delete(k);
	}
}

/** Internal: clamp `observed` to the overlay window. */
function applyOverlayValue(
	chain: CollateralChainKey,
	observed: number,
): number {
	const e = overlays.get(chain);
	if (!e) return observed;
	if (e.expiresAt <= Date.now()) {
		overlays.delete(chain);
		return observed;
	}
	let v = observed;
	// Buy ceiling: clear once observed is at or below the ceiling, otherwise hold.
	if (e.ceiling !== undefined) {
		if (Number.isFinite(observed) && observed <= e.ceiling) {
			delete e.ceiling;
		} else {
			v = e.ceiling;
		}
	}
	// Sell floor: clear once observed is at or above the floor, otherwise hold.
	if (e.floor !== undefined) {
		if (Number.isFinite(observed) && observed >= e.floor) {
			delete e.floor;
		} else {
			v = Math.max(v, e.floor);
		}
	}
	if (e.ceiling === undefined && e.floor === undefined) {
		overlays.delete(chain);
	}
	return v;
}

/** Apply all active overlays to a fresh balances snapshot. */
export function applyCollateralOverlays(
	data: FundingStableBalancesHuman,
): FundingStableBalancesHuman {
	pruneExpired();
	if (overlays.size === 0) return data;
	const out: FundingStableBalancesHuman = { ...data };
	out.base = applyOverlayValue("base", data.base);
	out.polygon = applyOverlayValue("polygon", data.polygon);
	out.bnb = applyOverlayValue("bnb", data.bnb);
	out.solana = applyOverlayValue("solana", data.solana);
	if (data.limitlessMakerBase !== undefined) {
		out.limitlessMakerBase = applyOverlayValue(
			"limitlessMakerBase",
			data.limitlessMakerBase,
		);
	}
	return out;
}

/**
 * Register an optimistic cash change.
 * - `direction === "buy"`  → cash went DOWN by `amountUsd`; set ceiling at `target = max(0, baseline - amountUsd)`.
 * - `direction === "sell"` → cash went UP   by `amountUsd`; set floor   at `target =     baseline + amountUsd`.
 *
 * Pass `baseline` (current observed cash before the trade) so we only need to
 * remember the post-trade target rather than incrementing across applications.
 */
export function registerCollateralOverlay(input: {
	chain: CollateralChainKey;
	baseline: number;
	amountUsd: number;
	direction: "buy" | "sell";
}): void {
	const { chain, baseline, amountUsd, direction } = input;
	if (!(amountUsd > 0)) return;
	const prev = overlays.get(chain);
	const expiresAt = Date.now() + OVERLAY_TTL_MS;

	if (direction === "buy") {
		const target = Math.max(0, baseline - amountUsd);
		const next: OverlayEntry = { ...prev, expiresAt };
		next.ceiling =
			prev?.ceiling !== undefined ? Math.min(prev.ceiling, target) : target;
		overlays.set(chain, next);
	} else {
		const target = baseline + amountUsd;
		const next: OverlayEntry = { ...prev, expiresAt };
		next.floor =
			prev?.floor !== undefined ? Math.max(prev.floor, target) : target;
		overlays.set(chain, next);
	}
}

/** Test/util: forget all overlays. */
export function _resetCollateralOverlaysForTesting(): void {
	overlays.clear();
}
