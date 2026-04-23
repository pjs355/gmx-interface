import type { RouteLeg } from "./sor-types";

/**
 * Multiple SOR legs may share the same LI.FI corridor (same `fromChain` → `toChain`).
 * Aggregating avoids parallel `executeBridge` calls racing on one source wallet and
 * reduces duplicate LI.FI minimum-fee overhead.
 */
export type SorBridgeGroup = {
	/** Stable key e.g. `bnb->base`. */
	key: string;
	legs: RouteLeg[];
	/** Sum of `leg.bridge.amount` — passed as `amountUsdOverride` for one prefund. */
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
		g.totalAmountUsd += b.amount;
	}
	return [...map.values()];
}
