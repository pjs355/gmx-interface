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
	/**
	 * SOR `questionId` / trade-box `smartRoutingMarketKey` for the market the user
	 * is viewing. When set, omnibus + execution overlays must match this id on the
	 * route snapshot (same pattern as outcome flips — avoids one stale frame of
	 * market A prices after switching to market B).
	 */
	questionId?: string;
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
 * Omnibus (display) channel.
 *
 * Trust whenever the **effective** display route (live response or sticky fallback from
 * SmartRoutingSection) matches the user's typed context. We intentionally do **not** gate on
 * `displayLoading`: background polls set loading while `liveRoute` is briefly null; the sticky
 * snapshot still matches the amount/outcome and must not flash skeleton on every refresh
 * (common after a fill when SOR re-poller runs).
 *
 * If the user changes amount/outcome, `routeMatchesTradeContext` fails on the stale sticky
 * route until a matching response arrives — that still suppresses wrong digits without loading gates.
 */
export function isOmnibusDisplayMetricsTrusted(
	_liveRoute: RoutePlan | null,
	effectiveDisplayRoute: RoutePlan | null,
	ctx: SorTradeTrustContext,
	_displayLoading: boolean,
	/** Which market produced the effective omnibus route; must align with `ctx.questionId` when set. */
	displayRouteSourceQuestionId: string | null,
): boolean {
	if (!effectiveDisplayRoute) return false;
	if (ctx.questionId) {
		if (displayRouteSourceQuestionId !== ctx.questionId) return false;
	}
	return routeMatchesTradeContext(effectiveDisplayRoute, ctx);
}

/** Venue-tab overlay row: numbers come from `executionRoute` when it targets this venue. */
export function isExecutionOverlayRowTrusted(
	executionRoute: RoutePlan | null,
	overlayRoute: RoutePlan | null,
	ctx: SorTradeTrustContext,
	_executionLoading: boolean,
	/** Which market produced `executionRoute`; must align with `ctx.questionId` when set. */
	executionRouteSourceQuestionId: string | null,
): boolean {
	if (!overlayRoute || !executionRoute) return false;
	if (ctx.questionId) {
		if (executionRouteSourceQuestionId !== ctx.questionId) return false;
	}
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
 * (stale + cent match + outcome/side). Loading is **not** a gate: during background polls the
 * previous matching route stays mounted while `executionLoading` flips, and we must not bounce
 * between skeleton and numbers.
 */
export function executionRouteTrustedForSingleVenueMarketBuy(
	route: RoutePlan | null,
	ctx: SorTradeTrustContext,
	_executionLoading: boolean,
	executionStale: boolean,
): boolean {
	if (executionStale) return false;
	return routeMatchesTradeContext(route, ctx);
}

/**
 * To Win + smart-routing overlay: parent trade state intentionally does **not** drop SOR for
 * `executionStale` alone (avoids requote flicker). Treat as pending only when there is no
 * matching plan yet (initial fetch) or the plan doesn't match the typed context — **not** on
 * every `executionLoading` tick while a matching route is still mounted (post-trade refresh).
 */
export function executionRoutePendingForToWinOverlay(
	executionRoute: RoutePlan | null,
	ctx: SorTradeTrustContext | null,
	executionLoading: boolean,
): boolean {
	if (!ctx) return false;
	if (executionRoute && routeMatchesTradeContext(executionRoute, ctx)) return false;
	if (executionLoading && executionRoute == null) return true;
	return executionRoute != null && !routeMatchesTradeContext(executionRoute, ctx);
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
