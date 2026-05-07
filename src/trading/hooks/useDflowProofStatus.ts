import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { tradingQueryKeys } from "@/trading/queryKeys";
import { usePrivateApiClient } from "./usePrivateApiClient";
import type { DflowAccountResponse } from "@/services/privateApi";

/**
 * Fetches DFlow/Proof KYC status once on login and caches it.
 * Consumers get `isVerified`, `solanaAddress`, and the full account response
 * without repeated pings — staleTime is long so it only refetches on mount
 * or explicit invalidation (e.g. after completing Proof KYC on Profile page).
 */
export function useDflowProofStatus() {
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();

	const query = useQuery<DflowAccountResponse>({
		queryKey: tradingQueryKeys.dflowAccount,
		queryFn: () => api.getDflowAccount(),
		enabled: authenticated,
		staleTime: 5 * 60_000,
		gcTime: 10 * 60_000,
		retry: 1,
	});

	const proofState = query.data?.proofState;
	const isVerified = Boolean(
		proofState?.identityVerified && proofState?.ownershipProofValid
	);
	const solanaAddress = proofState?.solanaWalletAddress ?? null;
	const venueStatus = query.data?.venueStatus ?? null;

	return {
		isVerified,
		solanaAddress,
		venueStatus,
		proofState: proofState ?? null,
		isLoading: query.isLoading,
		isError: query.isError,
		isFetched: query.isFetched,
		isSuccess: query.isSuccess,
		data: query.data ?? null,
		error: query.error,
		refetch: async (): Promise<void> => {
			await query.refetch();
		},
		/**
		 * Force a fresh read of `/dflow/account` and return the updated
		 * verification boolean. Used by the SOR leg executor to avoid
		 * falsely rejecting a user who completed KYC mid-session with a
		 * stale cache.
		 */
		refetchIsVerified: async (): Promise<boolean> => {
			const refreshed = await query.refetch();
			const ps = refreshed.data?.proofState;
			return Boolean(ps?.identityVerified && ps?.ownershipProofValid);
		},
	};
}
