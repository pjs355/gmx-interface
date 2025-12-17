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
import { usePredictionData } from "@/context/PredictionDataContext";
import TradeHistoryListMobile from "./TradeHistoryListMobile";

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
			width={40}
			height={40}
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

export default function HistoryCardView({
	returnsByQid,
	orders,
	resolvedMarketsByUmbrella,
}: {
	returnsByQid: Record<string, { Yes: number; No: number }>;
	orders: any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
}) {
	const { umbrellas } = usePredictionData();
	const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
	const [expandedTradeHistory, setExpandedTradeHistory] = useState<Set<string>>(new Set());

	const toggleCard = (cardId: string) => {
		setExpandedCards((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(cardId)) {
				newSet.delete(cardId);
			} else {
				newSet.add(cardId);
			}
			return newSet;
		});
	};

	const toggleTradeHistory = (marketId: string) => {
		setExpandedTradeHistory((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(marketId)) {
				newSet.delete(marketId);
			} else {
				newSet.add(marketId);
			}
			return newSet;
		});
	};

	// Count trades for a market
	const getTradeCount = (marketId: string): number => {
		return orders.filter(
			(order) => order.questionId === marketId && order.filled
		).length;
	};

	// Calculate Net Cash Flow for a specific market and side
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
						};
					}

					filtered.push({ umbrella, markets: marketsWithHistory });
				}
			}
		);

		return filtered;
	}, [resolvedMarketsByUmbrella, orders, umbrellas]);

	return (
		<div className="flex flex-col gap-12">
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
				filteredResolvedMarkets.map(({ umbrella, markets }) => (
					<div key={umbrella._id} className="umbrella-card">
						{markets.map(({ market, yes, no }) => {
							const yesNum = Number(yes);
							const noNum = Number(no);
							const qid =
								market._id ||
								market.questionId ||
								market.marketId;

							const finalAmounts = qid
								? getFinalAmount(orders, qid)
								: {
										yesShares: 0,
										noShares: 0,
										yesCost: 0,
										noCost: 0,
								  };
							const resolvedOutcome = String(
								(market as any).resolvedOutcome || ""
							).toLowerCase();

							// Determine which sides the user traded on (check orders, not just current shares)
							const userYesOrders = qid ? orders.filter(
								(order) => order.questionId === qid && order.position?.toLowerCase() === "yes"
							) : [];
							const userNoOrders = qid ? orders.filter(
								(order) => order.questionId === qid && order.position?.toLowerCase() === "no"
							) : [];
							
							const rows: {
								side: "Yes" | "No";
								amount: string;
							}[] = [];
							// Show a row if user has current shares OR has traded on that side
							if (yesNum > 0 || userYesOrders.length > 0)
								rows.push({ side: "Yes", amount: yes });
							if (noNum > 0 || userNoOrders.length > 0)
								rows.push({ side: "No", amount: no });

							const tradeCount = getTradeCount(qid);
							const isTradeHistoryExpanded = expandedTradeHistory.has(qid);

							return (
								<React.Fragment key={qid}>
									{rows.map(({ side, amount }, rowIndex) => {
										const cardId = `${umbrella._id}-${market._id}-${side}`;
										const isExpanded = expandedCards.has(cardId);

										const finalShares =
											side === "Yes"
												? finalAmounts.yesShares
												: finalAmounts.noShares;
										
										// Calculate Net Cash Flow for this side
										const netCashFlow = getNetCashFlow(qid, side);

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

										const wasCorrect =
											(side === "Yes" &&
												resolvedOutcome === "yes") ||
											(side === "No" && resolvedOutcome === "no");
										const settlementPayout = wasCorrect ? 1 : 0;

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
											totalPayout > 0 ? "#16a34a" : "#fff";

										// Calculate total return using Net Cash Flow
										const baseReturn =
											totalPayout === null
												? null
												: totalPayout + netCashFlow;
										const realizedLegPnl = (() => {
											if (!qid) return 0;
											const legPnls = returnsByQid[qid];
											if (!legPnls) return 0;
											return side === "Yes"
												? legPnls.Yes || 0
												: legPnls.No || 0;
										})();
										const totalReturn =
											baseReturn === null
												? null
												: baseReturn + realizedLegPnl;
										// Calculate return percentage based on cash spent
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
												totalReturn >= 0 ? "+" : "-";
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
												totalReturnPct >= 0 ? "+" : "-";
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
												return resolvedOutcome === "yes"
													? parts[0]
													: parts[1];
											} else {
												// For regular markets, show Yes or No
												return resolvedOutcome === "yes"
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
												return resolvedOutcome === "yes"
													? "#16a34a"
													: "#ef4444";
											}
										})();

										// Only show trade history button on first row for this market
										const showTradeHistoryButton = rowIndex === 0;

										return (
											<div
												key={cardId}
												style={{
													background: "#1a1a1a",
													border: "1px solid #2a2a2a",
													borderRadius: 12,
													overflow: "hidden",
													marginBottom: 12,
												}}
											>
												{/* Card Header */}
												<div
													style={{
														padding: "16px",
														background: "#0a0a0a",
														borderBottom:
															"1px solid #2a2a2a",
														display: "flex",
														alignItems: "center",
														gap: 12,
													}}
												>
													<UmbrellaImage
														umbrella={umbrella}
													/>
													<div style={{ flex: 1 }}>
														<div
															style={{
																color: "#888",
																fontSize: 11,
																textTransform:
																	"uppercase",
																letterSpacing: 0.6,
																marginBottom: 4,
															}}
														>
															{umbrella.displayName}
														</div>
														<div
															style={{
																color: "#fff",
																fontSize: 16,
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
													</div>
												</div>

												{/* Card Summary - Two Info Pieces */}
												<div
													onClick={() => toggleCard(cardId)}
													style={{
														padding: "16px",
														display: "flex",
														justifyContent: "space-between",
														alignItems: "center",
														cursor: "pointer",
													}}
												>
													<div style={{ flex: 1 }}>
														<div
															style={{
																color: "#888",
																fontSize: 11,
																textTransform:
																	"uppercase",
																letterSpacing: 0.6,
																marginBottom: 4,
															}}
														>
															Final Position
														</div>
														<div
															style={{
																color: "#fff",
																fontSize: 18,
																fontWeight: 700,
															}}
														>
															{finalPositionText}
														</div>
													</div>
													<div
														style={{
															flex: 1,
															textAlign: "right",
														}}
													>
														<div
															style={{
																color: "#888",
																fontSize: 11,
																textTransform:
																	"uppercase",
																letterSpacing: 0.6,
																marginBottom: 4,
															}}
														>
															Total Return
														</div>
														<div
															style={{
																color: totalReturnColor,
																fontSize: 18,
																fontWeight: 700,
																whiteSpace: "nowrap",
															}}
														>
															{totalReturnText}
														</div>
													</div>
													<button
														onClick={(e) => {
															e.stopPropagation();
															toggleCard(cardId);
														}}
														style={{
															marginLeft: 12,
															background: "transparent",
															border: "none",
															color: "#888",
															cursor: "pointer",
															fontSize: 20,
															padding: 0,
															width: 24,
															height: 24,
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															transition:
																"transform 0.2s ease",
															transform: isExpanded
																? "rotate(180deg)"
																: "rotate(0deg)",
														}}
													>
														▼
													</button>
												</div>

												{/* Expanded Details */}
												{isExpanded && (
													<div
														style={{
															padding: "16px",
															borderTop:
																"1px solid #2a2a2a",
															background: "#0f0f0f",
														}}
													>
														<div
															style={{
																display: "flex",
																flexDirection: "column",
																gap: 12,
															}}
														>
															<div
																style={{
																	display: "flex",
																	justifyContent:
																		"space-between",
																}}
															>
																<span
																	style={{
																		color: "#888",
																		fontSize: 13,
																	}}
																>
																	Outcome
																</span>
																<span
																	style={{
																		color: outcomeColor,
																		fontSize: 13,
																		fontWeight: 600,
																	}}
																>
																	{outcomeText}
																</span>
															</div>
															<div
																style={{
																	display: "flex",
																	justifyContent:
																		"space-between",
																}}
															>
																<span
																	style={{
																		color: "#888",
																		fontSize: 13,
																	}}
																>
																	Total Cost
																</span>
																<span
																	style={{
																		color: totalCostColor,
																		fontSize: 13,
																		fontWeight: 600,
																	}}
																>
																	{totalCostText}
																</span>
															</div>
															<div
																style={{
																	display: "flex",
																	justifyContent:
																		"space-between",
																}}
															>
																<span
																	style={{
																		color: "#888",
																		fontSize: 13,
																	}}
																>
																	Total Payout
																</span>
																<span
																	style={{
																		color: totalPayoutColor,
																		fontSize: 13,
																		fontWeight: 600,
																	}}
																>
																	{totalPayoutText}
																</span>
															</div>

															{/* View Trades Link */}
															{showTradeHistoryButton && tradeCount > 0 && (
																<div
																	onClick={(e) => {
																		e.stopPropagation();
																		toggleTradeHistory(qid);
																	}}
																	style={{
																		marginTop: 12,
																		paddingTop: 12,
																		borderTop: "1px solid #1f1f1f",
																		display: "flex",
																		alignItems: "center",
																		justifyContent: "center",
																		gap: 6,
																		color: "#666",
																		fontSize: 13,
																		cursor: "pointer",
																	}}
																>
																	<span>{isTradeHistoryExpanded ? "Hide" : "View"} {tradeCount} trade{tradeCount !== 1 ? "s" : ""}</span>
																	<span
																		style={{
																			display: "inline-block",
																			transition: "transform 0.2s ease",
																			transform: isTradeHistoryExpanded ? "rotate(180deg)" : "rotate(0deg)",
																			fontSize: 10,
																		}}
																	>
																		▼
																	</span>
																</div>
															)}
														</div>
													</div>
												)}

												{/* Trade History (shown when trade history is expanded) */}
												{showTradeHistoryButton && isTradeHistoryExpanded && (
													<TradeHistoryListMobile
														orders={orders}
														marketId={qid}
														isExpanded={isTradeHistoryExpanded}
													/>
												)}
											</div>
										);
									})}
								</React.Fragment>
							);
						})}
					</div>
				))
			)}
		</div>
	);
}
