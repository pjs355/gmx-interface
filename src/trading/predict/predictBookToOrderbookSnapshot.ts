import type { Book } from "@predictdotfun/sdk";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";

/**
 * Predict REST orderbook depth uses `[price, size]` tuples (human-readable decimals).
 * Maps to `OrderbookSnapshot` prices in 0–1 probability space for `useMarketOrderHandler`.
 *
 * Caller must pass an outcome-native book (single-market NO: complement REST first).
 * The trade box then walks with `orderbookWalkPosition` for LevelUp / single-market Predict.
 */
export function predictBookToOrderbookSnapshot(book: Book | null | undefined): OrderbookSnapshot | null {
	if (!book || (!book.asks?.length && !book.bids?.length)) return null;

	const asks = (book.asks ?? []).map(([p, q]) => ({
		price: Number(p),
		size: Number(q),
	}));
	const bids = (book.bids ?? []).map(([p, q]) => ({
		price: Number(p),
		size: Number(q),
	}));

	const ts =
		typeof book.updateTimestampMs === "number" && Number.isFinite(book.updateTimestampMs)
			? book.updateTimestampMs
			: Date.now();

	return {
		asks,
		bids,
		stopBook: { asks: [], bids: [] },
		ts,
		lastOp: ts,
	};
}
