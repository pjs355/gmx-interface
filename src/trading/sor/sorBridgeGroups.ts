import type { RouteLeg } from "./sor-types";
import { resolveBuyPrefundAnchorUsd } from "./prefundPlan";

/**
 * Multiple SOR legs may share the same LI.FI corridor (same `fromChain` → `toChain`).
 * Aggregating avoids parallel `executeBridge` calls racing on one source wallet and
 * reduces duplicate LI.FI minimum-fee overhead.
 */
export type SorBridgeGroup = {
	/** Stable key e.g. `bnb->base`. */
	key: string;
	legs: RouteLeg[];
	/**
	 * Aggregated prefund anchor — passed as `amountUsdOverride` for one prefund.
	 * `Σ max(bridge.amount, executionAmountUsd)` per leg. `bridge.amount` is the
	 * optimizer **shortfall** (what must still cross from source chains); the venue
	 * order spends **`executionAmountUsd`** on the destination. Anchoring on shortfall
	 * alone skips LI.FI when the dest wallet is short of the full trade notional.
	 *
	 * Venue fee is **not** added on top — `executionAmountUsd = notional + fee` from
	 * the optimizer already encodes the fee. Fee headroom for the venue API balance
	 * check is satisfied at the wire layer (see `wireAmountUsdForVenue` in
	 * `useSorLegExecutor`), not by bridging more.
	 */
	totalAmountUsd: number;
	/**
	 * Sum of optimizer per-leg `bridge.estimatedCost` for legs in this corridor (the
	 * optimizer assigns the cost to a single bridge-payer leg, so this is typically
	 * just that one leg's cost). Used together with `totalAmountUsd` to derive the
	 * strict source-debit cap (`budgetUsd = totalAmountUsd + groupBridgeCostUsd`)
	 * passed to `ensurePrefundQuoteMeetsDestMin`.
	 */
	groupBridgeCostUsd: number;
	representativeLeg: RouteLeg;
};

export function groupBridgeLegsByCorridor(bridgeLegs: RouteLeg[]): SorBridgeGroup[] {
	const map = new Map<string, SorBridgeGroup>();
	for (const leg of bridgeLegs) {
		const b = leg.bridge;
		if (!b) continue;
		const key = `${b.fromChain}->${b.toChain}`;
		let g = map.get(key);
		if (!g) {
			g = {
				key,
				legs: [],
				totalAmountUsd: 0,
				groupBridgeCostUsd: 0,
				representativeLeg: leg,
			};
			map.set(key, g);
		}
		g.legs.push(leg);
		g.totalAmountUsd += resolveBuyPrefundAnchorUsd(b.amount, leg.executionAmountUsd);
		g.groupBridgeCostUsd += Math.max(0, b.estimatedCost ?? 0);
	}
	return [...map.values()];
}
