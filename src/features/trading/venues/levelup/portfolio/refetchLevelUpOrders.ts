import type { QueryClient } from "@tanstack/react-query";
import { levelUpQueryKeys } from "../levelUpQueryKeys";

function normalizeLevelUpWallet(wallet: string | null | undefined): string | null {
	const trimmed = wallet?.trim();
	if (!trimmed || !trimmed.startsWith("0x")) return null;
	return trimmed;
}

/** Invalidate + refetch LevelUp order history (`GET /orders/:wallet`). */
export async function refetchLevelUpOrders(
	queryClient: QueryClient,
	wallet: string | null | undefined,
): Promise<void> {
	const w = normalizeLevelUpWallet(wallet);
	if (!w) return;
	await queryClient.invalidateQueries({
		queryKey: levelUpQueryKeys.orders(w),
	});
}

/** Orders API + LevelUp positions — used after transfers and claims. */
export async function refetchLevelUpOrdersAndPositions(
	queryClient: QueryClient,
	wallet: string | null | undefined,
	refreshLevelUpPositions: () => Promise<void>,
): Promise<void> {
	await Promise.allSettled([refetchLevelUpOrders(queryClient, wallet), refreshLevelUpPositions()]);
}
