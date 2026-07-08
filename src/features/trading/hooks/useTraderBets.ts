import { useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type TraderBet,
	type TraderSportFilter,
} from "@/services/api/whaleTrackerService";

export interface UseTraderBetsArgs {
	address: string | undefined;
	sport?: TraderSportFilter;
	limit?: number;
	offset?: number;
}

export function useTraderBets(args: UseTraderBetsArgs) {
	const lowered = args.address?.toLowerCase() ?? "";
	const sport = args.sport ?? "all";
	const limit = args.limit ?? 50;
	const offset = args.offset ?? 0;
	return useQuery<TraderBet[]>({
		queryKey: tradingQueryKeys.traderBets(lowered || "unknown", sport, limit, offset),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchBets({ address: lowered, sport, limit, offset }, signal),
		enabled: /^0x[0-9a-fA-F]{40}$/.test(lowered),
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
	});
}
