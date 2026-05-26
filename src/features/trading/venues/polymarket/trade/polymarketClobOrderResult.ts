import { mapPolymarketClobError, throwAppError } from "@/errors";

/**
 * `@polymarket/clob-client-v2` uses axios internally; on HTTP failure its `post()` helper
 * returns `{ error, status? }` instead of rejecting. Call this on every order POST result
 * so failures surface as exceptions and the UI does not show a false success.
 */
export function ensurePolymarketClobOrderSuccess(result: unknown, context: string): void {
	if (result == null || typeof result !== "object") {
		return;
	}
	const o = result as Record<string, unknown>;
	if (!Object.prototype.hasOwnProperty.call(o, "error")) {
		return;
	}
	const errVal = o.error;
	if (
		errVal === undefined ||
		errVal === null ||
		errVal === "" ||
		errVal === false ||
		errVal === 0
	) {
		return;
	}
	const status = typeof o.status === "number" ? (o.status as number) : undefined;
	const part =
		typeof errVal === "string"
			? errVal
			: errVal instanceof Error
				? errVal.message
				: JSON.stringify(errVal);
	console.error(`[Polymarket CLOB] ${context} rejected`, {
		status: status ?? null,
		raw: part,
	});
	throwAppError({
		code: "POLYMARKET_CLOB_ORDER_REJECTED",
		userMessage: mapPolymarketClobError(part, status, context),
	});
}

/** Log-friendly snapshot; avoids dumping huge payloads in the console. */
export function summarizeClobResultForLog(result: unknown): unknown {
	if (result == null) return result;
	if (typeof result !== "object") return result;
	const o = result as Record<string, unknown>;
	const keys = Object.keys(o);
	if (keys.length > 12) {
		return { _keys: keys.length, sample: keys.slice(0, 8) };
	}
	return o;
}
