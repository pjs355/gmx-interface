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
		retry: 2,
		retryDelay: (i) => Math.min(1500 * 2 ** i, 8000),
		placeholderData: (previousData) => previousData,
		queryFn: async ({ queryKey }) => {
			const addr = queryKey[1];
			if (typeof addr !== "string" || !addr.startsWith("0x")) {
				throw new Error("predict-positions: invalid address in query key");
			}
			return api.getPredictPositions(addr);
		},
	});
}
