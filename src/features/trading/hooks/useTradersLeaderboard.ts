import { useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	type TraderCategory,
	type TraderLeaderboardResponse,
	type TraderLeaderboardType,
	type TraderSportFilter,
} from "@/services/api/whaleTrackerService";

export interface UseTradersLeaderboardArgs {
	type: TraderLeaderboardType;
	sport: TraderSportFilter;
	category: TraderCategory;
	limit?: number;
}

export function useTradersLeaderboard(args: UseTradersLeaderboardArgs) {
	const limit = args.limit ?? 10;
	return useQuery<TraderLeaderboardResponse>({
		queryKey: tradingQueryKeys.tradersLeaderboard(args.type, args.sport, args.category, limit),
		queryFn: () =>
			whaleTrackerService.fetchLeaderboard({
				type: args.type,
				sport: args.sport,
				category: args.category,
				limit,
			}),
		staleTime: 60_000,
	});
}
