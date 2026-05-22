import type { SorVenue } from "@/trading/sor";

/** Venue keys when reading `allMarketsOutcomeVenueShares` into SOR sell legs. */
export const SOR_VENUE_POSITION_KEYS: readonly SorVenue[] = [
	"levelup",
	"polymarket",
	"predictfun",
	"dflow",
	"limitless",
];
