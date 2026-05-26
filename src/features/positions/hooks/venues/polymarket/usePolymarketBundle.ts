import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AccountPositionsSlice } from "@/context/AccountDataContext";
import { usePolymarketTradeHistory } from "@/features/trading/venues/polymarket/portfolio/usePolymarketTradeHistory";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { accountPositionsQueryShim } from "../accountPositionsQueryShim";

export type UsePolymarketBundleArgs = {
	polymarketSafe: string | undefined | null;
	/** Polymarket venue slice from `useAccountData()` — passed in so this module never calls `useAccountData` (avoids duplicate `AccountDataContext` module under Vite chunking). */
	poly: AccountPositionsSlice;
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
	poly,
}: UsePolymarketBundleArgs): UsePolymarketBundleResult {
	const all = poly.rows;
	const tradeHistoryQuery = usePolymarketTradeHistory(polymarketSafe);

	const polyEnabled = Boolean(polymarketSafe?.trim());
	const positionsQuery = useMemo(
		() => accountPositionsQueryShim(poly, all, polyEnabled),
		[poly, all, polyEnabled],
	);

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
