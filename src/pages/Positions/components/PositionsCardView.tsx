import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoWithPriority,
	collectTagsFromUmbrella,
	resolveUmbrellaIconById,
} from "@/pages/Predictions/utils/gameLogoResolver";

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;
	const gameLogo = resolveLogoWithPriority(
		umbrella,
		collectTagsFromUmbrella(umbrella)
	);
	const fallbackLogo = gameLogo || gtaIcon;
	const initialSrc = serverImage || fallbackLogo;

	const handleError = () => {
		if (!imageError && serverImage && gameLogo) {
			setImageError(true);
			setCurrentSrc(gameLogo);
		} else if (!imageError && serverImage && !gameLogo) {
			setImageError(true);
			setCurrentSrc(gtaIcon);
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

export default function PositionsCardView({
	umbrellaBalances,
	aggregates,
	spentByQid,
	returnsByQid,
	getCurrentPriceForSide,
	toCentsString,
	softLoading = false,
}: {
	umbrellaBalances: any[];
	aggregates: Record<string, any>;
	spentByQid: Record<string, { Yes: number; No: number }>;
	returnsByQid: Record<string, { Yes: number; No: number }>;
	getCurrentPriceForSide: (
		market: PredictionMarket,
		side: "Yes" | "No"
	) => number | null;
	toCentsString: (n?: number | null) => string;
	softLoading?: boolean;
}) {
	const navigate = useNavigate();
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

	const navigateToTradingPage = (
		umbrella: Umbrella,
		market: PredictionMarket,
		position: "yes" | "no"
	) => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		localStorage.setItem("currentPredictionMarket", JSON.stringify(market));
		localStorage.setItem("activePosition", position);

		const marketId = market._id || market.questionId || market.marketId;
		if (marketId) {
			localStorage.setItem("selectedMarketId", marketId);
		}

		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const formatCurrency = (value?: number | null): string => {
		if (value === null || value === undefined || !isFinite(value))
			return "—";
		const isInt = Math.abs(value % 1) < 1e-9;
		return `$${isInt ? value.toFixed(0) : value.toFixed(2)}`;
	};

	return (
		<div className="flex flex-col gap-12">
			{umbrellaBalances.map(({ umbrella, markets }: any) => (
				<div key={umbrella._id} className="umbrella-card">
					{markets.map(({ market, yes, no }: any) => {
						const yesNum = Number(yes);
						const noNum = Number(no);
						const rows: { side: "Yes" | "No"; amount: string }[] =
							[];
						if (yesNum > 0) rows.push({ side: "Yes", amount: yes });
						if (noNum > 0) rows.push({ side: "No", amount: no });

						return rows.map(({ side, amount }) => {
							const cardId = `${umbrella._id}-${market._id}-${side}`;
							const isExpanded = expandedCards.has(cardId);

							const currentPrice = getCurrentPriceForSide(
								market,
								side
							);
							const sharesNum = Number(amount);
							const marketValue =
								currentPrice === null
									? null
									: currentPrice * sharesNum;
							const payoutIfCorrect = isNaN(sharesNum)
								? null
								: sharesNum;
							const qid =
								market._id ||
								market.questionId ||
								market.marketId;
							const sideAgg = aggregates[qid]
								? ((aggregates[qid] as any)[side] as {
										avgPrice: number | null;
										cost: number | null;
								  })
								: undefined;

							const effectiveAvgPrice =
								sideAgg && sideAgg.avgPrice !== null
									? sideAgg.avgPrice
									: null;
							const fallbackSpent =
								spentByQid[qid]?.[side as "Yes" | "No"];
							const effectiveCost =
								sideAgg &&
								sideAgg.cost !== null &&
								sideAgg.cost !== undefined
									? (sideAgg.cost as number)
									: typeof fallbackSpent === "number"
									? fallbackSpent
									: null;

							const baseReturn =
								marketValue === null || effectiveCost === null
									? null
									: marketValue - effectiveCost;
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
								const signUsd = totalReturn >= 0 ? "+" : "-";
								const usdPart = formatCurrency(
									Math.abs(totalReturn)
								);
								if (
									totalReturnPct === null ||
									!isFinite(totalReturnPct)
								) {
									return `${signUsd}${usdPart}`;
								}
								const signPct = totalReturnPct >= 0 ? "+" : "-";
								const pctPart = `${Math.round(
									Math.abs(totalReturnPct as number)
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
							const primaryLabel = isVs
								? parts[0]
								: market.displayName ||
								  (market as any).question;
							const secondaryLabel = isVs ? parts[1] : "";

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
											borderBottom: "1px solid #2a2a2a",
											display: "flex",
											alignItems: "center",
											gap: 12,
										}}
									>
										<UmbrellaImage umbrella={umbrella} />
										<div style={{ flex: 1 }}>
											<div
												style={{
													color: "#888",
													fontSize: 11,
													textTransform: "uppercase",
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
															? primaryLabel
															: secondaryLabel}
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
										onClick={() =>
											navigateToTradingPage(
												umbrella,
												market,
												side.toLowerCase() as
													| "yes"
													| "no"
											)
										}
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
													textTransform: "uppercase",
													letterSpacing: 0.6,
													marginBottom: 4,
												}}
											>
												Shares
											</div>
											<div
												style={{
													color: "#fff",
													fontSize: 18,
													fontWeight: 700,
												}}
											>
												<span
													className={
														softLoading
															? "soft-blur"
															: undefined
													}
												>
													{amount}
												</span>
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
													textTransform: "uppercase",
													letterSpacing: 0.6,
													marginBottom: 4,
												}}
											>
												Market Value
											</div>
											<div
												style={{
													color: "#fff",
													fontSize: 18,
													fontWeight: 700,
												}}
											>
												<span
													className={
														softLoading
															? "soft-blur"
															: undefined
													}
												>
													{marketValue === null ||
													marketValue === undefined ||
													isNaN(marketValue)
														? "—"
														: formatCurrency(
																marketValue
														  )}
												</span>
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
												borderTop: "1px solid #2a2a2a",
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
														Current Price
													</span>
													<span
														style={{
															color: "#fff",
															fontSize: 13,
															fontWeight: 600,
														}}
													>
														<span
															className={
																softLoading
																	? "soft-blur"
																	: undefined
															}
														>
															{toCentsString(
																currentPrice
															)}
														</span>
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
														Avg Price
													</span>
													<span
														style={{
															color: "#fff",
															fontSize: 13,
															fontWeight: 600,
														}}
													>
														<span
															className={
																softLoading
																	? "soft-blur"
																	: undefined
															}
														>
															{effectiveAvgPrice ===
															null
																? "—"
																: toCentsString(
																		effectiveAvgPrice
																  )}
														</span>
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
														Cost
													</span>
													<span
														style={{
															color: "#fff",
															fontSize: 13,
															fontWeight: 600,
														}}
													>
														<span
															className={
																softLoading
																	? "soft-blur"
																	: undefined
															}
														>
															{effectiveCost ===
																null ||
															effectiveCost ===
																undefined
																? "—"
																: formatCurrency(
																		effectiveCost
																  )}
														</span>
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
														Payout if correct
													</span>
													<span
														style={{
															color: "#fff",
															fontSize: 13,
															fontWeight: 600,
														}}
													>
														<span
															className={
																softLoading
																	? "soft-blur"
																	: undefined
															}
														>
															{payoutIfCorrect ===
																null ||
															payoutIfCorrect ===
																undefined
																? "—"
																: formatCurrency(
																		payoutIfCorrect
																  )}
														</span>
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
														Total Return
													</span>
													<span
														style={{
															color: totalReturnColor,
															fontSize: 13,
															fontWeight: 600,
															whiteSpace:
																"nowrap",
														}}
													>
														<span
															className={
																softLoading
																	? "soft-blur"
																	: undefined
															}
														>
															{totalReturnText}
														</span>
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
			))}
		</div>
	);
}
