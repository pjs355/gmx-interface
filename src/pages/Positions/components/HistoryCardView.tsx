import React, { useState, useMemo } from "react";
import { getFinalAmount, type ProcessedOrder } from "@/services/api/simplifiedOrderService";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import TradeHistoryListMobile from "./TradeHistoryListMobile";
import UmbrellaImage from "./UmbrellaImage";
import { stripUmbrellaDisplayPrefix, titlesMatchVenue } from "@/helpers/umbrellaDisplayName";
import { getVenueHistoryMarketColumnLabel } from "@/trading/predict/predictPositionLabel";
import { getTradeCount, getNetCashFlow } from "../utils/positionHelpers";
import {
	resolveCanonicalMatchWinner,
	shortTeamDisplayName,
	winnerLabelFromLevelUpTitle,
	winnerLabelFromVenuePosition,
} from "../utils/historyOutcomeWinner";

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
	returnsByQid,
	orders,
	resolvedMarketsByUmbrella,
	venueHistory = [],
}: {
	returnsByQid: Record<string, { Yes: number; No: number }>;
	orders: any[];
	resolvedMarketsByUmbrella: Record<string, any[]>;
	venueHistory?: VenuePosition[];
}) {
	const { umbrellas } = usePredictionData();
	const { appState } = useOddsMonitor();
	const matchedMarkets = appState?.markets ?? null;
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
			if (pos.shares <= 0) continue;
			const venueName = pos.venue === "predictfun" ? "Predict.fun" : pos.venue === "polymarket" ? "Polymarket" : pos.venue === "dflow" ? "DFlow" : pos.venue;
			const position: "Yes" | "No" = pos.outcome.toLowerCase() === "yes" || pos.outcome.toLowerCase() !== "no" ? "Yes" : "No";
			synth.push({
				orderId: `synth-vh-${pos.tokenId}`, questionId: pos.tokenId, tokenId: pos.tokenId,
				side: "buy", position, price: pos.avgPrice ?? 0, size: pos.shares,
				filled: true, filledAt: null, createdAt: new Date().toISOString(),
				usdcValue: pos.cost ?? pos.shares * (pos.avgPrice ?? 0), tokenValue: pos.shares, venue: venueName,
			});
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

		const matchedTokenIds = new Set<string>();
		for (const pos of venueHistory) {
			const matched = umbrellas.find((u) => u.displayName && titlesMatchVenue(u.displayName, pos.marketTitle ?? ""));
			if (matched && blocks.has(matched._id)) {
				blocks.get(matched._id)!.venuePositions.push(pos);
				matchedTokenIds.add(pos.tokenId);
			}
		}

		const unmatchedByTitle = new Map<string, VenuePosition[]>();
		for (const pos of venueHistory) {
			if (matchedTokenIds.has(pos.tokenId)) continue;
			const key = stripUmbrellaDisplayPrefix(pos.marketTitle) || pos.marketTitle;
			const arr = unmatchedByTitle.get(key) ?? [];
			arr.push(pos);
			unmatchedByTitle.set(key, arr);
		}
		for (const [title, positions] of unmatchedByTitle) {
			const matched = umbrellas.find((u) => u.displayName && titlesMatchVenue(u.displayName, title));
			const synth = matched ?? {
				_id: `venue-hist-${title.slice(0, 20)}`, displayName: title,
				children: [], originalChildren: [],
				createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), __v: 0,
				_polyIcon: positions[0].iconUrl,
			} as any;
			blocks.set(synth._id, { id: synth._id, umbrella: synth, luMarkets: [], venuePositions: positions });
		}

		return Array.from(blocks.values());
	}, [resolvedMarketsByUmbrella, orders, umbrellas, venueHistory]);

	const mergedRowsByBlock = useMemo(() => {
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
				const side: "Yes" | "No" = pos.outcome.toLowerCase() === "yes" || pos.outcome.toLowerCase() !== "no" ? "Yes" : "No";
				const bucket = sideBuckets[side];
				bucket.hasData = true;
				bucket.marketIds.push(pos.tokenId);

				const safeShares = pos.shares != null && isFinite(pos.shares) ? pos.shares : 0;
				bucket.finalPosition += safeShares;

				const safeCost = pos.cost != null && isFinite(pos.cost) ? pos.cost : 0;
				bucket.totalCost += safeCost;

				const isWon = pos.outcomeResult === "WON";
				const payout = isWon ? (pos.pnl != null && isFinite(pos.pnl) && pos.cost != null ? pos.cost + pos.pnl : safeShares) : 0;
				bucket.totalPayout += payout;

				const ret = pos.pnl != null && isFinite(pos.pnl) ? pos.pnl : payout - safeCost;
				bucket.totalReturn += ret;

				bucket.tradeCount += 1;

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
	}, [unifiedBlocks, orders, returnsByQid, resolvedMarketsByUmbrella, matchedMarkets]);

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
				const umbrellaHeaderLabel = stripUmbrellaDisplayPrefix(block.umbrella.displayName);
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
								return `${s}${u} (${sp}${Math.round(Math.abs(row.totalReturnPct))}%)`;
							})();

							return (
								<div key={cardId} style={{ background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
									{/* Card Header */}
									<div style={{ padding: "16px", background: "#0a0a0a", borderBottom: "1px solid #2a2a2a", display: "flex", alignItems: "center", gap: 12 }}>
										<UmbrellaImage umbrella={block.umbrella} size={40} />
										<div style={{ flex: 1 }}>
											<div style={{ color: "#888", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 }}>
												{umbrellaHeaderLabel}
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
