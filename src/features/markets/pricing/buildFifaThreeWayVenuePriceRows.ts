import type { MatchedMarket } from "@/types/odds-monitor";
import type { FifaVenueRowModel } from "@/features/markets/pricing/fifaVenueRowModel";
import {
	applyBboPolicy,
	VENUE_PRICE_ADAPTERS,
} from "@/features/markets/pricing/venuePriceAdapters";
import type { VenueQuotes } from "@/features/markets/pricing/venuePriceAdapters/types";

export type FifaThreeWayMatchedLegs = {
	home: MatchedMarket | null;
	draw: MatchedMarket | null;
	away: MatchedMarket | null;
};

type LegYesAsk = {
	ask: number | null;
	status?: import("@/types/odds-monitor").SnapshotStatus;
};

function legYesAsk(
	m: MatchedMarket | null,
	adapter: (typeof VENUE_PRICE_ADAPTERS)[number],
): LegYesAsk {
	if (m === null || !adapter.isMapped(m)) {
		return { ask: null };
	}
	const { bookA, bookB } = adapter.books(m);
	const quotes = applyBboPolicy(adapter.bboPolicy, bookA, bookB);
	return { ask: quotes.askA, status: bookA?.snapshotStatus };
}

function legQuotes(m: MatchedMarket, adapter: (typeof VENUE_PRICE_ADAPTERS)[number]): VenueQuotes {
	const { bookA, bookB } = adapter.books(m);
	return applyBboPolicy(adapter.bboPolicy, bookA, bookB);
}

function shouldShowFifaVenueRow(
	adapter: (typeof VENUE_PRICE_ADAPTERS)[number],
	legs: FifaThreeWayMatchedLegs,
): boolean {
	if (!adapter.shouldShowRow) return true;
	const candidates = [legs.home, legs.draw, legs.away].filter(
		(m): m is MatchedMarket => m !== null && adapter.isMapped(m),
	);
	if (candidates.length === 0) return false;
	return candidates.some((m) => adapter.shouldShowRow!(m, legQuotes(m, adapter)));
}

/**
 * Build cross-venue display rows for FIFA 3-way fixtures.
 * Each cell is that leg's YES best ask on the venue (not binary NO / complement).
 */
export function buildFifaThreeWayVenuePriceRows(
	legs: FifaThreeWayMatchedLegs,
): FifaVenueRowModel[] {
	const rows: FifaVenueRowModel[] = [];

	for (const adapter of VENUE_PRICE_ADAPTERS) {
		const homeMapped = legs.home !== null && adapter.isMapped(legs.home);
		const drawMapped = legs.draw !== null && adapter.isMapped(legs.draw);
		const awayMapped = legs.away !== null && adapter.isMapped(legs.away);
		if (!homeMapped && !drawMapped && !awayMapped) continue;
		if (!shouldShowFifaVenueRow(adapter, legs)) continue;

		const home = legYesAsk(legs.home, adapter);
		const draw = legYesAsk(legs.draw, adapter);
		const away = legYesAsk(legs.away, adapter);

		rows.push({
			id: adapter.id,
			label: adapter.label,
			linked: true,
			askHome: home.ask,
			askDraw: draw.ask,
			askAway: away.ask,
			statusHome: home.status,
			statusDraw: draw.status,
			statusAway: away.status,
		});
	}

	return rows;
}
