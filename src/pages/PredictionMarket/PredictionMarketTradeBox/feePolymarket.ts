/**
 * Polymarket taker fee — probability-weighted per category.
 *
 * Formula (from https://docs.polymarket.com/trading/fees):
 *   fee = C × feeRate × p × (1 − p)
 *
 * Category rates:
 *   Crypto          0.072
 *   Sports/Esports  0.03
 *   Finance/Politics/Mentions/Tech  0.04
 *   Economics/Culture/Weather/Other  0.05
 *   Geopolitics     0  (fee-free)
 *
 * Makers pay 0%. Fees rounded to 5 decimal places.
 */

export const POLYMARKET_FEE_RATES: Record<string, number> = {
	crypto: 0.072,
	sports: 0.03,
	esports: 0.03,
	finance: 0.04,
	politics: 0.04,
	mentions: 0.04,
	tech: 0.04,
	economics: 0.05,
	culture: 0.05,
	weather: 0.05,
	other: 0.05,
	general: 0.05,
	geopolitics: 0,
};

/** Default rate used for our esports / sports markets. */
export const POLYMARKET_DEFAULT_FEE_RATE = 0.03;

/**
 * @param contracts  Number of shares traded (C).
 * @param price      Fill probability 0–1 (p).
 * @param feeRate    Category taker rate (defaults to Sports 0.03).
 * @returns Fee in USDC, rounded to 5 decimal places.
 */
export function calculatePolymarketFee(
	contracts: number,
	price: number,
	feeRate: number = POLYMARKET_DEFAULT_FEE_RATE,
): number {
	if (contracts <= 0 || price <= 0 || price >= 1 || feeRate <= 0) return 0;
	const raw = contracts * feeRate * price * (1 - price);
	return Math.round(raw * 100_000) / 100_000;
}
