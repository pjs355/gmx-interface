import type { UseQueryResult } from "@tanstack/react-query";
import type { AccountPositionsSlice } from "@/context/AccountDataContext";
import type { VenuePosition } from "@/types/trading/venuePosition";

/**
 * Positions page only needs a few TanStack fields for readiness gates; rows come from
 * `useAccountData().positions.*` (same cache as the venue hooks).
 *
 * When the underlying `useQuery` is **disabled** (no Polymarket safe, Predict address not 0x,
 * DFlow off, etc.), TanStack stays `idle` with `isFetched: false` forever — we must not treat
 * that as loading or the page and header gate never open.
 */
export function accountPositionsQueryShim(
	slice: AccountPositionsSlice,
	rows: VenuePosition[],
	queryEnabled: boolean,
): UseQueryResult<VenuePosition[], unknown> {
	const status =
		slice.status === "success" ? "success" : slice.status === "error" ? "error" : "pending";
	const loading =
		queryEnabled && (slice.status === "pending" || (!slice.isFetched && slice.status !== "error"));
	return {
		data: rows,
		isLoading: loading,
		isPending: loading,
		isSuccess: slice.status === "success",
		isError: slice.status === "error",
		isFetched: slice.isFetched,
		status,
		fetchStatus: slice.isFetched ? "idle" : "fetching",
	} as UseQueryResult<VenuePosition[], unknown>;
}
