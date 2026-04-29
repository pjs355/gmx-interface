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
	 * Uses `max(bridge.amount, executionAmountUsd)` per leg: `bridge.amount` is the
	 * optimizer **shortfall** (what must still cross from source chains), while the
	 * venue order spends **`executionAmountUsd`** on the destination. Anchoring only
	 * to shortfall skips LI.FI when the dest wallet is short of the full trade notional.
	 */
	totalAmountUsd: number;
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
			g = { key, legs: [], totalAmountUsd: 0, representativeLeg: leg };
			map.set(key, g);
		}
		g.legs.push(leg);
		g.totalAmountUsd += resolveBuyPrefundAnchorUsd(b.amount, leg.executionAmountUsd);
	}
	return [...map.values()];
}
