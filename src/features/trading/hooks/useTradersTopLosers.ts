import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type TraderDashboardResponse,
	type TraderLeaderboardEntry,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

export interface UseTradersTopLosersArgs {
	sport: TraderSportFilter;
	window?: TraderWindow;
	limit?: number;
	enabled?: boolean;
}

/**
 * Trader-level biggest losers — wallets ranked by worst realised PnL in
 * the window. Distinct from "biggest losses" (individual lost bets): this
 * answers "which ACCOUNTS are down the most", not "which single bet lost
 * the most". Backed by the dashboard endpoint, whose `biggestLosers`
 * board is the window-aware `top-losers` leaderboard; the raw dashboard
 * payload shares a cache entry with `useTradersDashboard`.
 */
export function useTradersTopLosers(args: UseTradersTopLosersArgs) {
	const window = args.window ?? "all";
	const limit = args.limit ?? 20;
	return useQuery({
		queryKey: tradingQueryKeys.tradersDashboard(args.sport, "trader", limit, window),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchDashboard(
				{ sport: args.sport, category: "trader", limit, window },
				signal,
			),
		select: (data: TraderDashboardResponse): { entries: TraderLeaderboardEntry[] } => ({
			// The board sorts ascending by PnL, so on thin sport/window combos
			// wallets that are actually UP would pad the tail. A losers board
			// only shows wallets that are down.
			entries: data.biggestLosers.filter((e) => e.pnlUsd < 0),
		}),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000, // matches server-side cache
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}
