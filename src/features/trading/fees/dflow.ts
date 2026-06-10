/**
 * Synced from predictions-api `src/sor/dflow-fees.ts` — update both together.
 *
 * DFlow routes Kalshi markets; taker fee matches kalshi.com:
 *   round up(0.07 × C × P × (1 − P)) to the next cent.
 */

export const DFLOW_FEE_POND_FORMULA_PAGE =
	"https://pond.dflow.net/build/prediction-markets/prediction-market-fees";

export const DFLOW_FEES_SETTLEMENT_RECIPE_PAGE =
	"https://pond.dflow.net/build/recipes/prediction-markets/fees-and-settlement";

export const DFLOW_QUOTE_API_OPENAPI =
	"https://pond.dflow.net/openapi/build/trading-api/openapi.json";

/** Kalshi general-market taker coefficient (matches kalshi.com). */
export const DFLOW_DEFAULT_TAKER_FEE_SCALE = 0.07;

/** Upper bound on share count for binary searches (prevents runaway). */
const DFLOW_SHARE_SEARCH_CEIL = 1e18;

function fin(n: number): boolean {
	return Number.isFinite(n) && n > 0;
}

export type CalculateDflowFeeOptions = {
	takerFeeScale?: number;
};

/** Estimated Kalshi taker fee in USDC for a fill of `contracts` at `price`. */
export function calculateDflowFee(
	contracts: number,
	price: number,
	opts?: CalculateDflowFeeOptions,
): number {
	if (!fin(contracts) || !fin(price) || price >= 1) return 0;
	const rawScale = opts?.takerFeeScale;
	const coeff =
		rawScale != null && Number.isFinite(rawScale) && rawScale > 0
			? rawScale
			: DFLOW_DEFAULT_TAKER_FEE_SCALE;
	const pq = price * (1 - price);
	return Math.ceil(coeff * contracts * pq * 100) / 100;
}

/** Total USDC spent buying `fillSize` contracts at `price` including Kalshi taker fee. */
export function dflowBuyCostUsd(fillSize: number, price: number): number {
	if (!(fillSize > 0) || !(price > 0 && price < 1)) return 0;
	return fillSize * price + calculateDflowFee(fillSize, price);
}

/** Largest fill in `[0, maxShares]` such that `dflowBuyCostUsd(fill, price) <= budgetUsd`. */
export function maxDflowFillForBuyBudget(
	budgetUsd: number,
	price: number,
	maxShares: number,
): number {
	if (!(budgetUsd > 0) || !(price > 0 && price < 1) || !(maxShares > 0)) return 0;
	const cap = Math.min(maxShares, budgetUsd / price + 1e9, DFLOW_SHARE_SEARCH_CEIL);
	if (dflowBuyCostUsd(cap, price) <= budgetUsd + 1e-12) return cap;
	let lo = 0;
	let hi = cap;
	for (let i = 0; i < 80; i++) {
		const mid = (lo + hi) / 2;
		if (dflowBuyCostUsd(mid, price) <= budgetUsd) lo = mid;
		else hi = mid;
	}
	return lo;
}

/** Largest integer contract count fitting `budgetUsd` at `price`, capped by book depth. */
export function maxWholeDflowContractsForBuyBudget(
	budgetUsd: number,
	price: number,
	maxShares: number,
): number {
	const raw = maxDflowFillForBuyBudget(budgetUsd, price, maxShares);
	let s = Math.floor(raw + 1e-12);
	while (s > 0 && dflowBuyCostUsd(s, price) > budgetUsd + 1e-9) {
		s--;
	}
	return s;
}

/** Net USDC proceeds from selling `fillSize` contracts at bid price `price` after taker fee. */
export function dflowSellProceedsUsd(fillSize: number, price: number): number {
	if (!(fillSize > 0) || !(price > 0 && price < 1)) return 0;
	return fillSize * price - calculateDflowFee(fillSize, price);
}

/** Smallest fill achieving at least `proceedsUsd` net proceeds. */
export function minDflowFillForSellProceeds(
	proceedsUsd: number,
	price: number,
	maxFill: number,
): number {
	if (!(proceedsUsd > 0) || !(price > 0 && price < 1) || !(maxFill > 0)) return 0;
	const maxP = dflowSellProceedsUsd(maxFill, price);
	if (maxP < proceedsUsd - 1e-9) return maxFill;
	let lo = 0;
	let hi = maxFill;
	for (let i = 0; i < 80; i++) {
		const mid = (lo + hi) / 2;
		if (dflowSellProceedsUsd(mid, price) >= proceedsUsd) hi = mid;
		else lo = mid;
	}
	return hi;
}

/** Notional portion of gross buy budget after Kalshi fee-inclusive sizing. */
export function dflowEffectiveBuyBudget(usd: number, approxPrice: number = 0.5): number {
	if (!fin(usd) || !fin(approxPrice) || approxPrice >= 1) return 0;
	const maxS = maxWholeDflowContractsForBuyBudget(usd, approxPrice, DFLOW_SHARE_SEARCH_CEIL);
	return maxS * approxPrice;
}

/** Exact fee in USDC for a fill of `fillSize` contracts at `price`. */
export function calculateDflowFeeForFill(fillSize: number, price: number): number {
	return calculateDflowFee(fillSize, price);
}
