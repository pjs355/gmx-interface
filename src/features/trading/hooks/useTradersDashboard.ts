import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type TraderCategory,
	type TraderDashboardResponse,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

export interface UseTradersDashboardArgs {
	sport: TraderSportFilter;
	category: TraderCategory;
	limit?: number;
	window?: TraderWindow;
	/** Skip the fetch entirely (e.g., a different lens is active). */
	enabled?: boolean;
}

export function useTradersDashboard(args: UseTradersDashboardArgs) {
	const limit = args.limit ?? 10;
	const window = args.window ?? "all";
	return useQuery<TraderDashboardResponse>({
		queryKey: tradingQueryKeys.tradersDashboard(args.sport, args.category, limit, window),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchDashboard(
				{
					sport: args.sport,
					category: args.category,
					limit,
					window,
				},
				signal,
			),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000, // matches server-side cache
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}
