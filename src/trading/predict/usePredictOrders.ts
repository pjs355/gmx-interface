import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type { PredictOrderRow } from "./predictOrdersApi";

/**
 * Fetches Predict.fun orders for the authenticated user.
 * Returns both FILLED (for cost basis) and OPEN (for the Orders tab).
 */
export function usePredictOrders(enabled = true) {
	const api = usePrivateApiClient();

	const filledQuery = useQuery<PredictOrderRow[]>({
		queryKey: ["predict-orders", "FILLED"],
		enabled,
		staleTime: 60_000,
		queryFn: () => api.getPredictOrders("FILLED"),
	});

	const openQuery = useQuery<PredictOrderRow[]>({
		queryKey: ["predict-orders", "OPEN"],
		enabled,
		staleTime: 15_000,
		queryFn: () => api.getPredictOrders("OPEN"),
	});

	return {
		filledOrders: filledQuery.data ?? [],
		openOrders: openQuery.data ?? [],
		isLoading: filledQuery.isLoading || openQuery.isLoading,
		filledQuery,
		openQuery,
	};
}
