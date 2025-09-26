import { MarketInfo, MarketsInfoData } from "types/markets";
import { SwapPathStats, SwapStats } from "types/trade";
export declare function getSwapCapacityUsd(marketInfo: MarketInfo, isLong: boolean): bigint;
export declare function getSwapPathOutputAddresses(p: {
    marketsInfoData: MarketsInfoData;
    initialCollateralAddress: string;
    swapPath: string[];
    wrappedNativeTokenAddress: string;
    shouldUnwrapNativeToken: boolean;
    isIncrease: boolean;
}): {
    outTokenAddress: string;
    outMarketAddress: undefined;
} | {
    outTokenAddress: undefined;
    outMarketAddress: undefined;
} | {
    outTokenAddress: string;
    outMarketAddress: string;
};
export declare function getSwapPathStats(p: {
    marketsInfoData: MarketsInfoData;
    swapPath: string[];
    initialCollateralAddress: string;
    wrappedNativeTokenAddress: string;
    usdIn: bigint;
    shouldUnwrapNativeToken: boolean;
    shouldApplyPriceImpact: boolean;
    isAtomicSwap: boolean;
}): SwapPathStats | undefined;
export declare function getSwapStats(p: {
    marketInfo: MarketInfo;
    tokenInAddress: string;
    tokenOutAddress: string;
    usdIn: bigint;
    shouldApplyPriceImpact: boolean;
    isAtomicSwap: boolean;
}): SwapStats;
export declare function getMaxSwapPathLiquidity(p: {
    marketsInfoData: MarketsInfoData;
    swapPath: string[];
    initialCollateralAddress: string;
}): bigint;
