import type { QueryClient } from "@tanstack/react-query";
import type { PrivateApiClient } from "@/services/privateApi/client";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { mergeLevelUpPositionRows } from "./mergeLevelUpPositionRows";
import { levelUpQueryKeys } from "../levelUpQueryKeys";

function normalizeWallet(wallet: string | null | undefined): string | null {
	const trimmed = wallet?.trim();
	if (!trimmed) return null;
	return trimmed.toLowerCase();
}

function normalizeTokenIds(tokenIds: readonly string[]): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	for (const raw of tokenIds) {
		const tokenId = String(raw ?? "").trim();
		if (tokenId.length === 0) continue;
		if (seen.has(tokenId)) continue;
		seen.add(tokenId);
		out.push(tokenId);
	}
	return out;
}

/**
 * RPC-confirm specific outcome token balances and merge into the positions cache.
 */
export async function refreshLevelUpPositionsByTokenIds(
	queryClient: QueryClient,
	api: PrivateApiClient,
	wallet: string | null | undefined,
	tokenIds: readonly string[],
): Promise<void> {
	const walletKey = normalizeWallet(wallet);
	const ids = normalizeTokenIds(tokenIds);
	if (!walletKey || ids.length === 0) return;

	const fresh = await api.refreshLevelUpPositions({ tokenIds: ids });
	const queryKey = levelUpQueryKeys.positions(walletKey);

	queryClient.setQueryData<VenuePosition[]>(queryKey, (existing) =>
		mergeLevelUpPositionRows(existing ?? [], fresh),
	);
}
