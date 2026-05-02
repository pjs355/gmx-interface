import type { QueryClient } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type {
	RouteExecution,
	RouteLeg,
	RoutePlan,
	SorSide,
} from "@/trading/sor/sor-types";
import { canonicalLimitlessTokenId } from "./limitlessTokenId";
import { limitlessQueryKeys } from "./limitlessQueryKeys";
import { registerLimitlessShareFloorFromRow } from "./limitlessPositionsRefetchMerge";

/**
 * Optimistic Limitless position updates after SOR. Mirrors the Polymarket
 * pattern but keys by `canonicalLimitlessTokenId(tokenId)`.
 */

function limitlessTokenIdForLeg(leg: RouteLeg): string | null {
	const tid =
		leg.outcome === "A"
			? leg.venueMarketIds.limitlessTokenIdA
			: leg.venueMarketIds.limitlessTokenIdB;
	const trimmed = tid?.trim();
	return trimmed ? trimmed : null;
}

function mergeLimitlessLeg(
	prev: VenuePosition[],
	leg: RouteLeg,
	filledShares: number,
	side: SorSide,
	marketTitleHint: string,
): VenuePosition[] {
	const rawTokenId = limitlessTokenIdForLeg(leg);
	if (!rawTokenId) return prev;
	const canonTok = canonicalLimitlessTokenId(rawTokenId);
	if (!canonTok) return prev;

	const idx = prev.findIndex(
		(p) =>
			p.venue === "limitless" &&
			canonicalLimitlessTokenId(p.tokenId) === canonTok,
	);

	if (side === "buy") {
		const avgPrice = Number.isFinite(leg.avgPrice) ? leg.avgPrice : null;
		const slug = leg.venueMarketIds.limitlessSlug?.trim();

		if (idx >= 0) {
			const row = prev[idx]!;
			const newShares = row.shares + filledShares;
			const copy = [...prev];
			copy[idx] = {
				...row,
				shares: newShares,
				currentValue:
					row.currentPrice != null
						? row.currentPrice * newShares
						: avgPrice != null
							? avgPrice * newShares
							: row.currentValue,
			};
			return copy;
		}

		const row: VenuePosition = {
			venue: "limitless",
			marketTitle: marketTitleHint.trim() || slug || "Limitless",
			outcome: "Yes",
			shares: filledShares,
			avgPrice,
			currentPrice: avgPrice,
			cost: avgPrice != null ? avgPrice * filledShares : null,
			currentValue: avgPrice != null ? avgPrice * filledShares : 0,
			pnl: null,
			pnlPercent: null,
			tokenId: canonTok,
			...(slug ? { eventSlug: slug } : {}),
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

export function applyOptimisticLimitlessFillToQueryCache(
	queryClient: QueryClient,
	route: RoutePlan | null | undefined,
	execution: RouteExecution | null | undefined,
	marketTitleHint: string,
): void {
	if (!route || !execution) return;
	if (execution.routeId !== route.routeId) return;

	const key = limitlessQueryKeys.positionsVenue;

	queryClient.setQueryData<VenuePosition[]>(key, (prev) => {
		let rows = [...(prev ?? [])];
		let changed = false;
		for (let i = 0; i < execution.legs.length; i++) {
			const ex = execution.legs[i];
			const rl = route.legs[i];
			if (!rl || ex.venue !== "limitless" || rl.venue !== "limitless") {
				continue;
			}
			if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;
			const next = mergeLimitlessLeg(
				rows,
				rl,
				ex.filledShares,
				route.side,
				marketTitleHint,
			);
			if (next !== rows) changed = true;
			rows = next;
		}

		if (changed && route.side === "buy") {
			for (let i = 0; i < execution.legs.length; i++) {
				const ex = execution.legs[i];
				const rl = route.legs[i];
				if (!rl || ex.venue !== "limitless" || rl.venue !== "limitless") {
					continue;
				}
				if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;
				const tok = limitlessTokenIdForLeg(rl);
				if (!tok) continue;
				const canon = canonicalLimitlessTokenId(tok);
				const row = rows.find(
					(r) =>
						r.venue === "limitless" &&
						canonicalLimitlessTokenId(r.tokenId) === canon,
				);
				if (row) registerLimitlessShareFloorFromRow(row);
			}
		}

		return changed ? rows : prev;
	});
}
