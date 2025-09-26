import type { GasLimitsConfig } from "types/fees";
import { TokensData } from "types/tokens";
import type { IncreasePositionAmounts } from "types/trade";
import type { DecreasePositionAmounts, SwapAmounts, TradeFeesType } from "types/trade";
import { Module } from "../base";
export declare class Utils extends Module {
    private _gasLimits;
    getGasLimits(): Promise<GasLimitsConfig>;
    getEstimatedGasFee(tradeFeesType: TradeFeesType, { increaseAmounts, decreaseAmounts, swapAmounts, }: {
        swapAmounts?: SwapAmounts;
        decreaseAmounts?: DecreasePositionAmounts;
        increaseAmounts?: IncreasePositionAmounts;
    }): Promise<bigint | null>;
    getExecutionFee(tradeFeesType: TradeFeesType, tokensData: TokensData, { increaseAmounts, decreaseAmounts, swapAmounts, }: {
        swapAmounts?: SwapAmounts;
        decreaseAmounts?: DecreasePositionAmounts;
        increaseAmounts?: IncreasePositionAmounts;
    }): Promise<import("types/fees").ExecutionFee | undefined>;
    getGasPrice(): Promise<bigint | undefined>;
    private _uiFeeFactor;
    getUiFeeFactor(): Promise<bigint>;
}
