import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type NewWhalesResponse,
	type TraderSportFilter,
} from "@/services/api/whaleTrackerService";

export interface UseTradersNewWhalesArgs {
	sport: TraderSportFilter;
	limit?: number;
	minVolumeUsd?: number;
	maxAgeDays?: number;
	enabled?: boolean;
}

/** Fresh accounts already trading serious volume (New Whales tab). */
export function useTradersNewWhales(args: UseTradersNewWhalesArgs) {
	const limit = args.limit ?? 50;
	const minVolumeUsd = args.minVolumeUsd ?? 10_000;
	const maxAgeDays = args.maxAgeDays ?? 30;
	return useQuery<NewWhalesResponse>({
		queryKey: tradingQueryKeys.tradersNewWhales(args.sport, limit, minVolumeUsd, maxAgeDays),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchNewWhales(
				{ sport: args.sport, limit, minVolumeUsd, maxAgeDays },
				signal,
			),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}
