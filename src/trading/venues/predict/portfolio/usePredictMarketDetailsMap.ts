import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type { PredictMarketDetail } from "@/trading/venues/predict/portfolio/predictMarketApi";

/**
 * Fetches Predict.fun market detail per id (same query key as Positions) for token→outcome resolution.
 */
export function usePredictMarketDetailsMap(marketIds: number[], enabled: boolean) {
	const privateApi = usePrivateApiClient();
	const sortedKey = [...new Set(marketIds)].slice().sort((a, b) => a - b);

	return useQuery({
		queryKey: ["predict-market-details", sortedKey],
		enabled: enabled && sortedKey.length > 0,
		staleTime: 60_000,
		/** When `predictMarketIds` grows, keep prior map so downstream merges never see an empty map mid-fetch. */
		placeholderData: keepPreviousData,
		queryFn: async () => {
			const results = await Promise.allSettled(
				sortedKey.map((id) => privateApi.getPredictMarket(id)),
			);
			const map = new Map<number, PredictMarketDetail>();
			results.forEach((r, i) => {
				if (r.status === "fulfilled") map.set(sortedKey[i]!, r.value);
			});
			return map;
		},
	});
}
