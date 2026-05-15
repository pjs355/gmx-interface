/**
 * Synced from predictions repo `src/sor/dflow-fees.ts` — update both together.
 *
 * DFlow prediction-market taker fee — single implementation for trade UI.
 *
 * ## Spec reference (do not guess coefficients from conflicting summaries)
 *
 * - Primary formula (pond): https://pond.dflow.net/build/prediction-markets/prediction-market-fees
 * - Tier taker scale (Frost default **0.09**) vs printed **0.07** in the same doc — sizing follows the tier row; rebate caps only limit rebate eligibility.
 * - Tier/cookbook tensions: see `DFLOW_FEES_SETTLEMENT_RECIPE_PAGE`; settlement parity uses quote checks.
 *
 * ## Buy vs sell
 *
 * Same `(contracts, price)` USD fee until DFlow documents separate buy/sell collateral schedules.
 * Buy/sell optimizers use marginal sizing (`maxDflowFillForBuyBudget`, `minDflowFillForSellProceeds`)
 * so fills respect non-linear `calculateDflowFee`.
 */

export const DFLOW_FEE_POND_FORMULA_PAGE =
	"https://pond.dflow.net/build/prediction-markets/prediction-market-fees";

export const DFLOW_FEES_SETTLEMENT_RECIPE_PAGE =
	"https://pond.dflow.net/build/recipes/prediction-markets/fees-and-settlement";

export const DFLOW_QUOTE_API_OPENAPI =
	"https://pond.dflow.net/openapi/build/trading-api/openapi.json";

/** Default taker coefficient (Frost tier) for the primary rounded term. */
export const DFLOW_DEFAULT_TAKER_FEE_SCALE = 0.09;

/** Second term before USDC conversion; keep 0.01 until maker-tier parity is confirmed. */
const DFLOW_FEE_SECOND_SCALE = 0.01;

/** Upper bound on share count for binary searches (prevents runaway). */
const DFLOW_SHARE_SEARCH_CEIL = 1e18;

function fin(n: number): boolean {
	return Number.isFinite(n) && n > 0;
}

export type CalculateDflowFeeOptions = {
	takerFeeScale?: number;
};

/**
 * Estimated taker fee in **USDC** using Pond’s decomposition; primary scale defaults to Frost **0.09**.
 */
export function calculateDflowFee(
	contracts: number,
	price: number,
	opts?: CalculateDflowFeeOptions,
): number {
	if (!fin(contracts) || !fin(price) || price >= 1) return 0;
	const rawScale = opts?.takerFeeScale;
	const takerScale =
		rawScale != null && Number.isFinite(rawScale) && rawScale > 0
			? rawScale
			: DFLOW_DEFAULT_TAKER_FEE_SCALE;
	const pq = price * (1 - price);
	const basePart = Math.ceil(takerScale * contracts * pq * 100) / 100;
	const addPart = DFLOW_FEE_SECOND_SCALE * contracts * pq;
	const feeInContracts = basePart + addPart;
	return Math.round(feeInContracts * price * 100) / 100;
}

/**
 * Total USDC spent buying `fillSize` contracts at `price` including DFlow fee.
 */
export function dflowBuyCostUsd(fillSize: number, price: number): number {
	if (!(fillSize > 0) || !(price > 0 && price < 1)) return 0;
	return fillSize * price + calculateDflowFee(fillSize, price);
}

/**
 * Largest fill in `[0, maxShares]` such that `dflowBuyCostUsd(fill, price) <= budgetUsd`
 * (binary search; assumes cost increases with fill size).
 */
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

/**
 * Largest **integer** contract count fitting `budgetUsd` at `price`, capped by book depth.
 */
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

/**
 * Net USDC proceeds from selling `fillSize` contracts at bid price `price` after DFlow fee.
 */
export function dflowSellProceedsUsd(fillSize: number, price: number): number {
	if (!(fillSize > 0) || !(price > 0 && price < 1)) return 0;
	return fillSize * price - calculateDflowFee(fillSize, price);
}

/**
 * Smallest fill in `(0, maxFill]` achieving at least `proceedsUsd` net proceeds; returns `maxFill`
 * if the book cannot deliver `proceedsUsd` in one slice.
 */
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

/**
 * Portion of a **gross** USDC buy budget that goes to notional (`shares × approxPrice`)
 * when sizing uses **whole Kalshi/DFlow contracts** against `dflowBuyCostUsd`.
 */
export function dflowEffectiveBuyBudget(
	usd: number,
	approxPrice: number = 0.5,
): number {
	if (!fin(usd) || !fin(approxPrice) || approxPrice >= 1) return 0;
	const maxS = maxWholeDflowContractsForBuyBudget(usd, approxPrice, DFLOW_SHARE_SEARCH_CEIL);
	return maxS * approxPrice;
}

/**
 * Exact fee in USDC for a fill of `fillSize` contracts at `price` on DFlow.
 */
export function calculateDflowFeeForFill(
	fillSize: number,
	price: number,
): number {
	return calculateDflowFee(fillSize, price);
}
