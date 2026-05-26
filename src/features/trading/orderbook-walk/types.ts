export interface MarketOrderCalculation {
	contracts: number;
	remainingUsd: number;
	maxPrice?: number;
	minPrice?: number;
}

export type AvailableLiquidity = {
	maxSharesAvailable: number;
	maxUsdValue: number;
	hasAnyLiquidity: boolean;
};
