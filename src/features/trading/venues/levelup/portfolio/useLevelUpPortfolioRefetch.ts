import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountData, useVenueAddressChainMap } from "@/context/AccountDataContext";
import { refetchLevelUpOrdersAndPositions } from "./refetchLevelUpOrders";

/** Imperative refresh for LevelUp orders + CTF positions (transfers, fund callbacks). */
export function useLevelUpPortfolioRefetch() {
	const queryClient = useQueryClient();
	const venueAddressChainMap = useVenueAddressChainMap();
	const accountData = useAccountData();
	const levelUpWallet = venueAddressChainMap?.levelup.walletAddress ?? null;

	return useCallback(async () => {
		await refetchLevelUpOrdersAndPositions(queryClient, levelUpWallet, () =>
			accountData.refresh.positions("levelup"),
		);
	}, [queryClient, levelUpWallet, accountData.refresh]);
}
