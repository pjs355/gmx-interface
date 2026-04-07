/**
 * DFlow prediction-market fee — probability-weighted, Frost tier.
 *
 * Formula (from https://pond.dflow.net/build/prediction-markets/prediction-market-fees):
 *   fees = roundup(0.07 × C × p × (1 − p)) + (0.01 × C × p × (1 − p))
 *
 * The result is denominated in **contracts** (outcome tokens).
 * We convert to a USDC-equivalent by multiplying by the fill price so the UI
 * can display a dollar amount consistent with the other venues.
 *
 * Tier table (30-day volume):
 *   Frost   (< $50M)      taker 0.09  maker 0.0225
 *   Glacier ($50–150M)     taker 0.0875
 *   Steel   ($150–300M)    taker 0.085
 *   Obsidian (> $300M)     taker 0.08
 */

/**
 * @param contracts  Number of contracts (C).
 * @param price      Fill probability 0–1 (p).
 * @returns Estimated fee in USDC (Frost tier).
 */
export function calculateDflowFee(
	contracts: number,
	price: number,
): number {
	if (contracts <= 0 || price <= 0 || price >= 1) return 0;
	const pq = price * (1 - price);
	const basePart = Math.ceil(0.07 * contracts * pq * 100) / 100;
	const addPart = 0.01 * contracts * pq;
	const feeInContracts = basePart + addPart;
	return Math.round(feeInContracts * price * 100) / 100;
}
