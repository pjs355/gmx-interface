/**
 * Canonical venue list for the aggregator front end.
 *
 * Single source of truth for which venues exist and how they are labelled in
 * the UI. Used by the admin "Disable Venues" toggle, the EnabledVenuesContext,
 * and any iteration over all venues. Trading-side type unions
 * (`VenueId`, `SorVenue`, `TradingVenue`) re-export `VenueId` from here so the
 * five tradeable venues stay in lockstep across the codebase.
 */

export const ALL_VENUES = [
	"levelup",
	"polymarket",
	"dflow",
	"predictfun",
	"limitless",
] as const;

export type VenueId = (typeof ALL_VENUES)[number];

const VENUE_ID_SET: ReadonlySet<VenueId> = new Set(ALL_VENUES);

export function isVenueId(value: unknown): value is VenueId {
	return typeof value === "string" && VENUE_ID_SET.has(value as VenueId);
}

/** Display labels shown in the admin toggles, dropdowns, and badges. */
export const VENUE_LABELS: Record<VenueId, string> = {
	levelup: "LevelUp",
	polymarket: "Polymarket",
	dflow: "Kalshi",
	predictfun: "Predict.fun",
	limitless: "Limitless",
};
