import type { SorErrorCode, SorRouteResult, SorSide, SorVenue } from "@/trading/sor/sor-types";
import { VENUE_DISPLAY_NAMES } from "@/trading/sor/sor-types";
import { getPrivateApiErrorMessage } from "@/services/privateApi/errors";
import { AppError, isAppError } from "./AppError";
import {
	POLYMARKET_BELOW_MIN_SIZE,
	POLYMARKET_INSUFFICIENT_BALANCE,
	POLYMARKET_INSUFFICIENT_LIQUIDITY,
	POLYMARKET_NO_MARKET_LIQUIDITY,
	POLYMARKET_RATE_LIMITED,
	POLYMARKET_SESSION_EXPIRED,
} from "./catalog/venues";
import {
	DFLOW_MISSING_BLOCK_HEIGHT,
	DFLOW_NO_TRANSACTION,
	DFLOW_ORDER_FAILED,
	DFLOW_ROUTE_EXPIRED,
} from "./catalog/trade-execution";
import {
	LIFI_BRIDGE_FAILED,
	LIFI_INSUFFICIENT_BALANCE,
	LIFI_INVALID_RECIPIENT,
	LIFI_INVALID_WALLET_ADDRESS,
	LIFI_INVALID_WALLET_ADDRESS_RETRY,
	LIFI_NO_BRIDGE_STEPS,
	LIFI_NO_TX_HASH,
	LIFI_NO_TX_HASH_WALLET,
	LIFI_NO_WALLET_CLIENT,
	LIFI_NO_WALLET_FOR_CHAIN,
	LIFI_POLY_EMBEDDED_WALLET_LOADING,
	LIFI_POLL_TIMEOUT,
	LIFI_SCW_LIMITLESS_SWEEP_NOT_PLANNED,
	LIFI_SOLANA_WALLET_UNAVAILABLE,
	LIFI_STATUS_FAILED,
	LIFI_STATUS_NO_FIELD,
	LIFI_STATUS_UNEXPECTED,
	LIFI_STEP_FAILED,
	LIFI_WITHDRAW_STEP_FAILED,
} from "./catalog/lifi";
import {
	SOR_ALL_BOOKS_STALE,
	SOR_AMOUNT_TOO_SMALL,
	SOR_API_HTTP_ERROR,
	SOR_API_INVALID_RESPONSE,
	SOR_API_NOT_AUTHENTICATED,
	SOR_EXECUTION_NOT_READY,
	SOR_NO_BIDS_AVAILABLE,
	SOR_NO_SHARES_AVAILABLE,
	SOR_NO_VENUES_ELIGIBLE,
	SOR_RATE_LIMITED,
	SOR_ROUTE_EXPIRED,
	SOR_ROUTE_UNAVAILABLE,
	SOR_WHOLE_SHARES_ONLY,
} from "./catalog/sor";
import {
	formatPolymarketOrderRejected,
	formatSorNoOrderBookForVenue,
	userMessage,
} from "./messages";

const POLYMARKET_NO_MATCH_RE = /^no match$/i;
const SOR_API_ERROR_RE = /^SOR API error (\d{3})\b/i;

/**
 * Map non-2xx SOR HTTP responses — never surface raw body text in the UI.
 */
export function mapSorApiHttpError(
	status: number,
	rawBody?: string | null,
): string {
	const body = (rawBody ?? "").trim();
	if (body.length > 0) {
		console.error("[SOR API] HTTP error", {
			status,
			bodyPreview: body.slice(0, 500),
		});
	}
	if (status === 401) return userMessage(SOR_API_NOT_AUTHENTICATED);
	if (status >= 500) return userMessage(SOR_API_HTTP_ERROR);
	if (status === 429) return userMessage(SOR_RATE_LIMITED);
	return userMessage(SOR_API_HTTP_ERROR);
}

/**
 * Map Polymarket CLOB client / HTTP raw text to catalog copy.
 * Never return raw vendor bodies to the UI.
 */
export function mapPolymarketClobError(
	raw: string,
	status: number | undefined,
	context: string,
): string {
	const text = raw.trim();
	if (POLYMARKET_NO_MATCH_RE.test(text)) {
		return userMessage(POLYMARKET_NO_MARKET_LIQUIDITY);
	}
	if (/not enough balance\s*\/\s*allowance/i.test(text)) {
		return userMessage(POLYMARKET_INSUFFICIENT_BALANCE);
	}
	if (/below.*min(imum)?\s*size/i.test(text) || /minimum order size/i.test(text)) {
		return userMessage(POLYMARKET_BELOW_MIN_SIZE);
	}
	if (/insufficient\s*(asks|bids|liquidity)/i.test(text)) {
		return userMessage(POLYMARKET_INSUFFICIENT_LIQUIDITY);
	}
	if (
		status === 401 ||
		/unauthorized|invalid (signature|api key)|missing.*l2/i.test(text)
	) {
		return userMessage(POLYMARKET_SESSION_EXPIRED);
	}
	if (status === 429 || /rate ?limit/i.test(text)) {
		return userMessage(POLYMARKET_RATE_LIMITED);
	}
	return formatPolymarketOrderRejected(context, status);
}

/** Map server `SorErrorCode` (+ optional server detail for logs) to UI copy. */
export function formatSorRouteFailureMessage(
	result: Extract<SorRouteResult, { success: false }>,
	targetVenue: SorVenue | undefined,
	side: SorSide,
): string {
	const code = result.code;

	if (code === "NO_MARKET_FOUND" && targetVenue) {
		return formatSorNoOrderBookForVenue(VENUE_DISPLAY_NAMES[targetVenue]);
	}
	if (code === "NO_MARKET_FOUND" || code === "NO_BOOKS_AVAILABLE") {
		return side === "buy"
			? userMessage(SOR_NO_SHARES_AVAILABLE)
			: userMessage(SOR_NO_BIDS_AVAILABLE);
	}
	if (code === "ALL_BOOKS_STALE") {
		return userMessage(SOR_ALL_BOOKS_STALE);
	}
	if (code === "NO_VENUES_ELIGIBLE") {
		return userMessage(SOR_NO_VENUES_ELIGIBLE);
	}
	if (code === "EXECUTION_NOT_READY") {
		return userMessage(SOR_EXECUTION_NOT_READY);
	}
	if (code === "AMOUNT_TOO_SMALL") {
		return userMessage(SOR_AMOUNT_TOO_SMALL);
	}
	if (code === "WHOLE_SHARES_ONLY") {
		return userMessage(SOR_WHOLE_SHARES_ONLY);
	}
	if (code === "RATE_LIMITED") {
		return userMessage(SOR_RATE_LIMITED);
	}
	if (code === "ROUTE_EXPIRED") {
		return userMessage(SOR_ROUTE_EXPIRED);
	}
	return userMessage(SOR_ROUTE_UNAVAILABLE);
}

/** Map DFlow/Kalshi API error fields — log raw code/msg, return catalog copy. */
export function mapDflowOrderError(
	code?: string | null,
	msg?: string | null,
): string {
	const detail = [code, msg].filter(Boolean).join(": ");
	if (detail.length > 0) {
		console.error("[DFlow] order error", { code: code ?? null, msg: msg ?? null });
	}
	if (/expired|route.*expired/i.test(detail)) {
		return userMessage(DFLOW_ROUTE_EXPIRED);
	}
	if (/lastValidBlockHeight|block height/i.test(detail)) {
		return userMessage(DFLOW_MISSING_BLOCK_HEIGHT);
	}
	if (/no transaction/i.test(detail)) {
		return userMessage(DFLOW_NO_TRANSACTION);
	}
	return userMessage(DFLOW_ORDER_FAILED);
}

function mapLifiAndTransferMessage(message: string): string | null {
	const t = message.trim();
	if (!t) return null;
	if (/LI\.FI returned no bridge steps/i.test(t)) {
		return userMessage(LIFI_NO_BRIDGE_STEPS);
	}
	if (/Bridge produced no transaction hash/i.test(t)) {
		return userMessage(LIFI_NO_TX_HASH);
	}
	if (/No transaction hash returned from wallet/i.test(t)) {
		return userMessage(LIFI_NO_TX_HASH_WALLET);
	}
	if (/No wallet address for source chain/i.test(t)) {
		return userMessage(LIFI_NO_WALLET_FOR_CHAIN);
	}
	if (/SCW → Limitless maker sweep was not planned/i.test(t)) {
		return userMessage(LIFI_SCW_LIMITLESS_SWEEP_NOT_PLANNED);
	}
	if (/Invalid wallet address for this route\. Refresh/i.test(t)) {
		return userMessage(LIFI_INVALID_WALLET_ADDRESS_RETRY);
	}
	if (/Invalid wallet address for this route/i.test(t)) {
		return userMessage(LIFI_INVALID_WALLET_ADDRESS);
	}
	if (/Insufficient balance in the source wallet/i.test(t)) {
		return userMessage(LIFI_INSUFFICIENT_BALANCE);
	}
	if (/Solana embedded wallet is unavailable/i.test(t)) {
		return userMessage(LIFI_SOLANA_WALLET_UNAVAILABLE);
	}
	if (/Transfers from Polymarket need your embedded wallet/i.test(t)) {
		return userMessage(LIFI_POLY_EMBEDDED_WALLET_LOADING);
	}
	if (/This route sends from your Polymarket wallet/i.test(t)) {
		return userMessage(LIFI_POLY_EMBEDDED_WALLET_LOADING);
	}
	if (/No Base smart wallet client/i.test(t)) {
		return userMessage(LIFI_NO_WALLET_CLIENT);
	}
	if (/Buy route is missing executionAmountUsd/i.test(t)) {
		return userMessage(SOR_EXECUTION_NOT_READY);
	}
	if (/Prefund step budget is zero/i.test(t)) {
		return userMessage(LIFI_STEP_FAILED);
	}
	if (/LI\.FI status response had no status field/i.test(t)) {
		return userMessage(LIFI_STATUS_NO_FIELD);
	}
	if (/LI\.FI bridge ended with status/i.test(t)) {
		return userMessage(LIFI_STATUS_FAILED);
	}
	if (/LI\.FI bridge ended with unexpected status/i.test(t)) {
		return userMessage(LIFI_STATUS_UNEXPECTED);
	}
	if (/LI\.F[Ii].*(?:poll|timeout|timed out)/i.test(t)) {
		return userMessage(LIFI_POLL_TIMEOUT);
	}
	if (/Invalid recipient address/i.test(t)) {
		return userMessage(LIFI_INVALID_RECIPIENT);
	}
	if (/^Step \d+ of \d+ failed:/i.test(t)) {
		return userMessage(LIFI_WITHDRAW_STEP_FAILED);
	}
	if (/LI\.FI step \d+/i.test(t) || /Approve tx for step/i.test(t)) {
		return userMessage(LIFI_STEP_FAILED);
	}
	if (/Bridge execution failed/i.test(t)) {
		return userMessage(LIFI_BRIDGE_FAILED);
	}
	if (/Trade route quote expired/i.test(t)) {
		return userMessage(DFLOW_ROUTE_EXPIRED);
	}
	if (/Kalshi returned no transaction/i.test(t)) {
		return userMessage(DFLOW_NO_TRANSACTION);
	}
	if (/Kalshi quote missing lastValidBlockHeight/i.test(t)) {
		return userMessage(DFLOW_MISSING_BLOCK_HEIGHT);
	}
	if (/Kalshi order failed/i.test(t)) {
		return userMessage(DFLOW_ORDER_FAILED);
	}
	return null;
}

function mapKnownErrorMessage(message: string): string | null {
	const trimmed = message.trim();
	if (!trimmed) return null;
	if (POLYMARKET_NO_MATCH_RE.test(trimmed)) {
		return userMessage(POLYMARKET_NO_MARKET_LIQUIDITY);
	}
	const lifiMapped = mapLifiAndTransferMessage(trimmed);
	if (lifiMapped) return lifiMapped;
	const polyMapped = mapPolymarketClobError(trimmed, undefined, "market order");
	if (polyMapped !== formatPolymarketOrderRejected("market order", undefined)) {
		return polyMapped;
	}
	return null;
}

/** Transfers / LI.FI UI entry — same as formatErrorForUser but prefers bridge catalog copy. */
export function formatLifiErrorForUser(err: unknown): string {
	return formatErrorForUser(err);
}

/**
 * Single UI entry for unknown throws, leg failures, and vendor errors.
 */
export function formatErrorForUser(err: unknown): string {
	if (isAppError(err)) {
		return err.message;
	}
	if (err instanceof Error) {
		const sorApi = SOR_API_ERROR_RE.exec(err.message);
		if (sorApi) {
			const status = Number(sorApi[1]);
			if (Number.isFinite(status)) {
				return mapSorApiHttpError(status, err.message);
			}
		}
		const mapped = mapKnownErrorMessage(err.message);
		if (mapped) return mapped;
		const trimmed = err.message.trim();
		if (trimmed.length > 0) {
			if (
				/CRITICAL ERROR|TOKEN ID MISMATCH|HTTP \d{3}:|LI\.FI |^Step \d+ of \d+ failed:/i.test(
					trimmed,
				)
			) {
				return userMessage(LIFI_STEP_FAILED);
			}
			return err.message;
		}
		const fromName = err.name.trim();
		if (fromName.length > 0 && fromName !== "Error") {
			return `${fromName} (no message)`;
		}
		return "Request failed";
	}
	if (typeof err === "string") {
		const mapped = mapKnownErrorMessage(err);
		if (mapped) return mapped;
		const trimmed = err.trim();
		if (trimmed.length > 0) return err;
	}
	const privateApi = getPrivateApiErrorMessage(err).trim();
	if (privateApi.length > 0) {
		const mapped = mapKnownErrorMessage(privateApi);
		if (mapped) return mapped;
		const lifiMapped = mapLifiAndTransferMessage(privateApi);
		if (lifiMapped) return lifiMapped;
		return privateApi;
	}
	return "Request failed";
}

export function throwAppError(
	def: { code: string; userMessage: string },
	options?: { cause?: unknown },
): never {
	throw new AppError(def, options);
}

/** Format Limitless partner order HTTP body errors for display. */
export function formatLimitlessDelegatedOrderError(raw: string): string {
	const mapped = mapKnownErrorMessage(raw);
	if (mapped) return mapped;
	return raw.trim();
}

export type { SorErrorCode };
