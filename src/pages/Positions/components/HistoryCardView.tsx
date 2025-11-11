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
	const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

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

	const filteredResolvedMarkets = React.useMemo(() => {
		const filtered: Array<{ umbrella: any; markets: any[] }> = [];

		Object.entries(resolvedMarketsByUmbrella).forEach(
			([umbrellaId, resolvedMarkets]) => {
				const marketsWithHistory: any[] = [];

				resolvedMarkets.forEach((market) => {
					const marketId =
						market._id || market.questionId || market.marketId;
					if (!marketId) return;

					const finalAmounts = getFinalAmount(orders, marketId);
					const hasTradingHistory =
						finalAmounts.yesShares > 0 || finalAmounts.noShares > 0;

					if (hasTradingHistory) {
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
					const umbrella = {
						_id: umbrellaId,
						displayName:
							resolvedMarkets[0]?.umbrellaName ||
							resolvedMarkets[0]?.displayName ||
							`Umbrella ${umbrellaId}`,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						__v: 0,
					};

					filtered.push({ umbrella, markets: marketsWithHistory });
				}
			}
		);

		return filtered;
	}, [resolvedMarketsByUmbrella, orders]);

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

							const rows: {
								side: "Yes" | "No";
								amount: string;
							}[] = [];
							if (yesNum > 0)
								rows.push({ side: "Yes", amount: yes });
							if (noNum > 0)
								rows.push({ side: "No", amount: no });

							return rows.map(({ side, amount }) => {
								const cardId = `${umbrella._id}-${market._id}-${side}`;
								const isExpanded = expandedCards.has(cardId);

								const finalShares =
									side === "Yes"
										? finalAmounts.yesShares
										: finalAmounts.noShares;
								const finalCost =
									side === "Yes"
										? finalAmounts.yesCost
										: finalAmounts.noCost;

								const finalPositionText =
									finalShares > 0
										? `${
												finalShares % 1 === 0
													? finalShares.toFixed(0)
													: finalShares.toFixed(2)
										  }`
										: "—";
								const totalCostText =
									finalCost > 0
										? `$${
												finalCost % 1 === 0
													? finalCost.toFixed(0)
													: finalCost.toFixed(2)
										  }`
										: "—";

								const wasCorrect =
									(side === "Yes" &&
										resolvedOutcome === "yes") ||
									(side === "No" && resolvedOutcome === "no");
								const settlementPayout = wasCorrect ? 1 : 0;
								const settlementPayoutText =
									settlementPayout === 1 ? "$1" : "$0";

								const totalPayout =
									finalShares * settlementPayout;
								const totalPayoutText =
									totalPayout > 0
										? `$${
												totalPayout % 1 === 0
													? totalPayout.toFixed(0)
													: totalPayout.toFixed(2)
										  }`
										: "$0";
								const totalPayoutColor =
									totalPayout > 0 ? "#16a34a" : "#fff";

								const effectiveCost = finalCost;
								const baseReturn =
									totalPayout === null ||
									effectiveCost === null
										? null
										: totalPayout - effectiveCost;
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
								const totalReturnPct =
									totalReturn !== null &&
									effectiveCost &&
									effectiveCost > 0
										? (totalReturn / effectiveCost) * 100
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
									const usdPart = `$${
										Math.abs(totalReturn) % 1 === 0
											? Math.abs(totalReturn).toFixed(0)
											: Math.abs(totalReturn).toFixed(2)
									}`;
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
									)}%`;
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
											style={{
												padding: "16px",
												display: "flex",
												justifyContent: "space-between",
												alignItems: "center",
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
															Settlement Payout
														</span>
														<span
															style={{
																color: "#fff",
																fontSize: 13,
																fontWeight: 600,
															}}
														>
															{
																settlementPayoutText
															}
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
																color: "#fff",
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
												</div>
											</div>
										)}
									</div>
								);
							});
						})}
					</div>
				))
			)}
		</div>
	);
}
