import type { RoutePlan, SorChain, SorVenue } from "./sor-types";
import { VENUE_DISPLAY_NAMES } from "./sor-types";

const CHAIN_LABEL: Record<SorChain, string> = {
	base: "Base",
	polygon: "Polygon",
	solana: "Solana",
	bnb: "BNB Chain",
};

export function sorChainDisplayName(chain: SorChain): string {
	return CHAIN_LABEL[chain] ?? chain;
}

export function formatSorUsd2(amount: number): string {
	return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Prefer API `totalBridgeCost` when > 0; otherwise sum `leg.bridge.estimatedCost`.
 * Buy routes only (sells do not execute bridge in the client).
 */
export function derivedBridgeUsdForDisplay(route: RoutePlan): { displayUsd: number; legSumUsd: number } {
	if (route.side === "sell") {
		return { displayUsd: 0, legSumUsd: 0 };
	}
	const legSumUsd = route.legs.reduce((sum, leg) => sum + (leg.bridge?.estimatedCost ?? 0), 0);
	const apiUsd = route.totalBridgeCost;
	const raw = apiUsd > 0 ? apiUsd : legSumUsd;
	const displayUsd = Math.round(raw * 100) / 100;

	if (import.meta.env.DEV) {
		if (legSumUsd > 0 && apiUsd === 0) {
			console.warn("[SOR] totalBridgeCost is 0 but leg bridge estimates sum to", legSumUsd);
		}
		if (apiUsd > 0 && legSumUsd > 0 && Math.abs(apiUsd - legSumUsd) > 0.02) {
			console.warn("[SOR] totalBridgeCost vs leg bridge sum mismatch", { apiUsd, legSumUsd });
		}
	}

	return { displayUsd, legSumUsd };
}

export function buildFundsTransferTooltip(route: RoutePlan): string {
	const pairs: { venue: string; chain: string }[] = [];
	const seen = new Set<string>();

	for (const leg of route.legs) {
		if (!leg.bridge) continue;
		const venue = VENUE_DISPLAY_NAMES[leg.venue];
		const chain = sorChainDisplayName(leg.bridge.toChain);
		const dedupeKey = `${venue}|${chain}`;
		if (seen.has(dedupeKey)) continue;
		seen.add(dedupeKey);
		pairs.push({ venue, chain });
	}

	const lifiPhrase = "LI.FI bridge quote (estimated)";
	if (pairs.length === 0) {
		return `Estimated ${lifiPhrase} cost to move funds for this trade.`;
	}
	if (pairs.length === 1) {
		const { venue, chain } = pairs[0];
		return `${lifiPhrase}: moving funds to your ${chain} account to trade on ${venue}.`;
	}
	return `${lifiPhrase} across: ${pairs.map((p) => `${p.chain} for ${p.venue}`).join("; ")}.`;
}

export type SorBuyCashShortfall = { available: number; shortfall: number };

export interface SorCashGateInput {
	routeExpired: boolean;
	isLoading: boolean;
	isStale: boolean;
	side: "buy" | "sell";
}

/**
 * When the user is short on aggregate SOR cash for a buy, returns amounts for UI + deposit CTA.
 * Skips when route is expired or a stale refetch is in flight (matches trade-box button logic).
 */
export function getSorBuyCashShortfall(
	route: RoutePlan | null | undefined,
	totalAvailableCash: number | undefined,
	opts: SorCashGateInput,
): SorBuyCashShortfall | null {
	if (opts.side !== "buy" || !route || opts.routeExpired) return null;
	if (opts.isLoading && opts.isStale) return null;
	if (typeof totalAvailableCash !== "number" || !Number.isFinite(totalAvailableCash)) return null;

	const needed = route.totalCost;
	if (typeof needed !== "number" || !Number.isFinite(needed) || needed <= totalAvailableCash) return null;

	return {
		available: totalAvailableCash,
		shortfall: needed - totalAvailableCash,
	};
}
