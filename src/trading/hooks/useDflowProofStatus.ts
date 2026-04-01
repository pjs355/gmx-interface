import { useQuery } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
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
		queryKey: ["dflow", "account"],
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
		data: query.data ?? null,
	};
}
