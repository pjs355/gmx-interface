import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";

/**
 * Open Predict.fun positions for an address (BNB). Uses authenticated LevelUp proxy `/api/predict/positions/...`.
 */
export function usePredictPositions(address: string | undefined | null) {
	const a = address?.trim().toLowerCase() ?? "";
	const api = usePrivateApiClient();

	return useQuery({
		queryKey: ["predict-positions", a],
		enabled: Boolean(a.startsWith("0x")),
		staleTime: 30_000,
		queryFn: () => api.getPredictPositions(address!),
	});
}
