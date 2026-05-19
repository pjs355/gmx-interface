import { defineError } from "../types";

// ── SOR route (server `SorErrorCode` → UI) ──────────────────────────────────

export const SOR_NO_SHARES_AVAILABLE = defineError(
	"SOR_NO_SHARES_AVAILABLE",
	"No shares available",
);
export const SOR_NO_BIDS_AVAILABLE = defineError(
	"SOR_NO_BIDS_AVAILABLE",
	"No bids available",
);
export const SOR_ALL_BOOKS_STALE = defineError(
	"SOR_ALL_BOOKS_STALE",
	"Refreshing venue prices…",
);
export const SOR_NO_VENUES_ELIGIBLE = defineError(
	"SOR_NO_VENUES_ELIGIBLE",
	"No venue is ready for this size yet. Try a smaller amount or another tab.",
);
export const SOR_EXECUTION_NOT_READY = defineError(
	"SOR_EXECUTION_NOT_READY",
	"Complete trading setup for this venue before using smart routing.",
);
export const SOR_AMOUNT_TOO_SMALL = defineError(
	"SOR_AMOUNT_TOO_SMALL",
	"Below trade minimum. Increase trade size",
);
export const SOR_WHOLE_SHARES_ONLY = defineError(
	"SOR_WHOLE_SHARES_ONLY",
	"Fractional shares aren't supported on LevelUp or Kalshi. Enter a whole number",
);
export const SOR_RATE_LIMITED = defineError(
	"SOR_RATE_LIMITED",
	"Too many requests. Wait a moment and try again.",
);
export const SOR_ROUTE_EXPIRED = defineError(
	"SOR_ROUTE_EXPIRED",
	"That route expired. Wait for refresh and try again.",
);
export const SOR_ROUTE_UNAVAILABLE = defineError(
	"SOR_ROUTE_UNAVAILABLE",
	"Could not compute a route. Try again or pick a different venue.",
);
export const SOR_ROUTE_TIMEOUT = defineError(
	"SOR_ROUTE_TIMEOUT",
	"Route request timed out. Try again.",
);
export const SOR_ROUTE_FETCH_FAILED = defineError(
	"SOR_ROUTE_FETCH_FAILED",
	"Could not load a route. Try again.",
);
export const SOR_API_NOT_AUTHENTICATED = defineError(
	"SOR_API_NOT_AUTHENTICATED",
	"Sign in to load smart routing.",
);
export const SOR_API_HTTP_ERROR = defineError(
	"SOR_API_HTTP_ERROR",
	"Smart routing is temporarily unavailable. Try again in a moment.",
);
export const SOR_API_INVALID_RESPONSE = defineError(
	"SOR_API_INVALID_RESPONSE",
	"Smart routing returned an unexpected response. Try again.",
);
export const SOR_SMART_ROUTE_FAILED = defineError(
	"SOR_SMART_ROUTE_FAILED",
	"Smart route failed to run.",
);

// ── SOR leg execution (venue-agnostic) ──────────────────────────────────────

export const SOR_LEG_FAILED_NO_MESSAGE = defineError(
	"SOR_LEG_FAILED_NO_MESSAGE",
	"Venue leg failed with no error message — check Network for this venue and earlier [SOR] Bridge+trade leg end / Leg end logs.",
);
export const SOR_EXECUTION_FAILED_NO_MESSAGE = defineError(
	"SOR_EXECUTION_FAILED_NO_MESSAGE",
	"Execution failed with no message (throw had no usable text — inspect DevTools Network for the failing request).",
);
export const SOR_NO_VALID_ORDER_RESPONSE = defineError(
	"SOR_NO_VALID_ORDER_RESPONSE",
	"No valid response from order submit",
);
export const SOR_ORDER_NOT_CONFIRMED = defineError(
	"SOR_ORDER_NOT_CONFIRMED",
	"Order could not be confirmed. Please try again.",
);
export const SOR_REFUSE_BRIDGE_ON_SELL = defineError(
	"SOR_REFUSE_BRIDGE_ON_SELL",
	"Refusing to bridge on a sell leg — shares are non-transferable",
);
export const SOR_MISSING_LIMIT_PRICE = defineError(
	"SOR_MISSING_LIMIT_PRICE",
	"Missing or invalid limit price on leg",
);
export const SOR_NO_WALLET = defineError(
	"SOR_NO_WALLET",
	"No wallet connected",
);
export const SOR_MISSING_LEVELUP_QUESTION = defineError(
	"SOR_MISSING_LEVELUP_QUESTION",
	"Missing LevelUp question ID",
);
export const SOR_POLY_CLOB_NOT_READY = defineError(
	"SOR_POLY_CLOB_NOT_READY",
	"Polymarket CLOB session not ready. Open Polymarket tab first to initialize.",
);
export const SOR_POLY_MISSING_TOKEN = defineError(
	"SOR_POLY_MISSING_TOKEN",
	"Missing Polymarket outcome token ID",
);
export const SOR_KALSHI_NO_LIMIT = defineError(
	"SOR_KALSHI_NO_LIMIT",
	"Kalshi does not support limit orders",
);
export const SOR_KALSHI_MISSING_MINT = defineError(
	"SOR_KALSHI_MISSING_MINT",
	"Missing Kalshi outcome mint",
);
export const SOR_SOLANA_SIGNER_UNAVAILABLE = defineError(
	"SOR_SOLANA_SIGNER_UNAVAILABLE",
	"Solana signer unavailable — connect your Solana embedded wallet",
);
export const SOR_LIMITLESS_MISSING_SLUG = defineError(
	"SOR_LIMITLESS_MISSING_SLUG",
	"Missing Limitless slug or outcome token on route leg",
);
export const SOR_PREDICT_SESSION_NOT_READY = defineError(
	"SOR_PREDICT_SESSION_NOT_READY",
	"Predict session not ready. Authenticate on the Predict tab first.",
);
export const SOR_PREDICT_NOT_APPROVED = defineError(
	"SOR_PREDICT_NOT_APPROVED",
	"Predict contracts not approved.",
);
export const SOR_PREDICT_MISSING_TOKEN = defineError(
	"SOR_PREDICT_MISSING_TOKEN",
	"Missing Predict outcome token ID",
);
export const SOR_PREDICT_MARKET_NOT_LOADED = defineError(
	"SOR_PREDICT_MARKET_NOT_LOADED",
	"Predict market data not loaded",
);
export const SOR_LIMITLESS_ORDER_NOT_FILLED = defineError(
	"SOR_LIMITLESS_ORDER_NOT_FILLED",
	"Order was not filled",
);
