import { MarketsData, MarketsInfoData } from "types/markets";
import { OrderInfo } from "types/orders";
import { PositionsData, PositionsInfoData } from "types/positions";
import { TokensData } from "types/tokens";
import { Module } from "../base";
type PositionsResult = {
    positionsData?: PositionsData;
    allPossiblePositionsKeys?: string[];
    error?: Error;
};
type PositionsConstantsResult = {
    minCollateralUsd?: bigint;
    minPositionSizeUsd?: bigint;
    maxAutoCancelOrders?: bigint;
};
export declare class Positions extends Module {
    static MAX_PENDING_UPDATE_AGE: number;
    private getKeysAndPricesParams;
    private getPositionsData;
    getPositions(p: {
        marketsData: MarketsData;
        tokensData: TokensData;
        start?: number;
        end?: number;
    }): Promise<PositionsResult>;
    private getUiFeeFactorRequest;
    private _positionsConstants;
    getPositionsConstants(): Promise<PositionsConstantsResult>;
    getMaxAutoCancelOrders({ draftOrdersCount, positionOrders, }: {
        positionOrders?: OrderInfo[];
        draftOrdersCount?: number;
    }): Promise<{
        warning: boolean;
        autoCancelOrdersLimit: number;
    }>;
    private getCodeOwner;
    private getUserRefferalCode;
    private getAffiliateTier;
    private getTiers;
    private getReferrerDiscountShare;
    private getUserReferralInfo;
    getPositionsInfo(p: {
        marketsInfoData: MarketsInfoData;
        tokensData: TokensData;
        showPnlInLeverage: boolean;
    }): Promise<PositionsInfoData>;
}
export {};
