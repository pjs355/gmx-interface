export function getEffectivePrice(
	usdAmount: number,
	contracts: number,
	remainingUsd: number,
): number {
	if (contracts === 0) return 0;
	return (usdAmount - remainingUsd) / contracts;
}
