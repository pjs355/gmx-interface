import React, { useState, useMemo, useEffect, useRef } from "react";
import type {
	OrderbookSnapshot,
	OrderbookEntry,
} from "@/services/api/orderbookService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { useCurtainActions } from "components/PredictionMarketTradeBox/PredictionCurtain";
// Helper function to calculate prices from orderbook
const calculateOrderbookPrices = (orderbook: OrderbookSnapshot | null) => {
	if (!orderbook) return { bestAsk: null, bestBid: null };

	const bestAsk =
		orderbook.asks && orderbook.asks.length > 0
			? Math.min(...orderbook.asks.map((a) => a.price))
			: null;

	const bestBid =
		orderbook.bids && orderbook.bids.length > 0
			? Math.max(...orderbook.bids.map((b) => b.price))
			: null;

	return { bestAsk, bestBid };
};
import DepthBar from "./DepthBar";
import "./OrderbookDisplay.scss";

interface OrderbookDisplayProps {
	orderbook: OrderbookSnapshot | null;
	loading: boolean;
	error: string | null;
	onRefresh?: () => void;
	customTitle?: string;
	market?: PredictionMarket;
	onMarketSwitch?: (market: PredictionMarket, position: "yes" | "no") => void;
	onMarketSwitchWithOrderbook?: (
		market: PredictionMarket,
		position: "yes" | "no"
	) => void;
	onOrderbookToggle?: (marketId: string) => void;
	isActiveMarket?: boolean;
	activePosition?: "yes" | "no";
	isCollapsed?: boolean;
	side?: "buy" | "sell";
}

export default function OrderbookDisplay({
	orderbook,
	loading,
	error,
	onRefresh,
	customTitle,
	market,
	onMarketSwitch,
	onMarketSwitchWithOrderbook,
	onOrderbookToggle,
	isActiveMarket,
	activePosition,
	isCollapsed = true,
	side = "buy",
}: OrderbookDisplayProps) {
	const [activeTab, setActiveTab] = useState<"yes" | "no">("yes");
	const { openCurtain } = useCurtainActions();
	const spreadRef = useRef<HTMLDivElement>(null);

	// Sync local activeTab with external activePosition ONLY for the active market
	useEffect(() => {
		if (isActiveMarket && activePosition && activePosition !== activeTab) {
			setActiveTab(activePosition);
		}
	}, [isActiveMarket, activePosition, activeTab]);

	// Auto-scroll to spread when orderbook opens
	useEffect(() => {
		if (!isCollapsed && spreadRef.current) {
			// Use setTimeout to ensure the DOM has rendered
			setTimeout(() => {
				spreadRef.current?.scrollIntoView({
					behavior: "smooth",
					block: "center",
				});
			}, 100);
		}
	}, [isCollapsed]);

	// Calculate prices for this market's orderbook
	const { bestBid: marketBestBid, bestAsk: marketBestAsk } = useMemo(() => {
		return calculateOrderbookPrices(orderbook);
	}, [orderbook]);

	// Helper function to format price as cents
	const toCentsString = (value?: number | null): string => {
		if (value === undefined || value === null || !isFinite(value))
			return "--";
		return Math.round(value * 100).toString();
	};

	// Derive team labels conditionally when umbrella has only one market and title contains "vs" (case-insensitive, optional period)
	const { yesTeamLabel, noTeamLabel } = useMemo(() => {
		const title = (
			market?.displayName ||
			(market as any)?.question ||
			""
		).trim();
		if (!title) return { yesTeamLabel: "Yes", noTeamLabel: "No" };
		const parts = title
			.split(/\s*vs\.?\s*/i)
			.map((s: any) => s.trim())
			.filter(Boolean);
		if (
			parts.length === 2 &&
			(market as any)?.umbrellaChildrenCount === 1
		) {
			return { yesTeamLabel: parts[0], noTeamLabel: parts[1] };
		}
		return { yesTeamLabel: "Yes", noTeamLabel: "No" };
	}, [
		market?.displayName,
		(market as any)?.question,
		(market as any)?.umbrellaChildrenCount,
	]);

	const isVsSingle = useMemo(() => {
		const title = (
			market?.displayName ||
			(market as any)?.question ||
			""
		).trim();
		const parts = title
			.split(/\s*vs\.?\s*/i)
			.map((s: any) => s.trim())
			.filter(Boolean);
		return (
			parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1
		);
	}, [
		market?.displayName,
		(market as any)?.question,
		(market as any)?.umbrellaChildrenCount,
	]);

	const yesColor: string = (market as any)?.yesColor || "#8b5cf6";
	const noColor: string = (market as any)?.noColor || "#3b82f6";

	const hexToRgba = (hex?: string, alpha: number = 0.35): string => {
		if (!hex) return `rgba(0,0,0,${alpha})`;
		const cleaned = hex.replace("#", "");
		const full =
			cleaned.length === 3
				? cleaned
						.split("")
						.map((c) => c + c)
						.join("")
				: cleaned;
		const r = parseInt(full.substring(0, 2), 16) || 0;
		const g = parseInt(full.substring(2, 4), 16) || 0;
		const b = parseInt(full.substring(4, 6), 16) || 0;
		return `rgba(${r}, ${g}, ${b}, ${alpha})`;
	};

	// Calculate display prices following the same convention as trading box
	// Flip prices based on buy/sell side (same logic as trade box)
	const yesLabel =
		side === "buy"
			? `${toCentsString(marketBestAsk)}¢`
			: `${toCentsString(marketBestBid)}¢`;
	const noLabel =
		side === "buy"
			? `${toCentsString(
					marketBestBid === null ? null : 1 - marketBestBid
			  )}¢`
			: `${toCentsString(
					marketBestAsk === null ? null : 1 - marketBestAsk
			  )}¢`;

	if (loading) {
		return (
			<div className="orderbook-display">
				<div className="orderbook-header">
					<h3>{customTitle || "Order Book"}</h3>
				</div>
				<div className="orderbook-content">
					<div className="loading-message">Loading orderbook...</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="orderbook-display">
				<div className="orderbook-header">
					<h3>{customTitle || "Order Book"}</h3>
				</div>
				<div className="orderbook-content">
					<div className="error-message">Error: {error}</div>
				</div>
			</div>
		);
	}

	if (!orderbook) {
		return (
			<div className="orderbook-display">
				<div className="orderbook-header">
					<h3>{customTitle || "Order Book"}</h3>
				</div>
				<div className="orderbook-content">
					<div className="no-data-message">
						No orderbook data available
					</div>
				</div>
			</div>
		);
	}

	// Helper function to safely format numbers
	const safeNumber = (value: any): number => {
		if (typeof value === "number" && !isNaN(value) && isFinite(value)) {
			return value;
		}
		if (typeof value === "string") {
			const parsed = parseFloat(value);
			if (!isNaN(parsed) && isFinite(parsed)) {
				return parsed;
			}
		}
		return 0;
	};

	// Helper function to flatten and consolidate orders with same price
	const flattenAndConsolidateOrders = (
		priceLevels: any[]
	): Array<{ price: number; size: number; id: string }> => {
		const priceMap = new Map<number, { size: number; id: string }>();

		priceLevels?.forEach((level, levelIndex) => {
			if (
				level &&
				typeof level === "object" &&
				level.price !== undefined
			) {
				const price = safeNumber(level.price);

				if (price > 0) {
					// Handle nested orders array structure
					if (level.orders && Array.isArray(level.orders)) {
						level.orders.forEach(
							(order: any, orderIndex: number) => {
								if (order && typeof order === "object") {
									const size = safeNumber(
										order.size || order.amount || 1
									);
									if (size > 0) {
										if (priceMap.has(price)) {
											priceMap.get(price)!.size += size;
										} else {
											priceMap.set(price, {
												size,
												id:
													order.id ||
													order.salt ||
													`level-${levelIndex}-order-${orderIndex}`,
											});
										}
									}
								}
							}
						);
					} else {
						// Handle direct size property
						const size = safeNumber(
							level.size || level.amount || 1
						);
						if (size > 0) {
							if (priceMap.has(price)) {
								priceMap.get(price)!.size += size;
							} else {
								priceMap.set(price, {
									size,
									id:
										level.id ||
										level.salt ||
										`level-${levelIndex}`,
								});
							}
						}
					}
				}
			}
		});

		// Convert map back to array
		const consolidated: Array<{ price: number; size: number; id: string }> =
			[];
		priceMap.forEach((value, price) => {
			consolidated.push({
				price,
				size: value.size,
				id: value.id,
			});
		});

		return consolidated;
	};

	// Flatten and consolidate orders with same price
	const flattenedAsks = flattenAndConsolidateOrders(orderbook.asks || []);
	const flattenedBids = flattenAndConsolidateOrders(orderbook.bids || []);

	// Debug flattened data (commented out)
	// console.log('🔍 Flattened orders:', {
	//   asks: flattenedAsks,
	//   bids: flattenedBids,
	//   originalAsks: orderbook.asks,
	//   originalBids: orderbook.bids
	// });

	// Sort asks (sell orders) by price ascending (lowest ask first), then reverse to show best ask at bottom
	const sortedAsks = flattenedAsks
		.sort((a, b) => a.price - b.price)
		.reverse();

	// Sort bids (buy orders) by price descending (highest bid first)
	const sortedBids = flattenedBids.sort((a, b) => b.price - a.price);

	// Create inverted data for NO tab (bids become asks, asks become bids, prices inverted)
	const invertedAsks = flattenedBids
		.map((bid) => ({
			...bid,
			price: 1 - bid.price, // Invert price: 0.6 becomes 0.4
			id: `inverted-${bid.id}`,
		}))
		.sort((a, b) => a.price - b.price)
		.reverse(); // Sort ascending for asks, then reverse to show best ask at bottom

	const invertedBids = flattenedAsks
		.map((ask) => ({
			...ask,
			price: 1 - ask.price, // Invert price: 0.4 becomes 0.6
			id: `inverted-${ask.id}`,
		}))
		.sort((a, b) => b.price - a.price); // Sort descending for bids

	// Use appropriate data based on active tab - load all orders
	const displayAsks = activeTab === "yes" ? sortedAsks : invertedAsks;
	const displayBids = activeTab === "yes" ? sortedBids : invertedBids;

	// Get best prices and spread based on active tab
	const bestAsk =
		displayAsks.length > 0
			? safeNumber(displayAsks[displayAsks.length - 1].price)
			: null;
	const bestBid =
		displayBids.length > 0 ? safeNumber(displayBids[0].price) : null;
	const spread = bestBid && bestAsk ? bestAsk - bestBid : null;
	const spreadPercentage =
		spread && bestBid ? (spread / bestBid) * 100 : null;

	// Calculate cumulative depth percentages for visualization
	const calculateDepthPercentages = (
		orders: Array<{ price: number; size: number; id: string }>,
		isAsks: boolean = false
	) => {
		if (orders.length === 0) return [];

		// Calculate running totals for each order
		const ordersWithTotals = orders.map((order, index) => {
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
			const reversedOrders = ordersWithCumulative
				.reverse()
				.map((order) => {
					reverseCumulativeTotal += order.total;
					return {
						...order,
						cumulativeTotal: reverseCumulativeTotal,
					};
				});
			ordersWithCumulative.splice(
				0,
				ordersWithCumulative.length,
				...reversedOrders.reverse()
			);
		}

		// Find the maximum cumulative total for percentage calculation
		const maxCumulativeTotal = Math.max(
			...ordersWithCumulative.map((order) => order.cumulativeTotal)
		);

		// Calculate depth percentages based on cumulative totals
		return ordersWithCumulative.map((order) => ({
			...order,
			depthPercentage:
				maxCumulativeTotal > 0
					? (order.cumulativeTotal / maxCumulativeTotal) * 100
					: 0,
		}));
	};

	const asksWithDepth = calculateDepthPercentages(displayAsks, true);
	const bidsWithDepth = calculateDepthPercentages(displayBids, false);

	return (
		<div className="orderbook-display">
			<div className="orderbook-header">
				<div
					className={`header-top clickable-header ${
						isCollapsed ? "collapsed" : "expanded"
					}`}
					onClick={() => {
						if (market && onOrderbookToggle) {
							const marketId =
								market._id ||
								market.questionId ||
								market.marketId;

							// If this is not the active market, switch to it while preserving the current position
							if (
								!isActiveMarket &&
								onMarketSwitch &&
								activePosition
							) {
								// Switch to this market but keep the current yes/no position from the active market
								onMarketSwitch(market, activePosition);
							}

							// Toggle the orderbook open/closed
							onOrderbookToggle(marketId);
						}
					}}
					title={
						isCollapsed
							? "Click to expand orderbook"
							: "Click to collapse orderbook"
					}
				>
					{/* Left: Market Name */}
					<div className="header-left">
						<div className="header-title-section">
							<h3>{customTitle || "Order Book"}</h3>
						</div>
					</div>

					{/* Right: Trade Yes/No Tabs - always visible */}
					<div className="header-right">
						<div className="orderbook-tabs">
							<button
								className={`tab-button trade-yes ${
									isActiveMarket && activePosition === "yes"
										? "active-yes"
										: ""
								}`}
								onClick={(e) => {
									e.stopPropagation(); // Prevent header click
									setActiveTab("yes");
									if (market && onMarketSwitch) {
										onMarketSwitch(market, "yes");
									}
									// On mobile/tablet, also open the trading panel (curtain)
									if (
										typeof window !== "undefined" &&
										window.innerWidth <= 1100
									) {
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
										e.currentTarget.style.border = `2px solid ${hexToRgba(
											yesColor,
											0.35
										)}`;
									}
								}}
								style={
									isVsSingle
										? {
												background:
													activeTab === "yes"
														? yesColor
														: hexToRgba(
																yesColor,
																0.35
														  ),
												color: "#ffffff",
												border: `2px solid ${
													activeTab === "yes"
														? yesColor
														: hexToRgba(
																yesColor,
																0.35
														  )
												}`,
										  }
										: undefined
								}
							>
								{yesTeamLabel} {yesLabel}
							</button>
							<button
								className={`tab-button trade-no ${
									isActiveMarket && activePosition === "no"
										? "active-no"
										: ""
								}`}
								onClick={(e) => {
									e.stopPropagation(); // Prevent header click
									setActiveTab("no");
									if (market && onMarketSwitch) {
										onMarketSwitch(market, "no");
									}
									// On mobile/tablet, also open the trading panel (curtain)
									if (
										typeof window !== "undefined" &&
										window.innerWidth <= 1100
									) {
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
										e.currentTarget.style.border = `2px solid ${hexToRgba(
											noColor,
											0.35
										)}`;
									}
								}}
								style={
									isVsSingle
										? {
												background:
													activeTab === "no"
														? noColor
														: hexToRgba(
																noColor,
																0.35
														  ),
												color: "#ffffff",
												border: `2px solid ${
													activeTab === "no"
														? noColor
														: hexToRgba(
																noColor,
																0.35
														  )
												}`,
										  }
										: undefined
								}
							>
								{noTeamLabel} {noLabel}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Orderbook content - only show when not collapsed */}
			{!isCollapsed && (
				<>
					{/* Fixed Column Headers */}
					<div className="orderbook-headers">
						<span className="header-label"></span>
						<span className="header-price">Price</span>
						<span className="header-shares">Shares</span>
						<span className="header-total">Total</span>
					</div>

					<div className="orderbook-content">
						<div className="unified-orders-list">
							{/* Asks */}
							{asksWithDepth.length > 0 ? (
								asksWithDepth.map((ask, index) => {
									const isLowestAsk =
										index === asksWithDepth.length - 1; // Last ask (lowest price)

									return (
										<div
											key={`ask-${ask.id}-${index}`}
											className="order-row ask"
										>
											<DepthBar
												depth={ask.depthPercentage}
												side="ask"
											/>
											<span className="side-label ask">
												{isLowestAsk ? "Asks" : ""}
											</span>
											<span className="price ask">
												${ask.price.toFixed(2)}
											</span>
											<span className="size">
												{Math.round(ask.size)}
											</span>
											<span className="total">
												$
												{ask.cumulativeTotal.toLocaleString(
													"en-US",
													{
														minimumFractionDigits: 2,
														maximumFractionDigits: 2,
													}
												)}
											</span>
										</div>
									);
								})
							) : (
								<div className="no-orders">No sell orders</div>
							)}

							{/* Separator with Spread */}
							<div
								className="orderbook-separator"
								ref={spreadRef}
							>
								{spread !== null && (
									<div className="spread-display">
										<span className="spread-label">
											Spread:
										</span>
										<span className="spread-value">
											${spread.toFixed(2)}
										</span>
									</div>
								)}
							</div>

							{/* Bids */}
							{bidsWithDepth.length > 0 ? (
								bidsWithDepth.map((bid, index) => {
									const isHighestBid = index === 0; // First bid (highest price)

									return (
										<div
											key={`bid-${bid.id}-${index}`}
											className="order-row bid"
										>
											<DepthBar
												depth={bid.depthPercentage}
												side="bid"
											/>
											<span className="side-label bid">
												{isHighestBid ? "Bids" : ""}
											</span>
											<span className="price bid">
												${bid.price.toFixed(2)}
											</span>
											<span className="size">
												{Math.round(bid.size)}
											</span>
											<span className="total">
												$
												{bid.cumulativeTotal.toLocaleString(
													"en-US",
													{
														minimumFractionDigits: 2,
														maximumFractionDigits: 2,
													}
												)}
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
