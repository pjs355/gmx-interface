import type { RouteExecution, RoutePlan } from "@/features/trading/sor/core/sor-types";
import type { LevelUpMarketCatalogEntry } from "./levelUpTokenBalanceTypes";

type LevelUpMarketTokenIds = {
	yesTokenId?: string | null;
	noTokenId?: string | null;
};

function normalizeTokenId(raw: unknown): string {
	return String(raw ?? "").trim();
}

function addTokenId(ids: Set<string>, raw: unknown): void {
	const tokenId = normalizeTokenId(raw);
	if (tokenId.length > 0) ids.add(tokenId);
}

/**
 * Outcome token IDs touched by filled LevelUp legs on a route (typically one id).
 */
export function levelUpTokenIdsFromFilledRoute(
	route: RoutePlan,
	execution: RouteExecution,
	market: LevelUpMarketTokenIds | null | undefined,
): string[] {
	const ids = new Set<string>();

	for (let i = 0; i < execution.legs.length; i++) {
		const ex = execution.legs[i];
		const rl = route.legs[i];
		if (!ex || ex.status !== "filled" || ex.filledShares <= 0) continue;
		if (!rl || rl.venue !== "levelup") continue;

		const side = rl.outcome === "A" ? "yes" : "no";
		const tokenId =
			side === "yes" ? normalizeTokenId(market?.yesTokenId) : normalizeTokenId(market?.noTokenId);
		if (tokenId.length > 0) ids.add(tokenId);
	}

	return [...ids];
}

export function levelUpTokenIdsFromMarket(
	market: LevelUpMarketTokenIds | null | undefined,
): string[] {
	const ids: string[] = [];
	const yes = normalizeTokenId(market?.yesTokenId);
	const no = normalizeTokenId(market?.noTokenId);
	if (yes.length > 0) ids.push(yes);
	if (no.length > 0) ids.push(no);
	return ids;
}

/** Both outcome mints for claim refresh (winning leg zeroes; losing leg unchanged). */
export function levelUpTokenIdsFromMarketCatalog(
	marketIds: readonly string[],
	catalog: ReadonlyMap<string, LevelUpMarketCatalogEntry>,
): string[] {
	const ids = new Set<string>();
	for (const raw of marketIds) {
		const marketId = normalizeTokenId(raw);
		if (marketId.length === 0) continue;
		const entry = catalog.get(marketId);
		if (!entry) continue;
		addTokenId(ids, entry.yesTokenId);
		addTokenId(ids, entry.noTokenId);
	}
	return [...ids];
}
