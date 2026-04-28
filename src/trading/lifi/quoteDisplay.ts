import { formatUnits } from "viem";
import type { LifiQuoteResponse } from "@/types/trading";

export type LifiQuoteSummary = {
	/** Human-ish receive amount if parseable */
	receiveLabel: string | null;
	/** Single fee line or aggregate if parseable */
	feeLabel: string | null;
};

/** Send / receive / total non-gas fees in USD for the bridge card */
export type BridgeQuoteUsdLines = {
	sendUsd: string | null;
	receiveUsd: string | null;
	feeUsd: string | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
	return v !== null && typeof v === "object" && !Array.isArray(v);
}

function stringish(v: unknown): string | null {
	if (typeof v === "string" && v.trim()) return v;
	if (typeof v === "number" && Number.isFinite(v)) return String(v);
	return null;
}

function formatUsd(n: number): string {
	return new Intl.NumberFormat(undefined, {
		style: "currency",
		currency: "USD",
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(n);
}

function formatUsdFromCents(cents: number): string {
	return formatUsd(cents / 100);
}

/**
 * Parse LI.FI / server amount: plain digit strings are **base units** using `decimals`
 * (e.g. 6 for USDC, 18 for BEP-20 USDT); otherwise treat as human decimal string.
 */
export function parseRawTokenAmountToNumber(
	raw: string | null | undefined,
	decimals: number
): number | null {
	if (raw == null) return null;
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) return null;
	const t = String(raw).trim();
	if (!t) return null;
	if (/^\d+$/.test(t)) {
		try {
			return Number(formatUnits(BigInt(t), decimals));
		} catch {
			return null;
		}
	}
	const f = parseFloat(t);
	return Number.isFinite(f) ? f : null;
}

/**
 * @deprecated Prefer {@link parseRawTokenAmountToNumber} with the correct token decimals.
 * Stable (e.g. pUSD) 6-decimal base units only.
 */
export function parseUsdcLikeAmountToNumber(raw: string | null | undefined): number | null {
	return parseRawTokenAmountToNumber(raw, 6);
}

/** `fromFundingStable` / `toFundingStable` (server) or LI.FI `action` / `estimate` tokens */
function resolveTokenDecimals(response: LifiQuoteResponse, side: "from" | "to"): number {
	const envelope = response as Record<string, unknown>;
	const stableKey = side === "from" ? "fromFundingStable" : "toFundingStable";
	const stable = envelope[stableKey];
	if (isRecord(stable) && typeof stable.decimals === "number") {
		const d = stable.decimals;
		if (Number.isInteger(d) && d >= 0 && d <= 36) return d;
	}

	const q = response.quote;
	if (isRecord(q)) {
		const action = q.action;
		if (isRecord(action)) {
			const tok = side === "from" ? action.fromToken : action.toToken;
			if (isRecord(tok) && typeof tok.decimals === "number") {
				const d = tok.decimals;
				if (Number.isInteger(d) && d >= 0 && d <= 36) return d;
			}
		}
		const est = q.estimate;
		if (isRecord(est)) {
			const tok = side === "from" ? est.fromToken : est.toToken;
			if (isRecord(tok) && typeof tok.decimals === "number") {
				const d = tok.decimals;
				if (Number.isInteger(d) && d >= 0 && d <= 36) return d;
			}
		}
	}
	return 6;
}

/** LI.FI `estimate.fromAmountUSD` / `toAmountUSD` (already in USD). */
function findEstimateAmountUsd(response: LifiQuoteResponse, side: "from" | "to"): number | null {
	const key = side === "from" ? "fromAmountUSD" : "toAmountUSD";
	const q = response.quote;
	if (!isRecord(q)) return null;
	const estimate = q.estimate;
	if (isRecord(estimate)) {
		const v = stringish(estimate[key]);
		if (v) {
			const n = parseFloat(v);
			if (Number.isFinite(n)) return n;
		}
	}
	return null;
}

function findFromAmountRaw(response: LifiQuoteResponse): string | null {
	const top = stringish(response.fromAmount);
	if (top) return top;
	const q = response.quote;
	if (!isRecord(q)) return null;
	const est = q.estimate;
	if (isRecord(est)) {
		const a = stringish(est.fromAmount) ?? stringish(est.min);
		if (a) return a;
	}
	const action = q.action;
	if (isRecord(action)) {
		const fromTok = action.fromToken;
		if (isRecord(fromTok)) {
			const a = stringish(fromTok.amount);
			if (a) return a;
		}
	}
	return null;
}

/** Pull nested LI.FI / server-normalized shapes for "to" amount */
function findToAmountRaw(quote: LifiQuoteResponse): string | null {
	if (stringish(quote.toAmount)) return stringish(quote.toAmount);

	const q = quote.quote;
	if (!isRecord(q)) return null;

	const estimate = q.estimate;
	if (isRecord(estimate)) {
		/** Do not use *AmountUSD here — those are USD floats, not token base units (fixes 18-dec USDT). */
		const t = stringish(estimate.toAmount) ?? stringish(estimate.toAmountMin);
		if (t) return t;
	}

	const action = q.action;
	if (isRecord(action)) {
		const toToken = action.toToken;
		if (isRecord(toToken)) {
			const amt = stringish(toToken.amount);
			if (amt) return amt;
		}
	}

	const to = q.to;
	if (isRecord(to)) {
		const t = stringish(to.amount) ?? stringish(to.min);
		if (t) return t;
	}

	return null;
}

function isGasRelatedFeeItem(item: Record<string, unknown>): boolean {
	const blob = [
		stringish(item.name),
		stringish(item.type),
		stringish(item.description),
		stringish(item.tool),
	]
		.filter(Boolean)
		.join(" ")
		.toLowerCase();
	return blob.includes("gas");
}

function feeItemUsdNumber(item: Record<string, unknown>): number | null {
	const usdRaw = stringish(item.amountUSD);
	if (usdRaw) {
		const n = parseFloat(usdRaw);
		return Number.isFinite(n) ? n : null;
	}
	const amt = stringish(item.amount);
	if (!amt) return null;
	return parseUsdcLikeAmountToNumber(amt);
}

function sumNonGasFeesFromCostArray(feeCosts: unknown): number {
	if (!Array.isArray(feeCosts)) return 0;
	let sum = 0;
	for (const item of feeCosts) {
		if (!isRecord(item)) continue;
		if (isGasRelatedFeeItem(item)) continue;
		const n = feeItemUsdNumber(item);
		if (n != null && Number.isFinite(n)) sum += n;
	}
	return sum;
}

/**
 * Send $x · Receive $y · Fee $z for the bridge card.
 * When both send and receive are known, **Fee** is the reconciled remainder
 * (rounded send − rounded receive in cents) so the three lines always add up for users.
 * Otherwise falls back to summed non-gas fee line items only.
 */
export function formatBridgeQuoteUsdLines(response: LifiQuoteResponse): BridgeQuoteUsdLines {
	let sendN = findEstimateAmountUsd(response, "from");
	let recvN = findEstimateAmountUsd(response, "to");

	if (sendN == null) {
		const fromRaw = findFromAmountRaw(response);
		sendN = parseRawTokenAmountToNumber(fromRaw, resolveTokenDecimals(response, "from"));
	}
	if (recvN == null) {
		const toRaw = findToAmountRaw(response);
		recvN = parseRawTokenAmountToNumber(toRaw, resolveTokenDecimals(response, "to"));
	}

	let feeSum = 0;
	const q = response.quote;
	if (isRecord(q)) {
		const primary = q.feeCosts;
		const est = q.estimate;
		const fallback = isRecord(est) ? est.feeCosts : undefined;
		const list =
			Array.isArray(primary) && primary.length > 0 ? primary : fallback;
		feeSum = sumNonGasFeesFromCostArray(list);
	}

	if (sendN != null && recvN != null) {
		const sendCents = Math.round(sendN * 100);
		const recvCents = Math.round(recvN * 100);
		const feeCents = Math.max(0, sendCents - recvCents);
		return {
			sendUsd: formatUsdFromCents(sendCents),
			receiveUsd: formatUsdFromCents(recvCents),
			feeUsd: feeCents > 0 ? formatUsdFromCents(feeCents) : null,
		};
	}

	return {
		sendUsd: sendN != null ? formatUsd(sendN) : null,
		receiveUsd: recvN != null ? formatUsd(recvN) : null,
		feeUsd: feeSum > 0 ? formatUsd(feeSum) : null,
	};
}

/** Stable key for displayed send/receive/fee + route shape — skip React updates if unchanged (30s refresh). */
export function getBridgeQuoteFingerprint(r: LifiQuoteResponse): string {
	const lines = formatBridgeQuoteUsdLines(r);
	const steps = r.steps ?? [];
	let tool = typeof r.tool === "string" ? r.tool : "";
	const q = r.quote;
	if (!tool && isRecord(q) && "tool" in q) {
		const t = (q as { tool?: unknown }).tool;
		if (typeof t === "string") tool = t;
	}
	return JSON.stringify({
		s: lines.sendUsd,
		r: lines.receiveUsd,
		f: lines.feeUsd,
		n: steps.length,
		tool,
		fa: r.fromAmount ?? null,
	});
}

function summarizeFeeCosts(feeCosts: unknown): string | null {
	if (!Array.isArray(feeCosts) || feeCosts.length === 0) return null;
	const parts: string[] = [];
	for (const item of feeCosts) {
		if (!isRecord(item)) continue;
		const name = stringish(item.name) ?? stringish(item.type) ?? "Fee";
		const amt =
			stringish(item.amount) ??
			stringish(item.amountUSD) ??
			stringish(item.minimum) ??
			stringish(item.amountMin);
		if (amt) parts.push(`${name}: ${amt}`);
	}
	if (parts.length === 0) return null;
	return parts.join(" · ");
}

/** Defensive summary for quote card — omit lines when structure unknown */
export function summarizeLifiQuote(response: LifiQuoteResponse): LifiQuoteSummary {
	const q = response.quote;
	let feeLabel: string | null = null;

	if (isRecord(q)) {
		feeLabel =
			summarizeFeeCosts(q.feeCosts) ??
			(isRecord(q.estimate) ? summarizeFeeCosts(q.estimate.feeCosts) : null);
	}

	const receiveRaw = findToAmountRaw(response);
	const receiveLabel = receiveRaw ? receiveRaw : null;

	return { receiveLabel, feeLabel };
}
