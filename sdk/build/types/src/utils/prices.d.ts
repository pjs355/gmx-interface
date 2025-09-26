import { MarketInfo } from "types/markets";
import { OrderType } from "types/orders";
import { TokenPrices } from "types/tokens";
import { TriggerThresholdType } from "types/trade";
export declare function getMarkPrice(p: {
    prices: TokenPrices;
    isIncrease: boolean;
    isLong: boolean;
}): bigint;
export declare function getShouldUseMaxPrice(isIncrease: boolean, isLong: boolean): boolean;
export declare function getOrderThresholdType(orderType: OrderType, isLong: boolean): TriggerThresholdType | undefined;
export declare function getAcceptablePriceInfo(p: {
    marketInfo: MarketInfo;
    isIncrease: boolean;
    isLong: boolean;
    indexPrice: bigint;
    sizeDeltaUsd: bigint;
    maxNegativePriceImpactBps?: bigint;
}): {
    acceptablePrice: bigint;
    acceptablePriceDeltaBps: bigint;
    priceImpactDeltaAmount: bigint;
    priceImpactDeltaUsd: bigint;
    priceImpactDiffUsd: bigint;
};
export declare function getAcceptablePriceByPriceImpact(p: {
    isIncrease: boolean;
    isLong: boolean;
    indexPrice: bigint;
    sizeDeltaUsd: bigint;
    priceImpactDeltaUsd: bigint;
}): {
    acceptablePrice: bigint;
    acceptablePriceDeltaBps: bigint;
    priceDelta: bigint;
};
export declare function getDefaultAcceptablePriceImpactBps(p: {
    isIncrease: boolean;
    isLong: boolean;
    indexPrice: bigint;
    sizeDeltaUsd: bigint;
    priceImpactDeltaUsd: bigint;
    acceptablePriceImapctBuffer?: number;
}): bigint;
