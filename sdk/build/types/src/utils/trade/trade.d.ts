import { DecreasePositionAmounts, IncreasePositionAmounts, SwapAmounts, TradeFlags, TradeMode, TradeType } from "types/trade";
export declare function applySlippageToPrice(allowedSlippage: number, price: bigint, isIncrease: boolean, isLong: boolean): bigint;
export declare function applySlippageToMinOut(allowedSlippage: number, minOutputAmount: bigint): bigint;
export declare function getSwapCount({ isSwap, isIncrease, increaseAmounts, decreaseAmounts, swapAmounts, }: {
    isSwap: boolean;
    isIncrease: boolean;
    swapAmounts?: SwapAmounts;
    increaseAmounts?: IncreasePositionAmounts;
    decreaseAmounts?: DecreasePositionAmounts;
}): number | undefined;
export declare const createTradeFlags: (tradeType: TradeType, tradeMode: TradeMode) => TradeFlags;
