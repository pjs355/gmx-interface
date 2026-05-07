/**
 * When `true` (set `VITE_LIMITLESS_LEGACY_CLIENT_FALLBACKS=true` in `.env`):
 * enables Vite dev proxy plugins for Limitless public API (`/limitless-exchange-proxy`, etc.).
 * Limitless display books come only from `/ws/venue-prices` on the prediction API.
 */
export const LIMITLESS_LEGACY_CLIENT_FALLBACKS =
	import.meta.env.VITE_LIMITLESS_LEGACY_CLIENT_FALLBACKS === "true";
