import { useState, useMemo, useEffect, useRef } from "react";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { useCurtainActions } from "@/components/PredictionMarketTradeBox";
import {
	hexToRgba,
	getContrastingTextColor,
	getBorderColorForSelected,
	mixHexOnBlack,
} from "@/features/markets/presentation/teamColors";
import { shortenTeamLabelForButton } from "@/features/markets/presentation/marketLabels";
import { getYesNoTeamLabels } from "@/features/trading/trade-box/teamLabels";
import DepthBar from "./DepthBar";
import "./scss/OrderbookDisplay.scss";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import {
	formatLadderCentsLabel,
	formatOrderbookLevelShares,
	oddsDualLayoutForStyle,
} from "@/features/odds-display/oddsDisplayFormat";
import type { ConsolidatedRestingLevel } from "./orderbookDisplayLevels";
import {
	bestBidAskFromConsolidatedSides,
	effectiveMinDisplayableRestingSize,
	filterRestingLevelsByMinSize,
	flattenAndConsolidateRestingLevels,
	safeOrderbookNumber,
} from "./orderbookDisplayLevels";
import { isMatchPropQuestion } from "@/features/markets/listing/matchProps";

/**
 * One outcome button for the embedded orderbook tab row. When provided (FIFA
 * 3-way moneyline), these replace the binary Yes/No tabs: each button selects a
 * leg whose YES book is shown. Selecting a leg is always a YES bet on that leg,
 * so the ladder is locked to the YES side.
 */
export type OrderbookOutcomeTab = {
	id: string;
	label: string;
	active: boolean;
	onSelect: () => void;
	/** Outcome color (team color for home/away, grey for Draw). Applied to the tab button. */
	color?: string;
};

interface OrderbookDisplayProps {
	orderbook: OrderbookSnapshot | null;
	noSideOrderbook?: OrderbookSnapshot | null;
	loading: boolean;
	error: string | null;
	onRefresh?: () => void;
	customTitle?: string;
	market?: PredictionMarket;
	onMarketSwitch?: (market: PredictionMarket, position: "yes" | "no") => void;
	onMarketSwitchWithOrderbook?: (market: PredictionMarket, position: "yes" | "no") => void;
	onOrderbookToggle?: (marketId: string) => void;
	isActiveMarket?: boolean;
	activePosition?: "yes" | "no";
	isCollapsed?: boolean;
	side?: "buy" | "sell";
	umbrellaDisplayName?: string;
	umbrellaTeamMappings?: Umbrella["teamMappings"];
	/** Single always-visible book: team row above ladder; no accordion header. */
	layout?: "accordion" | "embedded";
	/**
	 * When true, resting rows below ~1 full contract are hidden and BBO uses the same floor
	 * (LevelUp on-chain, Kalshi / DFlow monitor books).
	 */
	wholeContractRestingBook?: boolean;
	/**
	 * Optional minimum resting `size` for ladder + BBO. Defaults: fractional books 1e-6,
	 * whole-contract books ~1. Pass `0` on fractional books to disable the dust floor.
	 */
	minDisplayableRestingSize?: number;
	/**
	 * 3-way moneyline (FIFA) outcome tabs. When set, the binary Yes/No tab buttons
	 * are replaced by these leg buttons and the ladder is locked to the YES side.
	 */
	outcomeTabs?: OrderbookOutcomeTab[];
	/**
	 * Suppresses the embedded team / outcome row above the ladder. Used by the
	 * multi-leg esports accordion where the section header's team pills already
	 * own the activeMarket / activePosition switch — a second copy of the same
	 * buttons sitting on top of the ladder is redundant and visually noisy.
	 *
	 * Has no effect on `accordion` layout (which has no team row anyway), and
	 * does not affect the FIFA 3-way `outcomeTabs` flow either — callers that
	 * pass `outcomeTabs` should not also pass `hideOutcomeTabs`.
	 */
	hideOutcomeTabs?: boolean;
}

export default function OrderbookDisplay({
	orderbook,
	noSideOrderbook,
	loading,
	error,
	onRefresh: _onRefresh,
	customTitle,
	market,
	onMarketSwitch,
	onMarketSwitchWithOrderbook: _onMarketSwitchWithOrderbook,
	onOrderbookToggle,
	isActiveMarket,
	activePosition,
	isCollapsed = true,
	side = "buy",
	umbrellaDisplayName,
	umbrellaTeamMappings,
	layout = "accordion",
	wholeContractRestingBook = false,
	minDisplayableRestingSize,
	outcomeTabs,
	hideOutcomeTabs = false,
}: OrderbookDisplayProps) {
	const isEmbedded = layout === "embedded";
	/** FIFA 3-way: leg buttons replace Yes/No and the ladder is locked to YES. */
	const useOutcomeTabs = Array.isArray(outcomeTabs) && outcomeTabs.length > 0;
	const { formatPrice, oddsDisplayStyle } = useOddsDisplay();
	const teamOddsLayout = oddsDualLayoutForStyle(oddsDisplayStyle);
	const [activeTab, setActiveTab] = useState<"yes" | "no">("yes");
	const { openCurtain } = useCurtainActions();
	const spreadRef = useRef<HTMLDivElement>(null);
	const ordersListRef = useRef<HTMLDivElement>(null);

	// Sync local activeTab with external activePosition ONLY for the active market
	useEffect(() => {
		if (isActiveMarket && activePosition && activePosition !== activeTab) {
			setActiveTab(activePosition);
		}
	}, [isActiveMarket, activePosition, activeTab]);

	const ladderExpanded = isEmbedded || !isCollapsed;

	// Scroll the orderbook's internal container to center the spread (does NOT scroll the page)
	useEffect(() => {
		if (!ladderExpanded) return;
		const t = window.setTimeout(() => {
			if (spreadRef.current && ordersListRef.current) {
				const container = ordersListRef.current;
				const spread = spreadRef.current;

				const spreadTop = spread.offsetTop;
				const containerHeight = container.clientHeight;
				const scrollPosition = spreadTop - containerHeight / 2;

				container.scrollTo({
					top: scrollPosition,
					behavior: "smooth",
				});
			}
		}, 100);
		return () => window.clearTimeout(t);
	}, [ladderExpanded, orderbook, activeTab]);

	const effectiveMinDisplayable = useMemo(
		() => effectiveMinDisplayableRestingSize(wholeContractRestingBook, minDisplayableRestingSize),
		[wholeContractRestingBook, minDisplayableRestingSize],
	);

	const orderbookDerived = useMemo(() => {
		const empty = {
			marketBestBid: null as number | null,
			marketBestAsk: null as number | null,
			noBestBid: null as number | null,
			noBestAsk: null as number | null,
			sortedAsksYes: [] as ConsolidatedRestingLevel[],
			sortedBidsYes: [] as ConsolidatedRestingLevel[],
			noTabAsks: [] as ConsolidatedRestingLevel[],
			noTabBids: [] as ConsolidatedRestingLevel[],
		};
		if (!orderbook) return empty;

		const min = effectiveMinDisplayable;
		const yesAskF = filterRestingLevelsByMinSize(
			flattenAndConsolidateRestingLevels(orderbook.asks || []),
			min,
		);
		const yesBidF = filterRestingLevelsByMinSize(
			flattenAndConsolidateRestingLevels(orderbook.bids || []),
			min,
		);
		const yesBbo = bestBidAskFromConsolidatedSides(yesAskF, yesBidF);
		const sortedAsksYes = [...yesAskF].sort((a, b) => a.price - b.price).reverse();
		const sortedBidsYes = [...yesBidF].sort((a, b) => b.price - a.price);

		if (noSideOrderbook) {
			const noAskF = filterRestingLevelsByMinSize(
				flattenAndConsolidateRestingLevels(noSideOrderbook.asks || []),
				min,
			);
			const noBidF = filterRestingLevelsByMinSize(
				flattenAndConsolidateRestingLevels(noSideOrderbook.bids || []),
				min,
			);
			const noBbo = bestBidAskFromConsolidatedSides(noAskF, noBidF);
			const noTabAsks = [...noAskF].sort((a, b) => a.price - b.price).reverse();
			const noTabBids = [...noBidF].sort((a, b) => b.price - a.price);
			return {
				marketBestBid: yesBbo.bestBid,
				marketBestAsk: yesBbo.bestAsk,
				noBestBid: noBbo.bestBid,
				noBestAsk: noBbo.bestAsk,
				sortedAsksYes,
				sortedBidsYes,
				noTabAsks,
				noTabBids,
			};
		}

		const noTabAsks = sortedBidsYes
			.map((bid) => ({
				...bid,
				price: 1 - bid.price,
				id: `inverted-${bid.id}`,
			}))
			.sort((a, b) => a.price - b.price)
			.reverse();
		const noTabBids = sortedAsksYes
			.map((ask) => ({
				...ask,
				price: 1 - ask.price,
				id: `inverted-${ask.id}`,
			}))
			.sort((a, b) => b.price - a.price);

		return {
			marketBestBid: yesBbo.bestBid,
			marketBestAsk: yesBbo.bestAsk,
			noBestBid: null,
			noBestAsk: null,
			sortedAsksYes,
			sortedBidsYes,
			noTabAsks,
			noTabBids,
		};
	}, [orderbook, noSideOrderbook, effectiveMinDisplayable]);

	const marketBestBid = orderbookDerived.marketBestBid;
	const marketBestAsk = orderbookDerived.marketBestAsk;

	// Check if this is an "Over {number}" market (daily player count style)
	const overUnderMatch = useMemo(() => {
		const title = (market?.displayName || (market as any)?.question || "").trim();
		// Match "Over" followed by a number (with optional commas)
		const match = title.match(/^Over\s+([\d,]+)/i);
		if (match) {
			return match[1]; // Return the number part
		}
		return null;
	}, [market?.displayName, (market as any)?.question]);

	const { yesTeamLabel, noTeamLabel } = useMemo(() => {
		if (!market) return { yesTeamLabel: "Yes", noTeamLabel: "No" };
		const { yesTeamLabel: y, noTeamLabel: n } = getYesNoTeamLabels(
			market,
			umbrellaDisplayName,
			umbrellaTeamMappings,
		);
		if (isMatchPropQuestion(market) && (market as { marketType?: unknown }).marketType === "spread") {
			return { yesTeamLabel: y, noTeamLabel: n };
		}
		return {
			yesTeamLabel: shortenTeamLabelForButton(y),
			noTeamLabel: shortenTeamLabelForButton(n),
		};
	}, [market, umbrellaDisplayName, umbrellaTeamMappings]);

	// Transform the display title for Over/Under markets
	const displayTitle = useMemo(() => {
		if (overUnderMatch && customTitle) {
			return `${overUnderMatch} Players`;
		}
		return customTitle;
	}, [overUnderMatch, customTitle]);

	const isVsSingle = useMemo(() => {
		if (!market || (market as any)?.umbrellaChildrenCount !== 1) return false;
		const mt = (market?.displayName || (market as any)?.question || "").trim();
		if (mt.match(/^Over\s+/i)) return false;
		const raw = (umbrellaDisplayName || "").replace(/\s*-\s*Match Winner$/i, "").trim() || mt;
		const parts = raw
			.split(/\s*vs\.?\s*/i)
			.map((s: string) => s.trim())
			.filter(Boolean);
		return parts.length === 2;
	}, [market, umbrellaDisplayName]);

	const yesColor: string = (market as any)?.yesColor || "var(--brand-primary)";
	const noColor: string = (market as any)?.noColor || "#3b82f6";

	const yesTextOnSolid = useMemo(() => getContrastingTextColor(yesColor), [yesColor]);
	const yesTextOnTint = useMemo(
		() => getContrastingTextColor(mixHexOnBlack(yesColor, 0.35)),
		[yesColor],
	);
	const noTextOnSolid = useMemo(() => getContrastingTextColor(noColor), [noColor]);
	const noTextOnTint = useMemo(
		() => getContrastingTextColor(mixHexOnBlack(noColor, 0.35)),
		[noColor],
	);

	const noBestBid = orderbookDerived.noBestBid;
	const noBestAsk = orderbookDerived.noBestAsk;

	const yesLabelPrice = side === "buy" ? marketBestAsk : marketBestBid;
	const noLabelPrice = noSideOrderbook
		? side === "buy"
			? noBestAsk
			: noBestBid
		: side === "buy"
			? marketBestBid === null
				? null
				: 1 - marketBestBid
			: marketBestAsk === null
				? null
				: 1 - marketBestAsk;

	const yesLabel = yesLabelPrice !== null ? formatPrice(yesLabelPrice, teamOddsLayout) : "--";
	const noLabel = noLabelPrice !== null ? formatPrice(noLabelPrice, teamOddsLayout) : "--";

	const teamTabRow = hideOutcomeTabs ? null : useOutcomeTabs ? (
		<div className="orderbook-embedded-team-row">
			<div className="orderbook-tabs" role="tablist" aria-label="Outcomes">
				{outcomeTabs!.map((tab) => (
					<button
						key={tab.id}
						type="button"
						role="tab"
						aria-selected={tab.active}
						className={`tab-button tab-button--outcome ${tab.active ? "active-outcome" : ""}`}
						style={
							tab.color
								? {
										// Solid team-color fill (matches the home-page team buttons).
										// Unselected outcomes are simply dimmed — no grey tint,
										// faded outline, or glow.
										background: tab.color,
										border: `2px solid ${tab.color}`,
										color: getContrastingTextColor(tab.color),
										fontWeight: tab.active ? 700 : 600,
										opacity: tab.active ? 1 : 0.45,
									}
								: undefined
						}
						onClick={(e) => {
							if (!isEmbedded) e.stopPropagation();
							tab.onSelect();
							if (typeof window !== "undefined" && window.innerWidth <= 1100) {
								openCurtain();
							}
						}}
					>
						<span
							style={{
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								maxWidth: "100%",
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{tab.label}
						</span>
					</button>
				))}
			</div>
		</div>
	) : (
		<div className="orderbook-embedded-team-row">
			<div className="orderbook-tabs">
				<button
					type="button"
					className={`tab-button trade-yes ${
						isActiveMarket && activePosition === "yes" ? "active-yes" : ""
					}`}
					onClick={(e) => {
						if (!isEmbedded) e.stopPropagation();
						setActiveTab("yes");
						if (market && onMarketSwitch) {
							onMarketSwitch(market, "yes");
						}
						if (typeof window !== "undefined" && window.innerWidth <= 1100) {
							openCurtain();
						}
					}}
					onMouseEnter={(e) => {
						if (isVsSingle && activeTab !== "yes") {
							e.currentTarget.style.border = `2px solid ${yesColor}`;
						}
					}}
					onMouseLeave={(e) => {
						if (isVsSingle && activeTab !== "yes") {
							e.currentTarget.style.border = `2px solid ${hexToRgba(yesColor, 0.35)}`;
						}
					}}
					style={
						isVsSingle
							? {
									background: activeTab === "yes" ? yesColor : hexToRgba(yesColor, 0.35),
									color: activeTab === "yes" ? yesTextOnSolid : yesTextOnTint,
									border: `2px solid ${
										activeTab === "yes"
											? getBorderColorForSelected(yesColor)
											: hexToRgba(yesColor, 0.35)
									}`,
								}
							: undefined
					}
				>
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							maxWidth: "100%",
							minWidth: 0,
							justifyContent: "center",
						}}
					>
						<span
							style={{
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{yesTeamLabel}
						</span>
						<span style={{ flexShrink: 0 }}>{yesLabel}</span>
					</span>
				</button>
				<button
					type="button"
					className={`tab-button trade-no ${
						isActiveMarket && activePosition === "no" ? "active-no" : ""
					}`}
					onClick={(e) => {
						if (!isEmbedded) e.stopPropagation();
						setActiveTab("no");
						if (market && onMarketSwitch) {
							onMarketSwitch(market, "no");
						}
						if (typeof window !== "undefined" && window.innerWidth <= 1100) {
							openCurtain();
						}
					}}
					onMouseEnter={(e) => {
						if (isVsSingle && activeTab !== "no") {
							e.currentTarget.style.border = `2px solid ${noColor}`;
						}
					}}
					onMouseLeave={(e) => {
						if (isVsSingle && activeTab !== "no") {
							e.currentTarget.style.border = `2px solid ${hexToRgba(noColor, 0.35)}`;
						}
					}}
					style={
						isVsSingle
							? {
									background: activeTab === "no" ? noColor : hexToRgba(noColor, 0.35),
									color: activeTab === "no" ? noTextOnSolid : noTextOnTint,
									border: `2px solid ${
										activeTab === "no"
											? getBorderColorForSelected(noColor)
											: hexToRgba(noColor, 0.35)
									}`,
								}
							: undefined
					}
				>
					<span
						style={{
							display: "inline-flex",
							alignItems: "center",
							gap: 6,
							maxWidth: "100%",
							minWidth: 0,
							justifyContent: "center",
						}}
					>
						<span
							style={{
								minWidth: 0,
								overflow: "hidden",
								textOverflow: "ellipsis",
								whiteSpace: "nowrap",
							}}
						>
							{noTeamLabel}
						</span>
						<span style={{ flexShrink: 0 }}>{noLabel}</span>
					</span>
				</button>
			</div>
		</div>
	);

	// Show a minimal collapsed state when loading (not full loading screen)
	// This allows the header with prices to still be interactive
	if (loading && !orderbook) {
		if (isEmbedded) {
			return (
				<div className="orderbook-display orderbook-display--embedded">
					{teamTabRow}
					<div className="orderbook-headers">
						<span className="header-label"></span>
						<span className="header-price">Price</span>
						<span className="header-shares">Shares</span>
						<span className="header-total">Total</span>
					</div>
					<div className="orderbook-content">
						<div className="loading-message">Loading order book…</div>
					</div>
				</div>
			);
		}
		return (
			<div className="orderbook-display">
				<div className="orderbook-header">
					<div
						className="header-top clickable-header collapsed"
						onClick={() => {
							// Allow clicking even while loading
							if (market && onOrderbookToggle) {
								const marketId = market._id || market.questionId || market.marketId;
								if (!isActiveMarket && onMarketSwitch && activePosition) {
									onMarketSwitch(market, activePosition);
								}
								onOrderbookToggle(marketId);
							}
						}}
					>
						<div className="header-left">
							<div className="header-title-section">
								<h3>{displayTitle || "Order Book"}</h3>
							</div>
						</div>
						<div className="header-right">
							<div className="orderbook-tabs">
								<button
									type="button"
									className={`tab-button trade-yes ${isActiveMarket && activePosition === "yes" ? "active-yes" : ""}`}
									onClick={(e) => {
										e.stopPropagation();
										if (market && onMarketSwitch) {
											onMarketSwitch(market, "yes");
										}
									}}
									onMouseEnter={(e) => {
										if (isVsSingle) {
											e.currentTarget.style.border = `2px solid ${yesColor}`;
										}
									}}
									onMouseLeave={(e) => {
										if (isVsSingle) {
											e.currentTarget.style.border = `2px solid ${hexToRgba(yesColor, 0.35)}`;
										}
									}}
									style={
										isVsSingle
											? {
													background:
														isActiveMarket && activePosition === "yes"
															? yesColor
															: hexToRgba(yesColor, 0.35),
													color:
														isActiveMarket && activePosition === "yes"
															? yesTextOnSolid
															: yesTextOnTint,
													border: `2px solid ${
														isActiveMarket && activePosition === "yes"
															? getBorderColorForSelected(yesColor)
															: hexToRgba(yesColor, 0.35)
													}`,
												}
											: undefined
									}
								>
									{yesTeamLabel} --
								</button>
								<button
									type="button"
									className={`tab-button trade-no ${isActiveMarket && activePosition === "no" ? "active-no" : ""}`}
									onClick={(e) => {
										e.stopPropagation();
										if (market && onMarketSwitch) {
											onMarketSwitch(market, "no");
										}
									}}
									onMouseEnter={(e) => {
										if (isVsSingle) {
											e.currentTarget.style.border = `2px solid ${noColor}`;
										}
									}}
									onMouseLeave={(e) => {
										if (isVsSingle) {
											e.currentTarget.style.border = `2px solid ${hexToRgba(noColor, 0.35)}`;
										}
									}}
									style={
										isVsSingle
											? {
													background:
														isActiveMarket && activePosition === "no"
															? noColor
															: hexToRgba(noColor, 0.35),
													color:
														isActiveMarket && activePosition === "no"
															? noTextOnSolid
															: noTextOnTint,
													border: `2px solid ${
														isActiveMarket && activePosition === "no"
															? getBorderColorForSelected(noColor)
															: hexToRgba(noColor, 0.35)
													}`,
												}
											: undefined
									}
								>
									{noTeamLabel} --
								</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		if (isEmbedded) {
			return (
				<div className="orderbook-display orderbook-display--embedded">
					{teamTabRow}
					<div className="orderbook-content">
						<div className="error-message">Error: {error}</div>
					</div>
				</div>
			);
		}
		return (
			<div className="orderbook-display">
				<div className="orderbook-header">
					<h3>{displayTitle || "Order Book"}</h3>
				</div>
				<div className="orderbook-content">
					<div className="error-message">Error: {error}</div>
				</div>
			</div>
		);
	}

	if (!orderbook) {
		if (isEmbedded) {
			return (
				<div className="orderbook-display orderbook-display--embedded">
					{teamTabRow}
					<div className="orderbook-content">
						<div className="no-data-message">No orderbook data available</div>
					</div>
				</div>
			);
		}
		return (
			<div className="orderbook-display">
				<div className="orderbook-header">
					<h3>{displayTitle || "Order Book"}</h3>
				</div>
				<div className="orderbook-content">
					<div className="no-data-message">No orderbook data available</div>
				</div>
			</div>
		);
	}

	/** FIFA leg tabs always show that leg's YES book (selecting a leg = YES bet). */
	const ladderTab = useOutcomeTabs ? "yes" : activeTab;
	const displayAsks =
		ladderTab === "yes" ? orderbookDerived.sortedAsksYes : orderbookDerived.noTabAsks;
	const displayBids =
		ladderTab === "yes" ? orderbookDerived.sortedBidsYes : orderbookDerived.noTabBids;

	// Get best prices and spread based on active tab
	const bestAsk =
		displayAsks.length > 0 ? safeOrderbookNumber(displayAsks[displayAsks.length - 1].price) : null;
	const bestBid = displayBids.length > 0 ? safeOrderbookNumber(displayBids[0].price) : null;
	const spread = bestBid && bestAsk ? bestAsk - bestBid : null;

	// Calculate cumulative depth percentages for visualization
	const calculateDepthPercentages = (
		orders: Array<{ price: number; size: number; id: string }>,
		isAsks: boolean = false,
	) => {
		if (orders.length === 0) return [];

		// Calculate running totals for each order
		const ordersWithTotals = orders.map((order) => {
			const total = order.price * order.size;
			return { ...order, total };
		});

		// Calculate cumulative totals (stacking effect)
		let cumulativeTotal = 0;
		const ordersWithCumulative = ordersWithTotals.map((order) => {
			cumulativeTotal += order.total;
			return { ...order, cumulativeTotal };
		});

		// For asks, we need to reverse the cumulative calculation
		// because asks are sorted with best ask (lowest price) at the end
		if (isAsks) {
			let reverseCumulativeTotal = 0;
			const reversedOrders = ordersWithCumulative.reverse().map((order) => {
				reverseCumulativeTotal += order.total;
				return {
					...order,
					cumulativeTotal: reverseCumulativeTotal,
				};
			});
			ordersWithCumulative.splice(0, ordersWithCumulative.length, ...reversedOrders.reverse());
		}

		// Find the maximum cumulative total for percentage calculation
		const maxCumulativeTotal = Math.max(
			...ordersWithCumulative.map((order) => order.cumulativeTotal),
		);

		// Calculate depth percentages based on cumulative totals
		return ordersWithCumulative.map((order) => ({
			...order,
			depthPercentage:
				maxCumulativeTotal > 0 ? (order.cumulativeTotal / maxCumulativeTotal) * 100 : 0,
		}));
	};

	const asksWithDepth = calculateDepthPercentages(displayAsks, true);
	const bidsWithDepth = calculateDepthPercentages(displayBids, false);

	return (
		<div
			className={isEmbedded ? "orderbook-display orderbook-display--embedded" : "orderbook-display"}
		>
			{isEmbedded ? (
				teamTabRow
			) : (
				<div className="orderbook-header">
					<div
						className={`header-top clickable-header ${isCollapsed ? "collapsed" : "expanded"}`}
						onClick={() => {
							if (market && onOrderbookToggle) {
								const marketId = market._id || market.questionId || market.marketId;

								if (!isActiveMarket && onMarketSwitch && activePosition) {
									onMarketSwitch(market, activePosition);
								}

								onOrderbookToggle(marketId);
							}
						}}
						title={isCollapsed ? "Click to expand orderbook" : "Click to collapse orderbook"}
					>
						<div className="header-left">
							<div className="header-title-section">
								<h3>{displayTitle || "Order Book"}</h3>
							</div>
						</div>

						<div className="header-right">
							<div className="orderbook-tabs">
								<button
									type="button"
									className={`tab-button trade-yes ${
										isActiveMarket && activePosition === "yes" ? "active-yes" : ""
									}`}
									onClick={(e) => {
										e.stopPropagation();
										setActiveTab("yes");
										if (market && onMarketSwitch) {
											onMarketSwitch(market, "yes");
										}
										if (typeof window !== "undefined" && window.innerWidth <= 1100) {
											openCurtain();
										}
									}}
									onMouseEnter={(e) => {
										if (isVsSingle && activeTab !== "yes") {
											e.currentTarget.style.border = `2px solid ${yesColor}`;
										}
									}}
									onMouseLeave={(e) => {
										if (isVsSingle && activeTab !== "yes") {
											e.currentTarget.style.border = `2px solid ${hexToRgba(yesColor, 0.35)}`;
										}
									}}
									style={
										isVsSingle
											? {
													background: activeTab === "yes" ? yesColor : hexToRgba(yesColor, 0.35),
													color: activeTab === "yes" ? yesTextOnSolid : yesTextOnTint,
													border: `2px solid ${
														activeTab === "yes"
															? getBorderColorForSelected(yesColor)
															: hexToRgba(yesColor, 0.35)
													}`,
												}
											: undefined
									}
								>
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
											maxWidth: "100%",
											minWidth: 0,
											justifyContent: "center",
										}}
									>
										<span
											style={{
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{yesTeamLabel}
										</span>
										<span style={{ flexShrink: 0 }}>{yesLabel}</span>
									</span>
								</button>
								<button
									type="button"
									className={`tab-button trade-no ${
										isActiveMarket && activePosition === "no" ? "active-no" : ""
									}`}
									onClick={(e) => {
										e.stopPropagation();
										setActiveTab("no");
										if (market && onMarketSwitch) {
											onMarketSwitch(market, "no");
										}
										if (typeof window !== "undefined" && window.innerWidth <= 1100) {
											openCurtain();
										}
									}}
									onMouseEnter={(e) => {
										if (isVsSingle && activeTab !== "no") {
											e.currentTarget.style.border = `2px solid ${noColor}`;
										}
									}}
									onMouseLeave={(e) => {
										if (isVsSingle && activeTab !== "no") {
											e.currentTarget.style.border = `2px solid ${hexToRgba(noColor, 0.35)}`;
										}
									}}
									style={
										isVsSingle
											? {
													background: activeTab === "no" ? noColor : hexToRgba(noColor, 0.35),
													color: activeTab === "no" ? noTextOnSolid : noTextOnTint,
													border: `2px solid ${
														activeTab === "no"
															? getBorderColorForSelected(noColor)
															: hexToRgba(noColor, 0.35)
													}`,
												}
											: undefined
									}
								>
									<span
										style={{
											display: "inline-flex",
											alignItems: "center",
											gap: 6,
											maxWidth: "100%",
											minWidth: 0,
											justifyContent: "center",
										}}
									>
										<span
											style={{
												minWidth: 0,
												overflow: "hidden",
												textOverflow: "ellipsis",
												whiteSpace: "nowrap",
											}}
										>
											{noTeamLabel}
										</span>
										<span style={{ flexShrink: 0 }}>{noLabel}</span>
									</span>
								</button>
							</div>
						</div>
					</div>
				</div>
			)}

			{ladderExpanded && (
				<>
					{/* Fixed Column Headers */}
					<div className="orderbook-headers">
						<span className="header-label"></span>
						<span className="header-price">Price</span>
						<span className="header-shares">Shares</span>
						<span className="header-total">Total</span>
					</div>

					<div className="orderbook-content">
						<div className="unified-orders-list" ref={ordersListRef}>
							{/* Asks */}
							{asksWithDepth.length > 0 ? (
								asksWithDepth.map((ask, index) => {
									const isLowestAsk = index === asksWithDepth.length - 1; // Last ask (lowest price)

									return (
										<div key={`ask-${ask.id}-${index}`} className="order-row ask">
											<DepthBar depth={ask.depthPercentage} side="ask" />
											<span className="side-label ask">{isLowestAsk ? "Asks" : ""}</span>
											<span className="price ask">{formatPrice(ask.price, "ladder")}</span>
											<span className="size">{formatOrderbookLevelShares(ask.size)}</span>
											<span className="total">
												$
												{ask.cumulativeTotal.toLocaleString("en-US", {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</span>
										</div>
									);
								})
							) : (
								<div className="no-orders">No sell orders</div>
							)}

							{/* Separator with Spread */}
							<div className="orderbook-separator" ref={spreadRef}>
								{spread !== null && (
									<div className="spread-display">
										<span className="spread-label">Spread:</span>
										<span className="spread-value">{formatLadderCentsLabel(spread)}</span>
									</div>
								)}
							</div>

							{/* Bids */}
							{bidsWithDepth.length > 0 ? (
								bidsWithDepth.map((bid, index) => {
									const isHighestBid = index === 0; // First bid (highest price)

									return (
										<div key={`bid-${bid.id}-${index}`} className="order-row bid">
											<DepthBar depth={bid.depthPercentage} side="bid" />
											<span className="side-label bid">{isHighestBid ? "Bids" : ""}</span>
											<span className="price bid">{formatPrice(bid.price, "ladder")}</span>
											<span className="size">{formatOrderbookLevelShares(bid.size)}</span>
											<span className="total">
												$
												{bid.cumulativeTotal.toLocaleString("en-US", {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2,
												})}
											</span>
										</div>
									);
								})
							) : (
								<div className="no-orders">No buy orders</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
