import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	shouldRetryWhaleQuery,
	type ComboPositionRow,
	type ComboStatus,
	type PnlHistoryResponse,
	type TraderSportFilter,
	type TraderStatsResponse,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

/**
 * A wallet's settled straight bets, paged by POSITION (profile → Trades →
 * Straight → Past + "Load more"). The server groups a market+side's repeat
 * buys into one position and returns every lot of it together, so a position
 * never splits across pages — the grouped total on the profile is always
 * complete. `pageSize` counts positions; the cursor comes back as `nextOffset`.
 */
export function useTraderClosedLots(address: string | undefined, pageSize = 50) {
	const lowered = address?.toLowerCase() ?? "";
	return useInfiniteQuery({
		queryKey: tradingQueryKeys.traderClosedLots(lowered || "unknown", pageSize),
		queryFn: ({ pageParam, signal }) =>
			whaleTrackerService.fetchWalletClosedLots(
				{
					address: lowered,
					sport: "all",
					window: "all",
					kind: "all",
					limit: pageSize,
					offset: pageParam,
				},
				signal,
			),
		initialPageParam: 0,
		getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
		enabled: ADDRESS_RE.test(lowered),
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
	});
}

/** Sport × window track-record stats — the profile "Track record" grid. */
export function useTraderStats(
	address: string | undefined,
	window: TraderWindow,
	sport: TraderSportFilter,
) {
	const lowered = address?.toLowerCase() ?? "";
	return useQuery<TraderStatsResponse>({
		queryKey: tradingQueryKeys.traderStats(lowered || "unknown", window, sport),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchTraderStats({ address: lowered, window, sport }, signal),
		enabled: ADDRESS_RE.test(lowered),
		staleTime: 60_000, // matches the server-side wallet cache
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		placeholderData: keepPreviousData,
	});
}

/** Cumulative realised PnL series for the profile chart. */
export function useTraderPnlHistory(
	address: string | undefined,
	window: TraderWindow,
	sport: TraderSportFilter,
) {
	const lowered = address?.toLowerCase() ?? "";
	return useQuery<PnlHistoryResponse>({
		queryKey: tradingQueryKeys.traderPnlHistory(lowered || "unknown", window, sport),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchPnlHistory({ address: lowered, window, sport }, signal),
		enabled: ADDRESS_RE.test(lowered),
		staleTime: 60_000, // matches the server-side wallet cache
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
		// Tab/sport swaps re-render over the previous curve instead of
		// blanking the chart.
		placeholderData: keepPreviousData,
	});
}

/** A wallet's combo positions, live and settled (profile → Bets → Combos). */
export function useTraderComboPositions(address: string | undefined, limit = 50) {
	const lowered = address?.toLowerCase() ?? "";
	return useQuery<{
		status: ComboStatus | "all";
		sport: TraderSportFilter;
		entries: ComboPositionRow[];
	}>({
		queryKey: tradingQueryKeys.traderComboPositions(lowered || "unknown", limit),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchWalletComboPositions(
				{ address: lowered, status: "all", sport: "all", limit },
				signal,
			),
		enabled: ADDRESS_RE.test(lowered),
		staleTime: 10 * 60_000,
		retry: shouldRetryWhaleQuery,
		gcTime: 60 * 60_000,
	});
}
