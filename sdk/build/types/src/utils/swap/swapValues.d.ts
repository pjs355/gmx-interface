import type { TokenData, TokensRatio } from "types/tokens";
import { SwapRoute } from "types/trade";
import type { FindSwapPath, SwapAmounts, SwapOptimizationOrderArray } from "types/trade";
export declare function getSwapAmountsByFromValue(p: {
    tokenIn: TokenData;
    tokenOut: TokenData;
    amountIn: bigint;
    triggerRatio?: TokensRatio;
    isLimit: boolean;
    swapOptimizationOrder?: SwapOptimizationOrderArray;
    allowedSwapSlippageBps?: bigint;
    findSwapPath: FindSwapPath;
    uiFeeFactor: bigint;
}): SwapAmounts;
export declare function getSwapAmountsByToValue(p: {
    tokenIn: TokenData;
    tokenOut: TokenData;
    amountOut: bigint;
    triggerRatio?: TokensRatio;
    isLimit: boolean;
    findSwapPath: FindSwapPath;
    swapOptimizationOrder?: SwapOptimizationOrderArray;
    allowedSwapSlippageBps?: bigint;
    uiFeeFactor: bigint;
}): SwapAmounts;
export declare function getSwapPathComparator(order?: SwapOptimizationOrderArray | undefined): (a: SwapRoute, b: SwapRoute) => 1 | 0 | -1;
