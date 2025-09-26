import { FeeItem } from "types/fees";
import { MarketInfo } from "types/markets";
import { SwapStats } from "types/trade";
export * from "./estimateOraclePriceCount";
export * from "./executionFee";
export * from "./priceImpact";
export declare function getSwapFee(marketInfo: MarketInfo, swapAmount: bigint, forPositiveImpact: boolean, isAtomicSwap: boolean): bigint;
export declare function getPositionFee(marketInfo: MarketInfo, sizeDeltaUsd: bigint, forPositiveImpact: boolean, referralInfo: {
    totalRebateFactor: bigint;
    discountFactor: bigint;
} | undefined, uiFeeFactor?: bigint): {
    positionFeeUsd: bigint;
    discountUsd: bigint;
    totalRebateUsd: bigint;
    uiFeeUsd?: undefined;
} | {
    positionFeeUsd: bigint;
    discountUsd: bigint;
    totalRebateUsd: bigint;
    uiFeeUsd: bigint;
};
export declare function getFundingFactorPerPeriod(marketInfo: MarketInfo, isLong: boolean, periodInSeconds: number): bigint;
export declare function getFundingFeeRateUsd(marketInfo: MarketInfo, isLong: boolean, sizeInUsd: bigint, periodInSeconds: number): bigint;
export declare function getBorrowingFactorPerPeriod(marketInfo: MarketInfo, isLong: boolean, periodInSeconds: number): bigint;
export declare function getBorrowingFeeRateUsd(marketInfo: MarketInfo, isLong: boolean, sizeInUsd: bigint, periodInSeconds: number): bigint;
export declare function getIsHighPriceImpact(positionPriceImpact?: FeeItem, swapPriceImpact?: FeeItem): boolean;
export declare function getFeeItem(feeDeltaUsd?: bigint, basis?: bigint, opts?: {
    shouldRoundUp?: boolean;
}): FeeItem | undefined;
export declare function getTotalFeeItem(feeItems: (FeeItem | undefined)[]): FeeItem;
export declare function getTotalSwapVolumeFromSwapStats(swapSteps?: SwapStats[]): bigint;
