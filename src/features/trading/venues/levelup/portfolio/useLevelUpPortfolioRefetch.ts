import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccountData, useVenueAddressChainMap } from "@/context/AccountDataContext";
import { refetchLevelUpOrdersAndPositions } from "./refetchLevelUpOrders";

/** Imperative refresh for LevelUp orders + CTF positions (transfers, fund callbacks). */
export function useLevelUpPortfolioRefetch() {
	const queryClient = useQueryClient();
	const venueAddressChainMap = useVenueAddressChainMap();
	const accountData = useAccountData();
	const levelUpWallet = venueAddressChainMap?.levelup.walletAddress ?? null;
	const refreshPositionsRef = useRef(accountData.refresh.positions);
	refreshPositionsRef.current = accountData.refresh.positions;

	return useCallback(async () => {
		await refetchLevelUpOrdersAndPositions(queryClient, levelUpWallet, () =>
			refreshPositionsRef.current("levelup"),
		);
	}, [queryClient, levelUpWallet]);
}
