import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { mergePredictFetchWithFloors } from "./predictPositionsRefetchMerge";

/**
 * Open Predict.fun positions for an address (BNB). Uses authenticated LevelUp proxy `/api/predict/positions/...`.
 *
 * Server responses are merged with {@link mergePredictFetchWithFloors} so post-trade
 * optimistic fills are not dropped by an indexer that briefly returns the old rows.
 */
export function usePredictPositions(address: string | undefined | null) {
	const a = address?.trim().toLowerCase() ?? "";
	const api = usePrivateApiClient();

	return useQuery({
		queryKey: ["predict-positions", a],
		enabled: Boolean(a.startsWith("0x")),
		staleTime: 30_000,
		placeholderData: (previousData) => previousData,
		queryFn: async () => {
			const server = await api.getPredictPositions(address!);
			return mergePredictFetchWithFloors(a, server);
		},
	});
}
