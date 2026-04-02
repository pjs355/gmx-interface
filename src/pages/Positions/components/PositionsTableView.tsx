import React from "react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import Tooltip from "components/Tooltip/Tooltip";
import ScrollableTable from "components/ScrollableTable/ScrollableTable";
import gtaIcon from "@/assets/img/ic_gtaVI_24.svg";
import {
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/helpers/gameLogoResolver";
import { usePredictionData } from "@/context/PredictionDataContext";
import { stripUmbrellaDisplayPrefix } from "@/helpers/umbrellaDisplayName";
import { getPredictPositionRowLabel } from "@/trading/predict/predictPositionLabel";
import TradeHistoryList from "./TradeHistoryList";

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const { tags } = usePredictionData();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	// Priority 0: Polymarket icon from Data API (synthetic umbrellas)
	const polyIcon = umbrella?._polyIcon || null;

	// Priority 1: Check for server image (ic_{umbrellaID})
	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;

	// Priority 2: Check for tag imageUrl from tags
	const tagImage = getTagImageFromUmbrella(umbrella, tags);

	// Priority 3: Check for game logo based on tag labels
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);

	// Priority 4: Fallback to game controller
	const fallbackLogo = gameLogo || gtaIcon;

	const initialSrc = polyIcon || serverImage || tagImage || fallbackLogo;

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

export default function PositionsTableView({
	umbrellaBalances,
	aggregates,
	spentByQid,
	returnsByQid,
	getCurrentPriceForSide,
	toCentsString,
	softLoading = false,
	orders = [],
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
	orders?: ProcessedOrder[];
}) {
	const navigate = useNavigate();
	
	// Track which markets have their trade history expanded
	const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

	const toggleMarketExpansion = (marketId: string, e: React.MouseEvent) => {
		e.stopPropagation(); // Prevent navigation
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

	// Helper to get trade count for a market and position
	const getTradeCount = (marketId: string, position?: "Yes" | "No"): number => {
		return orders.filter((order) => {
			if (order.questionId !== marketId || !order.filled) return false;
			// Case-insensitive comparison for position
			if (position && order.position?.toLowerCase() !== position.toLowerCase()) return false;
			return true;
		}).length;
	};

	// Navigation function to go to trading page with specific market and position
	const navigateToTradingPage = (
		umbrella: Umbrella,
		market: PredictionMarket,
		position: "yes" | "no"
	) => {
		// Store the umbrella and market data
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		localStorage.setItem("currentPredictionMarket", JSON.stringify(market));
		localStorage.setItem("activePosition", position);

		// Store the selected market ID so it becomes the active market on the trading page
		const marketId = market._id || market.questionId || market.marketId;
		if (marketId) {
			localStorage.setItem("selectedMarketId", marketId);
		}

		// Navigate to the trading page
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};
	const formatCurrency = (value?: number | null): string => {
		if (value === null || value === undefined || !isFinite(value))
			return "—";
		const isInt = Math.abs(value % 1) < 1e-9;
		const formatted = isInt 
			? value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
			: value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return `$${formatted}`;
	};
	return (
		<div className="flex flex-col gap-8">
			<style>{`
        .custom-tooltip {
          background-color: black !important;
          color: white !important;
          border: 1px solid #d1d5db !important; /* light grey */
          text-transform: none !important; /* ensure normal case */
          font-weight: normal !important;
        }
      `}</style>
			<ScrollableTable minWidth="800px">
				<div
					className="positions-header grid items-center px-12 py-10"
					style={{
						gridTemplateColumns:
							"minmax(200px, 2fr) repeat(7, 1fr) 80px",
						borderBottom: "1px solid #333333",
						color: "#888",
						fontSize: 12,
						textTransform: "uppercase",
						letterSpacing: 0.6,
					}}
				>
					<div>Market</div>
					<div style={{ textAlign: "center" }}>Current Price</div>
					<div style={{ textAlign: "center" }}>Shares</div>
					<div style={{ textAlign: "center" }}>Avg Price</div>
					<div style={{ textAlign: "center" }}>Cost</div>
					<div style={{ textAlign: "center" }}>Payout if correct</div>
					<div style={{ textAlign: "center" }}>Market Value</div>
					<div style={{ textAlign: "center" }}>
						<Tooltip
							content="Total return includes market value of current positions and any past past you have bought or sold."
							position="top"
							tooltipClassName="custom-tooltip"
						>
							Total Return
						</Tooltip>
					</div>
					<div style={{ textAlign: "center" }}>Trades</div>
				</div>

				<div className="flex flex-col">
					{umbrellaBalances.map(({ umbrella, markets }: any) => {
						const singleMarketUnderUmbrella = markets.length === 1;
						return (
						<div key={umbrella._id} className="umbrella-block">
							<div
								className="grid px-12 py-10"
								style={{
									gridTemplateColumns:
										"minmax(200px, 2fr) repeat(7, 1fr) 80px",
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
									<UmbrellaImage umbrella={umbrella} />
									{stripUmbrellaDisplayPrefix(umbrella.displayName)}
								</div>
							</div>
							{softLoading && markets.length === 0 && (
								<div
									className="grid items-center px-12 py-12 position-row"
									style={{
										gridTemplateColumns:
											"minmax(200px, 2fr) repeat(7, 1fr) 80px",
										borderBottom: "1px solid #1f1f1f",
										fontSize: 16,
									}}
								>
									{Array.from({ length: 9 }).map((_, idx) => (
										<div
											key={idx}
											style={{
												textAlign:
													idx === 0
														? undefined
														: "center",
												color: "#fff",
											}}
										>
											<span
												className="skeleton-box"
												style={{
													display: "inline-block",
													width: idx === 0 ? 220 : 80,
													height: 16,
													borderRadius: 4,
												}}
											/>
										</div>
									))}
								</div>
							)}

							{markets.map(
								({
									market,
									yes,
									no,
									venue,
									predictOutcomeLabelYes,
									predictOutcomeLabelNo,
								}: any) => {
								const yesNum = Number(yes);
								const noNum = Number(no);
								const rows: {
									side: "Yes" | "No";
									amount: string;
								}[] = [];
								if (yesNum > 0)
									rows.push({ side: "Yes", amount: yes });
								if (noNum > 0)
									rows.push({ side: "No", amount: no });

								return rows.map(({ side, amount }) => {
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
										: sharesNum; // $1 per share
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

									// Preserve existing calculation, then add realized PnL for this leg if present
									const baseReturn =
										marketValue === null ||
										effectiveCost === null
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
											? (totalReturn / effectiveCost) *
											  100
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
										const usdPart = formatCurrency(
											Math.abs(totalReturn)
										);
										if (
											totalReturnPct === null ||
											!isFinite(totalReturnPct)
										) {
											return `${signUsd}${usdPart}`;
										}
										const signPct =
											totalReturnPct >= 0 ? "+" : "-";
										const pctPart = `${Math.round(
											Math.abs(totalReturnPct as number)
										)}%`;
										return `${signUsd}${usdPart} (${signPct}${pctPart})`;
									})();

									// Derive team labels for single-market VS titles
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

									const predictRowLabel =
										venue === "predictfun"
											? getPredictPositionRowLabel(
													title,
													side === "Yes"
														? predictOutcomeLabelYes
														: predictOutcomeLabelNo,
													side
											  )
											: null;

									const tradeCount = getTradeCount(qid, side);
									const isExpanded = expandedMarkets.has(`${qid}-${side}`);

									return (
										<React.Fragment key={`${market._id}-${side.toLowerCase()}`}>
										<div
											className={`grid items-center px-12 py-12 position-row ${isExpanded ? "expanded" : ""}`}
											style={{
												gridTemplateColumns:
													"minmax(200px, 2fr) repeat(7, 1fr) 80px",
												borderBottom:
													"1px solid #1f1f1f",
												fontSize: 16,
												cursor: "pointer",
												transition:
													"background-color 0.2s ease",
											}}
											onMouseEnter={(e) => {
												e.currentTarget.style.backgroundColor =
													"#2a2a2a";
											}}
											onMouseLeave={(e) => {
												e.currentTarget.style.backgroundColor =
													"transparent";
											}}
											onClick={() =>
												navigateToTradingPage(
													umbrella,
													market,
													side.toLowerCase() as
														| "yes"
														| "no"
												)
											}
										>
											<div
												style={{
													color: "#fff",
													fontWeight: 600,
												}}
											>
												{venue === "predictfun" ? (
													<span>{predictRowLabel}</span>
												) : isVs ? (
													<span>
														{side === "Yes"
															? primaryLabel
															: secondaryLabel}
													</span>
												) : singleMarketUnderUmbrella ? (
													<span
														style={{
															color:
																side === "Yes"
																	? "#16a34a"
																	: "#ef4444",
														}}
													>
														{side}
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
											</div>
											<div
												style={{
													textAlign: "center",
													color: "#fff",
												}}
											>
												<span
													className={
														softLoading
															? "soft-blur"
															: undefined
													}
												>
													{parseFloat(Number(amount).toFixed(2))}
												</span>
											</div>
											<div
												style={{
													textAlign: "center",
													color: "#fff",
												}}
											>
												<span
													className={
														softLoading
															? "soft-blur"
															: undefined
													}
												>
													{effectiveAvgPrice === null
														? "—"
														: toCentsString(
																effectiveAvgPrice
														  )}
												</span>
											</div>
											<div
												style={{
													textAlign: "center",
													color: "#fff",
												}}
											>
												<span
													className={
														softLoading
															? "soft-blur"
															: undefined
													}
												>
													{effectiveCost === null ||
													effectiveCost === undefined
														? "—"
														: formatCurrency(
																effectiveCost
														  )}
												</span>
											</div>
											<div
												style={{
													textAlign: "center",
													color: "#fff",
												}}
											>
												<span
													className={
														softLoading
															? "soft-blur"
															: undefined
													}
												>
													{payoutIfCorrect === null ||
													payoutIfCorrect ===
														undefined
														? "—"
														: formatCurrency(
																payoutIfCorrect
														  )}
												</span>
											</div>
											<div
												style={{
													textAlign: "center",
													color: "#fff",
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
											<div
												style={{
													textAlign: "center",
													color: totalReturnColor,
													fontWeight: "bold",
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
											</div>
											<div
												style={{
													textAlign: "center",
												}}
												onMouseEnter={(e) => {
													e.stopPropagation();
													// Reset parent row background
													const row = e.currentTarget.parentElement;
													if (row) row.style.backgroundColor = "transparent";
												}}
											>
												{tradeCount > 0 && (
													<button
														className={`expand-trades-btn ${isExpanded ? "expanded" : ""}`}
														onClick={(e) => toggleMarketExpansion(`${qid}-${side}`, e)}
														onMouseEnter={(e) => {
															e.stopPropagation();
															// Reset parent row background
															const row = e.currentTarget.closest('.position-row');
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
										{isExpanded && (
											<TradeHistoryList
												orders={orders}
												marketId={qid}
												isExpanded={isExpanded}
												position={side}
											/>
										)}
										</React.Fragment>
									);
								});
							})}
						</div>
						);
					})}
				</div>
			</ScrollableTable>
		</div>
	);
}
