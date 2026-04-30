import type { QueryClient } from "@tanstack/react-query";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type { RouteExecution, RouteLeg, RoutePlan, SorSide } from "@/trading/sor/sor-types";
import {
	registerPolymarketShareFloorFromRow,
	normalizePolymarketPositionTokenId,
} from "@/trading/polymarket/polymarketPositionsRefetchMerge";

/**
 * Optimistic Polymarket position updates after SOR — Data API lags the chain; see
 * `POLYMARKET_TRADING.md` §6 and `polymarketPositionsRefetchMerge.ts` for floors.
 */
function polyTokenNormFromRouteLeg(
	leg: RouteLeg,
	matched: MatchedMarket,
): string {
	const tokenForTeamA = matched.sidesSwapped
		? matched.polyTokenIdB
		: matched.polyTokenIdA;
	const tokenForTeamB = matched.sidesSwapped
		? matched.polyTokenIdA
		: matched.polyTokenIdB;
	const tokenId = leg.outcome === "A" ? tokenForTeamA : tokenForTeamB;
	return normalizePolymarketPositionTokenId(tokenId);
}

function mergePolymarketLeg(
	prev: VenuePosition[],
	leg: RouteLeg,
	filledShares: number,
	side: SorSide,
	matched: MatchedMarket,
	marketTitleHint: string,
): VenuePosition[] {
	const tokenForTeamA = matched.sidesSwapped
		? matched.polyTokenIdB
		: matched.polyTokenIdA;
	const tokenForTeamB = matched.sidesSwapped
		? matched.polyTokenIdA
		: matched.polyTokenIdB;
	const tokenId = leg.outcome === "A" ? tokenForTeamA : tokenForTeamB;
	const tokNorm = normalizePolymarketPositionTokenId(tokenId);
	if (!tokNorm) return prev;

	const cid =
		leg.venueMarketIds.polyConditionId?.trim() ||
		matched.polyConditionId?.trim() ||
		"";
	const outcomeLabel =
		leg.outcome === "A" ? matched.pandaTeamA : matched.pandaTeamB;
	const title =
		marketTitleHint.trim() ||
		(matched.pandaTeamA && matched.pandaTeamB
			? `${matched.pandaTeamA} vs ${matched.pandaTeamB}`
			: "Polymarket");

	const idx = prev.findIndex(
		(p) =>
			p.venue === "polymarket" &&
			normalizePolymarketPositionTokenId(p.tokenId) === tokNorm,
	);

	if (side === "buy") {
		const avgPrice = Number.isFinite(leg.avgPrice) ? leg.avgPrice : null;
		if (idx >= 0) {
			const row = prev[idx]!;
			const newShares = row.shares + filledShares;
			const copy = [...prev];
			copy[idx] = {
				...row,
				shares: newShares,
				avgPrice,
				currentValue:
					avgPrice != null ? avgPrice * newShares : row.currentValue,
			};
			return copy;
		}
		const row: VenuePosition = {
			venue: "polymarket",
			marketTitle: title,
			outcome: outcomeLabel,
			shares: filledShares,
			avgPrice,
			currentPrice: avgPrice,
			cost: avgPrice != null ? avgPrice * filledShares : null,
			currentValue: avgPrice != null ? avgPrice * filledShares : 0,
			pnl: null,
			pnlPercent: null,
			tokenId: String(tokenId).trim(),
			conditionId: cid || undefined,
			redeemable: false,
		};
		return [...prev, row];
	}

	if (idx < 0) return prev;
	const row = prev[idx]!;
	const newShares = Math.max(0, row.shares - filledShares);
	if (newShares <= 0) {
		return prev.filter((_, j) => j !== idx);
	}
	const copy = [...prev];
	copy[idx] = { ...row, shares: newShares };
	return copy;
}

/**
 * After a successful SOR run, Polymarket’s Data API `/positions` index can lag the chain.
 * Merge filled legs into the React Query cache so the trade box / portfolio update immediately.
 * Also registers share floors so {@link mergePolymarketFetchWithFloors} keeps holdings visible
 * across refetches until the API catches up.
 */
export function applyOptimisticPolymarketFillToQueryCache(
	queryClient: QueryClient,
	safeAddress: string | null | undefined,
	route: RoutePlan | null | undefined,
	execution: RouteExecution | null | undefined,
	matchedMonitor: MatchedMarket | null | undefined,
	marketTitleHint: string,
): void {
	const safe = safeAddress?.trim();
	if (!safe || !route || !execution || execution.status !== "complete") return;
	if (!matchedMonitor) return;
	if (execution.routeId !== route.routeId) return;

	const key = ["polymarket-positions", safe.toLowerCase()] as const;

	queryClient.setQueryData<VenuePosition[]>(key, (prev) => {
		let rows = [...(prev ?? [])];
		let changed = false;
		for (let i = 0; i < execution.legs.length; i++) {
			const ex = execution.legs[i];
			const rl = route.legs[i];
			if (!rl || ex.venue !== "polymarket" || rl.venue !== "polymarket") {
				continue;
			}
			if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;

			const next = mergePolymarketLeg(
				rows,
				rl,
				ex.filledShares,
				route.side,
				matchedMonitor,
				marketTitleHint,
			);
			if (next !== rows) changed = true;
			rows = next;
		}

		if (changed && route.side === "buy") {
			for (let i = 0; i < execution.legs.length; i++) {
				const ex = execution.legs[i];
				const rl = route.legs[i];
				if (!rl || ex.venue !== "polymarket" || rl.venue !== "polymarket") {
					continue;
				}
				if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;
				const tok = polyTokenNormFromRouteLeg(rl, matchedMonitor);
				const row = rows.find(
					(r) => normalizePolymarketPositionTokenId(r.tokenId) === tok,
				);
				if (row) registerPolymarketShareFloorFromRow(safe, row);
			}
		}

		return changed ? rows : prev;
	});
}
