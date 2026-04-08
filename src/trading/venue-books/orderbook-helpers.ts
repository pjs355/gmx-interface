import type { BookLevel, VenueBook, VenueBestPrices } from "./types";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";

/**
 * Convert YES-bids / NO-bids decimal maps (used by DFlow) into a standard book.
 * YES bids become bids; NO bids become asks at (1 - P_no).
 */
export function orderbookFromYesNoBidDecimalMaps(
	yesBids: Record<string, number>,
	noBids: Record<string, number>,
): VenueBook {
	const bids: BookLevel[] = [];
	for (const [pStr, qty] of Object.entries(yesBids)) {
		if (qty > 0 && pStr) {
			bids.push({ price: parseFloat(pStr).toFixed(4), size: String(qty) });
		}
	}
	bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

	const asks: BookLevel[] = [];
	for (const [pStr, qty] of Object.entries(noBids)) {
		if (qty > 0 && pStr) {
			const noPrice = parseFloat(pStr);
			asks.push({ price: (1 - noPrice).toFixed(4), size: String(qty) });
		}
	}
	asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

	return { bids, asks };
}

/**
 * Extract best bid/ask from a sorted book (bids desc, asks asc).
 */
export function extractBestPrices(book: VenueBook | null | undefined): VenueBestPrices {
	if (!book) return { bestBid: null, bestAsk: null };
	const bestBid = book.bids.length > 0 ? parseFloat(book.bids[0].price) : null;
	const bestAsk = book.asks.length > 0 ? parseFloat(book.asks[0].price) : null;
	return { bestBid, bestAsk };
}

/**
 * Parse Polymarket-style {price, size} object arrays.
 */
export function parseObjectBook(
	rawBids: Array<{ price: string; size: string }> | undefined,
	rawAsks: Array<{ price: string; size: string }> | undefined,
): VenueBook {
	const bids: BookLevel[] = [];
	if (rawBids) {
		for (const level of rawBids) {
			if (parseFloat(level.size) > 0) bids.push(level);
		}
	}
	bids.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));

	const asks: BookLevel[] = [];
	if (rawAsks) {
		for (const level of rawAsks) {
			if (parseFloat(level.size) > 0) asks.push(level);
		}
	}
	asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

	return { bids, asks };
}

/**
 * Convert a VenueBook into the OrderbookSnapshot shape expected by OrderbookDisplay.
 */
export function venueBookToSnapshot(book: VenueBook | null | undefined): OrderbookSnapshot | null {
	if (!book) return null;
	if (book.bids.length === 0 && book.asks.length === 0) return null;

	return {
		bids: book.bids.map((l, i) => ({
			price: parseFloat(l.price),
			size: parseFloat(l.size),
			id: `vb-b-${i}`,
		})),
		asks: book.asks.map((l, i) => ({
			price: parseFloat(l.price),
			size: parseFloat(l.size),
			id: `vb-a-${i}`,
		})),
		stopBook: { asks: [], bids: [] },
		ts: Date.now(),
		lastOp: 0,
	};
}
