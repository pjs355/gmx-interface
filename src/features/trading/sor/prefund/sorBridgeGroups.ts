import type { RouteLeg } from "../core/sor-types";
import { levelUpBuySignedPremiumUsdHuman } from "@/features/trading/venues/levelup/execute/levelUpSorSigning";
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
	 * Per leg: `resolveBuyPrefundAnchorUsd(shortfall, executionAmountUsd[, levelUpPremium])`.
	 * LevelUp adds signed USDC premium (`makerAmount`) when it exceeds optimizer cost.
	 *
	 * Venue fee is **not** doubled — `executionAmountUsd = notional + fee` from the
	 * optimizer already encodes fee. Token-side venues satisfy API checks via
	 * `wireAmountUsdForVenue` instead of inflating the corridor aggregate.
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

export function groupBridgeLegsByCorridor(
	bridgeLegs: RouteLeg[],
	routeSide: "buy" | "sell" = "buy",
): SorBridgeGroup[] {
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
		const premium =
			routeSide === "buy" && leg.venue === "levelup"
				? levelUpBuySignedPremiumUsdHuman(leg)
				: undefined;
		g.totalAmountUsd += resolveBuyPrefundAnchorUsd(b.amount, leg.executionAmountUsd, premium);
		g.groupBridgeCostUsd += Math.max(0, b.estimatedCost ?? 0);
	}
	return [...map.values()];
}
