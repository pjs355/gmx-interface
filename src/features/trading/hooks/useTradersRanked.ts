import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type RankedLeaderboardResponse,
	type TraderCategory,
	type TraderMetric,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

export interface UseTradersRankedArgs {
	metric: TraderMetric;
	sport: TraderSportFilter;
	window?: TraderWindow;
	category?: TraderCategory;
	limit?: number;
	enabled?: boolean;
}

/**
 * Wallet-aggregate leaderboard sortable by PnL / ROI / Volume. The backend
 * returns every metric on every row so tab-switching between the three sorts
 * is a re-sort at display time when we prefetch the sibling metrics.
 */
export function useTradersRanked(args: UseTradersRankedArgs) {
	const window = args.window ?? "all";
	const category = args.category ?? "trader";
	const limit = args.limit ?? 50;
	return useQuery<RankedLeaderboardResponse>({
		queryKey: tradingQueryKeys.tradersRanked(
			args.metric,
			args.sport,
			window,
			category,
			limit,
		),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchRanked(
				{
					metric: args.metric,
					sport: args.sport,
					window,
					category,
					limit,
				},
				signal,
			),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}
