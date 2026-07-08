import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type BigBetRow,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

export interface UseTradersBigBetsArgs {
	sport: TraderSportFilter;
	window?: TraderWindow;
	limit?: number;
	minSizeUsd?: number;
	enabled?: boolean;
}

export function useTradersBigBets(args: UseTradersBigBetsArgs) {
	const window = args.window ?? "all";
	const limit = args.limit ?? 20;
	const minSizeUsd = args.minSizeUsd ?? 1000;
	return useQuery<{ sport: TraderSportFilter; window: TraderWindow; entries: BigBetRow[] }>({
		queryKey: tradingQueryKeys.tradersBigBets(args.sport, window, limit, minSizeUsd),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchBigBets(
				{
					sport: args.sport,
					window,
					limit,
					minSizeUsd,
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
