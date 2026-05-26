/**
 * Limitless Exchange CLOB taker fee curves (buy vs sell) from the published
 * user-guide fee tables. Piecewise linear interpolation between breakpoints.
 *
 * @see https://docs.limitless.exchange/user-guide/fees
 *
 * AMM markets use a flat ~0.40% fee; when routing cannot distinguish AMM vs
 * CLOB, we default to CLOB curves (order-book sports routing).
 *
 * Kept in sync with `predictions/src/sor/limitless-fee-curve.ts`.
 */

const BUY_POINTS: ReadonlyArray<readonly [number, number]> = [
	[0.01, 3.0],
	[0.5, 3.0],
	[0.55, 2.52],
	[0.6, 2.13],
	[0.65, 1.8],
	[0.7, 1.51],
	[0.75, 1.26],
	[0.8, 1.05],
	[0.85, 0.85],
	[0.9, 0.68],
	[0.95, 0.53],
	[0.99, 0.42],
	[0.999, 0.4],
];

const SELL_POINTS: ReadonlyArray<readonly [number, number]> = [
	[0.01, 0.42],
	[0.05, 0.6],
	[0.1, 0.78],
	[0.2, 1.11],
	[0.3, 1.32],
	[0.4, 1.44],
	[0.5, 1.5],
	[0.6, 1.44],
	[0.7, 1.32],
	[0.8, 1.11],
	[0.9, 0.78],
	[0.95, 0.6],
	[0.99, 0.45],
	[0.999, 0.42],
];

function fin(n: number): boolean {
	return Number.isFinite(n) && n > 0;
}

function interpolateCurve(points: ReadonlyArray<readonly [number, number]>, price: number): number {
	const p = Math.min(0.999, Math.max(0.01, price));
	for (let i = 0; i < points.length - 1; i++) {
		const [p0, f0] = points[i]!;
		const [p1, f1] = points[i + 1]!;
		if (p >= p0 && p <= p1) {
			const t = (p - p0) / (p1 - p0);
			return f0 + t * (f1 - f0);
		}
	}
	return points[points.length - 1]![1];
}

/** Taker fee percent (0–100 scale) for Limitless CLOB buys at probability price `p`. */
export function limitlessClobBuyFeePercent(price: number): number {
	if (!Number.isFinite(price) || price <= 0 || price >= 1) return 0;
	return interpolateCurve(BUY_POINTS, price);
}

/** Taker fee percent for Limitless CLOB sells at probability price `p`. */
export function limitlessClobSellFeePercent(price: number): number {
	if (!Number.isFinite(price) || price <= 0 || price >= 1) return 0;
	return interpolateCurve(SELL_POINTS, price);
}

export type LimitlessClobFeeSide = "buy" | "sell";

/**
 * Fee in USD for a CLOB trade: fee = notional × (feePercent/100).
 * Docs describe buy fees as paid from outcome-side economics; for routing we use
 * the same USDC notional (contracts × price) as other venues so budget caps align.
 */
export function limitlessClobFeeUsd(
	contracts: number,
	price: number,
	side: LimitlessClobFeeSide,
): number {
	if (!fin(contracts) || !fin(price) || price >= 1) return 0;
	const notional = contracts * price;
	const pct =
		side === "buy" ? limitlessClobBuyFeePercent(price) : limitlessClobSellFeePercent(price);
	return Math.round(((notional * pct) / 100) * 1_000_000) / 1_000_000;
}

/** AMM-style markets: flat 0.40% on notional (published overview). */
export function limitlessAmmFeeUsd(contracts: number, price: number): number {
	if (!fin(contracts) || !fin(price) || price >= 1) return 0;
	const notional = contracts * price;
	return Math.round(notional * 0.004 * 1_000_000) / 1_000_000;
}

export function limitlessClobEffectiveBuyBudget(usd: number, approxPrice: number): number {
	if (!fin(usd) || !fin(approxPrice) || approxPrice >= 1) return 0;
	const f = limitlessClobBuyFeePercent(approxPrice) / 100;
	return usd / (1 + f);
}
