import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type {
	PredictActivityEvent,
	PredictActivityEventName,
} from "./predictActivityApi";

export type UsePredictAccountActivityOptions = {
	/**
	 * Gate the query the same way as `usePredictOrders` / `usePredictOrderMatches` so we don't
	 * fire before Predict JWT is ready.
	 */
	enabled: boolean;
	/** Defaults to 500 — covers all non-power users in a single page. */
	first?: number;
	/** Optional whitelist; default fetches everything (REDEEM, MATCH_SUCCESS, …). */
	eventTypes?: PredictActivityEventName[];
};

/**
 * Fetches `GET /api/predict/account/activity`. Drives the History tab's claimed-winner
 * rows: `REDEEM` events stay on this feed even after the user burns their ERC1155 tokens,
 * which is the only durable record of historical wins.
 */
export function usePredictAccountActivity(
	opts: UsePredictAccountActivityOptions,
) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const first = opts.first ?? 500;
	const types = opts.eventTypes;

	const ready = Boolean(authenticated && opts.enabled);

	return useQuery<PredictActivityEvent[], unknown>({
		queryKey: ["predict-account-activity", first, types?.join(",") ?? ""],
		enabled: ready,
		staleTime: 30_000,
		retry: 1,
		queryFn: () =>
			api.getPredictAccountActivity({ first, eventTypes: types }),
		meta: { errorMessage: "Predict account activity" },
	});
}
