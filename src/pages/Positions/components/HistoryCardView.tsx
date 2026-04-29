import React, { useEffect, useState, useMemo } from "react";
import { getFinalAmount, type ProcessedOrder } from "@/services/api/simplifiedOrderService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import TradeHistoryListMobile from "./TradeHistoryListMobile";
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
	getNetCashFlow,
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

type UnifiedBlock = {
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

export default function HistoryCardView({
	umbrellaBalances,
	returnsByQid,
	orders,
	resolvedMarketsByUmbrella,
	venueHistory = [],
	catalogUmbrellas,
	venueHistoryRawItemsForDebug,
	historyResolveStage,
}: {
	umbrellaBalances?: Array<{ umbrella: Umbrella; markets: any[] }>;
	returnsByQid: Record<string, { Yes: number; No: number }>;
	orders: any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
	venueHistory?: VenuePosition[];
	catalogUmbrellas?: Umbrella[];
	venueHistoryRawItemsForDebug?: VenuePosition[];
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

	const unifiedBlocks: UnifiedBlock[] = useMemo(() => {
		const blocks = new Map<string, UnifiedBlock>();

		Object.entries(resolvedMarketsByUmbrella).forEach(([umbrellaId, resolvedMarkets]) => {
			const marketsWithHistory: Array<{ market: any; yes: string; no: string }> = [];
			resolvedMarkets.forEach((market: any) => {
				const mid = market._id || market.questionId || market.marketId;
				if (!mid) return;
				if (orders.some((o: any) => o.questionId === mid)) {
					const fa = getFinalAmount(orders, mid);
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
			const blockCanonical = resolveCanonicalMatchWinner({
				umbrella: block.umbrella,
				matchedMarkets,
				resolvedMarketsForUmbrella: resolvedList,
				luSampleMarket: luSample,
			});
			const blockOutcomeShort = blockCanonical
				? shortTeamDisplayName(blockCanonical)
				: null;

			const sideBuckets: Record<"Yes" | "No", {
				finalPosition: number; totalCost: number; totalPayout: number; totalReturn: number;
				hasData: boolean; tradeCount: number; marketIds: string[];
				label: string; outcomeText: string;
			}> = {
				Yes: { finalPosition: 0, totalCost: 0, totalPayout: 0, totalReturn: 0, hasData: false, tradeCount: 0, marketIds: [], label: "", outcomeText: "" },
				No: { finalPosition: 0, totalCost: 0, totalPayout: 0, totalReturn: 0, hasData: false, tradeCount: 0, marketIds: [], label: "", outcomeText: "" },
			};

			for (const { market } of block.luMarkets) {
				const qid = market._id || market.questionId || market.marketId;
				if (!qid) continue;
				const fa = getFinalAmount(orders, qid);
				const resolved = String((market as any).resolvedOutcome || "").toLowerCase();
				const title = (market?.displayName || (market as any)?.question || "").trim();
				const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
				const isVs = parts.length === 2;

				for (const side of ["Yes", "No"] as const) {
					const tc = getTradeCount(orders, qid, side);
					if (tc === 0) continue;
					const bucket = sideBuckets[side];
					bucket.hasData = true;
					bucket.marketIds.push(qid);

					const finalShares = side === "Yes" ? fa.yesShares : fa.noShares;
					bucket.finalPosition += finalShares;

					const ncf = getNetCashFlow(orders, qid, side);
					const cashSpent = ncf < 0 ? Math.abs(ncf) : 0;
					bucket.totalCost += cashSpent;

					const correct = (side === "Yes" && resolved === "yes") || (side === "No" && resolved === "no");
					const payout = finalShares * (correct ? 1 : 0);
					bucket.totalPayout += payout;

					const base = payout + ncf;
					const leg = returnsByQid[qid]?.[side] ?? 0;
					bucket.totalReturn += base + leg;

					bucket.tradeCount += tc;

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
					debugLimitlessPortfolio("History tab UI (card): limitless row → bucket + labels", {
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
				bucket.marketIds.push(pos.tokenId);
				for (const qid of levelUpQuestionIdsForVenueHistoryRow(umbrellas, pos)) {
					if (!bucket.marketIds.includes(qid)) bucket.marketIds.push(qid);
					bucket.tradeCount += getTradeCount(orders, qid, side);
				}

				const safeShares = pos.shares != null && isFinite(pos.shares) ? pos.shares : 0;
				bucket.finalPosition += safeShares;

				const safeCost = pos.cost != null && isFinite(pos.cost) ? pos.cost : 0;
				bucket.totalCost += safeCost;

				const isWon = pos.outcomeResult === "WON";
				const payout = isWon ? (pos.pnl != null && isFinite(pos.pnl) && pos.cost != null ? pos.cost + pos.pnl : safeShares) : 0;
				bucket.totalPayout += payout;

				const ret = pos.pnl != null && isFinite(pos.pnl) ? pos.pnl : payout - safeCost;
				bucket.totalReturn += ret;

				bucket.tradeCount += venueHistoryPositionToSyntheticOrders(pos).length;

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
				const retPct = b.totalCost > 0 ? (b.totalReturn / b.totalCost) * 100 : null;
				const outcomeColor = b.totalReturn >= 0 ? "#16a34a" : "#ef4444";
				const fallbackOutcome = b.outcomeText
					? shortTeamDisplayName(b.outcomeText)
					: "—";
				rows.push({
					side, label: b.label || side,
					finalPosition: b.finalPosition,
					outcomeText: blockOutcomeShort ?? fallbackOutcome,
					outcomeColor,
					totalCost: b.totalCost, totalPayout: b.totalPayout, totalReturn: b.totalReturn,
					totalReturnPct: retPct, tradeCount: b.tradeCount, marketIds: b.marketIds,
				});
			}
			return { block, rows };
		});
	}, [unifiedBlocks, orders, returnsByQid, resolvedMarketsByUmbrella, matchedMarkets, umbrellas]);

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
												<span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{row.finalPosition > 0 ? row.finalPosition.toLocaleString("en-US", { maximumFractionDigits: 2 }) : "—"}</span>
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
