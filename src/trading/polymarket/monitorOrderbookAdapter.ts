import type { OrderbookData, OrderbookLevel } from "@/types/odds-monitor";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";

const MIN_SYNTH = 0.005;
const MAX_SYNTH = 0.995;

function levelsToEntries(levels: OrderbookLevel[] | undefined) {
	if (!levels?.length) return [];
	return levels.map((l) => ({
		price: typeof l.price === "number" ? l.price : Number(l.price),
		size: typeof l.size === "number" ? l.size : Number(l.size),
	}));
}

function validSynthPrice(p: number | null | undefined): number | null {
	if (p === null || p === undefined) return null;
	const n = typeof p === "number" ? p : Number(p);
	if (!Number.isFinite(n) || n < MIN_SYNTH || n > MAX_SYNTH) return null;
	return n;
}

export type MonitorBookToSnapshotOpts = {
	/**
	 * When the monitor has no resting `asks`/`bids` rows but does have `bestAsk` / `bestBid`,
	 * emit minimal one-level snapshots so trade-box headline and shallow walks match the WS strip.
	 */
	includeBboSyntheticLevels?: boolean;
};

/**
 * Converts odds-monitor `OrderbookData` into `OrderbookSnapshot` so
 * `useMarketOrderHandler` can walk the book the same way as LevelUp REST books.
 *
 * By default uses only resting levels from `asks` / `bids` with positive size.
 * With {@link MonitorBookToSnapshotOpts.includeBboSyntheticLevels}, fills from BBO when arrays are empty.
 */
export function monitorBookToOrderbookSnapshot(
	book: OrderbookData | null | undefined,
	opts?: MonitorBookToSnapshotOpts,
): OrderbookSnapshot | null {
	if (!book) return null;

	const asks = levelsToEntries(book.asks).filter((l) => l.size > 0);
	const bids = levelsToEntries(book.bids).filter((l) => l.size > 0);

	let outAsks = asks;
	let outBids = bids;
	if (!outAsks.length && !outBids.length && opts?.includeBboSyntheticLevels) {
		const ba = validSynthPrice(book.bestAsk);
		const bb = validSynthPrice(book.bestBid);
		if (ba !== null) outAsks = [{ price: ba, size: 1 }];
		if (bb !== null) outBids = [{ price: bb, size: 1 }];
	}

	if (!outAsks.length && !outBids.length) return null;

	const ts =
		typeof book.lastUpdated === "number" && Number.isFinite(book.lastUpdated)
			? book.lastUpdated
			: Date.now();

	return {
		asks: outAsks,
		bids: outBids,
		stopBook: { asks: [], bids: [] },
		ts,
		lastOp: ts,
	};
}
