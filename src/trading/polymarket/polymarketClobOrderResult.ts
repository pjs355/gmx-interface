/**
 * Translate the raw Polymarket CLOB HTTP body into a short, user-readable
 * sentence. The raw body (e.g. `not enough balance / allowance: balance: …,
 * order amount: …, fee estimate: …, required total: …`) must never reach the
 * UI/DOM/toast — it confuses users and dumps internal accounting into HTML.
 */
function sanitizeClobErrorMessage(
	raw: string,
	status: number | undefined,
	context: string,
): string {
	const text = raw.trim();
	if (/not enough balance\s*\/\s*allowance/i.test(text)) {
		return "Polymarket rejected the order: your wallet balance is too low to cover the order and trading fees.";
	}
	if (/below.*min(imum)?\s*size/i.test(text) || /minimum order size/i.test(text)) {
		return "Polymarket rejected the order: amount is below the minimum order size.";
	}
	if (/insufficient\s*(asks|bids|liquidity)/i.test(text)) {
		return "Polymarket has insufficient liquidity to fill this order right now.";
	}
	if (
		status === 401 ||
		/unauthorized|invalid (signature|api key)|missing.*l2/i.test(text)
	) {
		return "Polymarket trading session expired. Refresh the trade page and try again.";
	}
	if (status === 429 || /rate ?limit/i.test(text)) {
		return "Polymarket rate-limited the request. Wait a moment and try again.";
	}
	const verb = context.includes("limit") ? "limit order" : "market order";
	return status
		? `Polymarket rejected the ${verb} (HTTP ${status}). Try again.`
		: `Polymarket rejected the ${verb}. Try again.`;
}

/**
 * `@polymarket/clob-client-v2` uses axios internally; on HTTP failure its `post()` helper
 * returns `{ error, status? }` instead of rejecting. Call this on every order POST result
 * so failures surface as exceptions and the UI does not show a false success.
 */
export function ensurePolymarketClobOrderSuccess(
	result: unknown,
	context: string
): void {
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
	const status =
		typeof o.status === "number" ? (o.status as number) : undefined;
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
	throw new Error(sanitizeClobErrorMessage(part, status, context));
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
