import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type ClosedLotRow,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

export interface UseTradersBiggestWinsArgs {
	sport: TraderSportFilter;
	window?: TraderWindow;
	limit?: number;
	enabled?: boolean;
}

export function useTradersBiggestWins(args: UseTradersBiggestWinsArgs) {
	const window = args.window ?? "all";
	const limit = args.limit ?? 20;
	return useQuery<{ sport: TraderSportFilter; window: TraderWindow; entries: ClosedLotRow[] }>({
		queryKey: tradingQueryKeys.tradersBiggestWins(args.sport, window, limit),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchBiggestWins({ sport: args.sport, window, limit }, signal),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}
