import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";

/** Only real resting depth (positive size). No BBO-only or zero-size synthetic rows. */
export function monitorOrderbookDataToRestingSnapshot(
	book: OrderbookData | null | undefined,
): OrderbookSnapshot | null {
	if (!book) return null;
	const asks = (book.asks ?? [])
		.filter((l) => Number(l.size) > 0)
		.map((l, i) => ({ price: l.price, size: l.size, id: `a-${i}` }));
	const bids = (book.bids ?? [])
		.filter((l) => Number(l.size) > 0)
		.map((l, i) => ({ price: l.price, size: l.size, id: `b-${i}` }));
	if (asks.length === 0 && bids.length === 0) return null;
	return {
		asks,
		bids,
		stopBook: { asks: [], bids: [] },
		ts: book.lastUpdated ?? Date.now(),
		lastOp: 0,
	};
}

export type LevelUpCrossVenueBooks = {
	hasLevelUp: boolean;
	luBookA: OrderbookSnapshot | null;
	luBookB: OrderbookSnapshot | null;
};

/**
 * Same LevelUp book selection as `VenueOrderbooksPanel` / cross-venue orderbooks:
 * prefer REST when ladder row count > 2, else monitor WS with positive-size levels only,
 * else REST fallback.
 */
export function computeLevelUpCrossVenueBooks(
	matched: MatchedMarket | null | undefined,
	levelUpOrderbook: OrderbookSnapshot | null,
): LevelUpCrossVenueBooks {
	const wsBookA = matched
		? monitorOrderbookDataToRestingSnapshot(matched.levelUpPriceA)
		: null;
	const wsBookB = matched
		? monitorOrderbookDataToRestingSnapshot(matched.levelUpPriceB)
		: null;

	const restHasDepth =
		levelUpOrderbook &&
		(levelUpOrderbook.asks?.length ?? 0) + (levelUpOrderbook.bids?.length ?? 0) >
			2;
	const luBookA = restHasDepth
		? levelUpOrderbook
		: (wsBookA ?? levelUpOrderbook);
	const luBookB = restHasDepth ? null : wsBookB;
	const hasLevelUp = Boolean(luBookA || luBookB);
	return { hasLevelUp, luBookA, luBookB };
}

export function hasLevelUpCrossVenueOrderbook(
	matched: MatchedMarket | null | undefined,
	levelUpOrderbook: OrderbookSnapshot | null,
): boolean {
	return computeLevelUpCrossVenueBooks(matched, levelUpOrderbook).hasLevelUp;
}
