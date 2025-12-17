import React, { useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getFinalAmount } from "@/services/api/simplifiedOrderService";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/helpers/gameLogoResolver";
import Tooltip from "components/Tooltip/Tooltip";
import ScrollableTable from "components/ScrollableTable/ScrollableTable";
import { usePredictionData } from "@/context/PredictionDataContext";
import TradeHistoryList from "./TradeHistoryList";

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const { tags } = usePredictionData();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;
	const tagImage = getTagImageFromUmbrella(umbrella, tags);
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);
	const fallbackLogo = gameLogo || gtaIcon;
	const initialSrc = serverImage || tagImage || fallbackLogo;

	const handleError = () => {
		if (!imageError) {
			setImageError(true);
			if (currentSrc !== tagImage && tagImage) {
				setCurrentSrc(tagImage);
			} else if (currentSrc !== gameLogo && gameLogo) {
				setCurrentSrc(gameLogo);
			} else {
				setCurrentSrc(gtaIcon);
			}
		}
	};

	return (
		<img
			src={currentSrc || initialSrc}
			alt="umbrella"
			width={48}
			height={48}
			style={{
				display: "block",
				background: "#000",
				borderRadius: 8,
				objectFit: "contain",
			}}
			onError={handleError}
		/>
	);
}

export default function HistoryView({
	umbrellaBalances,
	returnsByQid,
	orders,
	resolvedMarketsByUmbrella,
}: {
	umbrellaBalances: any[];
	returnsByQid: Record<string, { Yes: number; No: number }>;
	orders: any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
}) {
	const { umbrellas } = usePredictionData();
	
	// Track which markets have their trade history expanded
	const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

	const toggleMarketExpansion = (marketId: string) => {
		setExpandedMarkets((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(marketId)) {
				newSet.delete(marketId);
			} else {
				newSet.add(marketId);
			}
			return newSet;
		});
	};

	// Filter resolved markets to only show those where user has trading history
	const filteredResolvedMarkets = React.useMemo(() => {
		const filtered: Array<{ umbrella: any; markets: any[] }> = [];

		Object.entries(resolvedMarketsByUmbrella).forEach(
			([umbrellaId, resolvedMarkets]) => {
				const marketsWithHistory: any[] = [];

				resolvedMarkets.forEach((market) => {
					const marketId =
						market._id || market.questionId || market.marketId;
					if (!marketId) return;

					// Check if user has any orders for this market (includes past trades even if position is closed/claimed)
					const hasOrders = orders.some(
						(order) => order.questionId === marketId
					);

					if (hasOrders) {
						// Get final amounts to display (will be 0 if claimed, but we still show the market)
						const finalAmounts = getFinalAmount(orders, marketId);
						const yesShares = finalAmounts.yesShares;
						const noShares = finalAmounts.noShares;

						marketsWithHistory.push({
							market,
							yes: yesShares.toString(),
							no: noShares.toString(),
						});
					}
				});

				if (marketsWithHistory.length > 0) {
					// Find the actual umbrella object for this ID (with children/tagIds for images)
					let umbrella = umbrellas.find((u) => u._id === umbrellaId);

					// If not found, create a basic umbrella object as fallback
					if (!umbrella) {
						umbrella = {
							_id: umbrellaId,
							displayName:
								resolvedMarkets[0]?.umbrellaName ||
								`Umbrella ${umbrellaId.slice(0, 8)}...`,
							children: [],
							originalChildren: [], // For image resolution
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							__v: 0,
						} as any;
					}

					filtered.push({ umbrella, markets: marketsWithHistory });
				}
			}
		);

		return filtered;
	}, [resolvedMarketsByUmbrella, orders, umbrellas]);

	// Count trades for a market
	const getTradeCount = (marketId: string): number => {
		return orders.filter(
			(order) => order.questionId === marketId && order.filled
		).length;
	};

	// Calculate Net Cash Flow for a specific market and side
	// Net Cash Flow = Cash In (sells) - Cash Out (buys)
	const getNetCashFlow = (marketId: string, side: "Yes" | "No"): number => {
		const sideOrders = orders.filter(
			(order) =>
				order.questionId === marketId &&
				order.filled &&
				order.position?.toLowerCase() === side.toLowerCase()
		);
		const cashOut = sideOrders
			.filter((o) => o.side === "buy")
			.reduce((sum, o) => sum + (o.usdcValue || 0), 0);
		const cashIn = sideOrders
			.filter((o) => o.side === "sell")
			.reduce((sum, o) => sum + (o.usdcValue || 0), 0);
		return cashIn - cashOut;
	};

	return (
		<div className="flex flex-col gap-8">
			{filteredResolvedMarkets.length === 0 ? (
				<div
					style={{
						textAlign: "center",
						padding: "40px",
						color: "#888",
					}}
				>
					<p>No resolved markets with trading history found.</p>
					<p style={{ fontSize: "14px", marginTop: "8px" }}>
						Only resolved markets where you have trading history
						will appear here.
					</p>
				</div>
			) : (
				<ScrollableTable minWidth="700px">
					<div
						className="grid items-center px-12 py-10"
						style={{
							gridTemplateColumns:
								"minmax(200px, 2fr) repeat(5, 1fr) 80px",
							borderBottom: "1px solid #333333",
							color: "#888",
							fontSize: 12,
							textTransform: "uppercase",
							letterSpacing: 0.6,
						}}
					>
						<div>Market</div>
						<div style={{ textAlign: "center" }}>
							Final Position
						</div>
						<div style={{ textAlign: "center" }}>Outcome</div>
						<div style={{ textAlign: "center" }}>Total Cost</div>
						<div style={{ textAlign: "center" }}>Total Payout</div>
						<div style={{ textAlign: "center" }}>
							<Tooltip
								content="Total return includes total payout of current positions and any past gains you have bought or sold."
								position="top"
							>
								Total Return
							</Tooltip>
						</div>
						<div style={{ textAlign: "center" }}>Trades</div>
					</div>

					<div className="flex flex-col">
						{filteredResolvedMarkets.map(
							({ umbrella, markets }) => (
								<div
									key={umbrella._id}
									className="umbrella-block"
								>
									<div
										className="grid px-12 py-10"
										style={{
											gridTemplateColumns:
												"minmax(200px, 2fr) repeat(5, 1fr) 80px",
											background: "#000000",
											borderBottom: "1px solid #1f1f1f",
											paddingTop: 16,
											paddingBottom: 16,
										}}
									>
										<div
											style={{
												gridColumn: "1 / -1",
												fontWeight: 700,
												color: "#dedede",
												fontSize: 20,
												display: "flex",
												alignItems: "center",
												gap: "12px",
											}}
										>
											<UmbrellaImage
												umbrella={umbrella}
											/>
											{umbrella.displayName}
										</div>
									</div>

									{markets.map(({ market, yes, no }) => {
										const yesNum = Number(yes);
										const noNum = Number(no);
										const qid =
											market._id ||
											market.questionId ||
											market.marketId;

										// Calculate final amounts for this market
										const finalAmounts = qid
											? getFinalAmount(orders, qid)
											: {
													yesShares: 0,
													noShares: 0,
													yesCost: 0,
													noCost: 0,
											  };

										// Get the resolved outcome to determine if user was correct
										const resolvedOutcome = String(
											(market as any).resolvedOutcome ||
												""
										).toLowerCase();

										// Determine which sides the user traded on (check orders, not just current shares)
										const userYesOrders = qid
											? orders.filter(
													(order) =>
														order.questionId ===
															qid &&
														order.position?.toLowerCase() === "yes"
											  )
											: [];
										const userNoOrders = qid
											? orders.filter(
													(order) =>
														order.questionId ===
															qid &&
														order.position?.toLowerCase() === "no"
											  )
											: [];

										const rows: {
											side: "Yes" | "No";
											amount: string;
										}[] = [];
										// Show a row if user has current shares OR has traded on that side
										if (
											yesNum > 0 ||
											userYesOrders.length > 0
										)
											rows.push({
												side: "Yes",
												amount: yes,
											});
										if (
											noNum > 0 ||
											userNoOrders.length > 0
										)
											rows.push({
												side: "No",
												amount: no,
											});

										const tradeCount = getTradeCount(qid);
										const isExpanded = expandedMarkets.has(qid);

										return (
											<React.Fragment key={qid}>
												{rows.map(({ side, amount }, rowIndex) => {
													// Get final position for this leg
													const finalShares =
														side === "Yes"
															? finalAmounts.yesShares
															: finalAmounts.noShares;
													
													// Calculate Net Cash Flow for this side
													const netCashFlow = getNetCashFlow(qid, side);

													// Format shares with commas
													const finalPositionText =
														finalShares > 0
															? finalShares.toLocaleString("en-US", {
																	minimumFractionDigits: finalShares % 1 === 0 ? 0 : 2,
																	maximumFractionDigits: 2,
															  })
															: "—";

													// Format Total Cost (absolute value, white if negative/cost, green if positive/profit)
													const totalCostText = (() => {
														const absVal = Math.abs(netCashFlow);
														const formatted = absVal.toLocaleString("en-US", {
															minimumFractionDigits: absVal % 1 === 0 ? 0 : 2,
															maximumFractionDigits: 2,
														});
														if (netCashFlow === 0) return "—";
														return `$${formatted}`;
													})();
													// White if negative (cost), green if positive (profit)
													const totalCostColor =
														netCashFlow === 0
															? "#fff"
															: netCashFlow > 0
															? "#22c55e"
															: "#fff";

													// Calculate settlement payout: $1 if user was correct, $0 if wrong
													const wasCorrect =
														(side === "Yes" &&
															resolvedOutcome ===
																"yes") ||
														(side === "No" &&
															resolvedOutcome === "no");
													const settlementPayout = wasCorrect
														? 1
														: 0;

													// Calculate total payout: Final Position × Settlement Payout
													const totalPayout =
														finalShares * settlementPayout;
													const totalPayoutText =
														totalPayout > 0
															? `$${totalPayout.toLocaleString("en-US", {
																	minimumFractionDigits: totalPayout % 1 === 0 ? 0 : 2,
																	maximumFractionDigits: 2,
															  })}`
															: "$0";
													const totalPayoutColor =
														totalPayout > 0
															? "#16a34a"
															: "#fff"; // Green if positive, white if $0

													// Calculate total return using Net Cash Flow
													// Total Return = Total Payout + Net Cash Flow (since net cash flow is already signed)
													const baseReturn =
														totalPayout === null
															? null
															: totalPayout + netCashFlow;
													const realizedLegPnl = (() => {
														if (!qid) return 0;
														const legPnls =
															returnsByQid[qid];
														if (!legPnls) return 0;
														return side === "Yes"
															? legPnls.Yes || 0
															: legPnls.No || 0;
													})();
													const totalReturn =
														baseReturn === null
															? null
															: baseReturn +
															  realizedLegPnl;
													// Calculate return percentage based on cash spent (negative net cash flow = money spent)
													const cashSpent = netCashFlow < 0 ? Math.abs(netCashFlow) : 0;
													const totalReturnPct =
														totalReturn !== null &&
														cashSpent > 0
															? (totalReturn / cashSpent) * 100
															: null;
													const totalReturnColor =
														totalReturn === null
															? "#fff"
															: totalReturn >= 0
															? "#16a34a"
															: "#ef4444";
													const totalReturnText = (() => {
														if (
															totalReturn === null ||
															!isFinite(totalReturn)
														)
															return "—";
														const signUsd =
															totalReturn >= 0
																? "+"
																: "-";
														const absReturn = Math.abs(totalReturn);
														const usdPart = `$${absReturn.toLocaleString("en-US", {
															minimumFractionDigits: absReturn % 1 === 0 ? 0 : 2,
															maximumFractionDigits: 2,
														})}`;
														if (
															totalReturnPct === null ||
															!isFinite(totalReturnPct)
														) {
															return `${signUsd}${usdPart}`;
														}
														const signPct =
															totalReturnPct >= 0
																? "+"
																: "-";
														const pctPart = `${Math.round(
															Math.abs(totalReturnPct)
														).toLocaleString("en-US")}%`;
														return `${signUsd}${usdPart} (${signPct}${pctPart})`;
													})();

													const title = (
														market?.displayName ||
														(market as any)?.question ||
														""
													).trim();
													const parts = title
														.split(/\s*vs\.?\s*/i)
														.map((s: string) => s.trim())
														.filter(Boolean);
													const isVs = parts.length === 2;

													// Determine outcome text
													const outcomeText = (() => {
														if (isVs) {
															// For VS markets, show the winning team name
															return resolvedOutcome ===
																"yes"
																? parts[0]
																: parts[1];
														} else {
															// For regular markets, show Yes or No
															return resolvedOutcome ===
																"yes"
																? "Yes"
																: "No";
														}
													})();

													// Determine outcome color
													const outcomeColor = (() => {
														if (isVs) {
															// For VS markets: Green if user won, Red if user lost
															return wasCorrect
																? "#16a34a" // Green - user won
																: "#ef4444"; // Red - user lost
														} else {
															// For regular markets: Yes = Green, No = Red
															return resolvedOutcome ===
																"yes"
																? "#16a34a"
																: "#ef4444";
														}
													})();

													// Only show expand button on first row for this market
													const showExpandButton = rowIndex === 0;

													return (
														<div
															key={`${
																market._id
															}-${side.toLowerCase()}`}
															className="grid items-center px-12 py-12"
															style={{
																gridTemplateColumns:
																	"minmax(200px, 2fr) repeat(5, 1fr) 80px",
																borderBottom:
																	"1px solid #1f1f1f",
																fontSize: 16,
																cursor: showExpandButton ? "pointer" : "default",
																transition: "background 0.15s ease",
															}}
															onClick={showExpandButton ? () => toggleMarketExpansion(qid) : undefined}
															onMouseEnter={(e) => {
																if (showExpandButton) {
																	e.currentTarget.style.background = "#1a1a1a";
																}
															}}
															onMouseLeave={(e) => {
																if (showExpandButton) {
																	e.currentTarget.style.background = "transparent";
																}
															}}
														>
															<div
																style={{
																	color: "#fff",
																	fontWeight: 600,
																}}
															>
																{isVs ? (
																	<span>
																		{side === "Yes"
																			? parts[0]
																			: parts[1]}
																	</span>
																) : (
																	<>
																		<span>
																			{market.displayName ||
																				market.question}{" "}
																		</span>
																		<span
																			style={{
																				color:
																					side ===
																					"Yes"
																						? "#16a34a"
																						: "#ef4444",
																			}}
																		>
																			{side}
																		</span>
																	</>
																)}
															</div>
															<div
																style={{
																	textAlign: "center",
																	color: "#fff",
																}}
															>
																{finalPositionText}
															</div>
															<div
																style={{
																	textAlign: "center",
																	color: outcomeColor,
																	fontWeight: 600,
																}}
															>
																{outcomeText}
															</div>
															<div
																style={{
																	textAlign: "center",
																	color: totalCostColor,
																	fontWeight: 500,
																}}
															>
																{totalCostText}
															</div>
															<div
																style={{
																	textAlign: "center",
																	color: totalPayoutColor,
																}}
															>
																{totalPayoutText}
															</div>
															<div
																style={{
																	textAlign: "center",
																	color: totalReturnColor,
																	fontWeight: "bold",
																}}
															>
																{totalReturnText}
															</div>
															{/* Expand/Collapse Button */}
															<div
																style={{
																	textAlign: "center",
																}}
																onMouseEnter={(e) => {
																	e.stopPropagation();
																	// Reset parent row background
																	const row = e.currentTarget.parentElement;
																	if (row) (row as HTMLElement).style.backgroundColor = "transparent";
																}}
															>
																{showExpandButton && tradeCount > 0 && (
																	<button
																		className={`expand-trades-btn ${isExpanded ? "expanded" : ""}`}
																		onClick={(e) => {
																			e.stopPropagation();
																			toggleMarketExpansion(qid);
																		}}
																		onMouseEnter={(e) => {
																			e.stopPropagation();
																			// Reset parent row background
																			const row = e.currentTarget.closest('.history-row');
																			if (row) (row as HTMLElement).style.backgroundColor = "transparent";
																		}}
																	>
																		<span>{tradeCount}</span>
																		<span
																			className="expand-icon"
																			style={{
																				transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
																			}}
																		>
																			▼
																		</span>
																	</button>
																)}
															</div>
														</div>
													);
												})}
												{/* Trade History Expansion */}
												{isExpanded && (
													<TradeHistoryList
														orders={orders}
														marketId={qid}
														isExpanded={isExpanded}
													/>
												)}
											</React.Fragment>
										);
									})}
								</div>
							)
						)}
					</div>
				</ScrollableTable>
			)}
		</div>
	);
}
