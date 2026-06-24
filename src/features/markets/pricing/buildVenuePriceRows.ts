import type { MatchedMarket } from "@/types/odds-monitor";
import type { MoneylineLegWire } from "@/features/markets/pricing/kalshiLegYesBook";
import { isValidProbPrice } from "@/features/markets/pricing/orderbookBbo";
import type { VenueRowModel } from "@/features/markets/pricing/venueRowModel";
import {
	applyBboPolicy,
	VENUE_PRICE_ADAPTERS,
} from "@/features/markets/pricing/venuePriceAdapters";

/** Overlay FIFA leg routing when the venue-prices stub lacks REST metadata yet. */
export function matchedMarketWithLegHint(
	m: MatchedMarket,
	legHint?: MoneylineLegWire | null,
): MatchedMarket {
	if (legHint == null || m.moneylineLeg === legHint) return m;
	return { ...m, moneylineLeg: legHint };
}

/**
 * Cross-venue display rows from OddsMonitor `MatchedMarket` (venue-prices WS).
 * Single source for Basic tab strip, home listing cards, and sell-strip bid lookup input.
 *
 * Implementation: loops `VENUE_PRICE_ADAPTERS` — see `venuePriceAdapters/index.ts` to add a venue.
 */
export function buildVenuePriceRows(
	m: MatchedMarket,
	opts?: { legHint?: MoneylineLegWire | null },
): VenueRowModel[] {
	const market = matchedMarketWithLegHint(m, opts?.legHint);
	const rows: VenueRowModel[] = [];

	for (const adapter of VENUE_PRICE_ADAPTERS) {
		if (!adapter.isMapped(market)) continue;

		const { bookA, bookB } = adapter.books(market);
		const quotes = applyBboPolicy(adapter.bboPolicy, bookA, bookB);

		if (adapter.shouldShowRow && !adapter.shouldShowRow(market, quotes)) continue;

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
