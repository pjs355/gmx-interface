import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { OrderbookData } from "@/types/odds-monitor";
import type { TradingVenue } from "@/features/trading/trade-box/types";
import { applyBboPolicy } from "@/features/markets/pricing/venuePriceAdapters/applyBboPolicy";
import type { BboPolicy } from "@/features/markets/pricing/venuePriceAdapters/types";

/** Monitor wire book or REST ladder snapshot — both feed the same BBO helpers. */
export type BboBookInput = OrderbookData | OrderbookSnapshot | null | undefined;

export type BookBbo = {
	bestAsk: number | null;
	bestBid: number | null;
};

/** Single-book BBO using the same policy as cross-venue display adapters. */
export function bboFromBook(policy: BboPolicy, book: BboBookInput): BookBbo {
	if (!book) return { bestAsk: null, bestBid: null };
	const quotes = applyBboPolicy(policy, book as OrderbookData, null);
	return { bestAsk: quotes.askA, bestBid: quotes.bidA };
}

/** Matches `VENUE_PRICE_ADAPTERS` BBO policy for trade-box / listing call sites. */
export function bboPolicyForTradingVenue(venue: TradingVenue): BboPolicy {
	switch (venue) {
		case "levelup":
			return "restingOnly";
		case "dflow":
			return "ladderFirst";
		case "all":
		case "polymarket":
		case "limitless":
		case "predictfun":
			return "standard";
		default: {
			const _exhaustive: never = venue;
			throw new Error(`Unknown trading venue: ${_exhaustive}`);
		}
	}
}
