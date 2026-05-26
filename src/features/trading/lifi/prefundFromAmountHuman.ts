import { formatUnits, parseUnits } from "viem";

/** LI.FI funding stable decimals on the **source** chain (matches private API `humanStableToAtomicForChain`). */
export function lifiSourceStableDecimals(fromChainLifi: number): number {
	if (fromChainLifi === 56) return 18;
	return 6;
}

function trimTrailingFractionZeros(s: string): string {
	if (!s.includes(".")) return s;
	return s.replace(/\.?0+$/, "");
}

/**
 * Floor a positive finite float to `decimals` fractional digits (no round-half-up).
 * Safe only for `decimals <= 15` (avoids `value * 10**decimals` overflow).
 */
export function floorFloatToDecimalString(value: number, decimals: number): string {
	if (!Number.isFinite(value) || value <= 0) return "0";
	if (decimals < 0 || decimals > 15) {
		throw new Error("floorFloatToDecimalString: decimals must be 0..15");
	}
	const m = 10 ** decimals;
	const floored = Math.floor(value * m + 1e-10);
	const s = (floored / m).toFixed(decimals);
	return trimTrailingFractionZeros(s) || "0";
}

/**
 * Human `amountHuman` for `POST /funding/lifi/quote`: never rounds **up** past
 * on-chain balance or past `capHuman` (already `min(walletFloat, budgetUsd)`).
 *
 * For **18-decimal** sources (BNB USDT), `maxFromWei` is **required** — JS floats
 * cannot represent wei caps safely.
 */
export function prefundQuoteAmountHuman(args: {
	sendHuman: number;
	/** `min(walletHuman, budgetUsd)` from the prefund loop. */
	capHuman: number;
	fromChainLifi: number;
	maxFromWei?: bigint | null;
}): string {
	const dec = lifiSourceStableDecimals(args.fromChainLifi);
	const capHuman = Math.max(0, args.capHuman);
	const send = Math.max(0, Math.min(args.sendHuman, capHuman));
	if (send <= 1e-18) return "0";

	if (dec === 18) {
		if (args.maxFromWei == null) {
			throw new Error(
				"prefundQuoteAmountHuman: maxFromWei is required for 18-decimal LI.FI source chains (e.g. BNB USDT)",
			);
		}
		const maxW = args.maxFromWei;
		const walletHuman = Number(formatUnits(maxW, 18));
		if (!Number.isFinite(walletHuman) || walletHuman <= 0) {
			return "0";
		}
		const capH = Math.min(capHuman, walletHuman);
		const sendC = Math.min(send, capH);
		const capQ = BigInt(Math.max(1, Math.floor(capH * 1e9)));
		const sendQ = BigInt(Math.max(0, Math.floor(sendC * 1e9)));
		let atomic = (maxW * sendQ) / capQ;
		if (atomic > maxW) atomic = maxW;
		return trimTrailingFractionZeros(formatUnits(atomic, 18));
	}

	const s = floorFloatToDecimalString(Math.min(send, capHuman), dec);
	let atomic = parseUnits(s, dec);
	if (args.maxFromWei != null && atomic > args.maxFromWei) {
		atomic = args.maxFromWei;
	}
	return trimTrailingFractionZeros(formatUnits(atomic, dec));
}
