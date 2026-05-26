import { useQuery } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { mapPolymarketTokenApprovalRead } from "@/features/trading/approvals/mapPolymarketTokenApprovalRead";
import type { VenueTokenApprovalRead } from "@/features/trading/approvals/venueTokenApprovalTypes";
import { checkPolymarketApprovals } from "@/features/trading/venues/polymarket/trade/approvalTxs";

/** TanStack prefix for Polymarket deposit-wallet approval reads on Polygon. */
export const POLYMARKET_APPROVALS_QUERY_KEY = "polymarket-approvals" as const;

/**
 * Read-only Polymarket approval status for the deposit wallet (Polygon).
 * Matches the on-chain gate in {@link ensurePolymarketApprovals} / SOR execute.
 */
export function usePolymarketApprovalsStatus(
	depositWalletAddress: string | null | undefined,
	enabled: boolean,
) {
	const api = usePrivateApiClient();
	const wallet = depositWalletAddress?.trim() ?? "";
	const queryEnabled = enabled && wallet.startsWith("0x");

	return useQuery<VenueTokenApprovalRead>({
		queryKey: [POLYMARKET_APPROVALS_QUERY_KEY, wallet.toLowerCase()],
		enabled: queryEnabled,
		staleTime: 15_000,
		retry: 1,
		queryFn: async () => {
			const status = await checkPolymarketApprovals(wallet, api);
			return mapPolymarketTokenApprovalRead(status);
		},
		meta: { errorMessage: "Polymarket approvals" },
	});
}
