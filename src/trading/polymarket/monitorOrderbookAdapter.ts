import type { OrderbookData, OrderbookLevel } from "@/types/odds-monitor";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";

function levelsToEntries(levels: OrderbookLevel[] | undefined) {
	if (!levels?.length) return [];
	return levels.map((l) => ({
		price: typeof l.price === "number" ? l.price : Number(l.price),
		size: typeof l.size === "number" ? l.size : Number(l.size),
	}));
}

/**
 * Converts odds-monitor `OrderbookData` into `OrderbookSnapshot` so
 * `useMarketOrderHandler` can walk the book the same way as LevelUp REST books.
 *
 * Uses only resting levels from `asks` / `bids` with positive size — no BBO-only
 * or liquidity-total synthesis when arrays are empty.
 */
export function monitorBookToOrderbookSnapshot(
	book: OrderbookData | null | undefined
): OrderbookSnapshot | null {
	if (!book) return null;

	const asks = levelsToEntries(book.asks).filter((l) => l.size > 0);
	const bids = levelsToEntries(book.bids).filter((l) => l.size > 0);

	if (!asks.length && !bids.length) return null;

	const ts =
		typeof book.lastUpdated === "number" && Number.isFinite(book.lastUpdated)
			? book.lastUpdated
			: Date.now();

	return {
		asks,
		bids,
		stopBook: { asks: [], bids: [] },
		ts,
		lastOp: ts,
	};
}
