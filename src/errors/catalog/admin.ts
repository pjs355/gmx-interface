import { userMessage } from "../messages";
import { defineError, type ErrorDef } from "../types";

/** Admin dashboard errors — internal tools only. */

// ── Auth ────────────────────────────────────────────────────────────────────

export const ADMIN_MISSING_ACCESS_TOKEN = defineError(
	"ADMIN_MISSING_ACCESS_TOKEN",
	"Missing admin access token. Sign in again.",
);
export const ADMIN_MISSING_IDENTITY_TOKEN = defineError(
	"ADMIN_MISSING_IDENTITY_TOKEN",
	"Missing identity token. Sign in again.",
);

// ── HTTP (admin API) ──────────────────────────────────────────────────────

export const ADMIN_HTTP_UNAUTHORIZED = defineError(
	"ADMIN_HTTP_UNAUTHORIZED",
	"Not authorized for this admin action. Sign in again.",
);
export const ADMIN_HTTP_FORBIDDEN = defineError(
	"ADMIN_HTTP_FORBIDDEN",
	"You do not have permission for this admin action.",
);
export const ADMIN_HTTP_NOT_FOUND = defineError(
	"ADMIN_HTTP_NOT_FOUND",
	"The requested admin resource was not found.",
);
export const ADMIN_HTTP_RATE_LIMITED = defineError(
	"ADMIN_HTTP_RATE_LIMITED",
	"Too many admin requests. Wait a moment and try again.",
);
export const ADMIN_HTTP_SERVER_ERROR = defineError(
	"ADMIN_HTTP_SERVER_ERROR",
	"Admin server error. Try again or check server logs.",
);
export const ADMIN_HTTP_REQUEST_FAILED = defineError(
	"ADMIN_HTTP_REQUEST_FAILED",
	"Admin request failed. Try again.",
);
export const ADMIN_HTTP_INVALID_RESPONSE = defineError(
	"ADMIN_HTTP_INVALID_RESPONSE",
	"Admin API returned an unexpected response.",
);

// ── Markets / umbrella ────────────────────────────────────────────────────

export const ADMIN_MARKET_TEAM_MAPPING_DISPLAY_NAME = defineError(
	"ADMIN_MARKET_TEAM_MAPPING_DISPLAY_NAME",
	"Team mapping is missing display name.",
);
export const ADMIN_MARKET_TEAM_MAPPING_SLUG = defineError(
	"ADMIN_MARKET_TEAM_MAPPING_SLUG",
	"Team mapping is missing slug.",
);
export const ADMIN_MARKET_QUESTION_NOT_ON_UMBRELLA = defineError(
	"ADMIN_MARKET_QUESTION_NOT_ON_UMBRELLA",
	"Unable to locate question on umbrella.",
);
export const ADMIN_MARKET_IMAGE_UPLOAD_FAILED = defineError(
	"ADMIN_MARKET_IMAGE_UPLOAD_FAILED",
	"Image upload failed.",
);
export const ADMIN_MARKET_CREATE_FAILED = defineError(
	"ADMIN_MARKET_CREATE_FAILED",
	"Failed to create market.",
);
export const ADMIN_MARKET_SAVE_UMBRELLA_FAILED = defineError(
	"ADMIN_MARKET_SAVE_UMBRELLA_FAILED",
	"Failed to save umbrella.",
);

// ── Daily games ───────────────────────────────────────────────────────────

export const ADMIN_DAILY_GAMES_LIST_NOT_AVAILABLE = defineError(
	"ADMIN_DAILY_GAMES_LIST_NOT_AVAILABLE",
	"GET endpoint not available yet. Use Add to create daily games.",
);
export const ADMIN_DAILY_GAMES_LIST_INVALID = defineError(
	"ADMIN_DAILY_GAMES_LIST_INVALID",
	"Invalid response for daily games list.",
);
export const ADMIN_DAILY_GAME_ID_REQUIRED = defineError(
	"ADMIN_DAILY_GAME_ID_REQUIRED",
	"Game ID is required.",
);
export const ADMIN_DAILY_GAME_NAME_REQUIRED = defineError(
	"ADMIN_DAILY_GAME_NAME_REQUIRED",
	"Game name is required.",
);
export const ADMIN_DAILY_GAME_SLUG_REQUIRED = defineError(
	"ADMIN_DAILY_GAME_SLUG_REQUIRED",
	"Game slug is required.",
);
export const ADMIN_DAILY_START_REQUIRED = defineError(
	"ADMIN_DAILY_START_REQUIRED",
	"Daily start time is required.",
);
export const ADMIN_INITIAL_OVER_REQUIRED = defineError(
	"ADMIN_INITIAL_OVER_REQUIRED",
	"Initial over number is required.",
);
export const ADMIN_INITIAL_OVER_POSITIVE = defineError(
	"ADMIN_INITIAL_OVER_POSITIVE",
	"Initial over number must be a positive number.",
);
export const ADMIN_DAILY_GAME_UPDATE_FAILED = defineError(
	"ADMIN_DAILY_GAME_UPDATE_FAILED",
	"Failed to update daily game.",
);
export const ADMIN_DAILY_GAME_UNKNOWN_RESPONSE = defineError(
	"ADMIN_DAILY_GAME_UNKNOWN_RESPONSE",
	"Unknown server response when creating daily game.",
);

// ── Tags ──────────────────────────────────────────────────────────────────

export const ADMIN_TAG_LABEL_REQUIRED = defineError(
	"ADMIN_TAG_LABEL_REQUIRED",
	"Tag label is required.",
);

// ── Teams ─────────────────────────────────────────────────────────────────

export const ADMIN_TEAM_DISPLAY_NAME_REQUIRED = defineError(
	"ADMIN_TEAM_DISPLAY_NAME_REQUIRED",
	"Display name is required.",
);
export const ADMIN_TEAM_SLUG_REQUIRED = defineError(
	"ADMIN_TEAM_SLUG_REQUIRED",
	"Slug is required.",
);
export const ADMIN_TEAM_SHORT_CODE_REQUIRED = defineError(
	"ADMIN_TEAM_SHORT_CODE_REQUIRED",
	"Short code is required.",
);
export const ADMIN_TEAM_PANDASCORE_ID_REQUIRED = defineError(
	"ADMIN_TEAM_PANDASCORE_ID_REQUIRED",
	"PandaScore ID is required.",
);
export const ADMIN_TEAM_PANDASCORE_ID_NUMBER = defineError(
	"ADMIN_TEAM_PANDASCORE_ID_NUMBER",
	"PandaScore ID must be a number.",
);
export const ADMIN_TEAM_UPDATE_FAILED = defineError(
	"ADMIN_TEAM_UPDATE_FAILED",
	"Failed to update team.",
);
export const ADMIN_TEAM_LIST_FAILED = defineError(
	"ADMIN_TEAM_LIST_FAILED",
	"Failed to load teams.",
);

// ── Profiles / stats / series ─────────────────────────────────────────────

export const ADMIN_PROFILES_LIST_INVALID = defineError(
	"ADMIN_PROFILES_LIST_INVALID",
	"Invalid response for profiles list.",
);
export const ADMIN_PROFILE_INVALID = defineError(
	"ADMIN_PROFILE_INVALID",
	"Invalid response for profile.",
);
export const ADMIN_STATS_INVALID = defineError(
	"ADMIN_STATS_INVALID",
	"Invalid response for stats.",
);
export const ADMIN_STATS_EMPTY = defineError("ADMIN_STATS_EMPTY", "No stats data in response.");
export const ADMIN_SERIES_LIST_INVALID = defineError(
	"ADMIN_SERIES_LIST_INVALID",
	"Invalid response for series list.",
);

// ── Wallet / claims (admin) ───────────────────────────────────────────────

export const ADMIN_WALLET_INFO_FAILED = defineError(
	"ADMIN_WALLET_INFO_FAILED",
	"Failed to load admin wallet info.",
);
export const ADMIN_CLAIM_FAILED = defineError("ADMIN_CLAIM_FAILED", "Claim failed.");
export const ADMIN_CLAIM_ALL_FAILED = defineError("ADMIN_CLAIM_ALL_FAILED", "Claim all failed.");

// ── Trade testing (admin stress tools) ────────────────────────────────────

export const ADMIN_TRADE_TEST_MISSING_DATA = defineError(
	"ADMIN_TRADE_TEST_MISSING_DATA",
	"Missing required data: market, account, signer, or orderbook.",
);
export const ADMIN_TRADE_TEST_MISSING_MARKET_SIGNER = defineError(
	"ADMIN_TRADE_TEST_MISSING_DATA_SIGNER",
	"Missing required data: market, account, or signer.",
);
export const ADMIN_TRADE_TEST_NO_TOKEN_ID = defineError(
	"ADMIN_TRADE_TEST_NO_TOKEN_ID",
	"No token ID for this market position.",
);
export const ADMIN_TRADE_TEST_NO_ORDERBOOK = defineError(
	"ADMIN_TRADE_TEST_NO_ORDERBOOK",
	"No orderbook available.",
);
export const ADMIN_TRADE_TEST_NO_ORDERBOOK_LIMIT = defineError(
	"ADMIN_TRADE_TEST_NO_ORDERBOOK_LIMIT",
	"No orderbook available for limit order pricing.",
);
export const ADMIN_TRADE_TEST_MISSING_TOKEN = defineError(
	"ADMIN_TRADE_TEST_MISSING_TOKEN",
	"Missing token ID for trade position.",
);
export const ADMIN_TRADE_TEST_FETCH_ORDERS_FAILED = defineError(
	"ADMIN_TRADE_TEST_FETCH_ORDERS_FAILED",
	"Failed to fetch orders.",
);
export const ADMIN_TRADE_TEST_FETCH_BALANCES_FAILED = defineError(
	"ADMIN_TRADE_TEST_FETCH_BALANCES_FAILED",
	"Failed to fetch balances.",
);
export const ADMIN_TRADE_TEST_API_FAILED = defineError(
	"ADMIN_TRADE_TEST_API_FAILED",
	"Trade API request failed.",
);
export const ADMIN_TRADE_TEST_SKIPPED_LOW_LIQUIDITY = defineError(
	"ADMIN_TRADE_TEST_SKIPPED_LOW_LIQUIDITY",
	"Skipped: insufficient orderbook liquidity.",
);
export const ADMIN_TRADE_TEST_SKIPPED_AMOUNT_TOO_SMALL = defineError(
	"ADMIN_TRADE_TEST_SKIPPED_AMOUNT_TOO_SMALL",
	"Skipped: adjusted trade amount too small.",
);

// ── Seed / settle market ──────────────────────────────────────────────────

export const ADMIN_SEED_MARKET_FAILED = defineError(
	"ADMIN_SEED_MARKET_FAILED",
	"Seed market request failed.",
);
export const ADMIN_SETTLE_MARKET_FAILED = defineError(
	"ADMIN_SETTLE_MARKET_FAILED",
	"Settle market request failed.",
);

// ── Generic operation failed ──────────────────────────────────────────────

export const ADMIN_OPERATION_FAILED = defineError(
	"ADMIN_OPERATION_FAILED",
	"Admin operation failed.",
);

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Map admin HTTP status (+ optional server detail for logs) to catalog copy.
 * Never return raw response bodies to the UI.
 */
export function formatAdminHttpError(status: number, serverDetail?: string | null): string {
	const detail = (serverDetail ?? "").trim();
	if (detail.length > 0) {
		console.error("[admin] HTTP error", { status, detail: detail.slice(0, 500) });
	}
	if (status === 401) return userMessage(ADMIN_HTTP_UNAUTHORIZED);
	if (status === 403) return userMessage(ADMIN_HTTP_FORBIDDEN);
	if (status === 404) return userMessage(ADMIN_HTTP_NOT_FOUND);
	if (status === 429) return userMessage(ADMIN_HTTP_RATE_LIMITED);
	if (status >= 500) return userMessage(ADMIN_HTTP_SERVER_ERROR);
	return userMessage(ADMIN_HTTP_REQUEST_FAILED);
}

export function adminErrorMessage(def: ErrorDef): string {
	return userMessage(def);
}

/** Format unknown admin catch blocks for setError / toast. */
export function formatAdminErrorForUser(err: unknown): string {
	if (err instanceof Error) {
		const msg = err.message.trim();
		if (/^HTTP \d{3}\b/i.test(msg) || /^Admin HTTP \d{3}\b/i.test(msg)) {
			const statusMatch = msg.match(/\b(\d{3})\b/);
			const status = statusMatch ? Number(statusMatch[1]) : 0;
			if (status > 0) return formatAdminHttpError(status, msg);
		}
		if (msg.length > 0) return err.message;
	}
	if (typeof err === "string" && err.trim().length > 0) return err.trim();
	return userMessage(ADMIN_OPERATION_FAILED);
}
