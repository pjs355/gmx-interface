import React, { useEffect, useState, useMemo } from "react";
import {
	getFinalAmount,
	getTradingReturns,
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
	stripUmbrellaDisplayPrefix,
	titlesMatchVenue,
	umbrellaHeaderLabel,
} from "@/helpers/umbrellaDisplayName";
import { buildUmbrellaLookupByPolymarketConditionId } from "@/trading/polymarket/polymarketConditionLookup";
import { buildUmbrellaLookupByDflowEventTicker, buildUmbrellaLookupByDflowOutcomeMint } from "@/trading/dflow/dflowUmbrellaLookup";
import { levelUpQuestionIdsForVenueHistoryRow } from "@/trading/levelUpQuestionIdsForVenueHistory";
import { getVenueHistoryMarketColumnLabel } from "@/trading/predict/predictPositionLabel";
import {
	getTradeCount,
	formatHistoryReturnPctAbs,
	venueHistoryPositionToSyntheticOrders,
	venueHistoryRowToSyntheticOrder,
	venueHistorySyntheticUmbrellaId,
} from "../utils/positionHelpers";
import {
	inferVenueHistoryYesNoSide,
	resolveCanonicalMatchWinner,
	shortTeamDisplayName,
	winnerLabelFromLevelUpTitle,
	winnerLabelFromVenuePosition,
} from "../utils/historyOutcomeWinner";
import { debugLimitlessPortfolio } from "@/trading/limitless/limitlessPortfolioDebug";
import {
	buildPredictUmbrellaLookup,
	matchVenuePositionToUmbrellaForHistory,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import {
	logFullHistoryDebug,
	type FullHistoryUnifiedBlock,
	type LogFullHistoryDebugParams,
} from "../utils/fullHistoryDebugLog";
import { sortUnifiedHistoryBlocksByLatest } from "../utils/historyActivitySort";

type UnifiedHistoryBlock = {
	id: string;
	umbrella: any;
	luMarkets: Array<{ market: any; yes: string; no: string }>;
	venuePositions: VenuePosition[];
};

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
	const { umbrellas: contextUmbrellas } = usePredictionData();
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

	const unifiedBlocks: UnifiedHistoryBlock[] = useMemo(() => {
		const blocks = new Map<string, UnifiedHistoryBlock>();

		Object.entries(resolvedMarketsByUmbrella).forEach(([umbrellaId, resolvedMarkets]) => {
			const marketsWithHistory: Array<{ market: any; yes: string; no: string }> = [];
			resolvedMarkets.forEach((market: any) => {
				const marketId = market._id || market.questionId || market.marketId;
				if (!marketId) return;
				const hasOrders = orders.some((o: any) => o.questionId === marketId);
				if (hasOrders) {
					const fa = getFinalAmount(orders, marketId);
					marketsWithHistory.push({ market, yes: fa.yesShares.toString(), no: fa.noShares.toString() });
				}
			});
			if (marketsWithHistory.length === 0) return;

			let umb = umbrellas.find((u) => u._id === umbrellaId);
			if (!umb) {
				umb = {
					_id: umbrellaId,
					displayName: resolvedMarkets[0]?.umbrellaName || `Umbrella ${umbrellaId.slice(0, 8)}...`,
					children: [], originalChildren: [],
					createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), __v: 0,
				} as any;
			}
			blocks.set(umbrellaId, { id: umbrellaId, umbrella: umb, luMarkets: marketsWithHistory, venuePositions: [] });
		});

		const placed = new WeakSet<VenuePosition>();

		for (const pos of venueHistory) {
			const uid = pos.levelUpUmbrellaId?.trim();
			if (!uid) continue;
			const fromCatalog = umbrellas.find((u) => u._id === uid);
			const dn =
				stripUmbrellaDisplayPrefix(
					pos.levelUpUmbrellaDisplayName ?? pos.marketTitle,
				).trim() || pos.marketTitle;
			const rowUmbrella: Umbrella =
				fromCatalog ??
				({
					_id: uid,
					displayName: dn || `Umbrella ${uid.slice(0, 8)}...`,
					children: [],
					originalChildren: [],
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					__v: 0,
					_polyIcon: pos.iconUrl,
				} as Umbrella);
			const existing = blocks.get(uid);
			if (!existing) {
				blocks.set(uid, {
					id: uid,
					umbrella: rowUmbrella,
					luMarkets: [],
					venuePositions: [pos],
				});
			} else {
				const cur = existing.umbrella as Umbrella;
				const prefer =
					(Array.isArray(rowUmbrella.children) && rowUmbrella.children.length > 0) ||
					(rowUmbrella as { exchangeMatching?: unknown }).exchangeMatching != null
						? rowUmbrella
						: cur;
				if (prefer !== cur) {
					existing.umbrella = prefer;
				}
				existing.venuePositions.push(pos);
			}
			placed.add(pos);
		}

		for (const pos of venueHistory) {
			if (placed.has(pos)) continue;
			const predictHint =
				pos.venue === "predictfun"
					? stripUmbrellaDisplayPrefix(pos.marketTitle) || undefined
					: undefined;
			const matchedUmb = matchVenuePositionToUmbrellaForHistory(
				pos,
				pos.venue,
				umbrellaLookupByConditionId,
				umbrellas,
				predictUmbrellaLookup,
				predictHint,
				umbrellaLookupByDflowOutcomeMint,
				umbrellaLookupByDflowEventTicker,
			);
			if (matchedUmb) {
				const id = matchedUmb._id;
				if (!blocks.has(id)) {
					blocks.set(id, {
						id,
						umbrella: matchedUmb,
						luMarkets: [],
						venuePositions: [],
					});
				}
				blocks.get(id)!.venuePositions.push(pos);
				placed.add(pos);
			}
		}

		const unmatchedByTitle = new Map<string, VenuePosition[]>();
		for (const pos of venueHistory) {
			if (placed.has(pos)) continue;
			const key = stripUmbrellaDisplayPrefix(pos.marketTitle) || pos.marketTitle;
			const arr = unmatchedByTitle.get(key) ?? [];
			arr.push(pos);
			unmatchedByTitle.set(key, arr);
		}
		for (const [title, positions] of unmatchedByTitle) {
			const matched = umbrellas.find((u) => u.displayName && titlesMatchVenue(u.displayName, title));
			const synth = matched ?? {
				_id: venueHistorySyntheticUmbrellaId(title, positions),
				displayName: title,
				children: [], originalChildren: [],
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), __v: 0,
				_polyIcon: positions[0].iconUrl,
			} as any;
			blocks.set(synth._id, { id: synth._id, umbrella: synth, luMarkets: [], venuePositions: positions });
		}

		return sortUnifiedHistoryBlocksByLatest(Array.from(blocks.values()), orders);
	}, [
		resolvedMarketsByUmbrella,
		orders,
		umbrellas,
		venueHistory,
		umbrellaLookupByConditionId,
		predictUmbrellaLookup,
		umbrellaLookupByDflowOutcomeMint,
		umbrellaLookupByDflowEventTicker,
	]);

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
			const blockCanonical = resolveCanonicalMatchWinner({
				umbrella: block.umbrella,
				matchedMarkets,
				resolvedMarketsForUmbrella: resolvedList,
				luSampleMarket: luSample,
			});
			const blockOutcomeShort = blockCanonical
				? shortTeamDisplayName(blockCanonical)
				: null;

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
				const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
				const isVs = parts.length === 2;

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
						bucket.label = isVs
							? shortTeamDisplayName(side === "Yes" ? parts[0] : parts[1])
							: side;
					}
					if (!bucket.outcomeText) {
						bucket.outcomeText = winnerLabelFromLevelUpTitle(title, resolved);
					}
				}
			}

			for (const pos of block.venuePositions) {
				const side = inferVenueHistoryYesNoSide(pos.marketTitle, pos.outcome);
				if (
					import.meta.env.DEV &&
					pos.venue === "limitless" &&
					limitlessHistUiLog < 18
				) {
					limitlessHistUiLog++;
					const synth = venueHistoryRowToSyntheticOrder(pos);
					debugLimitlessPortfolio("History tab UI: limitless venueHistory row → bucket + labels", {
						umbrella: umbrellaHeaderLabel(block.umbrella),
						rawApiOutcome: pos.outcome,
						inferredYesNoBucket: side,
						rowMarketTitle: pos.marketTitle,
						marketStatusOnRow: pos.marketStatus,
						outcomeResultOnRow: pos.outcomeResult,
						winnerColumnLabel: winnerLabelFromVenuePosition(pos),
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

				if (!bucket.label) {
					const singleInGroup = block.venuePositions.length === 1 && block.luMarkets.length === 0;
					bucket.label = getVenueHistoryMarketColumnLabel(pos.marketTitle, pos, singleInGroup);
				}
				if (!bucket.outcomeText) {
					bucket.outcomeText = winnerLabelFromVenuePosition(pos);
				}
			}

			const rows: MergedHistoryRow[] = [];
			for (const side of ["Yes", "No"] as const) {
				const b = sideBuckets[side];
				if (!b.hasData) continue;

				const sideLower = side.toLowerCase();
				let finalShares = 0;
				let finalCost = 0;
				let payout = 0;
				let realized = 0;
				let tradeCount = 0;

				for (const qid of b.marketIds) {
					let bought = 0;
					let sold = 0;
					for (const o of allOrders) {
						if (o.questionId !== qid) continue;
						if (!o.filled) continue;
						if (o.position?.toLowerCase() !== sideLower) continue;
						const shares =
							typeof o.tokenValue === "number" && Number.isFinite(o.tokenValue)
								? o.tokenValue
								: 0;
						if (o.side === "buy") bought += shares;
						else if (o.side === "sell") sold += shares;
					}
					const sharesHeld = bought - sold;
					finalShares += sharesHeld;

					const fa = getFinalAmount(allOrders, qid);
					finalCost += side === "Yes" ? fa.yesCost : fa.noCost;

					const tr = getTradingReturns(allOrders, qid);
					realized += side === "Yes" ? tr.yesPnL : tr.noPnL;

					if (b.wonByQid[qid] && sharesHeld > 0) {
						payout += sharesHeld;
					}

					tradeCount += getTradeCount(allOrders, qid, side);
				}

				const totalReturn = (payout - finalCost) + realized;
				const retPct = finalCost > 0 ? (totalReturn / finalCost) * 100 : null;
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
					totalCost: finalCost,
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
								const posText = row.finalPosition > 0 ? row.finalPosition.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—";

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
