import type { QueryClient } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type {
	RouteExecution,
	RouteLeg,
	RoutePlan,
	SorSide,
} from "@/trading/sor/sor-types";
import { registerPredictShareFloorFromRow } from "./predictPositionsRefetchMerge";

/**
 * Optimistic Predict.fun position updates after SOR — the proxied
 * `/api/predict/positions/:wallet` endpoint can lag the on-chain state.
 *
 * Mirrors `applyOptimisticPolymarketFillToQueryCache` but Predict's identity
 * is `(numericMarketId, outcomeName)`; we don't synthesize a hard `tokenId`
 * for new rows because the next server refetch will replace it anyway.
 */

function predictMarketIdForLeg(leg: RouteLeg): number | null {
	const raw =
		leg.outcome === "A"
			? leg.venueMarketIds.predictFunMarketIdA
			: leg.venueMarketIds.predictFunMarketIdB;
	if (!raw) return null;
	const n = Number(raw);
	return Number.isFinite(n) ? n : null;
}

function mergePredictLeg(
	prev: VenuePosition[],
	leg: RouteLeg,
	filledShares: number,
	side: SorSide,
	marketTitleHint: string,
): VenuePosition[] {
	const numericMarketId = predictMarketIdForLeg(leg);
	if (numericMarketId == null) return prev;

	// Predict route legs always trade the YES token of the chosen side's market.
	const outcomeName = "Yes";

	const idx = prev.findIndex(
		(p) =>
			p.venue === "predictfun" &&
			p.numericMarketId === numericMarketId &&
			(p.outcome ?? "").trim().toLowerCase() === outcomeName.toLowerCase(),
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
			venue: "predictfun",
			marketTitle: marketTitleHint.trim() || "Predict",
			outcome: outcomeName,
			shares: filledShares,
			avgPrice,
			currentPrice: avgPrice,
			cost: avgPrice != null ? avgPrice * filledShares : null,
			currentValue: avgPrice != null ? avgPrice * filledShares : 0,
			pnl: null,
			pnlPercent: null,
			tokenId: "",
			numericMarketId,
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
 * Apply filled Predict legs to the React Query cache and register share floors
 * so the next refetch cannot regress.
 */
export function applyOptimisticPredictFillToQueryCache(
	queryClient: QueryClient,
	walletAddress: string | null | undefined,
	route: RoutePlan | null | undefined,
	execution: RouteExecution | null | undefined,
	marketTitleHint: string,
): void {
	const addr = walletAddress?.trim().toLowerCase();
	if (!addr || !route || !execution) return;
	if (execution.routeId !== route.routeId) return;

	const key = ["predict-positions", addr] as const;

	queryClient.setQueryData<VenuePosition[]>(key, (prev) => {
		let rows = [...(prev ?? [])];
		let changed = false;
		for (let i = 0; i < execution.legs.length; i++) {
			const ex = execution.legs[i];
			const rl = route.legs[i];
			if (!rl || ex.venue !== "predictfun" || rl.venue !== "predictfun") {
				continue;
			}
			if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;
			const next = mergePredictLeg(
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
				if (!rl || ex.venue !== "predictfun" || rl.venue !== "predictfun") {
					continue;
				}
				if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;
				const numericMarketId = predictMarketIdForLeg(rl);
				if (numericMarketId == null) continue;
				const row = rows.find(
					(r) =>
						r.venue === "predictfun" &&
						r.numericMarketId === numericMarketId &&
						(r.outcome ?? "").trim().toLowerCase() === "yes",
				);
				if (row) registerPredictShareFloorFromRow(addr, row);
			}
		}

		return changed ? rows : prev;
	});
}
