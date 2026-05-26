import type { OrderbookData } from "@/types/odds-monitor";

export const MIN_VALID_PROB = 0.005;
export const MAX_VALID_PROB = 0.995;

export function isValidProbPrice(p: number): boolean {
	return p >= MIN_VALID_PROB && p <= MAX_VALID_PROB;
}

function parseProb(raw: number | string | null | undefined): number | null {
	if (raw === null || raw === undefined) return null;
	const p = typeof raw === "number" ? raw : Number(raw);
	if (!Number.isFinite(p) || !isValidProbPrice(p)) return null;
	return p;
}

/** Standard: scalar BBO first, then lowest positive-size resting ask. */
export function bestAskProbFromBook(book: OrderbookData | null | undefined): number | null {
	if (!book) return null;
	const fromScalar = parseProb(book.bestAsk);
	if (fromScalar !== null) return fromScalar;
	if (book.asks?.length) {
		let min = Infinity;
		for (const a of book.asks) {
			if ((a.size ?? 0) > 0 && isValidProbPrice(a.price) && a.price < min) {
				min = a.price;
			}
		}
		if (min !== Infinity) return min;
	}
	return null;
}

/** Standard: scalar BBO first, then highest positive-size resting bid. */
export function bestBidProbFromBook(book: OrderbookData | null | undefined): number | null {
	if (!book) return null;
	const fromScalar = parseProb(book.bestBid);
	if (fromScalar !== null) return fromScalar;
	if (book.bids?.length) {
		let max = -Infinity;
		for (const b of book.bids) {
			if ((b.size ?? 0) > 0 && isValidProbPrice(b.price) && b.price > max) {
				max = b.price;
			}
		}
		if (max !== -Infinity) return max;
	}
	return null;
}

/** Resting ladder only — no bare scalar BBO (LevelUp strip policy). */
export function bestAskProbRestingLevelsOnly(
	book: OrderbookData | null | undefined,
): number | null {
	if (!book?.asks?.length) return null;
	let min = Infinity;
	for (const a of book.asks) {
		if ((a.size ?? 0) > 0 && isValidProbPrice(a.price) && a.price < min) {
			min = a.price;
		}
	}
	return min === Infinity ? null : min;
}

export function bestBidProbRestingLevelsOnly(
	book: OrderbookData | null | undefined,
): number | null {
	if (!book?.bids?.length) return null;
	let max = -Infinity;
	for (const b of book.bids) {
		if ((b.size ?? 0) > 0 && isValidProbPrice(b.price) && b.price > max) {
			max = b.price;
		}
	}
	return max === -Infinity ? null : max;
}

/** DFlow strip: ladder touch first, then scalar (stale bestAsk with fresh asks). */
export function bestAskProbLadderFirst(book: OrderbookData | null | undefined): number | null {
	const fromLadder = bestAskProbRestingLevelsOnly(book);
	if (fromLadder !== null) return fromLadder;
	return parseProb(book?.bestAsk);
}

export function bestBidProbLadderFirst(book: OrderbookData | null | undefined): number | null {
	const fromLadder = bestBidProbRestingLevelsOnly(book);
	if (fromLadder !== null) return fromLadder;
	return parseProb(book?.bestBid);
}
