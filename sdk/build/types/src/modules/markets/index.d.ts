import { Module } from "../base";
import { MarketsInfoResult, MarketsResult } from "./types";
export declare class Markets extends Module {
    private getClaimableFundingData;
    private getMarketsValues;
    private getMarketsConfigs;
    private _marketsData;
    getMarkets(offset?: bigint, limit?: bigint): Promise<MarketsResult>;
    getMarketsInfo(): Promise<MarketsInfoResult>;
    getDailyVolumes(): Promise<Record<string, bigint> | undefined>;
}
