import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/trading/queryKeys";
import {
	getLimitlessEnsureTradeGate,
	limitlessEnsureWarrantsAccountOverviewRefresh,
} from "./limitlessEnsureTradeGate";

export type LimitlessEnsureExecutionReadyState = {
	setupInProgress: boolean;
	ready: boolean;
	error: string | null;
};

/**
 * Single source of truth for "Limitless is ready to trade". Mirrors the shape
 * of `usePolymarketEnsureExecutionReady` and `usePredictEnsureExecutionReady`
 * so the post-signup setup modal and the trade box can read all three from
 * the same activator components.
 *
 * Behavior:
 *  - When `enabled` + Privy authenticated, fires `POST /api/limitless/ensure-account`
 *    via React Query. The endpoint is idempotent and chains all the server-side
 *    setup (server wallet provisioning, owner-id sync, allowance verification,
 *    flipping `tradingEnabled: true`) so a single call makes the venue
 *    `executionReady` for the SOR.
 *  - On success, invalidates `tradingQueryKeys.accountOverview(profileId)` once
 *    so the next SOR `getRoute` sees `routingEligibility.limitless.canExecute: true`.
 *  - On-chain Base approvals (USDC `approve`, CTF `setApprovalForAll`) are
 *    deliberately NOT run here. They depend on a per-market `verify-allowance`
 *    response (spender varies by market) and are already executed JIT inside
 *    `useSorLegExecutor` on the buy click. Trying to run them upfront with a
 *    "warmup" market slug is brittle and a wasted signing session for users
 *    who never trade Limitless.
 *
 * The query is shared at `tradingQueryKeys.limitlessEnsureAccount(profileId)`,
 * so the trade box's existing query reads the same cache entry — no
 * duplicate `ensure-account` calls.
 */
export function useLimitlessEnsureExecutionReady(args: {
	enabled: boolean;
}): LimitlessEnsureExecutionReadyState {
	const { enabled } = args;
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const qc = useQueryClient();
	const profileQuery = useCurrentProfile({ enabled: enabled && authenticated });
	const profileId = profileQuery.data?._id;

	const queryEnabled = Boolean(enabled && authenticated && profileId);

	const ensureQuery = useQuery({
		queryKey: profileId
			? tradingQueryKeys.limitlessEnsureAccount(profileId)
			: ["trading", "limitlessEnsure", "__disabled__"],
		queryFn: () => api.postLimitlessEnsureAccount(),
		enabled: queryEnabled,
		staleTime: 1000 * 60 * 30,
		retry: 1,
	});

	const lastInvalidatedRef = useRef<number>(0);
	useEffect(() => {
		if (!profileId) return;
		if (ensureQuery.status !== "success") return;
		if (!limitlessEnsureWarrantsAccountOverviewRefresh(ensureQuery.data)) return;
		if (lastInvalidatedRef.current === ensureQuery.dataUpdatedAt) return;
		lastInvalidatedRef.current = ensureQuery.dataUpdatedAt;
		void qc.invalidateQueries({
			queryKey: tradingQueryKeys.accountOverview(profileId),
		});
	}, [
		profileId,
		ensureQuery.status,
		ensureQuery.data,
		ensureQuery.dataUpdatedAt,
		qc,
	]);

	const gate = getLimitlessEnsureTradeGate(ensureQuery.data ?? null);
	const ready = Boolean(
		ensureQuery.isSuccess && ensureQuery.data != null && gate.ready,
	);
	const setupInProgress =
		queryEnabled && !ready && (ensureQuery.isLoading || ensureQuery.isFetching);

	let error: string | null = null;
	if (ensureQuery.isError) {
		error =
			ensureQuery.error instanceof Error
				? ensureQuery.error.message
				: String(ensureQuery.error);
	}

	return { setupInProgress, ready, error };
}
