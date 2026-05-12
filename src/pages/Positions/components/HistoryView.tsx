import React, { useEffect, useState, useMemo } from "react";
import {
	normalizeOrderQuestionIdKey,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import Tooltip from "components/Tooltip/Tooltip";
import ScrollableTable from "components/ScrollableTable/ScrollableTable";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import TradeHistoryList from "./TradeHistoryList";
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

export default function HistoryView({
	umbrellaBalances,
	orders,
	resolvedMarketsByUmbrella,
	venueHistory = [],
	catalogUmbrellas,
	venueHistoryRawItemsForDebug,
	historyResolveStage,
}: {
	umbrellaBalances: any[];
	orders: any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
	venueHistory?: VenuePosition[];
	/** Pre-resolve venue merge rows from `usePositionsData` (FULL HISTORY debug). */
	venueHistoryRawItemsForDebug?: VenuePosition[];
	/** Merged active + resolve payloads (e.g. inactive) for History lookups only. */
	catalogUmbrellas?: Umbrella[];
	/** `POST /api/umbrellas/resolve-venue-history` status + row id counts for `FULL HISTORY`. */
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

	const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());

	const toggleMarketExpansion = (key: string) => {
		setExpandedMarkets((prev) => {
			const n = new Set(prev);
			if (n.has(key)) n.delete(key); else n.add(key);
			return n;
		});
	};

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
			layout: "table",
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

	const venueHistorySyntheticOrders = useMemo(() => {
		const synth: ProcessedOrder[] = [];
		for (const pos of venueHistory) {
			synth.push(...venueHistoryPositionToSyntheticOrders(pos));
		}
		return synth;
	}, [venueHistory]);

	const allOrders = useMemo(() => [...orders, ...venueHistorySyntheticOrders], [orders, venueHistorySyntheticOrders]);

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
					debugLimitlessPortfolio("History tab UI: limitless venueHistory row → bucket + labels", {
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
				 * wrong realized P&L.
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

				/**
				 * Net dollars still in the position after netting buys vs sells. When
				 * the user already cashed out more than they spent (e.g. bought $50,
				 * sold $70), this goes negative and Total Cost clamps to $0 — they're
				 * already cash-positive and the % falls back to gross capital deployed.
				 */
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
		<div className="flex flex-col gap-8">
			<ScrollableTable minWidth="700px">
				<div
					className="grid items-center px-12 py-10"
					style={{ gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr) 80px", borderBottom: "1px solid #333333", color: "#888", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6 }}
				>
					<div>Market</div>
					<div style={{ textAlign: "center" }}>Final Position</div>
					<div style={{ textAlign: "center" }}>Outcome</div>
					<div style={{ textAlign: "center" }}>Total Cost</div>
					<div style={{ textAlign: "center" }}>Total Payout</div>
					<div style={{ textAlign: "center" }}>
						<Tooltip content="Total return includes total payout of current positions and any past gains you have bought or sold." position="top">Total Return</Tooltip>
					</div>
					<div style={{ textAlign: "center" }}>Trades</div>
				</div>

				<div className="flex flex-col">
					{mergedRowsByBlock.map(({ block, rows }) => (
						<div key={block.id} className="umbrella-block">
							<div
								className="grid px-12 py-10"
								style={{
									gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr) 80px",
									background: "#000000",
									borderBottom: "1px solid #1f1f1f",
									paddingTop: 16, paddingBottom: 16,
								}}
							>
								<div style={{ gridColumn: "1 / -1", fontWeight: 700, color: "#dedede", fontSize: 20, display: "flex", alignItems: "center", gap: "12px" }}>
									<UmbrellaImage umbrella={block.umbrella} />
									{umbrellaHeaderLabel(block.umbrella)}
								</div>
							</div>

							{rows.map((row) => {
								const expandKey = `${block.id}-${row.side}`;
								const isExp = expandedMarkets.has(expandKey);
								const tradeListMarketTitle =
									(block.venuePositions.find((p) => p.marketTitle?.trim())
										?.marketTitle ?? "")
										.trim() || umbrellaHeaderLabel(block.umbrella) || undefined;

								const costText = row.totalCost > 0 ? `$${row.totalCost.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "—";
								const payoutText = row.totalPayout > 0 ? `$${row.totalPayout.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : "$0";
								const payoutColor = row.totalPayout > 0 ? "#16a34a" : "#fff";
								const retC = row.totalReturn >= 0 ? "#16a34a" : "#ef4444";
								const retT = (() => {
									const s = row.totalReturn >= 0 ? "+" : "-";
									const u = `$${Math.abs(row.totalReturn).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
									if (row.totalReturnPct === null || !isFinite(row.totalReturnPct)) return `${s}${u}`;
									const sp = row.totalReturnPct >= 0 ? "+" : "-";
									return `${s}${u} (${sp}${formatHistoryReturnPctAbs(row.totalReturnPct)}%)`;
								})();
								const posText = row.finalPosition >= 0 ? row.finalPosition.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";

								return (
									<React.Fragment key={expandKey}>
										<div
											className="grid items-center px-12 py-12"
											style={{
												gridTemplateColumns: "minmax(200px, 2fr) repeat(5, 1fr) 80px",
												borderBottom: "1px solid #1f1f1f",
												fontSize: 16,
												cursor: row.tradeCount > 0 ? "pointer" : "default",
												transition: "background 0.15s ease",
											}}
											onClick={row.tradeCount > 0 ? () => toggleMarketExpansion(expandKey) : undefined}
											onMouseEnter={(e) => { if (row.tradeCount > 0) e.currentTarget.style.background = "#1a1a1a"; }}
											onMouseLeave={(e) => { if (row.tradeCount > 0) e.currentTarget.style.background = "transparent"; }}
										>
											<div style={{ color: "#fff", fontWeight: 600 }}>{row.label}</div>
											<div style={{ textAlign: "center", color: "#fff" }}>{posText}</div>
											<div style={{ textAlign: "center", color: row.outcomeColor, fontWeight: 600 }}>{row.outcomeText}</div>
											<div style={{ textAlign: "center", color: "#fff", fontWeight: 500 }}>{costText}</div>
											<div style={{ textAlign: "center", color: payoutColor }}>{payoutText}</div>
											<div style={{ textAlign: "center", color: retC, fontWeight: 500 }}>{retT}</div>
											<div style={{ textAlign: "center" }}>
												{row.tradeCount > 0 && (
													<button
														className={`expand-trades-btn ${isExp ? "expanded" : ""}`}
														onClick={(e) => { e.stopPropagation(); toggleMarketExpansion(expandKey); }}
													>
														<span>{row.tradeCount}</span>
														<span className="expand-icon" style={{ transform: isExp ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
													</button>
												)}
											</div>
										</div>
										{isExp && (
											<TradeHistoryList
												orders={allOrders}
												marketId={row.marketIds}
												isExpanded={isExp}
												position={row.side}
												positionDisplayLabel={row.label}
												marketTitle={tradeListMarketTitle}
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
