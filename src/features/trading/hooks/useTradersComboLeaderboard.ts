import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type ComboLeaderboardEntry,
	type ComboLeaderboardType,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

export interface UseTradersComboLeaderboardArgs {
	type: ComboLeaderboardType;
	sport: TraderSportFilter;
	window?: TraderWindow;
	limit?: number;
	enabled?: boolean;
}

/** Wallet-aggregated combo leaderboard (Combo Traders tab). */
export function useTradersComboLeaderboard(args: UseTradersComboLeaderboardArgs) {
	const window = args.window ?? "all";
	const limit = args.limit ?? 50;
	return useQuery<{
		type: ComboLeaderboardType;
		sport: TraderSportFilter;
		window: TraderWindow;
		entries: ComboLeaderboardEntry[];
	}>({
		queryKey: tradingQueryKeys.tradersComboLeaderboard(args.type, args.sport, window, limit),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchComboLeaderboard(
				{ type: args.type, sport: args.sport, window, limit },
				signal,
			),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}
