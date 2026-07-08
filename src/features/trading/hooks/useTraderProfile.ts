import { useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type TraderProfile,
} from "@/services/api/whaleTrackerService";

export function useTraderProfile(address: string | undefined) {
	const lowered = address?.toLowerCase() ?? "";
	return useQuery<TraderProfile>({
		queryKey: tradingQueryKeys.traderProfile(lowered || "unknown"),
		queryFn: ({ signal }) => whaleTrackerService.fetchProfile(lowered, signal),
		enabled: /^0x[0-9a-fA-F]{40}$/.test(lowered),
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
	});
}
