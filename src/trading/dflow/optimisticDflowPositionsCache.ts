import type { QueryClient } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type {
	RouteExecution,
	RouteLeg,
	RoutePlan,
	SorSide,
} from "@/trading/sor/sor-types";
import { registerDflowShareFloorFromRow } from "./dflowPositionsRefetchMerge";

/**
 * Optimistic DFlow / Kalshi position updates after SOR. The chain settles
 * immediately, but our `useDflowPositions` queryFn assembles positions from
 * trades + Solana RPC + market metadata — refetches can briefly miss the
 * just-bought position until trades index. The optimistic merge + floor keeps
 * the row visible.
 */

function dflowMintForLeg(leg: RouteLeg): string | null {
	const mint =
		leg.outcome === "A"
			? leg.venueMarketIds.dflowYesMintA
			: leg.venueMarketIds.dflowYesMintB;
	const trimmed = mint?.trim();
	return trimmed ? trimmed : null;
}

function mergeDflowLeg(
	prev: VenuePosition[],
	leg: RouteLeg,
	filledShares: number,
	side: SorSide,
	marketTitleHint: string,
): VenuePosition[] {
	const mint = dflowMintForLeg(leg);
	if (!mint) return prev;

	const idx = prev.findIndex(
		(p) => p.venue === "dflow" && (p.tokenId ?? "").trim() === mint,
	);

	if (side === "buy") {
		const avgPrice = Number.isFinite(leg.avgPrice) ? leg.avgPrice : null;
		// DFlow legs are always YES on the chosen-side market. Use the SOR ticker
		// if present so the row matches what the queryFn produces post-fill.
		const eventTicker = leg.venueMarketIds.dflowEventTicker?.trim();

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
			venue: "dflow",
			marketTitle: marketTitleHint.trim() || "Kalshi",
			outcome: "Yes",
			shares: filledShares,
			avgPrice,
			currentPrice: avgPrice,
			cost: avgPrice != null ? avgPrice * filledShares : null,
			currentValue: avgPrice != null ? avgPrice * filledShares : 0,
			pnl: null,
			pnlPercent: null,
			tokenId: mint,
			...(eventTicker ? { dflowEventTicker: eventTicker } : {}),
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

export function applyOptimisticDflowFillToQueryCache(
	queryClient: QueryClient,
	solanaAddress: string | null | undefined,
	route: RoutePlan | null | undefined,
	execution: RouteExecution | null | undefined,
	marketTitleHint: string,
): void {
	const owner = solanaAddress?.trim();
	if (!owner || !route || !execution) return;
	if (execution.routeId !== route.routeId) return;

	const key = ["dflow-positions", owner] as const;

	queryClient.setQueryData<VenuePosition[]>(key, (prev) => {
		let rows = [...(prev ?? [])];
		let changed = false;
		for (let i = 0; i < execution.legs.length; i++) {
			const ex = execution.legs[i];
			const rl = route.legs[i];
			if (!rl || ex.venue !== "dflow" || rl.venue !== "dflow") continue;
			if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;
			const next = mergeDflowLeg(
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
				if (!rl || ex.venue !== "dflow" || rl.venue !== "dflow") continue;
				if (ex.status !== "filled" || !(ex.filledShares > 0)) continue;
				const mint = dflowMintForLeg(rl);
				if (!mint) continue;
				const row = rows.find(
					(r) => r.venue === "dflow" && (r.tokenId ?? "").trim() === mint,
				);
				if (row) registerDflowShareFloorFromRow(owner, row);
			}
		}

		return changed ? rows : prev;
	});
}
