import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type { PredictOrderRow } from "./predictOrdersApi";

/** Opt-in: `VITE_DEBUG_PREDICT_ORDERS=1` (dev). */
const predictOrdersConsole =
	typeof import.meta !== "undefined" && import.meta.env?.DEV
		? import.meta.env.VITE_DEBUG_PREDICT_ORDERS === "1"
		: false;

/**
 * Fetches Predict.fun orders for the authenticated user.
 * Returns both FILLED (for cost basis) and OPEN (for the Orders tab).
 *
 * NOTE: Requires an active Predict.fun JWT session. If the JWT is expired,
 * both queries will fail with 401 and return empty arrays — cost data will
 * be unavailable until the user re-authenticates with Predict.fun.
 *
 * Uses Privy `authenticated` (not `effectiveAccount`) so the orders query
 * runs as soon as the LevelUp session exists — Predict positions use the
 * embedded BNB address while this still shares the same LevelUp + Predict JWT.
 */
export function usePredictOrders(enabled = true) {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const ready = Boolean(authenticated && enabled);

	const filledQuery = useQuery<PredictOrderRow[]>({
		queryKey: ["predict-orders", "FILLED"],
		enabled: ready,
		staleTime: 60_000,
		retry: 1,
		queryFn: async () => {
			let rows = await api.getPredictOrders("FILLED");
			if (rows.length === 0) {
				const all = await api.getPredictOrders(undefined);
				const filled = all.filter((r) => r.status === "FILLED");
				if (filled.length > 0) {
					if (predictOrdersConsole) {
						console.log(
							"[PredictOrders] status=FILLED was empty; using",
							filled.length,
							"FILLED from unfiltered list (",
							all.length,
							"total)"
						);
					}
					rows = filled;
				} else if (predictOrdersConsole && all.length > 0) {
					console.warn(
						"[PredictOrders] No FILLED orders in list of",
						all.length,
						"— statuses:",
						[...new Set(all.map((r) => r.status))].join(", ") || "(none)"
					);
				} else if (predictOrdersConsole && all.length === 0 && !loggedEmptyOrdersHint) {
					loggedEmptyOrdersHint = true;
					console.info(
						"[PredictOrders] Zero FILLED orders — cost/avg falls back to GET /api/predict/orders/matches?signerAddress=… when you have Predict positions.",
						"If cost stays blank, set VITE_PREDICT_ACCOUNT_ADDRESS to the maker address Predict shows for your trades."
					);
				}
			}
			if (predictOrdersConsole && rows.length > 0) {
				console.log("[PredictOrders] Fetched", rows.length, "filled orders for cost basis");
			}
			return rows;
		},
		meta: { errorMessage: "Predict filled orders" },
	});

	const openQuery = useQuery<PredictOrderRow[]>({
		queryKey: ["predict-orders", "OPEN"],
		enabled: ready,
		staleTime: 15_000,
		retry: 1,
		queryFn: () => api.getPredictOrders("OPEN"),
		meta: { errorMessage: "Predict open orders" },
	});

	// Surface auth errors so the UI can react
	if (filledQuery.error) {
		const msg = (filledQuery.error as any)?.message ?? "";
		if (import.meta.env.DEV && /401|unauthorized|expired/i.test(msg)) {
			console.warn(
				"[PredictOrders] Predict.fun session expired — cost/avg price data unavailable. " +
				"User needs to place a trade or re-authenticate to refresh the session."
			);
		}
	}

	return {
		filledOrders: filledQuery.data ?? [],
		openOrders: openQuery.data ?? [],
		isLoading: filledQuery.isLoading || openQuery.isLoading,
		filledQuery,
		openQuery,
		/** True when the filled orders fetch failed (e.g. JWT expired) */
		filledError: filledQuery.error != null,
		/** True once the filled orders query has completed at least once */
		filledFetched: filledQuery.isFetched,
	};
}
