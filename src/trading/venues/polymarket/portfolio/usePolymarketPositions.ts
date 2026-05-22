import { useQuery } from "@tanstack/react-query";
import type {
	VenuePosition,
	PolymarketDataApiPosition,
} from "@/types/trading/venuePosition";

const POLYMARKET_DATA_API = "https://data-api.polymarket.com";
/**
 * Avoid an indefinite React Query pending state when Polymarket's API hangs.
 * 60 s gives the in-page fetch room to complete in a single attempt under the
 * connection-pool pressure that follows a LiFi prefund — a hard reload (fresh
 * connection pool) is usually back in ~10 s, but the same fetch from a
 * long-lived tab can stretch to 30–45 s. The previous 25 s cap was tripping
 * the global `retry: 1`, leaving the query in error state and the post-trade
 * spinner up for ~2 minutes.
 */
const POLY_POSITIONS_FETCH_MS = 60_000;

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
		isNegRisk: raw.negativeRisk === true,
	};
}

async function fetchPolymarketPositions(
	safeAddress: string
): Promise<VenuePosition[]> {
	const url = `${POLYMARKET_DATA_API}/positions?user=${safeAddress}`;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), POLY_POSITIONS_FETCH_MS);
	let res: Response;
	try {
		res = await fetch(url, { signal: controller.signal });
	} finally {
		clearTimeout(timeoutId);
	}
	if (!res.ok) {
		throw new Error(`Polymarket positions API returned ${res.status}`);
	}
	const raw: PolymarketDataApiPosition[] = await res.json();
	return raw.map(toVenuePosition);
}

/**
 * Fetches all open Polymarket positions for the given Safe address.
 * Public Data API — no auth.
 */
export function usePolymarketPositions(safeAddress: string | undefined | null) {
	const safeLower = safeAddress?.toLowerCase() ?? null;
	return useQuery<VenuePosition[]>({
		queryKey: ["polymarket-positions", safeLower],
		enabled: Boolean(safeAddress),
		staleTime: 30_000,
		queryFn: async () => {
			if (!safeAddress?.trim() || !safeLower) {
				throw new Error("polymarket-positions: missing Safe address");
			}
			return fetchPolymarketPositions(safeLower);
		},
	});
}
