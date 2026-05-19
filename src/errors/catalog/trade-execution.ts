import { defineError } from "../types";

/** Trade box / LevelUp CTF / venue setup (non-SOR leg) errors. */

export const TRADE_NOT_AUTHENTICATED = defineError(
	"TRADE_NOT_AUTHENTICATED",
	"Sign in to place a trade.",
);
export const TRADE_NO_WALLET = defineError(
	"TRADE_NO_WALLET",
	"No wallet connected. Connect your account and try again.",
);
export const TRADE_ALREADY_PROCESSING = defineError(
	"TRADE_ALREADY_PROCESSING",
	"A trade is already in progress. Wait for it to finish.",
);
export const TRADE_MISSING_FIELDS = defineError(
	"TRADE_MISSING_FIELDS",
	"Enter an outcome, amount, and price (for limit orders) before submitting.",
);
export const TRADE_SOR_NOT_READY = defineError(
	"TRADE_SOR_NOT_READY",
	"Price is still loading. Wait a moment and try again.",
);
export const TRADE_INSUFFICIENT_SHARES = defineError(
	"TRADE_INSUFFICIENT_SHARES",
	"Not enough shares to sell for this order.",
);

export const TRADE_LEVELUP_NO_MARKET = defineError(
	"TRADE_LEVELUP_NO_MARKET",
	"Market data is missing. Refresh the page and try again.",
);
export const TRADE_LEVELUP_MISSING_TOKENS = defineError(
	"TRADE_LEVELUP_MISSING_TOKENS",
	"This market is not configured for trading yet. Try another market.",
);
export const TRADE_LEVELUP_INVALID_POSITION = defineError(
	"TRADE_LEVELUP_INVALID_POSITION",
	"Choose Yes or No before submitting.",
);
export const TRADE_LEVELUP_NO_SIGNER = defineError(
	"TRADE_LEVELUP_NO_SIGNER",
	"Wallet signer is not ready. Reconnect your wallet and try again.",
);
export const TRADE_LEVELUP_INVALID_MAKER = defineError(
	"TRADE_LEVELUP_INVALID_MAKER",
	"Trading wallet is not ready on Base. Refresh and try again.",
);
export const TRADE_LEVELUP_TOKEN_MISMATCH = defineError(
	"TRADE_LEVELUP_TOKEN_MISMATCH",
	"Order could not be prepared for this outcome. Refresh and try again.",
);
export const TRADE_LEVELUP_SIGNER_NO_TYPED_DATA = defineError(
	"TRADE_LEVELUP_SIGNER_NO_TYPED_DATA",
	"Your wallet cannot sign this order. Reconnect and try again.",
);
export const TRADE_LEVELUP_SIGNER_NO_GET_ADDRESS = defineError(
	"TRADE_LEVELUP_SIGNER_NO_GET_ADDRESS",
	"Your wallet is not fully connected. Reconnect and try again.",
);
export const TRADE_LEVELUP_INVALID_ORDER_SIDE = defineError(
	"TRADE_LEVELUP_INVALID_ORDER_SIDE",
	"Order side is invalid. Refresh and try again.",
);
export const TRADE_LEVELUP_ORDER_FAILED = defineError(
	"TRADE_LEVELUP_ORDER_FAILED",
	"Order could not be submitted. Try again.",
);

export const TRADE_PREDICT_APPROVALS_INCOMPLETE = defineError(
	"TRADE_PREDICT_APPROVALS_INCOMPLETE",
	"Predict trading setup did not finish. Check your wallet and try again.",
);
export const TRADE_LEVELUP_APPROVALS_INCOMPLETE = defineError(
	"TRADE_LEVELUP_APPROVALS_INCOMPLETE",
	"Trading approvals did not finish. Check your wallet and try again.",
);
export const TRADE_POLY_SAFE_NOT_PROVISIONED = defineError(
	"TRADE_POLY_SAFE_NOT_PROVISIONED",
	"Polymarket account is not ready. Open the Polymarket tab to finish setup.",
);
export const TRADE_POLY_RELAYER_UNAVAILABLE = defineError(
	"TRADE_POLY_RELAYER_UNAVAILABLE",
	"Polymarket setup is temporarily unavailable. Wait a moment and refresh.",
);
export const TRADE_POLY_APPROVALS_INCOMPLETE = defineError(
	"TRADE_POLY_APPROVALS_INCOMPLETE",
	"Polymarket approvals did not finish. Retry the trade.",
);
export const TRADE_LIMITLESS_SLUG_MISSING = defineError(
	"TRADE_LIMITLESS_SLUG_MISSING",
	"Limitless market is not linked for this match.",
);
export const TRADE_LIMITLESS_MAKER_MISSING = defineError(
	"TRADE_LIMITLESS_MAKER_MISSING",
	"Limitless account is not ready. Refresh the page or finish Limitless setup.",
);
export const TRADE_LIMITLESS_APPROVALS_INCOMPLETE = defineError(
	"TRADE_LIMITLESS_APPROVALS_INCOMPLETE",
	"Limitless approvals did not finish. Retry the trade.",
);
export const TRADE_LIMITLESS_USDC_FUNDS = defineError(
	"TRADE_LIMITLESS_USDC_FUNDS",
	"Add USDC to your Limitless balance before buying. Open Transfers and move funds from your Base wallet.",
);
export const TRADE_LIMITLESS_USDC_ALLOWANCE = defineError(
	"TRADE_LIMITLESS_USDC_ALLOWANCE",
	"Limitless still reports insufficient USDC allowance. Wait a minute and retry, or finish setup in the Limitless app.",
);
export const TRADE_LIMITLESS_NOT_READY = defineError(
	"TRADE_LIMITLESS_NOT_READY",
	"Limitless is not ready for this market. Finish setup and try again.",
);

/** DFlow / Kalshi (client + API). */
export const DFLOW_ROUTE_EXPIRED = defineError(
	"DFLOW_ROUTE_EXPIRED",
	"This quote expired. Wait for prices to refresh and try again.",
);
export const DFLOW_ORDER_FAILED = defineError(
	"DFLOW_ORDER_FAILED",
	"Kalshi order could not be placed. Try again.",
);
export const DFLOW_NO_TRANSACTION = defineError(
	"DFLOW_NO_TRANSACTION",
	"Kalshi did not return a transaction to sign. Refresh and try again.",
);
export const DFLOW_MISSING_BLOCK_HEIGHT = defineError(
	"DFLOW_MISSING_BLOCK_HEIGHT",
	"Kalshi quote is stale. Refresh and try again.",
);
