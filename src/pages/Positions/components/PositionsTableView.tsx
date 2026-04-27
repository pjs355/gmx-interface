import React from "react";
import { useNavigate } from "react-router-dom";
import { useState, useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import Tooltip from "components/Tooltip/Tooltip";
import ScrollableTable from "components/ScrollableTable/ScrollableTable";
import { umbrellaHeaderLabel } from "@/helpers/umbrellaDisplayName";
import { getPredictPositionRowLabel } from "@/trading/predict/predictPositionLabel";
import { shortTeamDisplayName } from "../utils/historyOutcomeWinner";
import TradeHistoryList from "./TradeHistoryList";
import UmbrellaImage from "./UmbrellaImage";
import { formatCurrency } from "../utils/formatCurrency";
import {
	getTradeCount,
	fifoAlignedBasisForPositionsRow,
} from "../utils/positionHelpers";

type MergedRow = {
	side: "Yes" | "No";
	label: string;
	totalShares: number;
	currentPrice: number | null;
	marketValue: number | null;
	avgPrice: number | null;
	totalCost: number | null;
	payout: number;
	totalReturn: number | null;
	totalReturnPct: number | null;
	tradeCount: number;
	marketIds: string[];
	primaryMarket: PredictionMarket;
	primaryUmbrella: Umbrella;
};

export default function PositionsTableView({
	umbrellaBalances,
	aggregates,
	spentByQid,
	returnsByQid,
	getCurrentPriceForSide,
	toCentsString,
	orders = [],
}: {
	umbrellaBalances: any[];
	aggregates: Record<string, any>;
	spentByQid: Record<string, { Yes: number; No: number }>;
	returnsByQid: Record<string, { Yes: number; No: number }>;
	getCurrentPriceForSide: (market: PredictionMarket, side: "Yes" | "No") => number | null;
	toCentsString: (n?: number | null) => string;
	orders?: ProcessedOrder[];
}) {
	const navigate = useNavigate();
	const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

	const toggleMarketExpansion = (key: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setExpandedMarkets((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
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

			for (const { market, yes, no, venue, predictOutcomeLabelYes, predictOutcomeLabelNo } of markets) {
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
					if (effectiveCost !== null) {
						bucket.totalCost += effectiveCost;
						bucket.hasCost = true;
					}
					if (effectiveAvgPrice !== null) {
						bucket.weightedAvgSum += effectiveAvgPrice * amount;
						bucket.avgShares += amount;
					}

					if (!bucket.label) {
						if (venue === "predictfun") {
							bucket.label = getPredictPositionRowLabel(title, side === "Yes" ? predictOutcomeLabelYes : predictOutcomeLabelNo, side) || side;
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

			const rows: MergedRow[] = [];
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
		<div className="flex flex-col gap-8">
			<style>{`.custom-tooltip { background-color: black !important; color: white !important; border: 1px solid #d1d5db !important; text-transform: none !important; font-weight: normal !important; }`}</style>
			<ScrollableTable minWidth="800px">
				<div
					className="positions-header grid items-center px-12 py-10"
					style={{
						gridTemplateColumns: "minmax(200px, 2fr) repeat(7, 1fr) 80px",
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
							content="Unrealized (current market value minus FIFO cost of your open shares from filled trades) plus realized trading P&L from round-trips. This is not the same as the expanded “NET” cash-flow line, which is a simple sum of buy and sell cash amounts without your mark on the remaining position."
							position="top"
							tooltipClassName="custom-tooltip"
						>
							Total Return
						</Tooltip>
					</div>
					<div style={{ textAlign: "center" }}>Trades</div>
				</div>

				<div className="flex flex-col">
					{mergedByUmbrella.map(({ umbrella, rows }) => (
						<div key={umbrella._id} className="umbrella-block">
							<div
								className="grid px-12 py-10"
								style={{
									gridTemplateColumns: "minmax(200px, 2fr) repeat(7, 1fr) 80px",
									background: "#000000",
									borderBottom: "1px solid #1f1f1f",
									paddingTop: 16,
									paddingBottom: 16,
								}}
							>
								<div style={{ gridColumn: "1 / -1", fontWeight: 700, color: "#dedede", fontSize: 20, display: "flex", alignItems: "center", gap: "12px" }}>
									<UmbrellaImage umbrella={umbrella} />
									{umbrellaHeaderLabel(umbrella)}
								</div>
							</div>

							{rows.map((row) => {
								const expandKey = `${umbrella._id}-${row.side}`;
								const isExpanded = expandedMarkets.has(expandKey);
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
									<React.Fragment key={expandKey}>
										<div
											className={`grid items-center px-12 py-12 position-row ${isExpanded ? "expanded" : ""}`}
											style={{
												gridTemplateColumns: "minmax(200px, 2fr) repeat(7, 1fr) 80px",
												borderBottom: "1px solid #1f1f1f",
												fontSize: 16,
												cursor: "pointer",
												transition: "background-color 0.2s ease",
											}}
											onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#2a2a2a"; }}
											onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
											onClick={() => navigateToTradingPage(row.primaryUmbrella, row.primaryMarket, row.side.toLowerCase() as "yes" | "no")}
										>
											<div style={{ color: "#fff", fontWeight: 600 }}>
												{singleSide && row.label === row.side ? (
													<span style={{ color: row.side === "Yes" ? "#16a34a" : "#ef4444" }}>{row.side}</span>
												) : (
													<span>{row.label}</span>
												)}
											</div>
											<div style={{ textAlign: "center", color: "#fff" }}>{toCentsString(row.currentPrice)}</div>
											<div style={{ textAlign: "center", color: "#fff" }}>{parseFloat(row.totalShares.toFixed(2))}</div>
											<div style={{ textAlign: "center", color: "#fff" }}>{row.avgPrice === null ? "—" : toCentsString(row.avgPrice)}</div>
											<div style={{ textAlign: "center", color: "#fff" }}>{row.totalCost === null ? "—" : formatCurrency(row.totalCost)}</div>
											<div style={{ textAlign: "center", color: "#fff" }}>{formatCurrency(row.payout)}</div>
											<div style={{ textAlign: "center", color: "#fff" }}>{row.marketValue === null || isNaN(row.marketValue) ? "—" : formatCurrency(row.marketValue)}</div>
											<div style={{ textAlign: "center", color: totalReturnColor, fontWeight: "bold" }}>{totalReturnText}</div>
											<div
												style={{ textAlign: "center" }}
												onMouseEnter={(e) => {
													e.stopPropagation();
													const r = e.currentTarget.parentElement;
													if (r) r.style.backgroundColor = "transparent";
												}}
											>
												{row.tradeCount > 0 && (
													<button
														className={`expand-trades-btn ${isExpanded ? "expanded" : ""}`}
														onClick={(e) => toggleMarketExpansion(expandKey, e)}
														onMouseEnter={(e) => {
															e.stopPropagation();
															const r = e.currentTarget.closest(".position-row");
															if (r) (r as HTMLElement).style.backgroundColor = "transparent";
														}}
													>
														<span>{row.tradeCount}</span>
														<span className="expand-icon" style={{ transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
													</button>
												)}
											</div>
										</div>
										{isExpanded && (
											<TradeHistoryList
												orders={orders}
												marketId={row.marketIds}
												isExpanded={isExpanded}
												position={row.side}
												positionDisplayLabel={row.label}
											/>
										)}
									</React.Fragment>
								);
							})}
						</div>
					))}
				</div>
			</ScrollableTable>
		</div>
	);
}
