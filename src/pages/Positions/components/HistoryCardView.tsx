import React, { useEffect, useState, useMemo } from "react";
import {
	normalizeOrderQuestionIdKey,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import TradeHistoryListMobile from "./TradeHistoryListMobile";
import UmbrellaImage from "./UmbrellaImage";
import {
	umbrellaHeaderLabel,
} from "@/helpers/umbrellaDisplayName";
import { buildUmbrellaLookupByPolymarketConditionId } from "@/trading/polymarket/polymarketConditionLookup";
import { buildUmbrellaLookupByDflowEventTicker, buildUmbrellaLookupByDflowOutcomeMint } from "@/trading/dflow/dflowUmbrellaLookup";
import { levelUpQuestionIdsForVenueHistoryRow } from "@/trading/levelUpQuestionIdsForVenueHistory";
import {
	getVenueHistoryMarketColumnLabel,
	isGenericBinaryOutcomeLabel,
} from "@/trading/predict/predictPositionLabel";
import {
	getTradeCount,
	formatHistoryReturnPctAbs,
	historyVenueRowPortfolioYesNoSide,
	venueHistoryPositionToSyntheticOrders,
	venueHistoryRowToSyntheticOrder,
} from "../utils/positionHelpers";
import {
	parseVsTeamsFromTitle,
	pickResolvedWinnerFromMarkets,
	resolveCanonicalMatchWinner,
	shortTeamDisplayName,
	winnerLabelFromLevelUpTitle,
	winnerLabelFromVenuePosition,
} from "../utils/historyOutcomeWinner";
import { debugLimitlessPortfolio } from "@/trading/limitless/limitlessPortfolioDebug";
import {
	buildPredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import {
	logFullHistoryDebug,
	type FullHistoryUnifiedBlock,
	type LogFullHistoryDebugParams,
} from "../utils/fullHistoryDebugLog";
import { buildHistoryUnifiedBlocks } from "../utils/buildHistoryUnifiedBlocks";

type MergedHistoryRow = {
	side: "Yes" | "No";
	label: string;
	finalPosition: number;
	outcomeText: string;
	outcomeColor: string;
	totalCost: number;
	totalPayout: number;
	totalReturn: number;
	totalReturnPct: number | null;
	tradeCount: number;
	marketIds: string[];
};

export default function HistoryCardView({
	umbrellaBalances,
	orders,
	resolvedMarketsByUmbrella,
	venueHistory = [],
	catalogUmbrellas,
	venueHistoryRawItemsForDebug,
	historyResolveStage,
}: {
	umbrellaBalances?: Array<{ umbrella: Umbrella; markets: any[] }>;
	orders: any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
	venueHistory?: VenuePosition[];
	catalogUmbrellas?: Umbrella[];
	venueHistoryRawItemsForDebug?: VenuePosition[];
	historyResolveStage?: LogFullHistoryDebugParams["resolveStage"];
}) {
	const { umbrellas: contextUmbrellas, getAllQuestionsForUmbrella } = usePredictionData();
	const umbrellas = catalogUmbrellas ?? contextUmbrellas;
	const { appState } = useOddsMonitor();
	const matchedMarkets = appState?.markets ?? null;
	const umbrellaLookupByConditionId = useMemo(
		() => buildUmbrellaLookupByPolymarketConditionId(umbrellas),
		[umbrellas],
	);

	const predictUmbrellaLookup = useMemo(
		() => buildPredictUmbrellaLookup(appState?.markets, umbrellas),
		[appState?.markets, umbrellas],
	);

	const umbrellaLookupByDflowOutcomeMint = useMemo(
		() => buildUmbrellaLookupByDflowOutcomeMint(umbrellas),
		[umbrellas],
	);

	const umbrellaLookupByDflowEventTicker = useMemo(
		() => buildUmbrellaLookupByDflowEventTicker(umbrellas),
		[umbrellas],
	);

	const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
	const [expandedTradeHistory, setExpandedTradeHistory] = useState<Set<string>>(new Set());

	const toggle = (set: Set<string>, id: string) => {
		const n = new Set(set);
		if (n.has(id)) n.delete(id); else n.add(id);
		return n;
	};

	const venueHistorySyntheticOrders = useMemo(() => {
		const synth: ProcessedOrder[] = [];
		for (const pos of venueHistory) {
			synth.push(...venueHistoryPositionToSyntheticOrders(pos));
		}
		return synth;
	}, [venueHistory]);

	const allOrders = useMemo(() => [...orders, ...venueHistorySyntheticOrders], [orders, venueHistorySyntheticOrders]);

	const unifiedBlocks = useMemo(
		() =>
			buildHistoryUnifiedBlocks({
				umbrellas,
				getAllQuestionsForUmbrella,
				resolvedMarketsByUmbrella,
				orders,
				venueHistory,
				umbrellaLookupByConditionId,
				predictUmbrellaLookup,
				umbrellaLookupByDflowOutcomeMint,
				umbrellaLookupByDflowEventTicker,
			}),
		[
			umbrellas,
			getAllQuestionsForUmbrella,
			resolvedMarketsByUmbrella,
			orders,
			venueHistory,
			umbrellaLookupByConditionId,
			predictUmbrellaLookup,
			umbrellaLookupByDflowOutcomeMint,
			umbrellaLookupByDflowEventTicker,
		],
	);

	useEffect(() => {
		logFullHistoryDebug({
			layout: "card",
			venueHistory,
			unifiedBlocks: unifiedBlocks as FullHistoryUnifiedBlock[],
			umbrellas,
			umbrellaLookupByConditionId,
			predictLookup: predictUmbrellaLookup,
			dflowMintLookup: umbrellaLookupByDflowOutcomeMint,
			dflowEventTickerLookup: umbrellaLookupByDflowEventTicker,
			orders,
			resolvedMarketsByUmbrella,
			umbrellaBalances,
			venueHistoryRawItems: venueHistoryRawItemsForDebug,
			resolveStage: historyResolveStage ?? undefined,
		});
	}, [
		venueHistory,
		unifiedBlocks,
		umbrellas,
		umbrellaLookupByConditionId,
		predictUmbrellaLookup,
		umbrellaLookupByDflowOutcomeMint,
		umbrellaLookupByDflowEventTicker,
		orders,
		resolvedMarketsByUmbrella,
		umbrellaBalances,
		venueHistoryRawItemsForDebug,
		historyResolveStage,
	]);

	const mergedRowsByBlock = useMemo(() => {
		let limitlessHistUiLog = 0;
		return unifiedBlocks.map((block) => {
			const resolvedList = resolvedMarketsByUmbrella[block.id] ?? [];
			const luSample = block.luMarkets[0]?.market ?? null;
			const umbrellaTitle = umbrellaHeaderLabel(block.umbrella);
			const blockCanonical = resolveCanonicalMatchWinner({
				umbrella: block.umbrella,
				matchedMarkets,
				resolvedMarketsForUmbrella: resolvedList,
				luSampleMarket: luSample,
			});
			const luWinner = pickResolvedWinnerFromMarkets(
				block.luMarkets.map((r) => r.market),
				umbrellaTitle,
			);
			let blockOutcomeShort = blockCanonical
				? shortTeamDisplayName(blockCanonical)
				: null;
			if (!blockOutcomeShort && luWinner) {
				blockOutcomeShort = shortTeamDisplayName(luWinner);
			}
			if (!blockOutcomeShort) {
				for (const pos of block.venuePositions) {
					const w = winnerLabelFromVenuePosition(pos, {
						vsTitleHint: umbrellaTitle,
					});
					if (w && w !== "—") {
						blockOutcomeShort = shortTeamDisplayName(w);
						break;
					}
				}
			}

			type Bucket = {
				hasData: boolean;
				label: string;
				outcomeText: string;
				marketIds: string[];
				wonByQid: Record<string, boolean>;
			};
			const sideBuckets: Record<"Yes" | "No", Bucket> = {
				Yes: { hasData: false, label: "", outcomeText: "", marketIds: [], wonByQid: {} },
				No:  { hasData: false, label: "", outcomeText: "", marketIds: [], wonByQid: {} },
			};

			for (const { market } of block.luMarkets) {
				const qid = market._id || market.questionId || market.marketId;
				if (!qid) continue;
				const resolved = String((market as any).resolvedOutcome || "").toLowerCase();
				const title = (market?.displayName || (market as any)?.question || "").trim();
				const vsPair =
					parseVsTeamsFromTitle(title) ??
					parseVsTeamsFromTitle(umbrellaTitle);
				const isVs = vsPair != null;

				for (const side of ["Yes", "No"] as const) {
					const tc = getTradeCount(allOrders, qid, side);
					if (tc === 0) continue;
					const bucket = sideBuckets[side];
					bucket.hasData = true;
					if (!bucket.marketIds.includes(qid)) bucket.marketIds.push(qid);
					const won =
						(side === "Yes" && resolved === "yes") ||
						(side === "No" && resolved === "no");
					bucket.wonByQid[qid] = won;

					if (!bucket.label) {
						bucket.label = isVs && vsPair
							? shortTeamDisplayName(side === "Yes" ? vsPair[0] : vsPair[1])
							: side;
					}
					if (!bucket.outcomeText) {
						bucket.outcomeText = winnerLabelFromLevelUpTitle(
							title,
							resolved,
							umbrellaTitle,
						);
					}
				}
			}

			for (const pos of block.venuePositions) {
				const side = historyVenueRowPortfolioYesNoSide(pos);
				if (
					import.meta.env.DEV &&
					pos.venue === "limitless" &&
					limitlessHistUiLog < 18
				) {
					limitlessHistUiLog++;
					const synth = venueHistoryRowToSyntheticOrder(pos);
					debugLimitlessPortfolio("History tab UI (card): limitless row → bucket + labels", {
						umbrella: umbrellaTitle,
						rawApiOutcome: pos.outcome,
						inferredYesNoBucket: side,
						rowMarketTitle: pos.marketTitle,
						marketStatusOnRow: pos.marketStatus,
						outcomeResultOnRow: pos.outcomeResult,
						winnerColumnLabel: winnerLabelFromVenuePosition(pos, {
							vsTitleHint: umbrellaTitle,
						}),
						marketColumnLabel: getVenueHistoryMarketColumnLabel(
							pos.marketTitle,
							pos,
							block.venuePositions.length === 1 && block.luMarkets.length === 0,
						),
						syntheticOrderPosition: synth?.position,
						syntheticPrice: synth?.price,
						syntheticUsdc: synth?.usdcValue,
					});
				}
				const bucket = sideBuckets[side];
				bucket.hasData = true;
				if (!bucket.marketIds.includes(pos.tokenId)) bucket.marketIds.push(pos.tokenId);
				const venueWon = pos.outcomeResult === "WON";
				bucket.wonByQid[pos.tokenId] = venueWon;
				for (const qid of levelUpQuestionIdsForVenueHistoryRow(umbrellas, pos)) {
					if (!bucket.marketIds.includes(qid)) bucket.marketIds.push(qid);
					if (bucket.wonByQid[qid] === undefined) bucket.wonByQid[qid] = venueWon;
				}

				const singleInGroup = block.venuePositions.length === 1 && block.luMarkets.length === 0;
				const columnLabel = getVenueHistoryMarketColumnLabel(
					pos.marketTitle,
					pos,
					singleInGroup,
				);
				if (
					!bucket.label ||
					(isGenericBinaryOutcomeLabel(bucket.label) &&
						!isGenericBinaryOutcomeLabel(columnLabel))
				) {
					bucket.label = columnLabel;
				}
				if (!bucket.outcomeText) {
					bucket.outcomeText = winnerLabelFromVenuePosition(pos, {
						vsTitleHint: umbrellaTitle,
					});
				}
			}

			const rows: MergedHistoryRow[] = [];
			for (const side of ["Yes", "No"] as const) {
				const b = sideBuckets[side];
				if (!b.hasData) continue;

				const sideLower = side.toLowerCase();
				/**
				 * Cash-flow accounting (replaces the old FIFO `getFinalAmount` /
				 * `getTradingReturns` denominator). Total Cost = the actual net dollars
				 * deployed across every fill on this side. The previous code normalized
				 * the percent against the FIFO cost basis of leftover shares only — for
				 * a near-flat round trip (e.g. bought 7.03, sold 7.02) that denominator
				 * collapses to ~$0.01 and any tiny loss reads as `-2200%`. Using
				 * `usdcValue` directly also avoids the rounded `price` field producing
				 * wrong realized P&L. Mirror of `HistoryView.tsx` table layout.
				 */
				let finalShares = 0;
				let totalCashOut = 0;
				let totalCashIn = 0;
				let payout = 0;
				let tradeCount = 0;

				for (const qid of b.marketIds) {
					const qNorm = normalizeOrderQuestionIdKey(String(qid));
					let qidShares = 0;
					for (const o of allOrders) {
						if (
							normalizeOrderQuestionIdKey(String(o.questionId ?? "")) !== qNorm
						) {
							continue;
						}
						if (!o.filled) continue;
						if (o.position?.toLowerCase() !== sideLower) continue;
						const shares =
							typeof o.tokenValue === "number" && Number.isFinite(o.tokenValue)
								? o.tokenValue
								: 0;
						const cash =
							typeof o.usdcValue === "number" && Number.isFinite(o.usdcValue)
								? o.usdcValue
								: 0;
						if (o.side === "buy") {
							qidShares += shares;
							totalCashOut += cash;
						} else if (o.side === "sell") {
							qidShares -= shares;
							totalCashIn += cash;
						}
					}
					finalShares += qidShares;

					if (b.wonByQid[qid] && qidShares > 0) {
						payout += qidShares;
					}

					tradeCount += getTradeCount(allOrders, qid, side);
				}

				const netCashSpent = totalCashOut - totalCashIn;
				const displayCost = Math.max(netCashSpent, 0);
				const totalReturn = payout + totalCashIn - totalCashOut;
				const retDenom = displayCost > 0 ? displayCost : totalCashOut;
				const retPct =
					retDenom > 0 ? (totalReturn / retDenom) * 100 : null;
				const outcomeColor = totalReturn >= 0 ? "#16a34a" : "#ef4444";
				const fallbackOutcome = b.outcomeText
					? shortTeamDisplayName(b.outcomeText)
					: "—";
				rows.push({
					side,
					label: b.label || side,
					finalPosition: finalShares,
					outcomeText: blockOutcomeShort ?? fallbackOutcome,
					outcomeColor,
					totalCost: displayCost,
					totalPayout: payout,
					totalReturn,
					totalReturnPct: retPct,
					tradeCount,
					marketIds: b.marketIds,
				});
			}
			return { block, rows };
		});
	}, [unifiedBlocks, allOrders, resolvedMarketsByUmbrella, matchedMarkets, umbrellas]);

	if (unifiedBlocks.length === 0) {
		return (
			<div style={{ textAlign: "center", padding: "40px", color: "#888" }}>
				<p>No resolved markets with trading history found.</p>
				<p style={{ fontSize: "14px", marginTop: "8px" }}>Only resolved markets where you have trading history will appear here.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-12">
			{mergedRowsByBlock.map(({ block, rows }) => {
				const blockUmbrellaTitle = umbrellaHeaderLabel(block.umbrella);
				return (
					<div key={block.id} className="umbrella-card">
						{rows.map((row) => {
							const cardId = `${block.id}-${row.side}`;
							const isDetailOpen = expandedCards.has(cardId);
							const thKey = `${block.id}-${row.side}-th`;
							const isThExpanded = expandedTradeHistory.has(thKey);
							const tradeListMarketTitle =
								(block.venuePositions.find((p) => p.marketTitle?.trim())
									?.marketTitle ?? "")
									.trim() || umbrellaHeaderLabel(block.umbrella) || undefined;

							const retC = row.totalReturn >= 0 ? "#16a34a" : "#ef4444";
							const retT = (() => {
								const s = row.totalReturn >= 0 ? "+" : "-";
								const u = `$${Math.abs(row.totalReturn).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
								if (row.totalReturnPct === null || !isFinite(row.totalReturnPct)) return `${s}${u}`;
								const sp = row.totalReturnPct >= 0 ? "+" : "-";
								return `${s}${u} (${sp}${formatHistoryReturnPctAbs(row.totalReturnPct)}%)`;
							})();

							return (
								<div key={cardId} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
									{/* Card Header */}
									<div style={{ padding: "16px", background: "#0a0a0a", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "center", gap: 12 }}>
										<UmbrellaImage umbrella={block.umbrella} size={40} />
										<div style={{ flex: 1 }}>
											<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
												{blockUmbrellaTitle}
											</div>
											<div style={{ color: "#fff", fontSize: 16, fontWeight: 600 }}>{row.label}</div>
										</div>
									</div>

									{/* Summary row */}
									<div
										onClick={() => setExpandedCards((p) => toggle(p, cardId))}
										style={{ padding: "16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", background: isDetailOpen ? "#0f0f0f" : "transparent" }}
									>
										<div style={{ flex: 1 }}>
											<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Outcome</div>
											<div style={{ color: row.outcomeColor, fontSize: 16, fontWeight: 700 }}>{row.outcomeText}</div>
										</div>
										<div style={{ flex: 1, textAlign: "right" }}>
											<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>Return</div>
											<div style={{ color: retC, fontSize: 16, fontWeight: 500 }}>{retT}</div>
										</div>
										<div style={{ marginLeft: 12, color: "#888", fontSize: 20, width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", transition: "transform 0.2s ease", transform: isDetailOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
											▼
										</div>
									</div>

									{/* Expanded details */}
									{isDetailOpen && (
										<div style={{ padding: "16px", borderTop: "1px solid #2a2a2a", background: "#0f0f0f", display: "flex", flexDirection: "column", gap: 12 }}>
											<div style={{ display: "flex", justifyContent: "space-between" }}>
												<span style={{ color: "#888", fontSize: 13 }}>Position</span>
												<span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{row.finalPosition >= 0 ? row.finalPosition.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</span>
											</div>
											<div style={{ display: "flex", justifyContent: "space-between" }}>
												<span style={{ color: "#888", fontSize: 13 }}>Cost</span>
												<span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{row.totalCost > 0 ? `$${row.totalCost.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—"}</span>
											</div>
											<div style={{ display: "flex", justifyContent: "space-between" }}>
												<span style={{ color: "#888", fontSize: 13 }}>Payout</span>
												<span style={{ color: row.totalPayout > 0 ? "#16a34a" : "#fff", fontSize: 13, fontWeight: 600 }}>{row.totalPayout > 0 ? `$${row.totalPayout.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "$0"}</span>
											</div>
											{row.tradeCount > 0 && (
												<div
													onClick={(e) => { e.stopPropagation(); setExpandedTradeHistory((p) => toggle(p, thKey)); }}
													style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #1f1f1f", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, color: "#666", fontSize: 13, cursor: "pointer" }}
												>
													<span>{isThExpanded ? "Hide" : "View"} {row.tradeCount} trade{row.tradeCount !== 1 ? "s" : ""}</span>
													<span style={{ transition: "transform 0.2s", transform: isThExpanded ? "rotate(180deg)" : "rotate(0deg)", fontSize: 10 }}>▼</span>
												</div>
											)}
											{isThExpanded && (
												<TradeHistoryListMobile
													orders={allOrders}
													marketId={row.marketIds}
													isExpanded={true}
													position={row.side}
													positionDisplayLabel={row.label}
													marketTitle={tradeListMarketTitle}
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
