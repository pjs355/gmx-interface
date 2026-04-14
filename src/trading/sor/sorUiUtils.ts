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
 * "To Win" payout line: floor to whole cents so we never show more than the user can receive
 * (no sub-cent fractions in the UI).
 */
export function formatToWinUsdDisplay(rawUsd: number): string {
	if (!Number.isFinite(rawUsd) || rawUsd <= 0) return formatSorUsd2(0);
	const flooredCents = Math.floor(rawUsd * 100);
	return formatSorUsd2(flooredCents / 100);
}

/**
 * Details rows (venue legs, limits): share counts floored to 2 decimals — aligns with To Win flooring.
 */
export function formatSorDetailsSharesDisplay(shares: number): string {
	if (!Number.isFinite(shares)) return String(shares);
	const floored = Math.floor(shares * 100) / 100;
	const whole = Math.abs(floored % 1) < 1e-9;
	return new Intl.NumberFormat("en-US", {
		maximumFractionDigits: whole ? 0 : 2,
		minimumFractionDigits: whole ? 0 : 2,
	}).format(floored);
}

/**
 * Fee / transfer / bridge cost display: ceil to whole cents (never show a sub-penny fee; avoids understating).
 */
export function formatSorFeeUsdDisplay(usd: number): string {
	if (!Number.isFinite(usd) || usd <= 0) return formatSorUsd2(0);
	const ceiledCents = Math.ceil(usd * 100 - 1e-9);
	return formatSorUsd2(ceiledCents / 100);
}

/** Dollar amounts that are neither “to win” nor fees: nearest cent, no sub-penny in the string. */
export function formatSorUsdRounded2(usd: number): string {
	if (!Number.isFinite(usd)) return formatSorUsd2(0);
	return formatSorUsd2(Math.round(usd * 100) / 100);
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

/**
 * When to show the LI.FI transfer fee row on buy routes. Includes cases where the API
 * attached `leg.bridge` but costs are still estimated as $0 so users still see the line item.
 */
export function getSorLifiTransferFeeRowState(route: RoutePlan): {
	show: boolean;
	displayUsd: number;
} {
	if (route.side === "sell") {
		return { show: false, displayUsd: 0 };
	}
	const { displayUsd, legSumUsd } = derivedBridgeUsdForDisplay(route);
	const hasLegBridge = route.legs.some((l) => l.bridge != null);
	const apiReports = route.totalBridgeCost > 0;
	const show =
		displayUsd > 0 ||
		legSumUsd > 0 ||
		apiReports ||
		hasLegBridge;
	return { show, displayUsd };
}

function lifiTransferVenueChainPairs(route: RoutePlan): { venue: string; chain: string }[] {
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
	return pairs;
}

/** Tooltip for LI.FI transfer / bridge fee rows in the smart-route details panel. */
export function buildFundsTransferTooltip(route: RoutePlan): string {
	const base =
		"This is the estimated LI.FI fee to move money between your accounts on different exchanges when a venue wallet does not already have enough balance for its share of the order. LevelUp does not receive this fee.";

	const pairs = lifiTransferVenueChainPairs(route);
	if (pairs.length === 0) {
		return base;
	}
	if (pairs.length === 1) {
		const { venue, chain } = pairs[0];
		return `${base} This route includes an estimated transfer to your ${chain} wallet to trade on ${venue}.`;
	}
	return `${base} Transfers for this route: ${pairs.map((p) => `${p.chain} (${p.venue})`).join(", ")}.`;
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
