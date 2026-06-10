/**
 * Limitless CLOB fee helpers and net-held shares after buy.
 *
 * Default bps used when BFF omits per-market rate. Net-held uses
 * `limitlessClobFeeUsd` curve (see `./limitlessClobFeeCurve`).
 */
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import { limitlessClobBuyFeePercent, limitlessClobFeeUsd } from "./limitlessClobFeeCurve";

/** Default Limitless taker fee (bps) when BFF does not return a per-market rate. */
export const LIMITLESS_DEFAULT_FEE_RATE_BPS = 300;

export function calculateLimitlessFee(notionalUsd: number, feeRateBps: number): number {
	if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) return 0;
	return (notionalUsd * feeRateBps) / 10_000;
}

/**
 * Net outcome shares held after a Limitless **CLOB** market buy.
 */
export function limitlessNetOutcomeSharesHeldAfterBuy(
	grossShares: number,
	avgPrice: number,
): number {
	if (!Number.isFinite(grossShares) || grossShares <= 0) return 0;
	if (!Number.isFinite(avgPrice) || avgPrice <= 0 || avgPrice >= 1) {
		return grossShares;
	}
	const feeUsd = limitlessClobFeeUsd(grossShares, avgPrice, "buy");
	const shareSkim = feeUsd / avgPrice;
	const out = grossShares - shareSkim;
	return out > 0 && Number.isFinite(out) ? out : grossShares;
}

export type LimitlessClobBuyWalkResult = {
	/** Net outcome shares received after fee-in-contracts skim. */
	netShares: number;
	/** USD notional spent walking the raw ask book. */
	spentUsd: number;
	/** USD value of the fee (kept by venue in outcome tokens). */
	feeUsd: number;
	remainingUsd: number;
};

/**
 * Walk Limitless YES asks with CLOB fee-in-contracts (matches SOR `walkBook`).
 * `usdBudget` is total USDC the user pays; returned `netShares` is "to win".
 */
export function walkLimitlessClobBuyFromSnapshot(
	orderbook: OrderbookSnapshot | null,
	usdBudget: number,
): LimitlessClobBuyWalkResult {
	if (!orderbook || !Number.isFinite(usdBudget) || usdBudget <= 0) {
		return { netShares: 0, spentUsd: 0, feeUsd: 0, remainingUsd: usdBudget };
	}
	const asks = [...(orderbook.asks ?? [])]
		.filter((l) => l.size > 0 && l.price > 0 && l.price < 1)
		.sort((a, b) => a.price - b.price);

	let remainingUsd = usdBudget;
	let spentUsd = 0;
	let feeUsd = 0;
	let netShares = 0;

	for (const ask of asks) {
		if (remainingUsd <= 1e-9) break;
		const receiveFactor = 1 - limitlessClobBuyFeePercent(ask.price) / 100;
		if (receiveFactor <= 0) continue;
		const rowNotional = ask.size * ask.price;
		if (remainingUsd >= rowNotional) {
			spentUsd += rowNotional;
			remainingUsd -= rowNotional;
			feeUsd += limitlessClobFeeUsd(ask.size, ask.price, "buy");
			netShares += ask.size * receiveFactor;
			continue;
		}
		const grossAffordable = remainingUsd / ask.price;
		const grossTake = Math.min(ask.size, Math.max(0, grossAffordable));
		if (grossTake <= 0) break;
		const takeNotional = grossTake * ask.price;
		spentUsd += takeNotional;
		remainingUsd -= takeNotional;
		feeUsd += limitlessClobFeeUsd(grossTake, ask.price, "buy");
		netShares += grossTake * receiveFactor;
		break;
	}

	return { netShares, spentUsd, feeUsd, remainingUsd };
}
