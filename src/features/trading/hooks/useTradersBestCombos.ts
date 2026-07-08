import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type ComboHighlightRow,
	type LiveComboRow,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

export interface UseTradersBiggestComboWinsArgs {
	sport: TraderSportFilter;
	window?: TraderWindow;
	limit?: number;
	enabled?: boolean;
}

/** Biggest resolved winning combos (Best Combos → Won). */
export function useTradersBiggestComboWins(args: UseTradersBiggestComboWinsArgs) {
	const window = args.window ?? "all";
	const limit = args.limit ?? 50;
	return useQuery<{
		sport: TraderSportFilter;
		window: TraderWindow;
		entries: ComboHighlightRow[];
	}>({
		queryKey: tradingQueryKeys.tradersBiggestComboWins(args.sport, window, limit),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchBiggestComboWins(
				{ sport: args.sport, window, limit },
				signal,
			),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}

export interface UseTradersLiveCombosArgs {
	sport: TraderSportFilter;
	limit?: number;
	enabled?: boolean;
}

/** Biggest combos still riding (Best Combos → Live). */
export function useTradersLiveCombos(args: UseTradersLiveCombosArgs) {
	const limit = args.limit ?? 50;
	return useQuery<{ sport: TraderSportFilter; entries: LiveComboRow[] }>({
		queryKey: tradingQueryKeys.tradersLiveCombos(args.sport, limit),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchBiggestLiveCombos({ sport: args.sport, limit }, signal),
		enabled: args.enabled ?? true,
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}
