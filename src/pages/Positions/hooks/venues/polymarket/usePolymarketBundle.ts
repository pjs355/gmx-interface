import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePolymarketTradeHistory } from "@/trading/polymarket/usePolymarketTradeHistory";
import type { VenuePosition } from "@/types/trading/venuePosition";

export type UsePolymarketBundleArgs = {
	polymarketSafe: string | undefined | null;
};

export type UsePolymarketBundleResult = {
	all: VenuePosition[];
	active: VenuePosition[];
	winnings: VenuePosition[];
	history: VenuePosition[];
	positionsQuery: UseQueryResult<VenuePosition[], unknown>;
	tradeHistoryQuery: UseQueryResult<VenuePosition[], unknown>;
};

export function usePolymarketBundle({
	polymarketSafe,
}: UsePolymarketBundleArgs): UsePolymarketBundleResult {
	const positionsQuery = usePolymarketPositions(polymarketSafe);
	const tradeHistoryQuery = usePolymarketTradeHistory(polymarketSafe);
	const all = positionsQuery.data ?? [];

	const { active, winnings, history } = useMemo(() => {
		const a: VenuePosition[] = [];
		const w: VenuePosition[] = [];
		const h: VenuePosition[] = [];
		for (const pos of all) {
			if (pos.redeemable && pos.currentValue > 0) w.push(pos);
			else if (pos.redeemable) h.push(pos);
			else a.push(pos);
		}
		return { active: a, winnings: w, history: h };
	}, [all]);

	return { all, active, winnings, history, positionsQuery, tradeHistoryQuery };
}
