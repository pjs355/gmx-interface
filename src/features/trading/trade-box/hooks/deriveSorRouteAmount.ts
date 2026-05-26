import { SHARE_SELL_COMPARE_EPS } from "../checkBalances";

/** Parse trade-box amount string into the numeric value SOR expects. */
export function deriveSorRouteAmountFromInput(opts: {
	amount: string;
	side: "buy" | "sell";
	orderType: "market" | "limit";
	limitPriceCents: number | null | undefined;
	maxScopedSellShares: number;
}): number {
	const raw = Number.parseFloat(opts.amount);
	if (!Number.isFinite(raw) || raw <= 0) return 0;
	if (opts.orderType === "limit") {
		if (opts.limitPriceCents == null) return 0;
		let sharesForNotional = raw;
		if (
			opts.side === "sell" &&
			opts.maxScopedSellShares > 0 &&
			Math.abs(raw - opts.maxScopedSellShares) <= SHARE_SELL_COMPARE_EPS
		) {
			sharesForNotional = opts.maxScopedSellShares;
		}
		return sharesForNotional * (opts.limitPriceCents / 100);
	}
	if (
		opts.side === "sell" &&
		opts.maxScopedSellShares > 0 &&
		Math.abs(raw - opts.maxScopedSellShares) <= SHARE_SELL_COMPARE_EPS
	) {
		return opts.maxScopedSellShares;
	}
	return raw;
}
