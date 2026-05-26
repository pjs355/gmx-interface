import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";

export function usePredictOrderbook(marketId: number | null, enabled = true) {
	const api = usePrivateApiClient();
	return useQuery({
		queryKey: ["predict-orderbook", marketId],
		enabled: enabled && marketId !== null && marketId > 0,
		staleTime: 5_000,
		queryFn: () => api.getPredictOrderbook(marketId as number),
	});
}
