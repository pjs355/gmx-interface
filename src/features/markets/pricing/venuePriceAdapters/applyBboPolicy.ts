import type { OrderbookData } from "@/types/odds-monitor";
import {
	bestAskProbFromBook,
	bestAskProbLadderFirst,
	bestAskProbRestingLevelsOnly,
	bestBidProbFromBook,
	bestBidProbLadderFirst,
	bestBidProbRestingLevelsOnly,
} from "@/features/markets/pricing/orderbookBbo";
import type { BboPolicy, VenueQuotes } from "./types";

export function applyBboPolicy(
	policy: BboPolicy,
	bookA: OrderbookData | null | undefined,
	bookB: OrderbookData | null | undefined,
): VenueQuotes {
	switch (policy) {
		case "standard":
			return {
				askA: bestAskProbFromBook(bookA),
				askB: bestAskProbFromBook(bookB),
				bidA: bestBidProbFromBook(bookA),
				bidB: bestBidProbFromBook(bookB),
			};
		case "ladderFirst":
			return {
				askA: bestAskProbLadderFirst(bookA),
				askB: bestAskProbLadderFirst(bookB),
				bidA: bestBidProbLadderFirst(bookA),
				bidB: bestBidProbLadderFirst(bookB),
			};
		case "restingOnly":
			return {
				askA: bestAskProbRestingLevelsOnly(bookA),
				askB: bestAskProbRestingLevelsOnly(bookB),
				bidA: bestBidProbRestingLevelsOnly(bookA),
				bidB: bestBidProbRestingLevelsOnly(bookB),
			};
		default: {
			const _exhaustive: never = policy;
			throw new Error(`Unknown BBO policy: ${_exhaustive}`);
		}
	}
}
