import { waitForBaseTransactionSuccess } from "@/features/trading/chains/waitPrivyBaseTxReceipt";
import {
	readFundingStableBalancesForChains,
	type FundingAddressesInput,
	type FundingStableBalancesHuman,
} from "@/features/trading/sor/prefund/fundingStableBalances";
import { PREFUND_SHORTFALL_COVERED_EPS_USD } from "@/features/trading/sor/prefund/prefundPlan";
import { LIMITLESS_SCW_WITHDRAW_TIMEOUT_MS } from "@/features/trading/sor/prefund/sorBridgeWallTimeBudget";
import { withTimeout } from "@/shared/async/withTimeout";

export { LIMITLESS_SCW_WITHDRAW_TIMEOUT_MS } from "@/features/trading/sor/prefund/sorBridgeWallTimeBudget";

/** API may return `{ success, data }` from predictions; Limitless wire may be bare. */
function unwrapWithdrawWire(raw: unknown): unknown {
	if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
	const o = raw as Record<string, unknown>;
	if (o.success === true && "data" in o && o.data !== undefined && o.data !== null) {
		return o.data;
	}
	return raw;
}

function valueAtKnownTxHashKeys(o: Record<string, unknown>): `0x${string}` | null {
	for (const [k, v] of Object.entries(o)) {
		if (typeof v !== "string") continue;
		const kl = k.toLowerCase();
		if (kl !== "transactionhash" && kl !== "txhash") continue;
		const t = v.trim();
		if (/^0x[0-9a-fA-F]{64}$/i.test(t)) return t as `0x${string}`;
	}
	return null;
}

/**
 * Shallow hash extraction only — never deep-walks nested portfolio/history blobs
 * (wrong hash → false receipt success).
 */
function extractWithdrawTxHashShallow(raw: unknown): `0x${string}` | null {
	const u = unwrapWithdrawWire(raw);
	if (!u || typeof u !== "object" || Array.isArray(u)) return null;
	const top = u as Record<string, unknown>;
	const d0 = valueAtKnownTxHashKeys(top);
	if (d0) return d0;
	const inner = top.data;
	if (inner && typeof inner === "object" && !Array.isArray(inner)) {
		const d1 = valueAtKnownTxHashKeys(inner as Record<string, unknown>);
		if (d1) return d1;
	}
	const tx = top.transaction;
	if (tx && typeof tx === "object" && !Array.isArray(tx)) {
		const t = tx as Record<string, unknown>;
		for (const v of Object.values(t)) {
			if (typeof v !== "string") continue;
			const s = v.trim();
			if (/^0x[0-9a-fA-F]{64}$/i.test(s)) return s as `0x${string}`;
		}
	}
	return null;
}

function summarizeWithdrawWireForError(raw: unknown): string {
	const u = unwrapWithdrawWire(raw);
	if (u == null) return "empty withdraw payload.";
	if (typeof u !== "object" || Array.isArray(u)) {
		return `unexpected payload type: ${typeof u}.`;
	}
	const o = u as Record<string, unknown>;
	const parts: string[] = [];
	for (const k of ["status", "state", "id", "message"] as const) {
		const v = o[k];
		if (typeof v === "string" && v.trim().length > 0) {
			parts.push(`${k}=${v.trim().slice(0, 240)}`);
		} else if (typeof v === "number" || typeof v === "boolean") {
			parts.push(`${k}=${String(v)}`);
		}
	}
	if (parts.length > 0) return parts.join("; ");
	return `keys on wire: ${Object.keys(o).sort().join(", ")}`;
}

function upstreamWithdrawRejectionMessage(raw: unknown): string | undefined {
	const u = unwrapWithdrawWire(raw);
	if (!u || typeof u !== "object" || Array.isArray(u)) return undefined;
	const m = (u as Record<string, unknown>).message;
	return typeof m === "string" && m.trim().length > 0 ? m.trim() : undefined;
}

function applyLedgerAfterConfirmedWithdraw(input: {
	balancesHuman: FundingStableBalancesHuman;
	scwBefore: number;
	makerBefore?: number;
	credit: number;
}): void {
	const { balancesHuman, scwBefore, makerBefore, credit } = input;
	balancesHuman.base = Math.max(balancesHuman.base, scwBefore + credit);
	if (typeof makerBefore === "number" && Number.isFinite(makerBefore)) {
		balancesHuman.limitlessMakerBase = Math.max(0, makerBefore - credit);
	}
}

/**
 * After `POST /api/limitless/portfolio/withdraw` succeeds (HTTP 2xx):
 * requires a Base `transactionHash` on the wire, waits once for receipt (bounded),
 * then updates `balancesHuman` from ledger and optionally one RPC read if still short.
 */
export async function waitForScwUsdcAfterLimitlessPortfolioWithdraw(input: {
	fundingAddresses: FundingAddressesInput;
	withdrawResponse: unknown;
	targetScwMinUsd: number;
	balancesHuman?: FundingStableBalancesHuman;
	/** SCW Base USDC before POST — required for ledger fast path with `withdrawCreditsScwUsdApprox`. */
	scwUsdcBeforeWithdraw?: number;
	/** USDC amount requested in POST (credits SCW when on-chain transfer succeeds). */
	withdrawCreditsScwUsdApprox?: number;
	/** Limitless maker USDC before POST — optional ledger decrement. */
	limitlessMakerUsdcBeforeWithdraw?: number;
}): Promise<void> {
	const target = Math.max(0, input.targetScwMinUsd);

	const credit = input.withdrawCreditsScwUsdApprox;
	const scwBefore = input.scwUsdcBeforeWithdraw;
	const mkBefore = input.limitlessMakerUsdcBeforeWithdraw;
	const canLedger =
		input.balancesHuman != null &&
		typeof credit === "number" &&
		Number.isFinite(credit) &&
		credit > 0 &&
		typeof scwBefore === "number" &&
		Number.isFinite(scwBefore);

	const hash = extractWithdrawTxHashShallow(input.withdrawResponse);
	if (!hash) {
		const rejectMsg = upstreamWithdrawRejectionMessage(input.withdrawResponse);
		if (rejectMsg) {
			throw new Error(
				`[SOR][limitless-withdraw][rejected] ${rejectMsg} If this mentions whitelisted withdrawal addresses, sign in again so your smart wallet can be allowlisted, or add that address in Limitless.`,
			);
		}
		const detail = summarizeWithdrawWireForError(input.withdrawResponse);
		throw new Error(
			`[SOR][limitless-withdraw][no_tx_hash] Limitless portfolio withdraw returned no verifiable Base transaction hash (need 0x + 64 hex). ${detail} Check DevTools → Network → POST …/portfolio/withdraw response body. Without a hash the client cannot wait for a receipt.`,
		);
	}

	let receiptError: unknown;
	try {
		await withTimeout(
			waitForBaseTransactionSuccess(hash, "Limitless portfolio withdraw (USDC → Base SCW)"),
			LIMITLESS_SCW_WITHDRAW_TIMEOUT_MS,
			"Limitless withdraw Base receipt",
		);
	} catch (e) {
		receiptError = e;
	}
	if (receiptError != null) {
		const inner = receiptError instanceof Error ? receiptError.message : String(receiptError);
		throw new Error(
			`[SOR][limitless-withdraw][receipt] Base receipt wait failed for ${hash.slice(0, 14)}… (${inner})`,
		);
	}

	if (canLedger) {
		applyLedgerAfterConfirmedWithdraw({
			balancesHuman: input.balancesHuman!,
			scwBefore,
			makerBefore: mkBefore,
			credit,
		});
		if (input.balancesHuman!.base + PREFUND_SHORTFALL_COVERED_EPS_USD >= target) {
			return;
		}
		const b = await readFundingStableBalancesForChains(input.fundingAddresses, [
			"base",
			"limitlessMakerBase",
		]);
		input.balancesHuman!.base = b.base;
		input.balancesHuman!.limitlessMakerBase = b.limitlessMakerBase;
		if (b.base + PREFUND_SHORTFALL_COVERED_EPS_USD >= target) {
			return;
		}
		throw new Error(
			`[SOR][limitless-withdraw][balance_shortfall] Withdraw tx ${hash.slice(0, 14)}… succeeded on Base but SCW USDC (~$${b.base.toFixed(4)}) is still below target ~$${target.toFixed(4)} after crediting ~$${credit.toFixed(4)}.`,
		);
	}

	const b = await readFundingStableBalancesForChains(input.fundingAddresses, [
		"base",
		"limitlessMakerBase",
	]);
	if (input.balancesHuman) {
		input.balancesHuman.base = b.base;
		input.balancesHuman.limitlessMakerBase = b.limitlessMakerBase;
	}
	const sw = Math.max(0, b.base ?? 0);
	if (sw + PREFUND_SHORTFALL_COVERED_EPS_USD >= target) {
		return;
	}
	throw new Error(
		`[SOR][limitless-withdraw][balance_shortfall] After confirmed withdraw ${hash.slice(0, 14)}…, on-chain SCW USDC (~$${sw.toFixed(4)}) is still below target ~$${target.toFixed(4)} (no in-memory ledger path was provided).`,
	);
}
