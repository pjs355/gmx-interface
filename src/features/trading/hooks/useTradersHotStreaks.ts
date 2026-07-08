import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type HotStreakRow,
	type TraderCategory,
	type TraderSportFilter,
} from "@/services/api/whaleTrackerService";

export interface UseTradersHotStreaksArgs {
	sport: TraderSportFilter;
	category?: TraderCategory;
	limit?: number;
	minStreak?: number;
	enabled?: boolean;
}

export function useTradersHotStreaks(args: UseTradersHotStreaksArgs) {
	const category = args.category ?? "trader";
	const limit = args.limit ?? 20;
	const minStreak = args.minStreak ?? 3;
	return useQuery<{ sport: TraderSportFilter; entries: HotStreakRow[] }>({
		queryKey: tradingQueryKeys.tradersHotStreaks(args.sport, category, limit, minStreak),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchHotStreaks(
				{
					sport: args.sport,
					category,
					limit,
					minStreak,
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
