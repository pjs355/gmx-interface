import type { LevelUpMarketCatalogEntry } from "./levelUpTokenBalanceTypes";

type UmbrellaLike = { _id: string };
type MarketLike = {
	_id?: string;
	yesTokenId?: string;
	noTokenId?: string;
};

/**
 * Build marketId → { yesTokenId, noTokenId } from active + resolved LevelUp catalog.
 * Keys are always market `_id` (consistent with Positions / trade box lookups).
 */
export function buildLevelUpMarketCatalog(
	umbrellas: readonly UmbrellaLike[],
	getAllQuestionsForUmbrella: (umbrellaId: string) => readonly MarketLike[],
	resolvedMarketsByUmbrella: Readonly<Record<string, readonly MarketLike[] | undefined>>,
): Map<string, LevelUpMarketCatalogEntry> {
	const marketDataMap = new Map<string, LevelUpMarketCatalogEntry>();

	for (const u of umbrellas) {
		const marketsForUmb = getAllQuestionsForUmbrella(u._id);
		for (const market of marketsForUmb) {
			const marketId = market?._id;
			if (marketId && market?.yesTokenId && market?.noTokenId) {
				marketDataMap.set(marketId, {
					yesTokenId: market.yesTokenId,
					noTokenId: market.noTokenId,
				});
			}
		}
	}

	for (const resolvedMarkets of Object.values(resolvedMarketsByUmbrella)) {
		if (!resolvedMarkets) continue;
		for (const market of resolvedMarkets) {
			const marketId = market?._id;
			if (marketId && market?.yesTokenId && market?.noTokenId) {
				marketDataMap.set(marketId, {
					yesTokenId: market.yesTokenId,
					noTokenId: market.noTokenId,
				});
			}
		}
	}

	return marketDataMap;
}
