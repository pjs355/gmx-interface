import { useState, useCallback, useMemo } from "react";
import { PiArrowsSplitBold } from "react-icons/pi";
import type { RoutePlan, RouteLeg, SorVenue, VenueRoutePreview } from "@/trading/sor";
import {
	VENUE_DISPLAY_NAMES,
	formatToWinUsdDisplay,
	formatSorDetailsSharesDisplay,
	formatSorBuyCostUsdDisplay,
	formatSorSellProceedsUsdDisplay,
	formatSorLegAvgForDisplay,
} from "@/trading/sor";
import type { TradingVenue } from "@/config/venueConfig";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { FlashingValue } from "@/utils/FlashingValue";
import { SorRouteConsolidatedFeesSummary } from "./SorRouteConsolidatedFeesSummary";

const SR_VALUE_CLASS = "smart-routing-row__value";
const SR_VALUE_FLASH_CLASS = "smart-routing-row__value--flash";

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

/** Buy: executable first, then by most shares (best “to win”) descending. */
function sortVenuePreviewsBuy(previews: VenueRoutePreview[]): VenueRoutePreview[] {
	return [...previews].sort((a, b) => {
		if (a.side !== "buy" || b.side !== "buy") return 0;
		const aEx = a.quoteKind === "executable" ? 1 : 0;
		const bEx = b.quoteKind === "executable" ? 1 : 0;
		if (aEx !== bEx) return bEx - aEx;
		return b.totalShares - a.totalShares;
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

function sortVenuePreviews(previews: VenueRoutePreview[]): VenueRoutePreview[] {
	if (!previews.length) return previews;
	if (previews[0]!.side === "buy") return sortVenuePreviewsBuy(previews);
	if (previews[0]!.side === "sell") return sortVenuePreviewsSell(previews);
	return [...previews];
}

/** Split buy row only when it matches or beats every executable single-venue quote. */
function splitBuyIsBestOrTied(
	route: RoutePlan,
	previews: VenueRoutePreview[] | null | undefined,
): boolean {
	if (route.side !== "buy") return false;
	let maxSingle = 0;
	let anyExecutable = false;
	for (const p of previews ?? []) {
		if (p.side !== "buy" || p.quoteKind !== "executable") continue;
		anyExecutable = true;
		maxSingle = Math.max(maxSingle, p.totalShares);
	}
	if (!anyExecutable) return true;
	return route.totalShares + 1e-9 >= maxSingle;
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

function SmartRoutingLegRows({
	legs,
	side,
	formatLegAvg,
}: {
	legs: RouteLeg[];
	side: "buy" | "sell";
	formatLegAvg: (p: number) => string;
}) {
	return (
		<div className="smart-routing-drawer__legs">
			{legs.map((leg, idx) => {
				const shareStr = formatSorDetailsSharesDisplay(leg.shares);
				const priceStr = formatLegAvg(leg.avgPrice);
				return (
					<div key={`${leg.venue}-${idx}`} className="smart-routing-drawer__leg">
						<span className="smart-routing-drawer__venue">
							{VENUE_DISPLAY_NAMES[leg.venue]}
						</span>
						<span className="smart-routing-drawer__leg-line">
							{side === "sell" ? <>Sell </> : null}
							<span className="smart-routing-drawer__num">{shareStr}</span>
							{" shares"}
							<span className="smart-routing-drawer__avg-tail">
								{" @ avg "}
								{priceStr}
							</span>
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
}

export default function SmartRoutingSection({
	displayRoute,
	executionRoute,
	venuePreviews,
	tradingVenue,
	isLoading,
	onSelectVenue,
}: SmartRoutingSectionProps) {
	const { formatAvgOdds, oddsDisplayStyle } = useOddsDisplay();
	const [expandedKey, setExpandedKey] = useState<string | null>(null);
	const formatLegAvg = useCallback(
		(p: number) => formatSorLegAvgForDisplay(p, oddsDisplayStyle),
		[oddsDisplayStyle],
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
		() => (venuePreviews && venuePreviews.length > 0 ? sortVenuePreviews(venuePreviews) : null),
		[venuePreviews],
	);

	const showSplitBuyRow = useMemo(
		() =>
			multiVenueSplit &&
			displayRoute != null &&
			displayRoute.side === "buy" &&
			splitBuyIsBestOrTied(displayRoute, venuePreviews),
		[multiVenueSplit, displayRoute, venuePreviews],
	);

	const showSplitSellRow = useMemo(
		() =>
			multiVenueSplit &&
			displayRoute != null &&
			displayRoute.side === "sell" &&
			splitSellIsBestOrTied(displayRoute, venuePreviews),
		[multiVenueSplit, displayRoute, venuePreviews],
	);

	if (!sortedVenuePreviews && !multiVenueSplit && !isLoading) {
		return null;
	}

	const splitSellAvgCents =
		displayRoute && displayRoute.side === "sell"
			? sorRouteSellAvgCentsFromLegs(displayRoute)
			: null;

	return (
		<div className="smart-routing-section" data-qa="smart-routing-section">
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
									<PiArrowsSplitBold size={18} />
								</span>
								<div className="smart-routing-row__meta">
									<span className="smart-routing-row__name">Split order</span>
									{displayRoute.totalShares > 0 && (
										<span className="smart-routing-row__sub">
											{formatAvgOdds(displayRoute.totalCost / displayRoute.totalShares)} avg.
										</span>
									)}
								</div>
							</div>
							<FlashingValue
								value={`$${formatToWinUsdDisplay(displayRoute.totalShares)}`}
								className={SR_VALUE_CLASS}
								flashClassName={SR_VALUE_FLASH_CLASS}
							/>
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
					</div>
					{expandedKey === "split" && (
						<div className="smart-routing-drawer" data-qa="smart-routing-split-drawer">
							<SmartRoutingLegRows
								legs={displayRoute.legs}
								side="buy"
								formatLegAvg={formatLegAvg}
							/>
							<div className="smart-routing-drawer__footer">
								<div className="smart-routing-drawer__fees">
									<SorRouteConsolidatedFeesSummary route={displayRoute} variant="smart-drawer" />
								</div>
								{Number.isFinite(displayRoute.totalCost) && (
									<div className="smart-routing-drawer__total">
										<span>Cost</span>
										<span>$ {formatSorBuyCostUsdDisplay(displayRoute.totalCost)}</span>
									</div>
								)}
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
									<PiArrowsSplitBold size={18} />
								</span>
								<div className="smart-routing-row__meta">
									<span className="smart-routing-row__name">Split order</span>
									{splitSellAvgCents != null && (
										<span className="smart-routing-row__sub">
											{formatLegAvg(splitSellAvgCents / 100)} avg.
										</span>
									)}
								</div>
							</div>
							<FlashingValue
								value={`$ ${formatSorSellProceedsUsdDisplay(displayRoute.totalCost)}`}
								className={SR_VALUE_CLASS}
								flashClassName={SR_VALUE_FLASH_CLASS}
							/>
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
					</div>
					{expandedKey === "split-sell" && (
						<div className="smart-routing-drawer" data-qa="smart-routing-split-drawer">
							<SmartRoutingLegRows
								legs={displayRoute.legs}
								side="sell"
								formatLegAvg={formatLegAvg}
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
					tradingVenue === sorVenueToTradingVenue(preview.venue);
				const letter = (VENUE_DISPLAY_NAMES[preview.venue] ?? "?")
					.slice(0, 1)
					.toUpperCase();

				if (preview.side === "sell" && !preview.ok) {
					return (
						<div
							key={key}
							className="smart-routing-block smart-routing-block--disabled"
							data-qa={`smart-routing-venue-row-${preview.venue}`}
						>
							<div className="smart-routing-row smart-routing-row--message">
								<div className="smart-routing-row__left">
									<span className="smart-routing-row__logo">{letter}</span>
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
										<span className="smart-routing-row__logo">{letter}</span>
										<div className="smart-routing-row__meta">
											<span className="smart-routing-row__name">
												{VENUE_DISPLAY_NAMES[preview.venue]}
											</span>
											<span className="smart-routing-row__sub">
												{formatAvgOdds(displayAvgPrice)} avg.
											</span>
										</div>
									</div>
									<FlashingValue
										value={`$ ${formatSorSellProceedsUsdDisplay(displayProceeds)}`}
										className={SR_VALUE_CLASS}
										flashClassName={SR_VALUE_FLASH_CLASS}
									/>
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
							</div>
							{open && (
								<div className="smart-routing-drawer">
									<SmartRoutingLegRows
										legs={preview.legs}
										side="sell"
										formatLegAvg={formatLegAvg}
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
				const open = expandedKey === key;
				const feeR = overlayRoute ?? feeRouteFromBuyPreview(p);
				const displayShares = overlayRoute ? overlayRoute.totalShares : p.totalShares;
				const displayAvgPrice =
					overlayRoute && overlayRoute.totalShares > 0
						? overlayRoute.totalCost / overlayRoute.totalShares
						: p.totalShares > 0
							? p.totalCost / p.totalShares
							: null;
				const theoretical = p.quoteKind === "theoreticalOnly";

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
								disabled={theoretical}
								onClick={() => {
									if (!theoretical) {
										onSelectVenue(sorVenueToTradingVenue(p.venue));
									}
								}}
							>
								<div className="smart-routing-row__left">
									<span className="smart-routing-row__logo">{letter}</span>
									<div className="smart-routing-row__meta">
										<span className="smart-routing-row__name">
											{VENUE_DISPLAY_NAMES[p.venue]}
											{theoretical ? " (book only)" : ""}
										</span>
										{displayAvgPrice != null && (
											<span className="smart-routing-row__sub">
												{formatAvgOdds(displayAvgPrice)} avg.
											</span>
										)}
									</div>
								</div>
								<FlashingValue
									value={`$${formatToWinUsdDisplay(displayShares)}`}
									className={SR_VALUE_CLASS}
									flashClassName={SR_VALUE_FLASH_CLASS}
								/>
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
						</div>
						{open && (
							<div className="smart-routing-drawer">
								<SmartRoutingLegRows
									legs={p.legs}
									side="buy"
									formatLegAvg={formatLegAvg}
								/>
								<div className="smart-routing-drawer__footer">
									<div className="smart-routing-drawer__fees">
										<SorRouteConsolidatedFeesSummary route={feeR} variant="smart-drawer" />
									</div>
									{Number.isFinite(p.totalCost) && (
										<div className="smart-routing-drawer__total">
											<span>Cost</span>
											<span>$ {formatSorBuyCostUsdDisplay(p.totalCost)}</span>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
}
