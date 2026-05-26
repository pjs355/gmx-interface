import { formatUnits } from "viem";
import type { LifiQuoteRequestBody, LifiQuoteResponse } from "@/types/trading";
import {
	lifiSourceStableDecimals,
	prefundQuoteAmountHuman,
} from "@/features/trading/lifi/prefundFromAmountHuman";
import { SOR_PREFUND_QUOTE_MAX_ITERS } from "@/features/trading/sor/prefund/sorBridgeWallTimeBudget";

function asRecord(v: unknown): Record<string, unknown> | null {
	if (v && typeof v === "object" && !Array.isArray(v)) {
		return v as Record<string, unknown>;
	}
	return null;
}

/** Destination stable decimals for LI.FI funding routes (matches `readFundingStableBalancesHuman`). */
function stableDecimalsForLifiToChain(toChainLifi: number): number {
	if (toChainLifi === 56) return 18;
	return 6;
}

function atomicStableHuman(raw: string, toChainLifi: number): number | null {
	if (!/^[0-9]+$/.test(raw)) return null;
	try {
		const dec = stableDecimalsForLifiToChain(toChainLifi);
		return Number(formatUnits(BigInt(raw), dec));
	} catch {
		return null;
	}
}

/**
 * When only an **expected** `toAmount` is present (not `toAmountMin`), treat it
 * as an optimistic upper-ish bound for received stable — haircut before
 * comparing to `destPortionUsd` so we do not accept routes whose true minimum
 * could still fall short.
 */
const PREFUND_SOFT_DEST_HAIRCUT = 0.98;

export type PrefundLifiQuoteClient = {
	postFundingLifiQuote(body: LifiQuoteRequestBody): Promise<LifiQuoteResponse>;
};

const PREFUND_QUOTE_SLIPPAGE = 0.005;
const PREFUND_QUOTE_COVER_RATIO = 1.02;

/**
 * When `sendHuman` is already at the wallet cap, LI.FI's **minimum** destination stable
 * is often slightly below the nominal source USD (fees / route haircut). Requiring
 * `minTo >= destNeed` with `destNeed === send` is then impossible. Allow a bounded slack
 * so multi-step prefund can complete the Base chunk and continue with Solana, etc.
 */
const PREFUND_CAP_DEST_ABS_SLACK_USD = 0.06;
const PREFUND_CAP_DEST_REL_SLACK = 0.035;

/** Minimum quoted min-dest (human) we still treat as acceptable at send cap vs `destNeed`. */
export function prefundDestNeedFloorAtSendCap(destNeed: number): number {
	const need = Math.max(0, destNeed);
	if (need <= 1e-12) return 0;
	const relSlack = Math.max(PREFUND_CAP_DEST_REL_SLACK * need, PREFUND_CAP_DEST_ABS_SLACK_USD);
	const cappedSlack = Math.min(need * 0.4, relSlack);
	return Math.max(0, need - cappedSlack);
}

/**
 * Best-effort **parsed** destination stablecoin (human) from a raw LI.FI quote:
 * prefers `estimate.toAmountMin`, then `estimate.toAmount`, then `action.toAmount`
 * (no haircut — for diagnostics / tests).
 */
export function parseLifiQuoteMinToStableHuman(
	quoteRoot: unknown,
	toChainLifi: number,
): number | null {
	const root = asRecord(quoteRoot);
	if (!root) return null;

	const est = asRecord(root.estimate);
	if (est) {
		const min = est.toAmountMin;
		if (typeof min === "string") {
			const h = atomicStableHuman(min, toChainLifi);
			if (h != null) return h;
		}
		const to = est.toAmount;
		if (typeof to === "string") {
			const h = atomicStableHuman(to, toChainLifi);
			if (h != null) return h;
		}
	}

	const action = asRecord(root.action);
	if (action) {
		const a = action.toAmount;
		if (typeof a === "string") {
			return atomicStableHuman(a, toChainLifi);
		}
	}

	return null;
}

/**
 * Conservative **minimum destination stable (human)** for prefund checks.
 * Uses `estimate.toAmountMin` when present; otherwise applies a 2% haircut
 * (`PREFUND_SOFT_DEST_HAIRCUT`) to expected `toAmount` fields.
 */
export function prefundQuotedMinDestHuman(quoteRoot: unknown, toChainLifi: number): number | null {
	const root = asRecord(quoteRoot);
	if (!root) return null;

	const est = asRecord(root.estimate);
	if (est) {
		const min = est.toAmountMin;
		if (typeof min === "string") {
			const h = atomicStableHuman(min, toChainLifi);
			if (h != null) return h;
		}
		const to = est.toAmount;
		if (typeof to === "string") {
			const h = atomicStableHuman(to, toChainLifi);
			if (h != null) return h * PREFUND_SOFT_DEST_HAIRCUT;
		}
	}

	const action = asRecord(root.action);
	if (action) {
		const a = action.toAmount;
		if (typeof a === "string") {
			const h = atomicStableHuman(a, toChainLifi);
			if (h != null) return h * PREFUND_SOFT_DEST_HAIRCUT;
		}
	}

	return null;
}

/**
 * Fetches a LI.FI quote and, if the quoted **minimum** destination stable is below
 * `destPortionUsd`, scales up `amountHuman` (bounded by `min(maxFromHuman, budgetUsd)`)
 * and re-quotes.
 *
 * `budgetUsd` is the strict per-corridor source-debit ceiling (= optimizer's
 * `executionAmountUsd + bridge.estimatedCost`, summed for grouped legs). Capping at
 * `min(walletBalance, budget)` prevents iteration from spending past the user's
 * typed `request.amount` even when the source wallet has more available.
 */
export async function ensurePrefundQuoteMeetsDestMin(args: {
	api: PrefundLifiQuoteClient;
	fromChainLifi: number;
	toChainLifi: number;
	fromAddress: string;
	toAddress: string;
	/** Nominal USD this hop should deliver on the destination (from prefund step sizing). */
	destPortionUsd: number;
	/** Source-wallet stable balance (physical cap). */
	maxFromHuman: number;
	/**
	 * Per-corridor source-debit ceiling from the optimizer
	 * (`executionAmountUsd + bridge.estimatedCost`). Required — drops the cap to
	 * `min(maxFromHuman, budgetUsd)` so the bridge cannot exceed the optimizer's
	 * per-leg allocation regardless of wallet headroom.
	 */
	budgetUsd: number;
	seedAmountHuman: string;
	/**
	 * When prefunding for LevelUp `POST /orders`, quoted **min** destination stable at the
	 * send cap must still clear **full** `destNeed` — collateral matches signed `makerAmount`
	 * micros; the default slack (`prefundDestNeedFloorAtSendCap`) can otherwise accept cents short.
	 */
	strictDestMinAtSendCap?: boolean;
	/**
	 * On-chain source stable balance (wei). **Required** for 18-decimal sources (BNB USDT);
	 * optional for 6-decimal chains — when set, `amountHuman` is clamped so parsed atomic ≤ this.
	 */
	maxFromWei?: bigint | null;
}): Promise<{ quote: LifiQuoteResponse; amountHuman: string }> {
	const destNeed = Math.max(0, args.destPortionUsd);
	let sendHuman = Math.max(0, Number(args.seedAmountHuman));
	if (!Number.isFinite(sendHuman) || sendHuman <= 0) {
		throw new Error("Invalid prefund seed amountHuman");
	}
	const wallet = Math.max(0, args.maxFromHuman);
	const budget = Math.max(0, args.budgetUsd);
	if (!Number.isFinite(args.budgetUsd) || args.budgetUsd <= 0) {
		throw new Error("ensurePrefundQuoteMeetsDestMin: budgetUsd must be > 0");
	}
	const cap = Math.min(wallet, budget);
	const fromDec = lifiSourceStableDecimals(args.fromChainLifi);
	if (fromDec === 18 && args.maxFromWei == null) {
		throw new Error(
			"ensurePrefundQuoteMeetsDestMin: maxFromWei is required when fromChain uses 18-decimal stable (BNB USDT)",
		);
	}

	for (let iter = 0; iter < SOR_PREFUND_QUOTE_MAX_ITERS; iter++) {
		sendHuman = Math.min(sendHuman, cap);
		if (sendHuman <= 1e-12) {
			throw new Error("Prefund LI.FI quote: send amount clamped to zero on source chain");
		}

		const amountHuman = prefundQuoteAmountHuman({
			sendHuman,
			capHuman: cap,
			fromChainLifi: args.fromChainLifi,
			maxFromWei: args.maxFromWei,
		});
		if (amountHuman === "0") {
			throw new Error("Prefund LI.FI quote: floored send amountHuman is zero on source chain");
		}

		const q = await args.api.postFundingLifiQuote({
			fromChain: args.fromChainLifi,
			toChain: args.toChainLifi,
			amountHuman,
			fromAddress: args.fromAddress,
			toAddress: args.toAddress,
			slippage: PREFUND_QUOTE_SLIPPAGE,
		});
		if (!q.steps?.length) {
			throw new Error("LI.FI returned no bridge steps");
		}

		const minTo = prefundQuotedMinDestHuman(q.quote, args.toChainLifi);
		if (minTo == null || !Number.isFinite(minTo)) {
			if (iter === SOR_PREFUND_QUOTE_MAX_ITERS - 1) {
				throw new Error(
					"LI.FI quote did not include parsable destination amount fields (toAmountMin / toAmount)",
				);
			}
			sendHuman = Math.min(sendHuman * PREFUND_QUOTE_COVER_RATIO, cap);
			continue;
		}

		if (minTo + 1e-6 >= destNeed) {
			return { quote: q, amountHuman };
		}

		// Already sending the cap but quoted min destination is still short:
		// further iterations only repeat the same capped quote — fail fast unless within fee slack.
		if (sendHuman + 1e-9 >= cap && cap > 1e-12) {
			const floor = args.strictDestMinAtSendCap
				? destNeed
				: prefundDestNeedFloorAtSendCap(destNeed);
			if (minTo + 1e-6 >= floor) {
				return { quote: q, amountHuman };
			}
			const capLabel =
				wallet <= budget
					? `source balance cap ~$${wallet.toFixed(4)}`
					: `per-corridor budget cap ~$${budget.toFixed(4)} (source balance ~$${wallet.toFixed(4)})`;
			throw new Error(
				`Prefund LI.FI: ${capLabel} cannot meet quoted min destination ~$${minTo.toFixed(4)} (need ~$${destNeed.toFixed(4)})`,
			);
		}

		if (iter === SOR_PREFUND_QUOTE_MAX_ITERS - 1) {
			throw new Error(
				`LI.FI quoted min destination ~$${minTo.toFixed(4)} is below required ~$${destNeed.toFixed(4)} after scaling send amount`,
			);
		}

		const scale = (destNeed / Math.max(minTo, 1e-9)) * PREFUND_QUOTE_COVER_RATIO;
		const nextSend = Math.min(sendHuman * scale, cap);
		if (nextSend <= sendHuman + 1e-12) {
			throw new Error(
				`Prefund LI.FI: cannot scale send further (at ~$${sendHuman.toFixed(4)}, min dest ~$${minTo.toFixed(4)}, need ~$${destNeed.toFixed(4)}, cap ~$${cap.toFixed(4)})`,
			);
		}
		sendHuman = nextSend;
	}

	throw new Error("Prefund LI.FI quote iteration exhausted");
}
