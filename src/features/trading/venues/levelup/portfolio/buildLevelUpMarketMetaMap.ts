type UmbrellaLike = { _id: string };
type MarketLike = {
	_id?: string;
	displayName?: string;
	question?: string;
	yesTokenId?: string;
	noTokenId?: string;
};

export type LevelUpMarketMeta = {
	title: string;
	yesTokenId: string;
	noTokenId: string;
};

/**
 * market `_id` → display metadata + token ids (active + resolved catalog).
 */
export function buildLevelUpMarketMetaMap(
	umbrellas: readonly UmbrellaLike[],
	getAllQuestionsForUmbrella: (umbrellaId: string) => readonly MarketLike[],
	resolvedMarketsByUmbrella: Readonly<Record<string, readonly MarketLike[] | undefined>>,
): Map<string, LevelUpMarketMeta> {
	const map = new Map<string, LevelUpMarketMeta>();

	const ingest = (market: MarketLike) => {
		const marketId = market?._id;
		if (!marketId || !market?.yesTokenId || !market?.noTokenId) return;
		const title =
			(market.displayName ?? market.question ?? "").trim() || `Market ${marketId.slice(0, 8)}`;
		map.set(marketId, {
			title,
			yesTokenId: market.yesTokenId,
			noTokenId: market.noTokenId,
		});
	};

	for (const u of umbrellas) {
		for (const market of getAllQuestionsForUmbrella(u._id)) {
			ingest(market);
		}
	}

	for (const resolvedMarkets of Object.values(resolvedMarketsByUmbrella)) {
		if (!resolvedMarkets) continue;
		for (const market of resolvedMarkets) {
			ingest(market);
		}
	}

	return map;
}
