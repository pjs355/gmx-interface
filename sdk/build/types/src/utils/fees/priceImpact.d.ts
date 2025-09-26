import { MarketInfo } from "types/markets";
import { TokenData } from "types/tokens";
export declare function getPriceImpactByAcceptablePrice(p: {
    sizeDeltaUsd: bigint;
    acceptablePrice: bigint;
    indexPrice: bigint;
    isLong: boolean;
    isIncrease: boolean;
}): {
    priceImpactDeltaUsd: bigint;
    priceImpactDeltaAmount: bigint;
    priceDelta: bigint;
    acceptablePriceDeltaBps: bigint;
};
export declare function applySwapImpactWithCap(marketInfo: MarketInfo, token: TokenData, priceImpactDeltaUsd: bigint): {
    impactDeltaAmount: bigint;
    cappedDiffUsd: bigint;
};
export declare function getCappedPositionImpactUsd(marketInfo: MarketInfo, sizeDeltaUsd: bigint, isLong: boolean, opts?: {
    fallbackToZero?: boolean;
}): bigint;
export declare function getPriceImpactForPosition(marketInfo: MarketInfo, sizeDeltaUsd: bigint, isLong: boolean, opts?: {
    fallbackToZero?: boolean;
}): bigint;
export declare function getPriceImpactForSwap(marketInfo: MarketInfo, tokenA: TokenData, tokenB: TokenData, usdDeltaTokenA: bigint, usdDeltaTokenB: bigint, opts?: {
    fallbackToZero?: boolean;
}): bigint;
export declare function getNextPoolAmountsParams(p: {
    marketInfo: MarketInfo;
    longToken: TokenData;
    shortToken: TokenData;
    longPoolAmount: bigint;
    shortPoolAmount: bigint;
    longDeltaUsd: bigint;
    shortDeltaUsd: bigint;
}): {
    longPoolUsd: bigint;
    shortPoolUsd: bigint;
    nextLongPoolUsd: bigint;
    nextShortPoolUsd: bigint;
};
/**
 * @see https://github.com/gmx-io/gmx-synthetics/blob/updates/contracts/pricing/SwapPricingUtils.sol
 */
export declare function getPriceImpactUsd(p: {
    currentLongUsd: bigint;
    currentShortUsd: bigint;
    nextLongUsd: bigint;
    nextShortUsd: bigint;
    factorPositive: bigint;
    factorNegative: bigint;
    exponentFactor: bigint;
    fallbackToZero?: boolean;
}): bigint;
/**
 *  @see https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
export declare function calculateImpactForSameSideRebalance(p: {
    currentDiff: bigint;
    nextDiff: bigint;
    hasPositiveImpact: boolean;
    factor: bigint;
    exponentFactor: bigint;
}): bigint;
/**
 *  @see  https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
export declare function calculateImpactForCrossoverRebalance(p: {
    currentDiff: bigint;
    nextDiff: bigint;
    factorPositive: bigint;
    factorNegative: bigint;
    exponentFactor: bigint;
}): bigint;
export declare function applyImpactFactor(diff: bigint, factor: bigint, exponent: bigint): bigint;
