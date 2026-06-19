import { useCallback } from "react";
import { useAccountData } from "@/context/AccountDataContext";

/** Refreshes cash balances after a deposit — not LevelUp orders/positions. */
export function useAfterDepositRefresh() {
	const { refresh } = useAccountData();
	return useCallback(async () => {
		await refresh.cash();
	}, [refresh]);
}
