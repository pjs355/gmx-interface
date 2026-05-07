import type { RoutePlan, SorOutcome, SorSide } from "./sor-types";
import type { VenueRoutePreviewBuy, VenueRoutePreviewSellOk } from "./sor-types";
import { SHARE_SELL_COMPARE_EPS } from "@/pages/PredictionMarket/PredictionMarketTradeBox/checkBalances";

/** USD equality for market-buy routes — matches overlay logic in PredictionMarketTradeBox. */
export function usdAmountMatchesRoute(requestedUsd: number, inputUsd: number): boolean {
	return Math.round(requestedUsd * 100) === Math.round(inputUsd * 100);
}

/** Share quantity equality for market-sell routes — aligned with SHARE_SELL_COMPARE_EPS. */
export function shareAmountMatchesRoute(requestedShares: number, inputShares: number): boolean {
	return Math.abs(requestedShares - inputShares) <= SHARE_SELL_COMPARE_EPS;
}

export function positionToSorOutcome(position: "yes" | "no"): SorOutcome {
	return position === "yes" ? "A" : "B";
}

export interface SorTradeTrustContext {
	side: SorSide;
	outcome: SorOutcome;
	/** Parsed numeric amount: USD for buy, shares for sell (market orders). */
	amountNumber: number;
}

/**
 * Whether `route` describes the user's current trade intent (outcome, side, size).
 * Does not encode loading/stale — compose those at the callsite.
 */
export function routeMatchesTradeContext(
	route: RoutePlan | null | undefined,
	ctx: SorTradeTrustContext,
): boolean {
	if (!route || route.legs.length === 0) return false;
	if (route.side !== ctx.side) return false;
	if (route.outcome !== ctx.outcome) return false;
	if (ctx.side === "buy") {
		return usdAmountMatchesRoute(route.requestedAmount, ctx.amountNumber);
	}
	return shareAmountMatchesRoute(route.requestedAmount, ctx.amountNumber);
}

/**
 * Omnibus (display) channel: sticky refs may hold a prior quote while `displayLoading`
 * is true and live data is still null or from an older fetch — suppress stale digits until
 * live confirms the plan matches the current context, or loading finishes with a matching sticky snapshot.
 */
export function isOmnibusDisplayMetricsTrusted(
	liveRoute: RoutePlan | null,
	effectiveDisplayRoute: RoutePlan | null,
	ctx: SorTradeTrustContext,
	displayLoading: boolean,
): boolean {
	if (!effectiveDisplayRoute) return false;
	if (!routeMatchesTradeContext(effectiveDisplayRoute, ctx)) return false;
	if (
		displayLoading &&
		(!liveRoute || !routeMatchesTradeContext(liveRoute, ctx))
	) {
		return false;
	}
	return true;
}

/** Venue-tab overlay row: numbers come from `executionRoute` when it targets this venue. */
export function isExecutionOverlayRowTrusted(
	executionRoute: RoutePlan | null,
	overlayRoute: RoutePlan | null,
	ctx: SorTradeTrustContext,
	executionLoading: boolean,
): boolean {
	if (!overlayRoute || !executionRoute) return false;
	if (executionLoading) return false;
	return routeMatchesTradeContext(executionRoute, ctx);
}

export function venueBuyPreviewMatchesContext(
	p: VenueRoutePreviewBuy,
	ctx: SorTradeTrustContext,
): boolean {
	if (ctx.side !== "buy") return false;
	return usdAmountMatchesRoute(p.requestedAmount, ctx.amountNumber);
}

export function venueSellPreviewMatchesContext(
	p: VenueRoutePreviewSellOk,
	ctx: SorTradeTrustContext,
): boolean {
	if (ctx.side !== "sell") return false;
	return shareAmountMatchesRoute(p.shares, ctx.amountNumber);
}

/**
 * Single-venue market buy: avg-odds / SOR quote row — same gates as legacy `sorRouteFreshForAmount`
 * (loading + stale + cent match + outcome/side), expressed via `routeMatchesTradeContext`.
 */
export function executionRouteTrustedForSingleVenueMarketBuy(
	route: RoutePlan | null,
	ctx: SorTradeTrustContext,
	executionLoading: boolean,
	executionStale: boolean,
): boolean {
	if (executionLoading) return false;
	if (executionStale) return false;
	return routeMatchesTradeContext(route, ctx);
}

/**
 * To Win + smart-routing overlay: parent trade state intentionally does **not** drop SOR for
 * `executionStale` alone (avoids requote flicker). Only treat as “pending” when a fetch is
 * in flight or the route is for a different amount/outcome.
 */
export function executionRoutePendingForToWinOverlay(
	executionRoute: RoutePlan | null,
	ctx: SorTradeTrustContext | null,
	executionLoading: boolean,
): boolean {
	if (!ctx) return false;
	if (executionLoading) return true;
	if (executionRoute == null) return false;
	return !routeMatchesTradeContext(executionRoute, ctx);
}

/** Market sell avg cents line — trusted when SOR execution row matches (includes stale gate). */
export function executionRouteTrustedForSingleVenueMarketSell(
	route: RoutePlan | null,
	ctx: SorTradeTrustContext,
	executionLoading: boolean,
	executionStale: boolean,
): boolean {
	return executionRouteTrustedForSingleVenueMarketBuy(route, ctx, executionLoading, executionStale);
}
