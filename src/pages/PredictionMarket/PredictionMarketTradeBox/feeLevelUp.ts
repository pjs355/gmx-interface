/**
 * LevelUp 2% fee — MUST match backend micro-unit rounding exactly.
 * Mirrors `calculateBuyFee` in `predictions/helpers/order-validation.ts`
 * (same integer steps as `ctf-settlement.ts`).
 */
const FEE_RATE_PERCENT_BI = 2n;
const MICRO_PER_CENT_BI = 10000n;

/** Fee in USDC micros (6 dp) on the maker's USDC leg for a LevelUp **buy**. */
export function levelUpBuyFeeMicroFromMakerMicro(
	makerAmountMicro: bigint,
): bigint {
	const feeBeforeRounding =
		(makerAmountMicro * FEE_RATE_PERCENT_BI) / 100n;
	return (
		((feeBeforeRounding + MICRO_PER_CENT_BI - 1n) / MICRO_PER_CENT_BI) *
		MICRO_PER_CENT_BI
	);
}

/**
 * Minimum on-chain USDC balance on the **maker (SCW)** before `POST /orders`
 * buy validation: `makerAmount` + FeeWrapper fee (not just `makerAmount`).
 */
export function levelUpBuyTotalMicroScwBalanceRequired(
	makerAmountMicro: bigint,
): bigint {
	return makerAmountMicro + levelUpBuyFeeMicroFromMakerMicro(makerAmountMicro);
}

/**
 * LevelUp 2% fee — MUST match backend micro-unit rounding exactly.
 * Backend: Math.ceil(fee / 10000) * 10000 in USDC micro-units (6 decimals).
 */
export function calculateFeeMatchingBackend(amountInDollars: number): number {
	const amountMicro = Math.floor(amountInDollars * 1_000_000);
	const feeRoundedUp = levelUpBuyFeeMicroFromMakerMicro(BigInt(amountMicro));
	return Number(feeRoundedUp) / 1_000_000;
}
