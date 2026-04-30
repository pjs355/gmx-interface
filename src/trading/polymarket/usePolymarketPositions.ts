import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
	VenuePosition,
	PolymarketDataApiPosition,
} from "@/types/trading/venuePosition";
import { mergePolymarketFetchWithFloors } from "@/trading/polymarket/polymarketPositionsRefetchMerge";

const POLYMARKET_DATA_API = "https://data-api.polymarket.com";

function toVenuePosition(raw: PolymarketDataApiPosition): VenuePosition {
	return {
		venue: "polymarket",
		marketTitle: raw.title,
		outcome: raw.outcome,
		shares: raw.size,
		avgPrice: raw.avgPrice,
		currentPrice: raw.curPrice,
		cost: raw.initialValue,
		currentValue: raw.currentValue,
		pnl: raw.cashPnl,
		pnlPercent: raw.percentPnl,
		tokenId: raw.asset,
		conditionId: raw.conditionId,
		eventSlug: raw.eventSlug,
		iconUrl: raw.icon,
		redeemable: raw.redeemable,
	};
}

async function fetchPolymarketPositions(
	safeAddress: string
): Promise<VenuePosition[]> {
	const url = `${POLYMARKET_DATA_API}/positions?user=${safeAddress}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Polymarket positions API returned ${res.status}`);
	}
	const raw: PolymarketDataApiPosition[] = await res.json();
	return raw.map(toVenuePosition);
}

/**
 * Fetches all open Polymarket positions for the given Safe address.
 * Public Data API — no auth. Refetch results are merged with
 * {@link mergePolymarketFetchWithFloors} so stale indexer responses don’t drop
 * optimistic fills (see `POLYMARKET_TRADING.md`).
 */
export function usePolymarketPositions(safeAddress: string | undefined | null) {
	const queryClient = useQueryClient();
	const safeLower = safeAddress?.toLowerCase() ?? null;
	return useQuery<VenuePosition[]>({
		queryKey: ["polymarket-positions", safeLower],
		enabled: Boolean(safeAddress),
		staleTime: 30_000,
		queryFn: async () => {
			if (!safeAddress?.trim() || !safeLower) {
				throw new Error("polymarket-positions: missing Safe address");
			}
			const server = await fetchPolymarketPositions(safeLower);
			const previous = queryClient.getQueryData<VenuePosition[]>([
				"polymarket-positions",
				safeLower,
			]);
			return mergePolymarketFetchWithFloors(safeLower, server, previous);
		},
	});
}
