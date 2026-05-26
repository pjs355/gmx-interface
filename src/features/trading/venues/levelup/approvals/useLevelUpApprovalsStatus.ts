import { useQuery } from "@tanstack/react-query";
import { fetchLevelUpApprovalsChainRead } from "@/features/trading/chain-reads/levelUpChainRead";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { levelUpQueryKeys } from "../levelUpQueryKeys";
import type { LevelUpApprovalStatus } from "./levelUpApprovalAdapter";

/**
 * Read-only LevelUp approval status via `POST /chain/read` (TanStack cache).
 * Use {@link useLevelUpApprovalGate} for `ensureApproved` on the trade path.
 */
export function useLevelUpApprovalsStatus(
	walletAddress: string | null | undefined,
	enabled: boolean,
) {
	const api = usePrivateApiClient();
	const wallet = walletAddress?.trim() ?? "";
	const queryEnabled = enabled && wallet.startsWith("0x");

	return useQuery<LevelUpApprovalStatus>({
		queryKey: levelUpQueryKeys.approvals(wallet.toLowerCase()),
		enabled: queryEnabled,
		staleTime: 15_000,
		retry: 1,
		queryFn: () => fetchLevelUpApprovalsChainRead(api, wallet),
		meta: { errorMessage: "LevelUp approvals" },
	});
}
