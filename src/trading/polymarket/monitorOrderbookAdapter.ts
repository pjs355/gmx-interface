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
 * If the server only sends bests (no bid/ask arrays), we synthesize one level per
 * side using `totalAskLiquidity` / `totalBidLiquidity` when present; otherwise null
 * (avoid faking unknown depth).
 */
export function monitorBookToOrderbookSnapshot(
	book: OrderbookData | null | undefined
): OrderbookSnapshot | null {
	if (!book) return null;

	let asks = levelsToEntries(book.asks);
	let bids = levelsToEntries(book.bids);

	if (
		!asks.length &&
		book.bestAsk != null &&
		Number.isFinite(Number(book.bestAsk))
	) {
		const liq = book.totalAskLiquidity;
		const size =
			typeof liq === "number" && Number.isFinite(liq) && liq > 0 ? liq : null;
		if (size != null) {
			asks = [{ price: Number(book.bestAsk), size }];
		}
	}
	if (
		!bids.length &&
		book.bestBid != null &&
		Number.isFinite(Number(book.bestBid))
	) {
		const liq = book.totalBidLiquidity;
		const size =
			typeof liq === "number" && Number.isFinite(liq) && liq > 0 ? liq : null;
		if (size != null) {
			bids = [{ price: Number(book.bestBid), size }];
		}
	}

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
