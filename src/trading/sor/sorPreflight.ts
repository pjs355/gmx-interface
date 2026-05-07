import type { RouteLeg, SorVenue } from "./sor-types";
import { VENUE_DISPLAY_NAMES } from "./sor-types";

/**
 * Numeric floors per venue. **Keep in sync with**
 * `predictions/src/sor/venue-minimums.ts` (VENUE_MINIMUMS).
 */
const EPS = 1e-9;

type VenueMinProfile = {
	minMarketBuyUsd: number;
	minMarketSellShares: number;
	minLimitShares: number;
	minLimitBuyNotionalUsd: number;
};

const VENUE_MINIMUMS: Record<SorVenue, VenueMinProfile> = {
	levelup: {
		minMarketBuyUsd: 1,
		minMarketSellShares: 1,
		minLimitShares: 1,
		minLimitBuyNotionalUsd: 1,
	},
	polymarket: {
		minMarketBuyUsd: 1,
		minMarketSellShares: 1,
		minLimitShares: 1,
		minLimitBuyNotionalUsd: 1,
	},
	limitless: {
		minMarketBuyUsd: 1,
		minMarketSellShares: 1,
		minLimitShares: 1,
		minLimitBuyNotionalUsd: 1,
	},
	predictfun: {
		minMarketBuyUsd: 1,
		minMarketSellShares: 1,
		minLimitShares: 1,
		minLimitBuyNotionalUsd: 1,
	},
	dflow: {
		minMarketBuyUsd: 1,
		minMarketSellShares: 1,
		minLimitShares: 1,
		minLimitBuyNotionalUsd: 1,
	},
};

/**
 * Product-wide SOR floors. **Keep in sync with**
 * `predictions/src/sor/sor-floors.ts`.
 *
 * These are request-level gates — they sit on top of the per-venue minimums
 * above so sub-$2 buys / limits and sub-1-share sells are never sent to the
 * route API (and the trade button disables with the exact copy).
 */
export const SOR_MIN_MARKET_BUY_USD = 2;
export const SOR_MIN_LIMIT_ORDER_USD = 2;
export const SOR_MIN_MARKET_SELL_SHARES = 1;

export const SOR_FLOOR_MESSAGES = {
	marketBuy: "Trade minimum is $2.",
	limitOrder: "$2 minimum limit order value.",
	marketSell: "Minimum sell is 1 share.",
} as const;

const ALL_SOR_VENUES: readonly SorVenue[] = [
	"levelup",
	"polymarket",
	"dflow",
	"predictfun",
	"limitless",
] as const;

function isSorVenue(v: string): v is SorVenue {
	return Object.prototype.hasOwnProperty.call(VENUE_MINIMUMS, v);
}

function venuesForMinimumCheck(
	tradingVenue: string,
	matchedVenues?: Iterable<string> | null,
): SorVenue[] {
	if (tradingVenue === "all") {
		const fromMatch = matchedVenues
			? [...matchedVenues].filter(isSorVenue)
			: [];
		return fromMatch.length > 0 ? fromMatch : [...ALL_SOR_VENUES];
	}
	return isSorVenue(tradingVenue) ? [tradingVenue] : [];
}

export type AggregateVenueMinimums = {
	maxMinMarketBuyUsd: number;
	maxMinMarketSellShares: number;
	maxMinLimitShares: number;
	maxMinLimitBuyNotionalUsd: number;
};

export function aggregateMinThresholds(venues: readonly SorVenue[]): AggregateVenueMinimums {
	if (venues.length === 0) {
		return {
			maxMinMarketBuyUsd: 1,
			maxMinMarketSellShares: 0.01,
			maxMinLimitShares: 0.01,
			maxMinLimitBuyNotionalUsd: 1,
		};
	}
	return {
		maxMinMarketBuyUsd: Math.max(
			...venues.map((v) => VENUE_MINIMUMS[v].minMarketBuyUsd),
		),
		maxMinMarketSellShares: Math.max(
			...venues.map((v) => VENUE_MINIMUMS[v].minMarketSellShares),
		),
		maxMinLimitShares: Math.max(
			...venues.map((v) => VENUE_MINIMUMS[v].minLimitShares),
		),
		maxMinLimitBuyNotionalUsd: Math.max(
			...venues.map((v) => VENUE_MINIMUMS[v].minLimitBuyNotionalUsd),
		),
	};
}

/** Predict.fun SDK: market BUY `valueWei` must be ≥ 1e18 ($1 USDT). */
export const PREDICT_MIN_BUY_USD = VENUE_MINIMUMS.predictfun.minMarketBuyUsd;

/** Predict.fun SDK: `quantityWei` must be ≥ 1e16 (0.01 shares). */
export const PREDICT_MIN_SHARES = VENUE_MINIMUMS.predictfun.minMarketSellShares;

/**
 * The trade-box limit-price field stores integer cents (1–99) as a string.
 * All SOR / preflight call sites must go through this parser so the scale
 * semantics stay in lock-step and no code path silently rejects 99¢.
 *
 * Accepts whole-cent strings ("1".."99"); returns `undefined` for empty,
 * NaN, fractional, or out-of-range input.
 */
export function parseLimitPriceCents(raw: unknown): number | undefined {
	if (raw == null) return undefined;
	const s = String(raw).trim();
	if (!s) return undefined;
	const n = Number(s);
	if (!Number.isFinite(n)) return undefined;
	if (!Number.isInteger(n)) return undefined;
	if (n < 1 || n > 99) return undefined;
	return n;
}

/**
 * Convert a probability in (0,1) to an integer cents string suitable for the
 * limit-price field, clamped to the venue-accepted 1..99 range so that
 * `p=0.995` or `p=0.999` do not overflow to 100 (which would be rejected as
 * invalid and silently suppress routing).
 */
export function probabilityToLimitPriceCentsString(p: number): string | null {
	if (!Number.isFinite(p)) return null;
	const rounded = Math.round(p * 100);
	const clamped = Math.min(99, Math.max(1, rounded));
	return String(clamped);
}

function checkLegAgainstProfile(
	leg: RouteLeg,
	side: "buy" | "sell",
	m: VenueMinProfile,
	venueLabel: string,
): { ok: true } | { ok: false; error: string } {
	const isLimit = leg.orderType === "limit";
	if (isLimit) {
		if (leg.shares + EPS < m.minLimitShares) {
			return {
				ok: false,
				error: `${venueLabel} requires a minimum of ${m.minLimitShares} shares per limit order. Increase your size and try again.`,
			};
		}
		if (side === "buy" && leg.executionAmountUsd + EPS < m.minLimitBuyNotionalUsd) {
			return {
				ok: false,
				error: `${venueLabel} requires a minimum of $${m.minLimitBuyNotionalUsd.toFixed(2)} notional per limit buy. Increase your size and try again.`,
			};
		}
		return { ok: true };
	}
	if (side === "buy") {
		if (leg.executionAmountUsd + EPS < m.minMarketBuyUsd) {
			return {
				ok: false,
				error: `${venueLabel} requires a minimum of $${m.minMarketBuyUsd.toFixed(2)} per market buy. This route would only spend $${leg.executionAmountUsd.toFixed(2)} — increase your trade size.`,
			};
		}
		return { ok: true };
	}
	if (leg.shares + EPS < m.minMarketSellShares) {
		return {
			ok: false,
			error: `${venueLabel} requires a minimum of ${m.minMarketSellShares} shares per market sell.`,
		};
	}
	return { ok: true };
}

/**
 * Per-venue protocol minimums enforced before bridge / venue submit.
 */
export function validateLegMinimum(
	leg: RouteLeg,
	side: "buy" | "sell",
): { ok: true } | { ok: false; error: string } {
	if (!isSorVenue(leg.venue)) return { ok: true };
	const m = VENUE_MINIMUMS[leg.venue];
	const venueLabel = VENUE_DISPLAY_NAMES[leg.venue] ?? leg.venue;
	return checkLegAgainstProfile(leg, side, m, venueLabel);
}

/** True if any leg fails {@link validateLegMinimum}. */
export function routeFailsVenueMinimums(
	route: { legs: RouteLeg[] } | null | undefined,
	side: "buy" | "sell",
): boolean {
	if (!route?.legs?.length) return false;
	for (const leg of route.legs) {
		const v = validateLegMinimum(leg, side);
		if (!v.ok) return true;
	}
	return false;
}

/**
 * True when the user's typed amount is below venue minimums **before** a route exists.
 * Use so the trade button shows "Below trade minimum…" instead of "Route unavailable".
 *
 * - Market BUY: amount is USD; must be ≥ max venue `minMarketBuyUsd` (for `"all"`, max across `matchedVenues`).
 * - Market SELL: amount is shares; must ≥ max `minMarketSellShares`.
 * - Limit: amount is shares; must ≥ max `minLimitShares`. Limit **buy** also requires
 *   `shares * (limitPriceCents/100)` ≥ max `minLimitBuyNotionalUsd` when `limitPriceCents` is set.
 */
/**
 * Reason a trade input is below the minimum, so the button can show the
 * correct product copy (not a generic "below minimum" line).
 */
export type BelowMinReason =
	| "marketBuy"
	| "marketSell"
	| "limitOrder"
	| "limitShares";

/**
 * Rich preflight result. `below: false` means the amount is acceptable (or we
 * have no venues to check against, e.g. empty matched list). Callers that
 * only need a boolean can use {@link rawInputBelowVenueMinimum}.
 */
export function checkRawInputAgainstVenueMinimum(args: {
	tradingVenue: string;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	amountStr: string;
	/** Integer cents 1–99; pass for limit notional check. */
	limitPriceCents?: number;
	/** When `tradingVenue === "all"`, venues that may appear in SOR. */
	matchedVenues?: Iterable<string> | null;
}): { below: false } | { below: true; reason: BelowMinReason; message: string } {
	const venues = venuesForMinimumCheck(
		args.tradingVenue,
		args.matchedVenues ?? null,
	);
	if (venues.length === 0) return { below: false };

	const agg = aggregateMinThresholds(venues);
	const n = parseFloat(args.amountStr.trim());
	if (!Number.isFinite(n) || n <= 0) return { below: false };

	if (args.orderType === "limit") {
		// Per-venue share floor still applies (e.g. whole-share venues).
		if (n + EPS < agg.maxMinLimitShares) {
			return {
				below: true,
				reason: "limitShares",
				message: SOR_FLOOR_MESSAGES.limitOrder,
			};
		}
		// $2 notional floor applies to both sides. Only checked when we have
		// a valid price to compute notional; otherwise the caller should be
		// showing "Enter amount" anyway.
		if (
			typeof args.limitPriceCents === "number" &&
			Number.isInteger(args.limitPriceCents) &&
			args.limitPriceCents >= 1 &&
			args.limitPriceCents <= 99
		) {
			const notional = n * (args.limitPriceCents / 100);
			const floor = Math.max(
				agg.maxMinLimitBuyNotionalUsd,
				SOR_MIN_LIMIT_ORDER_USD,
			);
			if (notional + EPS < floor) {
				return {
					below: true,
					reason: "limitOrder",
					message: SOR_FLOOR_MESSAGES.limitOrder,
				};
			}
		}
		return { below: false };
	}
	if (args.side === "buy") {
		const floor = Math.max(agg.maxMinMarketBuyUsd, SOR_MIN_MARKET_BUY_USD);
		if (n + EPS < floor) {
			return {
				below: true,
				reason: "marketBuy",
				message: SOR_FLOOR_MESSAGES.marketBuy,
			};
		}
		return { below: false };
	}
	const sellFloor = Math.max(
		agg.maxMinMarketSellShares,
		SOR_MIN_MARKET_SELL_SHARES,
	);
	if (n + EPS < sellFloor) {
		return {
			below: true,
			reason: "marketSell",
			message: SOR_FLOOR_MESSAGES.marketSell,
		};
	}
	return { below: false };
}

export function rawInputBelowVenueMinimum(args: {
	tradingVenue: string;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	amountStr: string;
	limitPriceCents?: number;
	matchedVenues?: Iterable<string> | null;
}): boolean {
	return checkRawInputAgainstVenueMinimum(args).below;
}

/** @deprecated Use {@link rawInputBelowVenueMinimum} with `tradingVenue: "predictfun"`. */
export function predictRawInputBelowProtocolMinimum(args: {
	tradingVenue: string;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	amountStr: string;
}): boolean {
	if (args.tradingVenue !== "predictfun") return false;
	return rawInputBelowVenueMinimum({
		tradingVenue: "predictfun",
		side: args.side,
		orderType: args.orderType,
		amountStr: args.amountStr,
	});
}
