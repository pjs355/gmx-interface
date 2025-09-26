import { MarketsData } from "types/markets";
import { TokensData } from "types/tokens";
import type { ContractCallsConfig } from "utils/multicall";
export declare function buildClaimableFundingDataRequest({ marketsAddresses, marketsData, chainId, account, }: {
    marketsAddresses: string[] | undefined;
    marketsData: MarketsData | undefined;
    account: string;
    chainId: number;
}): Record<string, ContractCallsConfig<any>>;
export declare function buildMarketsValuesRequest(chainId: number, { marketsAddresses, marketsData, tokensData, dataStoreAddress, syntheticsReaderAddress, }: {
    marketsAddresses: string[] | undefined;
    marketsData: MarketsData | undefined;
    tokensData: TokensData | undefined;
    dataStoreAddress: string;
    syntheticsReaderAddress: string;
}): Promise<import("utils/multicall").MulticallRequestConfig<{
    [key: `${string}-reader`]: {
        calls: Record<"marketInfo" | "marketTokenPriceMax" | "marketTokenPriceMin", {
            methodName: string;
            params: any[];
        }>;
    };
    [key: `${string}-dataStore`]: {
        calls: Record<"longPoolAmount" | "shortPoolAmount" | "positionImpactPoolAmount" | "swapImpactPoolAmountLong" | "swapImpactPoolAmountShort" | "longInterestUsingLongToken" | "longInterestUsingShortToken" | "shortInterestUsingLongToken" | "shortInterestUsingShortToken" | "longInterestInTokensUsingLongToken" | "longInterestInTokensUsingShortToken" | "shortInterestInTokensUsingLongToken" | "shortInterestInTokensUsingShortToken", {
            methodName: string;
            params: any[];
        }>;
    };
}>>;
export declare function buildMarketsConfigsRequest(chainId: number, { marketsData, marketsAddresses, dataStoreAddress, }: {
    marketsData: MarketsData | undefined;
    marketsAddresses: string[] | undefined;
    dataStoreAddress: string;
}): Promise<import("utils/multicall").MulticallRequestConfig<{
    [key: `${string}-dataStore`]: {
        calls: Record<"isDisabled" | "maxLongPoolAmount" | "maxShortPoolAmount" | "maxLongPoolUsdForDeposit" | "maxShortPoolUsdForDeposit" | "longPoolAmountAdjustment" | "shortPoolAmountAdjustment" | "reserveFactorLong" | "reserveFactorShort" | "openInterestReserveFactorLong" | "openInterestReserveFactorShort" | "maxOpenInterestLong" | "maxOpenInterestShort" | "minPositionImpactPoolAmount" | "positionImpactPoolDistributionRate" | "borrowingFactorLong" | "borrowingFactorShort" | "borrowingExponentFactorLong" | "borrowingExponentFactorShort" | "fundingFactor" | "fundingExponentFactor" | "fundingIncreaseFactorPerSecond" | "fundingDecreaseFactorPerSecond" | "thresholdForStableFunding" | "thresholdForDecreaseFunding" | "minFundingFactorPerSecond" | "maxFundingFactorPerSecond" | "maxPnlFactorForTradersLong" | "maxPnlFactorForTradersShort" | "positionFeeFactorForPositiveImpact" | "positionFeeFactorForNegativeImpact" | "positionImpactFactorPositive" | "positionImpactFactorNegative" | "maxPositionImpactFactorPositive" | "maxPositionImpactFactorNegative" | "maxPositionImpactFactorForLiquidations" | "minCollateralFactor" | "minCollateralFactorForOpenInterestLong" | "minCollateralFactorForOpenInterestShort" | "positionImpactExponentFactor" | "swapFeeFactorForPositiveImpact" | "swapFeeFactorForNegativeImpact" | "atomicSwapFeeFactor" | "swapImpactFactorPositive" | "swapImpactFactorNegative" | "swapImpactExponentFactor" | "virtualMarketId" | "virtualLongTokenId" | "virtualShortTokenId", {
            methodName: string;
            params: any[];
        }>;
    };
}>>;
