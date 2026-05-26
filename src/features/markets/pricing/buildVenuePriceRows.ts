import type { MatchedMarket } from "@/types/odds-monitor";
import { isValidProbPrice } from "@/features/markets/pricing/orderbookBbo";
import type { VenueRowModel } from "@/features/markets/pricing/venueRowModel";
import {
	applyBboPolicy,
	VENUE_PRICE_ADAPTERS,
} from "@/features/markets/pricing/venuePriceAdapters";

/**
 * Cross-venue display rows from OddsMonitor `MatchedMarket` (venue-prices WS).
 * Single source for Basic tab strip, home listing cards, and sell-strip bid lookup input.
 *
 * Implementation: loops `VENUE_PRICE_ADAPTERS` — see `venuePriceAdapters/index.ts` to add a venue.
 */
export function buildVenuePriceRows(m: MatchedMarket): VenueRowModel[] {
	const rows: VenueRowModel[] = [];

	for (const adapter of VENUE_PRICE_ADAPTERS) {
		if (!adapter.isMapped(m)) continue;

		const { bookA, bookB } = adapter.books(m);
		const quotes = applyBboPolicy(adapter.bboPolicy, bookA, bookB);

		if (adapter.shouldShowRow && !adapter.shouldShowRow(m, quotes)) continue;

		rows.push({
			id: adapter.id,
			label: adapter.label,
			linked: true,
			askA: quotes.askA,
			askB: quotes.askB,
			bidA: quotes.bidA,
			bidB: quotes.bidB,
			statusA: bookA?.snapshotStatus,
			statusB: bookB?.snapshotStatus,
		});
	}

	return rows;
}

export function computeBestVenueAskIndices(rows: VenueRowModel[]): {
	bestAIdx: number;
	bestBIdx: number;
} {
	let bestA = Infinity;
	let bestAIdx = -1;
	let bestB = Infinity;
	let bestBIdx = -1;
	rows.forEach((r, i) => {
		if (r.askA !== null && isValidProbPrice(r.askA) && r.askA < bestA) {
			bestA = r.askA;
			bestAIdx = i;
		}
		if (r.askB !== null && isValidProbPrice(r.askB) && r.askB < bestB) {
			bestB = r.askB;
			bestBIdx = i;
		}
	});
	return { bestAIdx, bestBIdx };
}
