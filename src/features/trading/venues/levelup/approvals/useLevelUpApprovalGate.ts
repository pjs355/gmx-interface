import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import type { PrivyWalletListEntry } from "@/features/trading/venues/polymarket/wallet/privyEmbeddedWallet";
import { levelUpQueryKeys } from "../levelUpQueryKeys";
import { ensureLevelUpApprovals } from "./levelUpApprovalAdapter";
import { useLevelUpApprovalsStatus } from "./useLevelUpApprovalsStatus";

export type LevelUpApprovalUiState = {
	isApproved: boolean;
	isChecking: boolean;
	isApproving: boolean;
};

/**
 * LevelUp approval gate — read status for UI, `ensureApproved` for execute path.
 */
export function useLevelUpApprovalGate(enabled = true) {
	const queryClient = useQueryClient();
	const privateApi = usePrivateApiClient();
	const { user } = usePrivy();
	const { wallets: privyWallets } = usePrivyWallets();
	const { getClientForChain } = useSmartWallets();
	const venueAddressChainMap = useVenueAddressChainMap();
	const wallet = venueAddressChainMap?.levelup.walletAddress ?? null;
	const queryEnabled = enabled && Boolean(wallet?.trim());

	const statusQuery = useLevelUpApprovalsStatus(wallet, queryEnabled);
	const [isApproving, setIsApproving] = useState(false);

	const approvalState = useMemo((): LevelUpApprovalUiState => {
		const isChecking =
			queryEnabled &&
			(statusQuery.isFetching || (!statusQuery.isFetched && statusQuery.fetchStatus !== "idle"));
		return {
			isApproved: statusQuery.data?.isApproved ?? false,
			isChecking: isChecking && !isApproving,
			isApproving,
		};
	}, [
		queryEnabled,
		statusQuery.data?.isApproved,
		statusQuery.isFetching,
		statusQuery.isFetched,
		statusQuery.fetchStatus,
		isApproving,
	]);

	const invalidateStatus = useCallback(async () => {
		if (!wallet?.trim()) return;
		await queryClient.invalidateQueries({
			queryKey: levelUpQueryKeys.approvals(wallet),
		});
	}, [queryClient, wallet]);

	const ensureApproved = useCallback(async () => {
		if (!wallet?.trim()) {
			throw new Error("LevelUp wallet missing from venue address map");
		}
		if (statusQuery.data?.isApproved) return;

		setIsApproving(true);
		try {
			await ensureLevelUpApprovals({
				wallet,
				user,
				privyWallets: (privyWallets ?? []) as readonly PrivyWalletListEntry[],
				getClientForChain,
				chainRead: privateApi,
			});
			await invalidateStatus();
		} catch (err) {
			console.error("error", err);
			throw err;
		} finally {
			setIsApproving(false);
		}
	}, [
		wallet,
		statusQuery.data?.isApproved,
		user,
		privyWallets,
		getClientForChain,
		invalidateStatus,
		privateApi,
	]);

	const refetchStatus = useCallback(async () => {
		if (!queryEnabled) return false;
		const result = await statusQuery.refetch();
		return result.data?.isApproved ?? false;
	}, [queryEnabled, statusQuery]);

	return {
		wallet,
		approvalState,
		statusQuery,
		ensureApproved,
		refetchStatus,
	};
}
