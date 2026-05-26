import type { DflowOrderStatusResponse } from "@/services/privateApi/client";
import {
	formatLimitlessDelegatedOrderError,
	userMessage,
	SOR_LIMITLESS_ORDER_NOT_FILLED,
	SOR_NO_VALID_ORDER_RESPONSE,
	SOR_ORDER_NOT_CONFIRMED,
} from "@/errors";
import { floorSharesAtDecimals } from "@/features/trading/utils/floorShares";

/**
 * Limitless SDK `calculateFOKAmounts` rejects `makerAmount` when `.toString()`
 * has more than 6 fractional digits. We floor (never round half-up) to keep
 * sells from drifting above the wallet's actual balance — same rule the
 * trade box display uses (`formatShareCountDisplay`) and that Polymarket
 * enforces via its CTF clamp. `Number(toFixed(6))` was previously used and
 * could promote `3.3799999` to `3.38`, causing venues to reject the order.
 */
export function floorLimitlessFokMakerAmountHuman(n: number): number {
	return floorSharesAtDecimals(n, 6);
}

/** `pendingUsdcMicro` from `GET /portfolio/base-smart-wallet-pending-usdc`. */
export function scwPendingMicrosToHumanUsd(micro: string | undefined): number {
	if (typeof micro !== "string") return 0;
	const t = micro.trim();
	if (!t || !/^\d+$/.test(t)) return 0;
	try {
		return Number(BigInt(t)) / 1e6;
	} catch {
		return 0;
	}
}

/**
 * DFlow prediction-market orders are async end-to-end. `POST /api/dflow/orders`
 * does not return until the server observes DFlow `/order-status` === `closed`
 * (or returns a non-2xx with DFlow `msg`/`code`/`reverts` on failure). The SOR leg
 * is marked filled only on HTTP 200 from that route. Post-trade balance refetch
 * (`usePostTradeAccountSync`) still converges positions after settlement.
 */
export function sumDflowFillOutBaseUnitsForOutputMint(
	fills: DflowOrderStatusResponse["fills"],
	outputMint: string,
): bigint {
	const t = outputMint.trim();
	if (!t || !fills?.length) return 0n;
	let s = 0n;
	for (const f of fills) {
		const om = typeof f.outputMint === "string" ? f.outputMint.trim() : "";
		if (om !== t) continue;
		const raw = typeof f.outAmount === "string" ? f.outAmount.trim() : "";
		if (!raw) continue;
		try {
			s += BigInt(raw);
		} catch {
			continue;
		}
	}
	return s;
}

/**
 * Detect Polymarket order errors that imply a missing/revoked allowance on the
 * Safe and would be cured by re-running the onboarding approval batch.
 *
 * - "not approved" — CLOB pre-trade check failure
 * - "not enough balance / allowance" — CLOB error string when the maker
 *   (Safe) hasn't approved the CTF Exchange or pUSD spender
 * - "ERC20: transfer amount exceeds allowance" — on-chain revert reason from
 *   the wrap/unwrap path or pUSD `transferFrom` inside CLOB settlement
 * - The Polymarket relay revert sentinel from `safeActions.ts` — wraps the
 *   above on-chain message when the relayer reports STATE_FAILED
 */
export function isPolymarketAllowanceRecoverableError(message: string): boolean {
	const m = message.toLowerCase();
	return (
		m.includes("not approved") ||
		m.includes("not enough balance / allowance") ||
		m.includes("transfer amount exceeds allowance") ||
		m.includes("insufficient allowance") ||
		m.includes("polymarket deposit wallet relay transaction reverted on-chain")
	);
}

/**
 * Limitless `POST /orders` returns 200 with either a real order/execution
 * payload or a partner error shape such as `{ message: "Insufficient collateral…" }`.
 */
export function interpretLimitlessDelegatedOrderResponse(
	response: unknown,
): { ok: true } | { ok: false; error: string } {
	if (response == null || typeof response !== "object" || Array.isArray(response)) {
		return { ok: false, error: userMessage(SOR_NO_VALID_ORDER_RESPONSE) };
	}
	const o = response as Record<string, unknown>;

	if (typeof o.error === "string" && o.error.trim() !== "") {
		return {
			ok: false,
			error: formatLimitlessDelegatedOrderError(o.error),
		};
	}

	const ord = o.order;
	if (ord && typeof ord === "object" && !Array.isArray(ord)) {
		const id = (ord as { id?: unknown }).id;
		if (id !== undefined && id !== null && String(id).trim() !== "") {
			return { ok: true };
		}
	}

	const nestedData = o.data;
	if (nestedData && typeof nestedData === "object" && !Array.isArray(nestedData)) {
		const nestedOrder = (nestedData as { order?: unknown }).order;
		if (nestedOrder && typeof nestedOrder === "object" && !Array.isArray(nestedOrder)) {
			const id = (nestedOrder as { id?: unknown }).id;
			if (id !== undefined && id !== null && String(id).trim() !== "") {
				return { ok: true };
			}
		}
	}

	const ex = o.execution;
	if (ex && typeof ex === "object" && !Array.isArray(ex)) {
		const matched = (ex as { matched?: unknown }).matched;
		if (matched === true) {
			return { ok: true };
		}
		if (matched === false) {
			const m =
				typeof o.message === "string" && o.message.trim() !== ""
					? formatLimitlessDelegatedOrderError(o.message)
					: userMessage(SOR_LIMITLESS_ORDER_NOT_FILLED);
			return { ok: false, error: m };
		}
		// `matched` omitted — still a structured execution payload; treat as success.
		return { ok: true };
	}

	if (typeof o.message === "string" && o.message.trim() !== "") {
		return {
			ok: false,
			error: formatLimitlessDelegatedOrderError(o.message),
		};
	}

	return {
		ok: false,
		error: userMessage(SOR_ORDER_NOT_CONFIRMED),
	};
}
