/**
 * Limitless account ensure for the trade box (read cache + JIT refetch).
 *
 * Owns the React Query entry for `POST /limitless/ensure-account` (disabled by default;
 * LimitlessBackgroundActivation populates cache on app load). Exposes `limitlessReady`,
 * `limitlessEnsureGate`, and `getLimitlessOwnerId` for SOR Limitless legs.
 *
 * Also invalidates account-overview when ensure completes with a link/signup warrant.
 *
 * Used by: `PredictionMarketTradeBox` → `useTradeBoxVenueWiring` (trading gates),
 * `useTradeBoxApprovals`, `buildTradeBoxSorLegExecutorDeps`.
 */
import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ethers } from "ethers";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import type { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { buildLimitlessEoaEnsureBodyFromSigner } from "@/features/trading/venues/limitless/session/limitlessEnsureEoaBody";
import { postLimitlessEnsureAccountWhenNeeded } from "@/features/trading/venues/limitless/session/limitlessEnsureAccountRequest";
import {
	getLimitlessEnsureTradeGate,
	isLimitlessProfileExistsNotLinkedApiError,
	limitlessEnsureWarrantsAccountOverviewRefresh,
} from "@/features/trading/venues/limitless/session/limitlessEnsureTradeGate";

export function useTradeBoxLimitlessEnsure(args: {
	profileId: string | undefined;
	signer: ethers.Signer | null | undefined;
	privateApi: ReturnType<typeof usePrivateApiClient>;
}) {
	const { profileId, signer, privateApi } = args;
	const queryClient = useQueryClient();

	const limitlessEnsureQueryKey = profileId
		? tradingQueryKeys.limitlessEnsureAccount(profileId)
		: ["trading", "limitlessEnsure", "__disabled__"];

	/** LimitlessBackgroundActivation owns the initial ensure-account; trade box reads cache and refetches only after JIT approvals. */
	const limitlessEnsureQuery = useQuery({
		queryKey: limitlessEnsureQueryKey,
		enabled: false,
		queryFn: async () => {
			return postLimitlessEnsureAccountWhenNeeded(
				queryClient,
				limitlessEnsureQueryKey,
				queryClient.getQueryData(limitlessEnsureQueryKey),
				async () => {
					if (!signer) return undefined;
					return buildLimitlessEoaEnsureBodyFromSigner({
						getPlainSigningMessage: () => privateApi.getLimitlessAuthSigningMessage(),
						signer,
					});
				},
				(body) => privateApi.postLimitlessEnsureAccount(body),
			);
		},
		staleTime: 1000 * 60 * 30,
		retry: (failureCount, err) => {
			if (isLimitlessProfileExistsNotLinkedApiError(err)) return false;
			return failureCount < 1;
		},
	});

	const limitlessEnsureGate = useMemo(
		() => getLimitlessEnsureTradeGate(limitlessEnsureQuery.data ?? null),
		[limitlessEnsureQuery.data],
	);

	const limitlessReady = Boolean(
		limitlessEnsureQuery.isSuccess &&
		limitlessEnsureQuery.data != null &&
		limitlessEnsureGate.ready,
	);

	useEffect(() => {
		if (!profileId) return;
		if (limitlessEnsureQuery.status !== "success") return;
		if (!limitlessEnsureWarrantsAccountOverviewRefresh(limitlessEnsureQuery.data)) return;
		void queryClient.invalidateQueries({
			queryKey: tradingQueryKeys.accountOverview(profileId),
		});
	}, [
		profileId,
		limitlessEnsureQuery.status,
		limitlessEnsureQuery.data,
		limitlessEnsureQuery.dataUpdatedAt,
		queryClient,
	]);

	const getLimitlessOwnerId = useCallback(() => {
		const raw = limitlessEnsureQuery.data;
		if (!raw || typeof raw !== "object") return undefined;
		const o = raw as Record<string, unknown>;
		const inner =
			o.data != null && typeof o.data === "object" ? (o.data as Record<string, unknown>) : o;
		const la = inner.limitlessAccount;
		if (!la || typeof la !== "object") return undefined;
		const oid = (la as Record<string, unknown>).ownerId;
		if (typeof oid === "number" && Number.isFinite(oid) && oid > 0) return oid;
		return undefined;
	}, [limitlessEnsureQuery.data]);

	return {
		limitlessEnsureQuery,
		limitlessEnsureGate,
		limitlessReady,
		getLimitlessOwnerId,
	};
}
