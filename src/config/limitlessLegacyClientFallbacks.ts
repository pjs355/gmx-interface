/**
 * When `true` (set `VITE_LIMITLESS_LEGACY_CLIENT_FALLBACKS=true` in `.env`):
 * merge Limitless from umbrella onto matched-markets rows, REST-poll Limitless in the
 * browser, and use the Vite `/__limitless-api` dev proxy for orderbook GETs.
 *
 * Default `false` — rely on Mongo `exchangeMatching.limitless` and venue-prices WS /
 * prediction API `GET /api/public/limitless-orderbook` (same path as production builds).
 */
export const LIMITLESS_LEGACY_CLIENT_FALLBACKS =
	import.meta.env.VITE_LIMITLESS_LEGACY_CLIENT_FALLBACKS === "true";
