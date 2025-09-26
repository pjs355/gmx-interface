import { MarketInfo } from "types/markets";
import { PositionInfo } from "types/positions";
import { UserReferralInfo } from "types/referrals";
import { TokenData, TokensRatio } from "types/tokens";
import { ExternalSwapQuote, FindSwapPath, IncreasePositionAmounts, TriggerThresholdType } from "types/trade";
type IncreasePositionParams = {
    marketInfo: MarketInfo;
    indexToken: TokenData;
    initialCollateralToken: TokenData;
    collateralToken: TokenData;
    isLong: boolean;
    initialCollateralAmount: bigint | undefined;
    position: PositionInfo | undefined;
    externalSwapQuote: ExternalSwapQuote | undefined;
    indexTokenAmount: bigint | undefined;
    leverage?: bigint;
    triggerPrice?: bigint;
    limitOrderType?: IncreasePositionAmounts["limitOrderType"];
    fixedAcceptablePriceImpactBps?: bigint;
    acceptablePriceImpactBuffer?: number;
    userReferralInfo: UserReferralInfo | undefined;
    strategy: "leverageBySize" | "leverageByCollateral" | "independent";
    findSwapPath: FindSwapPath;
    uiFeeFactor: bigint;
};
export declare function getIncreasePositionAmounts(p: IncreasePositionParams): IncreasePositionAmounts;
export declare function getTokensRatio({ fromToken, toToken, triggerRatioValue, markPrice, }: {
    fromToken: TokenData;
    toToken: TokenData;
    triggerRatioValue: bigint;
    markPrice: bigint;
}): {
    markRatio: TokensRatio;
    triggerRatio?: undefined;
} | {
    markRatio: TokensRatio;
    triggerRatio: TokensRatio;
};
export declare function leverageBySizeValues({ collateralToken, leverage, sizeDeltaUsd, collateralPrice, positionFeeUsd, borrowingFeeUsd, uiFeeUsd, swapUiFeeUsd, fundingFeeUsd, }: {
    collateralToken: TokenData;
    leverage: bigint;
    sizeDeltaUsd: bigint;
    collateralPrice: bigint;
    uiFeeFactor: bigint;
    positionFeeUsd: bigint;
    fundingFeeUsd: bigint;
    borrowingFeeUsd: bigint;
    uiFeeUsd: bigint;
    swapUiFeeUsd: bigint;
}): {
    collateralDeltaUsd: bigint;
    collateralDeltaAmount: bigint;
    baseCollateralUsd: bigint;
    baseCollateralAmount: bigint;
};
export declare function getIncreasePositionPrices({ triggerPrice, indexToken, initialCollateralToken, collateralToken, limitOrderType, isLong, }: {
    triggerPrice?: bigint;
    indexToken: TokenData;
    initialCollateralToken: TokenData;
    collateralToken: TokenData;
    isLong: boolean;
    limitOrderType?: IncreasePositionAmounts["limitOrderType"];
}): {
    indexPrice: bigint;
    initialCollateralPrice: bigint;
    collateralPrice: bigint;
    triggerThresholdType: TriggerThresholdType | undefined;
    triggerPrice: bigint | undefined;
};
export {};
