import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";

export function usePredictMarketDetail(marketId: number | null, enabled = true) {
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: ["predict-market", marketId],
		enabled: enabled && marketId !== null && marketId > 0,
		staleTime: 15_000,
		queryFn: () => api.getPredictMarket(marketId as number),
	});
}
