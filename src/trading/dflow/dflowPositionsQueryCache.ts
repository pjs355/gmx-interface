import type { QueryClient } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";

/**
 * Reads the React Query cache for `useDflowPositions`, which registers under
 * `["dflow-positions", owner, catalogSig]`. Callers must not use
 * `getQueryData(["dflow-positions", owner])` — that misses the third segment.
 */
export function getCachedDflowPositions(
	queryClient: QueryClient,
	owner: string,
): VenuePosition[] | undefined {
	const key = owner.trim();
	if (!key) return undefined;
	const rows = queryClient.getQueriesData<VenuePosition[]>({
		queryKey: ["dflow-positions", key],
	});
	for (const [, data] of rows) {
		if (data !== undefined) return data;
	}
	return undefined;
}
