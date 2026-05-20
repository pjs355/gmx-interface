import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type {
	RoutePlan,
	RouteLeg,
	SorOutcome,
	SorSide,
	SorVenue,
	VenueRoutePreview,
	SorTradeTrustContext,
} from "@/trading/sor";
import {
	VENUE_DISPLAY_NAMES,
	isExecutionOverlayRowTrusted,
	isOmnibusDisplayMetricsTrusted,
	formatToWinUsdDisplay,
	formatSorDetailsSharesDisplay,
	formatSorBuyCostUsdDisplay,
	formatSorSellProceedsUsdDisplay,
	formatSorLegAvgForDisplay,
	sorBuyDrawerAllInCostUsd,
	sorBuyNetHeldTotalSharesFromLegs,
	sorBuyPredictLegNetHeldShares,
} from "@/trading/sor";
import type { TradingVenue } from "@/config/venueConfig";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { FlashingValue } from "@/utils/FlashingValue";
import QuoteMetricSkeleton from "./QuoteMetricSkeleton";
import { SorRouteConsolidatedFeesSummary } from "./SorRouteConsolidatedFeesSummary";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import { resolveMarketLogo } from "@/helpers/marketLogoResolver";
import { SHARE_SELL_COMPARE_EPS } from "./checkBalances";
import { FiLock } from "react-icons/fi";

const SR_VALUE_CLASS = "smart-routing-row__value";
const SR_VALUE_FLASH_CLASS = "smart-routing-row__value--flash";

/** Only snap away from a missing venue after previews stay without it — avoids jumping to "best" on one stale poll tick. */
const VENUE_IMPOSSIBLE_TAB_DEBOUNCE_MS = 650;

/** Brand blue→purple gradient (matches Header / RPGPanel). Inline SVG so the
 *  fork lines paint a real gradient instead of a flat color. */
function SplitGradientIcon({ size = 18 }: { size?: number }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			aria-hidden
		>
			<defs>
				<linearGradient
					id="sr-split-gradient"
					x1="0"
					y1="0"
					x2="24"
					y2="24"
					gradientUnits="userSpaceOnUse"
				>
					<stop offset="0%" stopColor="#6a6ff5" />
					<stop offset="100%" stopColor="#8b5cf6" />
				</linearGradient>
			</defs>
			{/* Trunk + two diverging arrows ("Y" with arrowheads). */}
			<path
				d="M12 21V13M12 13L5 6M5 6V10M5 6H9M12 13L19 6M19 6V10M19 6H15"
				stroke="url(#sr-split-gradient)"
				strokeWidth="2.4"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function isSellPreviewOk(
	p: VenueRoutePreview,
): p is Extract<VenueRoutePreview, { side: "sell"; ok: true }> {
	return p.side === "sell" && "ok" in p && p.ok === true;
}

function isSellPreviewFail(
	p: VenueRoutePreview,
): p is Extract<VenueRoutePreview, { side: "sell"; ok: false }> {
	return p.side === "sell" && "ok" in p && p.ok === false;
}

function buyPreviewNetDisplayShares(
	p: Extract<VenueRoutePreview, { side: "buy" }>,
	predictFunFeeRateBps: number | undefined,
): number {
	return sorBuyNetHeldTotalSharesFromLegs(p.legs, predictFunFeeRateBps);
}

function buyRouteNetDisplayShares(
	route: RoutePlan,
	predictFunFeeRateBps: number | undefined,
): number {
	if (route.side !== "buy") return route.totalShares;
	return sorBuyNetHeldTotalSharesFromLegs(route.legs, predictFunFeeRateBps);
}

/** Buy: executable first, then by most shares (best “to win”) descending. */
function sortVenuePreviewsBuy(
	previews: VenueRoutePreview[],
	predictFunFeeRateBps: number | undefined,
): VenueRoutePreview[] {
	return [...previews].sort((a, b) => {
		if (a.side !== "buy" || b.side !== "buy") return 0;
		const aEx = a.quoteKind === "executable" ? 1 : 0;
		const bEx = b.quoteKind === "executable" ? 1 : 0;
		if (aEx !== bEx) return bEx - aEx;
		return (
			buyPreviewNetDisplayShares(b, predictFunFeeRateBps) -
			buyPreviewNetDisplayShares(a, predictFunFeeRateBps)
		);
	});
}

/** Sell: highest proceeds first; failed rows last. */
function sortVenuePreviewsSell(previews: VenueRoutePreview[]): VenueRoutePreview[] {
	return [...previews].sort((a, b) => {
		if (a.side !== "sell" || b.side !== "sell") return 0;
		const aFail = isSellPreviewFail(a);
		const bFail = isSellPreviewFail(b);
		if (aFail && bFail) return 0;
		if (aFail) return 1;
		if (bFail) return -1;
		return b.proceeds - a.proceeds;
	});
}

function sortVenuePreviews(
	previews: VenueRoutePreview[],
	predictFunFeeRateBps: number | undefined,
): VenueRoutePreview[] {
	if (!previews.length) return previews;
	if (previews[0]!.side === "buy")
		return sortVenuePreviewsBuy(previews, predictFunFeeRateBps);
	if (previews[0]!.side === "sell") return sortVenuePreviewsSell(previews);
	return [...previews];
}

/** Split buy row only when it matches or beats every executable single-venue quote. */
function splitBuyIsBestOrTied(
	route: RoutePlan,
	previews: VenueRoutePreview[] | null | undefined,
	predictFunFeeRateBps: number | undefined,
): boolean {
	if (route.side !== "buy") return false;
	let maxSingle = 0;
	let anyExecutable = false;
	for (const p of previews ?? []) {
		if (p.side !== "buy" || p.quoteKind !== "executable") continue;
		anyExecutable = true;
		maxSingle = Math.max(
			maxSingle,
			buyPreviewNetDisplayShares(p, predictFunFeeRateBps),
		);
	}
	if (!anyExecutable) return true;
	return buyRouteNetDisplayShares(route, predictFunFeeRateBps) + 1e-9 >= maxSingle;
}

/** Split sell row only when proceeds match or beat every single-venue sell. */
function splitSellIsBestOrTied(
	route: RoutePlan,
	previews: VenueRoutePreview[] | null | undefined,
): boolean {
	if (route.side !== "sell") return false;
	let maxProceeds = 0;
	let anyOk = false;
	for (const p of previews ?? []) {
		if (!isSellPreviewOk(p)) continue;
		anyOk = true;
		maxProceeds = Math.max(maxProceeds, p.proceeds);
	}
	if (!anyOk) return true;
	return route.totalCost + 1e-9 >= maxProceeds;
}

function sorVenueToTradingVenue(v: SorVenue): TradingVenue {
	switch (v) {
		case "levelup":
			return "levelup";
		case "polymarket":
			return "polymarket";
		case "dflow":
			return "dflow";
		case "predictfun":
			return "predictfun";
		case "limitless":
			return "limitless";
		default:
			return "levelup";
	}
}

function sellRouteAvgPrice(route: RoutePlan): number | null {
	if (route.side !== "sell" || route.totalShares <= 0) return null;
	let weighted = 0;
	for (const leg of route.legs) {
		if (leg.shares > 0 && Number.isFinite(leg.avgPrice) && leg.avgPrice > 0) {
			weighted += leg.shares * leg.avgPrice;
		}
	}
	if (!(weighted > 0)) return null;
	return weighted / route.totalShares;
}

/** Synthetic "fee-only" route used by SorRouteConsolidatedFeesSummary inside the per-venue drawer. Never executed. */
function feeRouteFromBuyPreview(
	p: Extract<VenueRoutePreview, { side: "buy" }>,
): RoutePlan {
	return {
		side: "buy",
		legs: p.legs,
		totalFees: p.totalFees,
		totalBridgeCost: p.totalBridgeCost,
		totalCost: p.totalCost,
		totalShares: p.totalShares,
	} as RoutePlan;
}

function feeRouteFromSellPreview(
	p: Extract<VenueRoutePreview, { side: "sell"; ok: true }>,
): RoutePlan {
	return {
		side: "sell",
		legs: p.legs,
		totalFees: p.fees,
		totalBridgeCost: 0,
		totalCost: p.proceeds,
		totalShares: p.shares,
	} as RoutePlan;
}

function sorRouteSellAvgCentsFromLegs(route: RoutePlan): number | null {
	if (route.side !== "sell" || route.totalShares <= 0) return null;
	let weighted = 0;
	for (const leg of route.legs) {
		if (leg.shares > 0 && Number.isFinite(leg.avgPrice) && leg.avgPrice > 0) {
			weighted += leg.shares * leg.avgPrice;
		}
	}
	if (!(weighted > 0)) return null;
	const avg = weighted / route.totalShares;
	if (!Number.isFinite(avg) || avg <= 0) return null;
	return Math.round(avg * 100);
}

/**
 * Selected-row overlay: when the user is on `previewVenue`'s tab AND the execution channel has
 * a single-leg plan for that venue, that plan is what will actually be signed. Show its numbers
 * over the omnibus preview so the row matches the Submit button.
 */
function pickExecutionOverlay(
	executionRoute: RoutePlan | null,
	tradingVenue: TradingVenue,
	previewVenue: SorVenue,
	expectedSide: "buy" | "sell",
): RoutePlan | null {
	if (!executionRoute || tradingVenue === "all" || executionRoute.side !== expectedSide) {
		return null;
	}
	if (sorVenueToTradingVenue(previewVenue) !== tradingVenue) return null;
	if (executionRoute.legs.length !== 1 || executionRoute.legs[0]!.venue !== previewVenue) {
		return null;
	}
	return executionRoute;
}

/**
 * Inline "Max shares" badge for split-drawer legs. Drops to "Max" when the leg's
 * single-line text would overflow its container.
 *
 * Why measure instead of relying on @container queries: the parent leg-line uses
 * `display: inline-flex; white-space: nowrap; overflow: hidden`, which makes
 * container queries inside it brittle. A small `useLayoutEffect` measurement is
 * robust and re-evaluates whenever the leg's underlying data changes (passed via
 * `measureKey` so a new amount typed by the user re-runs the check).
 *
 * Hysteresis: once compact, we stay compact for that data shape (no oscillation).
 * `measureKey` resets us to the full label when the leg's shares/price change so
 * we always *try* "Max shares" first on the new layout.
 */
function MaxBadgeInline({ measureKey }: { measureKey: string }) {
	const ref = useRef<HTMLSpanElement | null>(null);
	const [compact, setCompact] = useState(false);

	useEffect(() => {
		setCompact(false);
	}, [measureKey]);

	useLayoutEffect(() => {
		if (compact) return;
		const span = ref.current;
		if (!span) return;
		const line = span.parentElement;
		if (!line) return;
		// 0.5px slack avoids sub-pixel rounding flips on retina displays.
		if (line.scrollWidth > line.clientWidth + 0.5) {
			setCompact(true);
		}
	}, [compact, measureKey]);

	return (
		<span ref={ref} className="smart-routing-drawer__leg-max smart-routing-drawer__leg-max--inline">
			{compact ? " Max" : " Max shares"}
		</span>
	);
}

/** Sell drawer: leg size matches user's outcome balance on that venue. */
function MaxBalanceBadgeInline({ measureKey }: { measureKey: string }) {
	const ref = useRef<HTMLSpanElement | null>(null);
	const [compact, setCompact] = useState(false);

	useEffect(() => {
		setCompact(false);
	}, [measureKey]);

	useLayoutEffect(() => {
		if (compact) return;
		const span = ref.current;
		if (!span) return;
		const line = span.parentElement;
		if (!line) return;
		if (line.scrollWidth > line.clientWidth + 0.5) {
			setCompact(true);
		}
	}, [compact, measureKey]);

	return (
		<span ref={ref} className="smart-routing-drawer__leg-max smart-routing-drawer__leg-max--inline">
			{compact ? " (Max Bal)" : " (Max Balance)"}
		</span>
	);
}

function sellLegVenuesAtUserBalance(
	legs: RouteLeg[],
	held: Partial<Record<SorVenue, number>> | undefined,
): Set<SorVenue> | undefined {
	if (!held || legs.length === 0) return undefined;
	const out = new Set<SorVenue>();
	for (const leg of legs) {
		const h = held[leg.venue];
		if (
			h != null &&
			Number.isFinite(h) &&
			h > 0 &&
			Number.isFinite(leg.shares) &&
			Math.abs(leg.shares - h) <= SHARE_SELL_COMPARE_EPS
		) {
			out.add(leg.venue);
		}
	}
	return out.size > 0 ? out : undefined;
}

function SmartRoutingLegRows({
	legs,
	side,
	formatLegAvg,
	showVenueLogo = false,
	atMaxByVenue,
	sellLegAtUserBalanceVenues,
	predictFunFeeRateBps,
}: {
	legs: RouteLeg[];
	side: "buy" | "sell";
	formatLegAvg: (p: number) => string;
	/** Multi-venue (split) drawers prefix each leg with its venue logo so the user can
	 *  tell legs apart. Single-venue drawers omit the logo — the venue is already
	 *  identified by the row above. */
	showVenueLogo?: boolean;
	/** Buy only. Venues whose available depth was fully consumed by this route — the
	 *  user couldn't get more shares from them at any price within the route's slippage
	 *  cap. Drives the "Max shares available" hint. Server already exposes this as
	 *  `VenueRoutePreviewBuy.insufficientLiquidity`; callers translate. */
	atMaxByVenue?: Set<SorVenue>;
	/** Sell only: leg fills user's entire venue outcome balance (within EPS). */
	sellLegAtUserBalanceVenues?: Set<SorVenue>;
	/** Predict.fun fee bps — buy legs show net-held shares when set. */
	predictFunFeeRateBps?: number;
}) {
	return (
		<div className="smart-routing-drawer__legs">
			{legs.map((leg, idx) => {
				const displayShares =
					side === "buy"
						? sorBuyPredictLegNetHeldShares(leg, predictFunFeeRateBps)
						: leg.shares;
				const shareStr = formatSorDetailsSharesDisplay(displayShares);
				const priceStr = formatLegAvg(leg.avgPrice);
				// Gross USD on this leg (shares × per-share price). Per-leg fees are
				// rolled up into the consolidated "Fees" row below the legs.
				const legGrossUsd =
					Number.isFinite(leg.shares) &&
					Number.isFinite(leg.avgPrice) &&
					leg.shares > 0 &&
					leg.avgPrice > 0
						? leg.shares * leg.avgPrice
						: null;
				const atBuyDepthMax =
					side === "buy" && atMaxByVenue?.has(leg.venue) === true;
				const atSellUserBalanceMax =
					side === "sell" && sellLegAtUserBalanceVenues?.has(leg.venue) === true;
				return (
					<div
						key={`${leg.venue}-${idx}`}
						className="smart-routing-drawer__leg"
					>
						{/* Left column: the shares/avg line, plus the optional
						 *  block-below "Max shares available" badge for the
						 *  single-venue drawer (which has the room to spell it
						 *  out without truncating). Split drawers render the
						 *  badge inline at the end of the line instead. */}
						<span className="smart-routing-drawer__leg-left">
							<span className="smart-routing-drawer__leg-line">
								{showVenueLogo ? (
									<MarketLogo
										venue={leg.venue}
										size={16}
										className="smart-routing-drawer__leg-logo"
									/>
								) : null}
								{side === "sell" ? <>Sell </> : null}
								<span className="smart-routing-drawer__num">{shareStr}</span>
								{" shares"}
								<span className="smart-routing-drawer__avg-tail">
									{" @ avg "}
									{priceStr}
								</span>
								{atBuyDepthMax && showVenueLogo ? (
									<MaxBadgeInline
										measureKey={`${leg.venue}-${leg.shares}-${leg.avgPrice}`}
									/>
								) : null}
								{atSellUserBalanceMax && showVenueLogo ? (
									<MaxBalanceBadgeInline
										measureKey={`sell-bal-${leg.venue}-${leg.shares}-${leg.avgPrice}`}
									/>
								) : null}
							</span>
							{atBuyDepthMax && !showVenueLogo ? (
								<span className="smart-routing-drawer__leg-max smart-routing-drawer__leg-max--block">
									(Max shares available)
								</span>
							) : null}
							{atSellUserBalanceMax && !showVenueLogo ? (
								<span className="smart-routing-drawer__leg-max smart-routing-drawer__leg-max--block">
									(Max Balance)
								</span>
							) : null}
						</span>
						<span className="smart-routing-drawer__leg-amount">
							{legGrossUsd != null
								? `$ ${formatSorBuyCostUsdDisplay(legGrossUsd)}`
								: ""}
						</span>
					</div>
				);
			})}
		</div>
	);
}

export interface SmartRoutingSectionProps {
	/** Always-on omnibus plan; drives the split row and per-venue rows. */
	displayRoute: RoutePlan | null;
	/** Targeted plan for the active venue tab; overlays its row's value when present. */
	executionRoute: RoutePlan | null;
	/** Preview list from the omnibus channel. `null` = not yet fetched / cleared. `[]` = fetched, no comparable venues. */
	venuePreviews: VenueRoutePreview[] | null;
	tradingVenue: TradingVenue;
	isLoading: boolean;
	onSelectVenue: (venue: TradingVenue) => void;
	/** Raw input amount string. When it changes we may auto-select the split row only (never a single-venue "best" jump). */
	userAmount?: string;
	/** Side of the active trade — drives the right-hand column header label. */
	side?: SorSide;
	/**
	 * Debounced gate from parent (`sorAmountMeetsFloor`). When false, sticky preview
	 * refs are cleared so stale payouts don't linger after the user drops below SOR floors.
	 */
	routePreviewAllowed?: boolean;
	/** Stable market id — when it changes, clear sticky omnibus state (match switch without remount). */
	smartRoutingMarketKey?: string;
	/** Which market the omnibus `displayRoute` was computed for — gates stale prices on market switch. */
	sorDisplayRouteSourceQuestionId?: string | null;
	/** Which market `executionRoute` was computed for — gates per-venue overlay rows on market switch. */
	sorExecutionRouteSourceQuestionId?: string | null;
	/** Selected outcome for omnibus + venue quotes — gates stale digits on Yes/No flips. */
	selectedOutcome: SorOutcome;
	/** Predict.fun fee bps from market detail — net-held share display when set. */
	predictFunFeeRateBps?: number;
	/** Execution channel loading — gates overlay rows when the targeted plan is in flight. */
	executionLoading: boolean;
	/** Parent locks venue rows while a trade executes or the box is loading — no auto-select or clicks. */
	venueSelectionLocked?: boolean;
	/** User outcome shares per venue (sell breakdown) — marks legs that fully consume venue balance. */
	userSellSharesByVenue?: Partial<Record<SorVenue, number>>;
}

export default function SmartRoutingSection({
	displayRoute: rawDisplayRoute,
	executionRoute,
	venuePreviews: rawVenuePreviews,
	tradingVenue,
	isLoading,
	onSelectVenue,
	userAmount,
	side,
	routePreviewAllowed = true,
	smartRoutingMarketKey,
	sorDisplayRouteSourceQuestionId = null,
	sorExecutionRouteSourceQuestionId = null,
	selectedOutcome,
	predictFunFeeRateBps,
	executionLoading,
	venueSelectionLocked = false,
	userSellSharesByVenue,
}: SmartRoutingSectionProps) {
	const { oddsDisplayStyle } = useOddsDisplay();
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const formatLegAvg = useCallback(
		(p: number) => formatSorLegAvgForDisplay(p, oddsDisplayStyle),
		[oddsDisplayStyle],
	);

	/* ---------------------------------------------------------------------
	 * Sticky-render shield against transient upstream nulls — gated on side.
	 *
	 * Team A ↔ Team B (same side):
	 *   The SOR hook leaves `displayRoute` / `venuePreviews` mounted across
	 *   the outcome flip; rows already use stable keys (`buy-${venue}` /
	 *   `sell-${venue}`) so React reconciles in place, `FlashingValue`
	 *   animates the per-row numbers, venues missing in the new payload
	 *   unmount, and venues that gain liquidity for the new outcome mount.
	 *   If anything upstream (an abort race, a transient failure inside the
	 *   grace window) momentarily flips a prop to null, the sticky refs
	 *   below keep the last good rows on screen so the grid does not
	 *   pop-out / pop-in.
	 *
	 * Buy ↔ Sell (the case that motivated this comment):
	 *   The two sides share nothing — different value semantics ("To Win"
	 *   vs "Receive"), different sort orders, different overlay rules.
	 *   On a side flip we MUST do a full reset, not a smooth swap. Two
	 *   subtle traps fight against that:
	 *     1. The parent re-renders with the new `side` prop the same tick
	 *        the user clicks; `useSorRoute`'s `blankAll()` runs in an
	 *        effect AFTER render, so for one render `rawDisplayRoute` is
	 *        still the old buy route while `side === "sell"`.
	 *     2. If we naively stamp every non-null `rawDisplayRoute` into
	 *        the sticky ref, that stale buy route would BECOME the sticky
	 *        snapshot — and the next render (after `blankAll`) would
	 *        recover it via `??`, holding buy rows on screen under a
	 *        "Receive" header until fresh sell data lands.
	 *   The fix: gate every read AND every write on `data.side ===
	 *   expectedSide`. Mismatched-side data is treated like `null` — never
	 *   rendered, never cached — so the section renders empty (no rows,
	 *   no header) for the brief loading window between buy and sell, and
	 *   only mounts again with data the user actually asked for.
	 * ------------------------------------------------------------------- */
	const stableDisplayRouteRef = useRef<RoutePlan | null>(null);
	const stableVenuePreviewsRef = useRef<VenueRoutePreview[] | null>(null);
	const lastSideKeyRef = useRef<string | null>(null);
	const expectedSide: SorSide = side ?? rawDisplayRoute?.side ?? "buy";
	if (lastSideKeyRef.current !== expectedSide) {
		lastSideKeyRef.current = expectedSide;
		stableDisplayRouteRef.current = null;
		stableVenuePreviewsRef.current = null;
	}
	const prevMarketKeyRef = useRef<string | null>(null);
	const marketKeyForSticky = smartRoutingMarketKey ?? "";
	if (
		prevMarketKeyRef.current !== null &&
		prevMarketKeyRef.current !== marketKeyForSticky
	) {
		stableDisplayRouteRef.current = null;
		stableVenuePreviewsRef.current = null;
	}
	prevMarketKeyRef.current = marketKeyForSticky;
	/* Promote upstream data to "live" only when its side matches the side the
	 * user is actually trading. The first preview's `.side` is enough — the
	 * SOR API always returns a homogeneous list per fetch. Empty arrays
	 * carry no side, so we accept them as legitimate ("server explicitly
	 * returned no venues") rather than treating them as a mismatch. */
	const liveDisplayRoute: RoutePlan | null =
		rawDisplayRoute && rawDisplayRoute.side === expectedSide
			? rawDisplayRoute
			: null;
	const liveVenuePreviews: VenueRoutePreview[] | null =
		rawVenuePreviews == null
			? null
			: rawVenuePreviews.length === 0 ||
				  rawVenuePreviews[0]!.side === expectedSide
				? rawVenuePreviews
				: null;
	/* Sticky refs only ever hold same-side data, so the fallback below can
	 * never resurrect a stale-side route after a buy↔sell flip. */
	if (routePreviewAllowed && liveDisplayRoute != null) {
		stableDisplayRouteRef.current = liveDisplayRoute;
	}
	if (routePreviewAllowed && liveVenuePreviews != null) {
		stableVenuePreviewsRef.current = liveVenuePreviews;
	}
	const displayRoute = routePreviewAllowed
		? (liveDisplayRoute ?? stableDisplayRouteRef.current)
		: null;
	const venuePreviews = routePreviewAllowed
		? (liveVenuePreviews ?? stableVenuePreviewsRef.current)
		: null;

	const trustCtx = useMemo((): SorTradeTrustContext | null => {
		if (userAmount === undefined) return null;
		const n = parseFloat(userAmount);
		if (!Number.isFinite(n) || n <= 0) return null;
		return {
			side: expectedSide,
			outcome: selectedOutcome,
			amountNumber: n,
			...(marketKeyForSticky ? { questionId: marketKeyForSticky } : {}),
		};
	}, [userAmount, expectedSide, selectedOutcome, marketKeyForSticky]);

	const omnibusMetricsTrusted = useMemo(() => {
		if (!trustCtx || !routePreviewAllowed) return true;
		return isOmnibusDisplayMetricsTrusted(
			liveDisplayRoute,
			displayRoute,
			trustCtx,
			isLoading,
			sorDisplayRouteSourceQuestionId ?? null,
		);
	}, [
		trustCtx,
		routePreviewAllowed,
		liveDisplayRoute,
		displayRoute,
		isLoading,
		sorDisplayRouteSourceQuestionId,
	]);

	const splitMetricsPending =
		Boolean(trustCtx && routePreviewAllowed && !omnibusMetricsTrusted);

	const rowMetricsPending = useCallback(
		(overlayRoute: RoutePlan | null) => {
			if (!trustCtx || !routePreviewAllowed) return false;
			if (overlayRoute) {
				return !isExecutionOverlayRowTrusted(
					executionRoute,
					overlayRoute,
					trustCtx,
					executionLoading,
					sorExecutionRouteSourceQuestionId ?? null,
				);
			}
			return !omnibusMetricsTrusted;
		},
		[
			trustCtx,
			routePreviewAllowed,
			executionRoute,
			omnibusMetricsTrusted,
			executionLoading,
			sorExecutionRouteSourceQuestionId,
		],
	);

	const toggle = useCallback((key: string) => {
		setExpandedKey((k) => (k === key ? null : key));
	}, []);

	const splitActive = tradingVenue === "all";
	const multiVenueSplit = useMemo(() => {
		if (!displayRoute || displayRoute.legs.length === 0) return false;
		return new Set(displayRoute.legs.map((l) => l.venue)).size > 1;
	}, [displayRoute]);

	const sortedVenuePreviews = useMemo(
		() =>
			venuePreviews && venuePreviews.length > 0
				? sortVenuePreviews(venuePreviews, predictFunFeeRateBps)
				: null,
		[venuePreviews, predictFunFeeRateBps],
	);

	const showSplitBuyRow = useMemo(
		() =>
			multiVenueSplit &&
			displayRoute != null &&
			displayRoute.side === "buy" &&
			splitBuyIsBestOrTied(displayRoute, venuePreviews, predictFunFeeRateBps),
		[multiVenueSplit, displayRoute, venuePreviews, predictFunFeeRateBps],
	);

	const showSplitSellRow = useMemo(
		() =>
			multiVenueSplit &&
			displayRoute != null &&
			displayRoute.side === "sell" &&
			splitSellIsBestOrTied(displayRoute, venuePreviews),
		[multiVenueSplit, displayRoute, venuePreviews],
	);

	/** When on "All Markets" without a split row, no venue string equals `"all"` — highlight the top preview row so one row always looks selected. */
	const omnibusHighlightsTopVenueRow = useMemo(
		() =>
			tradingVenue === "all" &&
			!showSplitBuyRow &&
			!showSplitSellRow &&
			Boolean(sortedVenuePreviews?.length),
		[tradingVenue, showSplitBuyRow, showSplitSellRow, sortedVenuePreviews],
	);

	const sortedVenuePreviewsRef = useRef(sortedVenuePreviews);
	sortedVenuePreviewsRef.current = sortedVenuePreviews;
	const tradingVenueRef = useRef(tradingVenue);
	tradingVenueRef.current = tradingVenue;
	const venueSelectionLockedRef = useRef(venueSelectionLocked);
	venueSelectionLockedRef.current = venueSelectionLocked;
	const routePreviewAllowedRef = useRef(routePreviewAllowed);
	routePreviewAllowedRef.current = routePreviewAllowed;

	useEffect(() => {
		if (!routePreviewAllowed) {
			stableDisplayRouteRef.current = null;
			stableVenuePreviewsRef.current = null;
		}
	}, [routePreviewAllowed]);

	/**
	 * When the user's venue tab is absent from the latest preview list, do **not**
	 * immediately snap to the sorted "best" row — transient SOR gaps caused wrong-venue
	 * trades. After a stable debounce, if the venue is still missing, move to the first
	 * preview row so the tab is never permanently orphaned.
	 */
	useEffect(() => {
		if (venueSelectionLocked) return;
		if (!routePreviewAllowed) return;
		if (tradingVenue === "all") return;
		if (!sortedVenuePreviews || sortedVenuePreviews.length === 0) return;
		const allowed = new Set(
			sortedVenuePreviews.map((p) => sorVenueToTradingVenue(p.venue)),
		);
		if (allowed.has(tradingVenue)) return;

		const timer = window.setTimeout(() => {
			if (venueSelectionLockedRef.current) return;
			if (!routePreviewAllowedRef.current) return;
			const tv = tradingVenueRef.current;
			if (tv === "all") return;
			const previews = sortedVenuePreviewsRef.current;
			if (!previews || previews.length === 0) return;
			const allowedNow = new Set(
				previews.map((p) => sorVenueToTradingVenue(p.venue)),
			);
			if (allowedNow.has(tv)) return;
			onSelectVenue(sorVenueToTradingVenue(previews[0]!.venue));
		}, VENUE_IMPOSSIBLE_TAB_DEBOUNCE_MS);

		return () => window.clearTimeout(timer);
	}, [
		venueSelectionLocked,
		routePreviewAllowed,
		sortedVenuePreviews,
		tradingVenue,
		onSelectVenue,
	]);

	/* Split-buy drawer: which venues did the route fully consume?
	 *
	 * Server marks each per-venue buy preview with `insufficientLiquidity` when
	 * that venue alone (given the full requested USD budget) cannot fill the
	 * order — its `totalShares` is the most the venue can ever provide at this
	 * size. If a leg in the SPLIT route delivered ≥ that ceiling, the split
	 * actually drained the venue's depth at the route's slippage cap, so we
	 * tag that leg with "(Max shares available)". Sell drawers don't need this
	 * (sell previews don't expose `insufficientLiquidity`).
	 */
	const splitBuyAtMaxByVenue = useMemo<Set<SorVenue> | undefined>(() => {
		if (!displayRoute || displayRoute.side !== "buy") return undefined;
		if (!venuePreviews || venuePreviews.length === 0) return undefined;
		const out = new Set<SorVenue>();
		const EPS = 1e-6;
		for (const leg of displayRoute.legs) {
			const preview = venuePreviews.find(
				(p): p is Extract<VenueRoutePreview, { side: "buy" }> =>
					p.side === "buy" && p.venue === leg.venue,
			);
			if (!preview) continue;
			if (!preview.insufficientLiquidity) continue;
			if (leg.shares + EPS >= preview.totalShares) out.add(leg.venue);
		}
		return out.size > 0 ? out : undefined;
	}, [displayRoute, venuePreviews]);

	/* ---------------------------------------------------------------------
	 * Auto-select when the input amount changes: only promote **split** ("all")
	 * when it is the top row — never auto-switch single-venue tabs to the sorted
	 * "best" preview. That jump raced user clicks and sent trades on the wrong venue.
	 *
	 * Notes:
	 *  - We mark "dirty" the moment `userAmount` changes, then commit only AFTER
	 *    `isLoading === false`, so split vs not uses fresh data.
	 *  - First mount does not auto-select; parent sticky `tradingVenue` wins.
	 *  - Manual `tradingVenue` changes clear the pending auto-select (effect below).
	 * ------------------------------------------------------------------- */
	const lastAutoSelectAmountRef = useRef<string | null>(
		userAmount === undefined ? null : userAmount,
	);
	const pendingAutoSelectRef = useRef(false);
	/**
	 * Tracks the `tradingVenue` we last observed. When `tradingVenue` changes
	 * for any reason **other than** auto-select itself (a manual venue tab
	 * click, smart-row click, or e2e injection), we cancel the pending
	 * auto-select so the SOR settle does not retroactively override the
	 * user's choice. Without this, typing an amount and then clicking a
	 * specific venue while SOR was still loading would leave the venue
	 * flipping to the auto-pick a few seconds later.
	 */
	const lastObservedTradingVenueRef = useRef<TradingVenue>(tradingVenue);

	useEffect(() => {
		if (venueSelectionLocked) {
			pendingAutoSelectRef.current = false;
		}
	}, [venueSelectionLocked]);

	useEffect(() => {
		if (userAmount === undefined) return;
		if (userAmount === lastAutoSelectAmountRef.current) return;
		pendingAutoSelectRef.current = true;
		lastAutoSelectAmountRef.current = userAmount;
	}, [userAmount]);

	useEffect(() => {
		if (lastObservedTradingVenueRef.current === tradingVenue) return;
		lastObservedTradingVenueRef.current = tradingVenue;
		// External venue change wins over a queued auto-pick. Auto-select
		// itself sets `pendingAutoSelectRef.current = false` before calling
		// `onSelectVenue`, so this branch only matters for manual changes.
		pendingAutoSelectRef.current = false;
	}, [tradingVenue]);

	useEffect(() => {
		if (venueSelectionLocked) return;
		if (!pendingAutoSelectRef.current) return;
		if (isLoading) return;
		// No data yet — nothing to select against. Wait for the next settle.
		if (!displayRoute && (!sortedVenuePreviews || sortedVenuePreviews.length === 0)) {
			return;
		}

		pendingAutoSelectRef.current = false;

		const splitIsTop = showSplitBuyRow || showSplitSellRow;
		if (splitIsTop && tradingVenue !== "all") {
			onSelectVenue("all");
		}
	}, [
		venueSelectionLocked,
		isLoading,
		showSplitBuyRow,
		showSplitSellRow,
		sortedVenuePreviews,
		displayRoute,
		tradingVenue,
		onSelectVenue,
	]);

	if (!sortedVenuePreviews && !multiVenueSplit && !isLoading) {
		return null;
	}

	const splitSellAvgCents =
		displayRoute && displayRoute.side === "sell"
			? sorRouteSellAvgCentsFromLegs(displayRoute)
			: null;

	/* Right-column header label mirrors what the row's value cell shows:
	 *  - buy → net-held share total (each share pays $1) → "To Win"
	 *  - sell → totalCost / proceeds USD → "Receive"
	 * Falls back to displayRoute.side if the parent didn't pass `side`. */
	const effectiveSide: SorSide =
		side ?? displayRoute?.side ?? executionRoute?.side ?? "buy";
	const rightHeaderLabel = effectiveSide === "buy" ? "To Win" : "Receive";

	const splitBuyNetDisplay =
		displayRoute && displayRoute.side === "buy"
			? buyRouteNetDisplayShares(displayRoute, predictFunFeeRateBps)
			: 0;

	/* Only show the column headers when there are actually rows to label.
	 * Avoids a "Venue / To Win" pair hovering above empty space during the
	 * initial fetch (when isLoading is true but no previews exist yet). */
	const hasAnyRow =
		showSplitBuyRow ||
		showSplitSellRow ||
		(sortedVenuePreviews != null && sortedVenuePreviews.length > 0);

	return (
		<div
			className={`smart-routing-section${venueSelectionLocked ? " smart-routing-section--interaction-locked" : ""}`}
			data-qa="smart-routing-section"
			aria-busy={venueSelectionLocked || undefined}
		>
			{hasAnyRow && (
				<div className="smart-routing-section__headers">
					<span className="smart-routing-section__header-label">Venue</span>
					<span className="smart-routing-section__header-label">
						{rightHeaderLabel}
					</span>
				</div>
			)}
			{showSplitBuyRow && displayRoute && (
				<div
					className={`smart-routing-block${splitActive ? " smart-routing-block--selected" : ""}`}
					data-qa="smart-routing-split-row"
				>
					<div className="smart-routing-row">
						<button
							type="button"
							className="smart-routing-row__main"
							onClick={() => onSelectVenue("all")}
						>
							<div className="smart-routing-row__left">
								<span
									className="smart-routing-row__logo smart-routing-row__logo--split"
									aria-hidden
								>
									<SplitGradientIcon size={20} />
								</span>
								<div className="smart-routing-row__meta">
									<span className="smart-routing-row__name">Split order</span>
									{splitBuyNetDisplay > 0 && (
										<span className="smart-routing-row__sub">
											{splitMetricsPending ? (
												<QuoteMetricSkeleton variant="smart-sub" />
											) : (
												<>
													{formatLegAvg(
														displayRoute.totalCost / splitBuyNetDisplay,
													)}{" "}
													avg.
												</>
											)}
										</span>
									)}
								</div>
							</div>
						</button>
						<button
							type="button"
							className="smart-routing-row__expand"
							aria-label="Show split order details"
							onClick={() => toggle("split")}
						>
							<span
								className={`smart-routing-row__chev${expandedKey === "split" ? " smart-routing-row__chev--open" : ""}`}
								aria-hidden
							/>
						</button>
						<button
							type="button"
							className="smart-routing-row__value-btn"
							onClick={() => onSelectVenue("all")}
							aria-busy={splitMetricsPending || undefined}
						>
							{splitMetricsPending ? (
								<QuoteMetricSkeleton variant="smart-value" />
							) : (
								<FlashingValue
									value={`$${formatToWinUsdDisplay(splitBuyNetDisplay)}`}
									className={SR_VALUE_CLASS}
									flashClassName={SR_VALUE_FLASH_CLASS}
								/>
							)}
						</button>
					</div>
					{expandedKey === "split" && (
						<div className="smart-routing-drawer" data-qa="smart-routing-split-drawer">
							<SmartRoutingLegRows
								legs={displayRoute.legs}
								side="buy"
								formatLegAvg={formatLegAvg}
								showVenueLogo
								atMaxByVenue={splitBuyAtMaxByVenue}
								predictFunFeeRateBps={predictFunFeeRateBps}
							/>
							<div className="smart-routing-drawer__footer">
								<div className="smart-routing-drawer__fees">
									<SorRouteConsolidatedFeesSummary route={displayRoute} variant="smart-drawer" />
								</div>
								{(() => {
									const drawerTotal = sorBuyDrawerAllInCostUsd(displayRoute);
									return drawerTotal != null ? (
										<div className="smart-routing-drawer__total">
											<span>Total Cost</span>
											<span>$ {formatSorBuyCostUsdDisplay(drawerTotal)}</span>
										</div>
									) : null;
								})()}
							</div>
						</div>
					)}
				</div>
			)}

			{showSplitSellRow && displayRoute && (
				<div
					className={`smart-routing-block${splitActive ? " smart-routing-block--selected" : ""}`}
					data-qa="smart-routing-split-row"
				>
					<div className="smart-routing-row">
						<button
							type="button"
							className="smart-routing-row__main"
							onClick={() => onSelectVenue("all")}
						>
							<div className="smart-routing-row__left">
								<span
									className="smart-routing-row__logo smart-routing-row__logo--split"
									aria-hidden
								>
									<SplitGradientIcon size={20} />
								</span>
								<div className="smart-routing-row__meta">
									<span className="smart-routing-row__name">Split order</span>
									{splitSellAvgCents != null && (
										<span className="smart-routing-row__sub">
											{splitMetricsPending ? (
												<QuoteMetricSkeleton variant="smart-sub" />
											) : (
												<>{formatLegAvg(splitSellAvgCents / 100)} avg.</>
											)}
										</span>
									)}
								</div>
							</div>
						</button>
						<button
							type="button"
							className="smart-routing-row__expand"
							aria-label="Show split sell details"
							onClick={() => toggle("split-sell")}
						>
							<span
								className={`smart-routing-row__chev${expandedKey === "split-sell" ? " smart-routing-row__chev--open" : ""}`}
								aria-hidden
							/>
						</button>
						<button
							type="button"
							className="smart-routing-row__value-btn"
							onClick={() => onSelectVenue("all")}
							aria-busy={splitMetricsPending || undefined}
						>
							{splitMetricsPending ? (
								<QuoteMetricSkeleton variant="smart-value" />
							) : (
								<FlashingValue
									value={`$ ${formatSorSellProceedsUsdDisplay(displayRoute.totalCost)}`}
									className={SR_VALUE_CLASS}
									flashClassName={SR_VALUE_FLASH_CLASS}
								/>
							)}
						</button>
					</div>
					{expandedKey === "split-sell" && (
						<div className="smart-routing-drawer" data-qa="smart-routing-split-drawer">
							<SmartRoutingLegRows
								legs={displayRoute.legs}
								side="sell"
								formatLegAvg={formatLegAvg}
								showVenueLogo
								sellLegAtUserBalanceVenues={sellLegVenuesAtUserBalance(
									displayRoute.legs,
									userSellSharesByVenue,
								)}
							/>
							<div className="smart-routing-drawer__footer">
								<div className="smart-routing-drawer__fees">
									<SorRouteConsolidatedFeesSummary route={displayRoute} variant="smart-drawer" />
								</div>
								<div className="smart-routing-drawer__total">
									<span>Est. receive</span>
									<span>$ {formatSorSellProceedsUsdDisplay(displayRoute.totalCost)}</span>
								</div>
							</div>
						</div>
					)}
				</div>
			)}

			{sortedVenuePreviews?.map((preview) => {
				const key =
					preview.side === "buy"
						? `buy-${preview.venue}`
						: `sell-${preview.venue}`;
				const selected =
					tradingVenue === sorVenueToTradingVenue(preview.venue) ||
					(omnibusHighlightsTopVenueRow &&
						sortedVenuePreviews &&
						preview === sortedVenuePreviews[0]);
				const letter = (VENUE_DISPLAY_NAMES[preview.venue] ?? "?")
					.slice(0, 1)
					.toUpperCase();

				const venueLogoUrl = resolveMarketLogo(preview.venue);
				const venueLogoNode = venueLogoUrl ? (
					<MarketLogo venue={preview.venue} size={28} />
				) : (
					letter
				);

				if (preview.side === "sell" && !preview.ok) {
					return (
						<div
							key={key}
							className="smart-routing-block smart-routing-block--disabled"
							data-qa={`smart-routing-venue-row-${preview.venue}`}
						>
							<div className="smart-routing-row smart-routing-row--message">
								<div className="smart-routing-row__left">
									<span
										className={`smart-routing-row__logo${venueLogoUrl ? " smart-routing-row__logo--image" : ""}`}
									>
										{venueLogoNode}
									</span>
									<div className="smart-routing-row__meta">
										<span className="smart-routing-row__name">
											{VENUE_DISPLAY_NAMES[preview.venue]}
										</span>
										<span className="smart-routing-row__sub">{preview.error}</span>
									</div>
								</div>
							</div>
						</div>
					);
				}

				if (preview.side === "sell" && preview.ok) {
					const overlayRoute = pickExecutionOverlay(
						executionRoute,
						tradingVenue,
						preview.venue,
						"sell",
					);
					const rowPending = rowMetricsPending(overlayRoute);
					const open = expandedKey === key;
					const feeR = overlayRoute ?? feeRouteFromSellPreview(preview);
					const overlayLeg = overlayRoute?.legs[0] ?? null;
					/** Sell proceeds match the trade-box overlay (`leg.executionAmountUsd` from PredictionMarketTradeBox.tsx L2179-2184). */
					const overlayProceeds =
						overlayLeg &&
						typeof overlayLeg.executionAmountUsd === "number" &&
						Number.isFinite(overlayLeg.executionAmountUsd) &&
						overlayLeg.executionAmountUsd > 0
							? overlayLeg.executionAmountUsd
							: overlayRoute
								? overlayRoute.totalCost
								: null;
					const displayProceeds = overlayProceeds ?? preview.proceeds;
					const displayAvgPrice =
						overlayRoute && overlayRoute.side === "sell"
							? (sellRouteAvgPrice(overlayRoute) ?? preview.avgPrice)
							: preview.avgPrice;
					return (
						<div
							key={key}
							className={`smart-routing-block${selected ? " smart-routing-block--selected" : ""}`}
						>
							<div className="smart-routing-row">
								<button
									type="button"
									className="smart-routing-row__main"
									data-qa={`smart-routing-venue-row-${preview.venue}`}
									onClick={() => onSelectVenue(sorVenueToTradingVenue(preview.venue))}
								>
									<div className="smart-routing-row__left">
										<span
											className={`smart-routing-row__logo${venueLogoUrl ? " smart-routing-row__logo--image" : ""}`}
										>
											{venueLogoNode}
										</span>
										<div className="smart-routing-row__meta">
											<span className="smart-routing-row__name">
												{VENUE_DISPLAY_NAMES[preview.venue]}
											</span>
											<span className="smart-routing-row__sub">
												{rowPending ? (
													<QuoteMetricSkeleton variant="smart-sub" />
												) : (
													<>
														{formatLegAvg(displayAvgPrice)} avg.
													</>
												)}
											</span>
										</div>
									</div>
								</button>
								<button
									type="button"
									className="smart-routing-row__expand"
									aria-label="Venue details"
									onClick={() => toggle(key)}
								>
									<span
										className={`smart-routing-row__chev${open ? " smart-routing-row__chev--open" : ""}`}
										aria-hidden
									/>
								</button>
								<button
									type="button"
									className="smart-routing-row__value-btn"
									onClick={() => onSelectVenue(sorVenueToTradingVenue(preview.venue))}
									aria-busy={rowPending || undefined}
								>
									{rowPending ? (
										<QuoteMetricSkeleton variant="smart-value" />
									) : (
										<FlashingValue
											value={`$ ${formatSorSellProceedsUsdDisplay(displayProceeds)}`}
											className={SR_VALUE_CLASS}
											flashClassName={SR_VALUE_FLASH_CLASS}
										/>
									)}
								</button>
							</div>
							{open && (
								<div className="smart-routing-drawer">
									<SmartRoutingLegRows
										legs={preview.legs}
										side="sell"
										formatLegAvg={formatLegAvg}
										sellLegAtUserBalanceVenues={sellLegVenuesAtUserBalance(
											preview.legs,
											userSellSharesByVenue,
										)}
									/>
									<div className="smart-routing-drawer__footer">
										<div className="smart-routing-drawer__fees">
											<SorRouteConsolidatedFeesSummary route={feeR} variant="smart-drawer" />
										</div>
										<div className="smart-routing-drawer__total">
											<span>Est. receive</span>
											<span>
												$ {formatSorSellProceedsUsdDisplay(displayProceeds)}
											</span>
										</div>
									</div>
								</div>
							)}
						</div>
					);
				}

				const p = preview;
				const overlayRoute = pickExecutionOverlay(executionRoute, tradingVenue, p.venue, "buy");
				const rowPending = rowMetricsPending(overlayRoute);
				const open = expandedKey === key;
				const feeR = overlayRoute ?? feeRouteFromBuyPreview(p);
				const previewNetShares = buyPreviewNetDisplayShares(p, predictFunFeeRateBps);
				const displayShares = overlayRoute
					? buyRouteNetDisplayShares(overlayRoute, predictFunFeeRateBps)
					: previewNetShares;
				const costForAvg = overlayRoute ? overlayRoute.totalCost : p.totalCost;
				const netSharesForAvg = overlayRoute
					? buyRouteNetDisplayShares(overlayRoute, predictFunFeeRateBps)
					: previewNetShares;
				const displayAvgPrice =
					netSharesForAvg > 0 && Number.isFinite(costForAvg)
						? costForAvg / netSharesForAvg
						: null;
				const theoretical = p.quoteKind === "theoreticalOnly";
				/* Kalshi (DFlow) is `theoreticalOnly` until the user completes KYC. We
				 * still let them click the row so the trade-box flips to the Kalshi tab,
				 * where the primary CTA reads "Enable Kalshi trading" and routes them
				 * into the DFlow Proof redirect. Other venues stay disabled — no other
				 * venue has an in-app onboarding hook to land on. */
				const kalshiNeedsKyc = theoretical && p.venue === "dflow";
				const blockClick = theoretical && !kalshiNeedsKyc;

				return (
					<div
						key={key}
						className={`smart-routing-block${selected ? " smart-routing-block--selected" : ""}${theoretical ? " smart-routing-block--theoretical" : ""}`}
					>
						<div className="smart-routing-row">
							<button
								type="button"
								className="smart-routing-row__main"
								data-qa={`smart-routing-venue-row-${p.venue}`}
								disabled={blockClick}
								onClick={() => {
									if (!blockClick) {
										onSelectVenue(sorVenueToTradingVenue(p.venue));
									}
								}}
							>
								<div className="smart-routing-row__left">
									<span
										className={`smart-routing-row__logo${venueLogoUrl ? " smart-routing-row__logo--image" : ""}`}
									>
										{venueLogoNode}
									</span>
									<div className="smart-routing-row__meta">
										<span className="smart-routing-row__name">
											{VENUE_DISPLAY_NAMES[p.venue]}
											{kalshiNeedsKyc ? (
												<FiLock
													className="smart-routing-row__name-lock"
													aria-hidden
												/>
											) : theoretical ? (
												" (book only)"
											) : null}
										</span>
										{(displayAvgPrice != null || rowPending) && (
											<span className="smart-routing-row__sub">
												{rowPending ? (
													<QuoteMetricSkeleton variant="smart-sub" />
												) : displayAvgPrice != null ? (
													<>
														{formatLegAvg(displayAvgPrice)} avg.
													</>
												) : null}
											</span>
										)}
									</div>
								</div>
							</button>
							<button
								type="button"
								className="smart-routing-row__expand"
								aria-label="Venue details"
								onClick={() => toggle(key)}
							>
								<span
									className={`smart-routing-row__chev${open ? " smart-routing-row__chev--open" : ""}`}
									aria-hidden
								/>
							</button>
							<button
								type="button"
								className="smart-routing-row__value-btn"
								disabled={blockClick}
								onClick={() => {
									if (!blockClick) {
										onSelectVenue(sorVenueToTradingVenue(p.venue));
									}
								}}
								aria-busy={rowPending || undefined}
							>
								{rowPending ? (
									<QuoteMetricSkeleton variant="smart-value" />
								) : (
									<FlashingValue
										value={`$${formatToWinUsdDisplay(displayShares)}`}
										className={SR_VALUE_CLASS}
										flashClassName={SR_VALUE_FLASH_CLASS}
									/>
								)}
							</button>
						</div>
						{open && (
							<div className="smart-routing-drawer">
								<SmartRoutingLegRows
									legs={p.legs}
									side="buy"
									formatLegAvg={formatLegAvg}
									atMaxByVenue={
										p.insufficientLiquidity ? new Set([p.venue]) : undefined
									}
									predictFunFeeRateBps={predictFunFeeRateBps}
								/>
								<div className="smart-routing-drawer__footer">
									<div className="smart-routing-drawer__fees">
										<SorRouteConsolidatedFeesSummary route={feeR} variant="smart-drawer" />
									</div>
									{(() => {
										const drawerTotal = sorBuyDrawerAllInCostUsd(feeR);
										return drawerTotal != null ? (
											<div className="smart-routing-drawer__total">
												<span>Total Cost</span>
												<span>$ {formatSorBuyCostUsdDisplay(drawerTotal)}</span>
											</div>
										) : null;
									})()}
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
