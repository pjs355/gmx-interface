import { defineError } from "../types";

// ── Button pre-flight (per venue) ───────────────────────────────────────────

export const BTN_POLY_ESPORTS_NOT_LINKED = defineError(
	"BTN_POLY_ESPORTS_NOT_LINKED",
	"Polymarket: esports match not linked",
);
export const BTN_POLY_NO_MATCHED_MARKET = defineError(
	"BTN_POLY_NO_MATCHED_MARKET",
	"Polymarket: no matched market",
);
export const BTN_POLY_SETUP_REQUIRED = defineError(
	"BTN_POLY_SETUP_REQUIRED",
	"Polymarket setup required",
);
export const BTN_POLY_UNAVAILABLE = defineError(
	"BTN_POLY_UNAVAILABLE",
	"Polymarket unavailable",
);

export const BTN_LIMITLESS_ESPORTS_NOT_LINKED = defineError(
	"BTN_LIMITLESS_ESPORTS_NOT_LINKED",
	"Limitless: esports match not linked",
);
export const BTN_LIMITLESS_NO_MATCHED_MARKET = defineError(
	"BTN_LIMITLESS_NO_MATCHED_MARKET",
	"Limitless: no matched market",
);
export const BTN_LIMITLESS_MARKET_NOT_LINKED = defineError(
	"BTN_LIMITLESS_MARKET_NOT_LINKED",
	"Limitless: market not linked",
);

export const BTN_PREDICT_ESPORTS_NOT_LINKED = defineError(
	"BTN_PREDICT_ESPORTS_NOT_LINKED",
	"Predict: esports match not linked",
);
export const BTN_PREDICT_NO_MATCHED_MARKET = defineError(
	"BTN_PREDICT_NO_MATCHED_MARKET",
	"Predict: no matched market",
);
export const BTN_PREDICT_MARKET_IDS_NOT_LINKED = defineError(
	"BTN_PREDICT_MARKET_IDS_NOT_LINKED",
	"Predict: market ids not linked",
);

export const BTN_KALSHI_ENABLE_TRADING = defineError(
	"BTN_KALSHI_ENABLE_TRADING",
	"Enable Kalshi trading",
);
export const BTN_KALSHI_LIMIT_NOT_SUPPORTED = defineError(
	"BTN_KALSHI_LIMIT_NOT_SUPPORTED",
	"Limit orders on Kalshi through DFlow are not supported",
);

// ── Polymarket CLOB (client + HTTP) ─────────────────────────────────────────

export const POLYMARKET_NO_MARKET_LIQUIDITY = defineError(
	"POLYMARKET_NO_MARKET_LIQUIDITY",
	"Not enough Polymarket liquidity to fill this market order. Try a limit order or check the other outcome.",
);
export const POLYMARKET_INSUFFICIENT_BALANCE = defineError(
	"POLYMARKET_INSUFFICIENT_BALANCE",
	"Polymarket rejected the order: your wallet balance is too low to cover the order and trading fees.",
);
export const POLYMARKET_BELOW_MIN_SIZE = defineError(
	"POLYMARKET_BELOW_MIN_SIZE",
	"Polymarket rejected the order: amount is below the minimum order size.",
);
export const POLYMARKET_INSUFFICIENT_LIQUIDITY = defineError(
	"POLYMARKET_INSUFFICIENT_LIQUIDITY",
	"Polymarket has insufficient liquidity to fill this order right now.",
);
export const POLYMARKET_SESSION_EXPIRED = defineError(
	"POLYMARKET_SESSION_EXPIRED",
	"Polymarket trading session expired. Refresh the trade page and try again.",
);
export const POLYMARKET_RATE_LIMITED = defineError(
	"POLYMARKET_RATE_LIMITED",
	"Polymarket rate-limited the request. Wait a moment and try again.",
);
export const POLYMARKET_CTF_BALANCE_READ_FAILED = defineError(
	"POLYMARKET_CTF_BALANCE_READ_FAILED",
	"Could not read Polymarket CTF balance before sell",
);
/** Polymarket builder relayer POST /submit — deposit wallet has an in-flight action. */
export const POLYMARKET_RELAYER_WALLET_BUSY = defineError(
	"POLYMARKET_RELAYER_WALLET_BUSY",
	"Polymarket is still processing another transaction for this wallet. Wait a minute without retrying, then try again.",
);
