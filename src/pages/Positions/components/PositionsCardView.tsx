import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import { umbrellaHeaderLabel } from "@/helpers/umbrellaDisplayName";
import { portfolioColumnTeamLabels } from "@/trading/dflow/dflowUmbrellaLookup";
import { getPredictPositionRowLabel } from "@/trading/predict/predictPositionLabel";
import { shortTeamDisplayName } from "../utils/historyOutcomeWinner";
import TradeHistoryListMobile from "./TradeHistoryListMobile";
import UmbrellaImage from "./UmbrellaImage";
import { formatCurrency } from "../utils/formatCurrency";
import { formatShareCountDisplay } from "@/pages/PredictionMarket/PredictionMarketTradeBox/checkBalances";
import {
	getTradeCount,
	fifoAlignedBasisForPositionsRow,
} from "../utils/positionHelpers";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { oddsDualLayoutForStyle } from "@/utils/oddsDisplayFormat";

export default function PositionsCardView({
	umbrellaBalances,
	aggregates,
	spentByQid,
	returnsByQid,
	getCurrentPriceForSide,
	orders = [],
}: {
	umbrellaBalances: any[];
	aggregates: Record<string, any>;
	spentByQid: Record<string, { Yes: number; No: number }>;
	returnsByQid: Record<string, { Yes: number; No: number }>;
	getCurrentPriceForSide: (market: PredictionMarket, side: "Yes" | "No") => number | null;
	orders?: ProcessedOrder[];
}) {
	const { formatPrice, oddsDisplayStyle } = useOddsDisplay();
	const portfolioPriceLayout = oddsDualLayoutForStyle(oddsDisplayStyle);
	const navigate = useNavigate();
	const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
	const [expandedTradeHistory, setExpandedTradeHistory] = useState<Set<string>>(new Set());

	const toggleCard = (cardId: string) => {
		setExpandedCards((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(cardId)) newSet.delete(cardId);
			else newSet.add(cardId);
			return newSet;
		});
	};

	const toggleTradeHistory = (key: string) => {
		setExpandedTradeHistory((prev) => {
			const newSet = new Set(prev);
			if (newSet.has(key)) newSet.delete(key);
			else newSet.add(key);
			return newSet;
		});
	};

	const navigateToTradingPage = (umbrella: Umbrella, market: PredictionMarket, position: "yes" | "no") => {
		localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
		localStorage.setItem("currentPredictionMarket", JSON.stringify(market));
		localStorage.setItem("activePosition", position);
		const marketId = market._id || market.questionId || market.marketId;
		if (marketId) localStorage.setItem("selectedMarketId", marketId);
		navigate(`/predictions/umbrella/${umbrella._id}`);
	};

	const mergedByUmbrella = useMemo(() => {
		return umbrellaBalances.map(({ umbrella, markets }: any) => {
			const hasDflowVenue = markets.some(
				(m: { venue?: string; includesDflowVenue?: boolean }) =>
					m.venue === "dflow" || Boolean(m.includesDflowVenue),
			);
			const hasLimitlessVenue = markets.some(
				(m: { venue?: string; includesLimitlessVenue?: boolean }) =>
					m.venue === "limitless" || Boolean(m.includesLimitlessVenue),
			);
			const teamPortfolioCols =
				hasDflowVenue || hasLimitlessVenue
					? portfolioColumnTeamLabels(umbrella)
					: null;

			const sideBuckets: Record<"Yes" | "No", {
				shares: number; marketValue: number; totalCost: number;
				hasCost: boolean; marketIds: string[];
				weightedPriceSum: number; priceShares: number;
				weightedAvgSum: number; avgShares: number;
				label: string; primaryMarket: any;
			}> = {
				Yes: { shares: 0, marketValue: 0, totalCost: 0, hasCost: false, marketIds: [], weightedPriceSum: 0, priceShares: 0, weightedAvgSum: 0, avgShares: 0, label: "", primaryMarket: null },
				No: { shares: 0, marketValue: 0, totalCost: 0, hasCost: false, marketIds: [], weightedPriceSum: 0, priceShares: 0, weightedAvgSum: 0, avgShares: 0, label: "", primaryMarket: null },
			};

			for (const {
				market,
				yes,
				no,
				venue,
				includesDflowVenue,
				includesLimitlessVenue,
				predictOutcomeLabelYes,
				predictOutcomeLabelNo,
			} of markets) {
				const qid = market._id || market.questionId || market.marketId;
				const title = (market?.displayName || (market as any)?.question || "").trim();
				const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
				const isVs = parts.length === 2;

				for (const { side, amount } of [
					{ side: "Yes" as const, amount: Number(yes) },
					{ side: "No" as const, amount: Number(no) },
				]) {
					if (amount <= 0) continue;
					const bucket = sideBuckets[side];
					bucket.shares += amount;
					bucket.marketIds.push(qid);
					if (!bucket.primaryMarket) bucket.primaryMarket = market;

					const price = getCurrentPriceForSide(market, side);
					if (price !== null) {
						bucket.weightedPriceSum += price * amount;
						bucket.priceShares += amount;
						bucket.marketValue += price * amount;
					}

					const sideAgg = aggregates[qid]?.[side] as { avgPrice: number | null; cost: number | null } | undefined;
					const effectiveAvgPrice = sideAgg?.avgPrice ?? null;
					const fallbackSpent = spentByQid[qid]?.[side];
					const effectiveCost = sideAgg?.cost ?? fallbackSpent ?? null;
					if (effectiveCost !== null) { bucket.totalCost += effectiveCost; bucket.hasCost = true; }
					if (effectiveAvgPrice !== null) { bucket.weightedAvgSum += effectiveAvgPrice * amount; bucket.avgShares += amount; }

					if (!bucket.label) {
						const useCatalogTeamCols =
							teamPortfolioCols &&
							(venue === "dflow" ||
								includesDflowVenue ||
								venue === "limitless" ||
								Boolean(includesLimitlessVenue));
						if (useCatalogTeamCols) {
							bucket.label =
								(side === "Yes"
									? teamPortfolioCols!.columnYes
									: teamPortfolioCols!.columnNo) || side;
						} else if (venue === "predictfun" || venue === "limitless") {
							bucket.label =
								getPredictPositionRowLabel(
									title,
									side === "Yes" ? predictOutcomeLabelYes : predictOutcomeLabelNo,
									side,
								) || side;
						} else if (isVs) {
							bucket.label = shortTeamDisplayName(
								side === "Yes" ? parts[0] : parts[1],
							);
						} else {
							bucket.label = side;
						}
					}
				}
			}

			const rows: Array<{
				side: "Yes" | "No"; label: string; totalShares: number;
				currentPrice: number | null; marketValue: number | null;
				avgPrice: number | null; totalCost: number | null; payout: number;
				totalReturn: number | null; totalReturnPct: number | null;
				tradeCount: number; marketIds: string[];
				primaryMarket: any; primaryUmbrella: any;
			}> = [];
			for (const side of ["Yes", "No"] as const) {
				const b = sideBuckets[side];
				if (b.shares <= 0) continue;

				const uniqMarketIds = [...new Set(b.marketIds)];
				let tradeCountDeduped = 0;
				for (const qid of uniqMarketIds) {
					tradeCountDeduped += getTradeCount(orders, qid, side);
				}

				const fifo = fifoAlignedBasisForPositionsRow(
					orders,
					uniqMarketIds,
					side,
					b.shares,
				);

				let totalCostDisplay: number | null = b.hasCost ? b.totalCost : null;
				let avgPriceDisplay: number | null =
					b.avgShares > 0 ? b.weightedAvgSum / b.avgShares : null;
				if (fifo.fifoCost != null && fifo.fifoAvgPrice != null) {
					totalCostDisplay = fifo.fifoCost;
					avgPriceDisplay = fifo.fifoAvgPrice;
				}

				const mvDisplay = b.priceShares > 0 ? b.marketValue : null;

				let realizedLegPnL = 0;
				for (const id of uniqMarketIds) {
					const r = returnsByQid[id]?.[side];
					if (typeof r === "number" && Number.isFinite(r)) {
						realizedLegPnL = r;
						break;
					}
				}

				let totalReturnDisplay: number | null = null;
				let hasRet = false;
				if (mvDisplay !== null && totalCostDisplay !== null) {
					totalReturnDisplay = mvDisplay - totalCostDisplay + realizedLegPnL;
					hasRet = true;
				}

				rows.push({
					side,
					label: b.label || side,
					totalShares: b.shares,
					currentPrice:
						b.priceShares > 0 ? b.weightedPriceSum / b.priceShares : null,
					marketValue: mvDisplay,
					avgPrice: avgPriceDisplay,
					totalCost: totalCostDisplay,
					payout: b.shares,
					totalReturn: hasRet ? totalReturnDisplay : null,
					totalReturnPct:
						hasRet &&
						totalCostDisplay != null &&
						totalCostDisplay > 0 &&
						totalReturnDisplay != null
							? (totalReturnDisplay / totalCostDisplay) * 100
							: null,
					tradeCount: tradeCountDeduped,
					marketIds: b.marketIds,
					primaryMarket: b.primaryMarket,
					primaryUmbrella: umbrella,
				});
			}
			return { umbrella, rows };
		});
	}, [umbrellaBalances, aggregates, spentByQid, returnsByQid, getCurrentPriceForSide, orders]);

	return (
		<div className="flex flex-col gap-12">
			{mergedByUmbrella.map(({ umbrella, rows }) => {
				const blockUmbrellaTitle = umbrellaHeaderLabel(umbrella);
				return (
					<div key={umbrella._id} className="umbrella-card">
						{rows.map((row) => {
							const cardId = `${umbrella._id}-${row.side}`;
							const isExpanded = expandedCards.has(cardId);
							const thKey = `${umbrella._id}-${row.side}-th`;
							const isThExpanded = expandedTradeHistory.has(thKey);
							const singleSide = rows.length === 1;

							const totalReturnColor = row.totalReturn === null ? "#fff" : row.totalReturn >= 0 ? "#16a34a" : "#ef4444";
							const totalReturnText = (() => {
								if (row.totalReturn === null || !isFinite(row.totalReturn)) return "—";
								const signUsd = row.totalReturn >= 0 ? "+" : "-";
								const usdPart = formatCurrency(Math.abs(row.totalReturn));
								if (row.totalReturnPct === null || !isFinite(row.totalReturnPct)) return `${signUsd}${usdPart}`;
								const signPct = row.totalReturnPct >= 0 ? "+" : "-";
								return `${signUsd}${usdPart} (${signPct}${Math.round(Math.abs(row.totalReturnPct))}%)`;
							})();

							return (
								<div
									key={cardId}
									style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}
								>
									{/* Card Header */}
									<div
										onClick={() => navigateToTradingPage(row.primaryUmbrella, row.primaryMarket, row.side.toLowerCase() as "yes" | "no")}
										style={{ padding: "16px", background: "#0a0a0a", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
									>
										<UmbrellaImage umbrella={umbrella} size={40} />
										<div style={{ flex: 1 }}>
											<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
												{blockUmbrellaTitle}
											</div>
											<div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>
												{singleSide && row.label === row.side ? (
													<span style={{ color: row.side === "Yes" ? "#16a34a" : "#ef4444" }}>{row.side}</span>
												) : (
													<span>{row.label}</span>
												)}
											</div>
										</div>
									</div>

									{/* Card Summary */}
									<div
										onClick={() => toggleCard(cardId)}
										style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: isExpanded ? "#0f0f0f" : "transparent" }}
									>
										<div style={{ flex: 1 }}>
											<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Shares</div>
											<div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>{formatShareCountDisplay(row.totalShares)}</div>
										</div>
										<div style={{ flex: 1, textAlign: "right" }}>
											<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Market Value</div>
											<div style={{ color: "#fff", fontSize: 18, fontWeight: 700 }}>
												{row.marketValue === null || isNaN(row.marketValue) ? "—" : formatCurrency(row.marketValue)}
											</div>
										</div>
										<div style={{ marginLeft: 12, color: "#888", fontSize: 20, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>
											▼
										</div>
									</div>

									{/* Expanded Details */}
									{isExpanded && (
										<div style={{ padding: "16px", borderTop: "1px solid #2a2a2a", background: "#0f0f0f" }}>
											<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
												<div style={{ display: "flex", justifyContent: "space-between" }}>
													<span style={{ color: "#888", fontSize: 13 }}>Last traded price</span>
													<span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{formatPrice(row.currentPrice, portfolioPriceLayout)}</span>
												</div>
												<div style={{ display: "flex", justifyContent: "space-between" }}>
													<span style={{ color: "#888", fontSize: 13 }}>Avg Price</span>
													<span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{row.avgPrice === null ? "—" : formatPrice(row.avgPrice, portfolioPriceLayout)}</span>
												</div>
												<div style={{ display: "flex", justifyContent: "space-between" }}>
													<span style={{ color: "#888", fontSize: 13 }}>Cost</span>
													<span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{row.totalCost === null ? "—" : formatCurrency(row.totalCost)}</span>
												</div>
												<div style={{ display: "flex", justifyContent: "space-between" }}>
													<span style={{ color: "#888", fontSize: 13 }}>Payout if correct</span>
													<span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{formatCurrency(row.payout)}</span>
												</div>
												<div style={{ display: "flex", justifyContent: "space-between" }}>
													<span style={{ color: "#888", fontSize: 13 }}>Total Return</span>
													<span style={{ color: totalReturnColor, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>{totalReturnText}</span>
												</div>
												{row.tradeCount > 0 && (
													<div
														onClick={(e) => { e.stopPropagation(); toggleTradeHistory(thKey); }}
														style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #1f1f1f", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#666", fontSize: 13, cursor: "pointer" }}
													>
														<span>{isThExpanded ? "Hide" : "View"} {row.tradeCount} trade{row.tradeCount !== 1 ? "s" : ""}</span>
														<span style={{ display: "inline-block", transition: "transform 0.2s ease", transform: isThExpanded ? "rotate(180deg)" : "rotate(0deg)", fontSize: 10 }}>▼</span>
													</div>
												)}
											</div>
											{isThExpanded && (
												<TradeHistoryListMobile
													orders={orders}
													marketId={row.marketIds}
													isExpanded={isThExpanded}
													position={row.side}
													positionDisplayLabel={row.label}
													marketTitle={
														(row.primaryMarket?.displayName ||
															(row.primaryMarket as { question?: string })?.question ||
															"")
															.trim() || undefined
													}
												/>
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}
