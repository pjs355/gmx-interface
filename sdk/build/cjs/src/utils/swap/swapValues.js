"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSwapPathComparator = exports.getSwapAmountsByToValue = exports.getSwapAmountsByFromValue = void 0;
const factors_1 = require("configs/factors");
const bigmath_1 = require("utils/bigmath");
const fees_1 = require("utils/fees");
const numbers_1 = require("utils/numbers");
const tokens_1 = require("utils/tokens");
function getSwapAmountsByFromValue(p) {
    const { tokenIn, tokenOut, amountIn, triggerRatio, isLimit, swapOptimizationOrder, findSwapPath, uiFeeFactor, allowedSwapSlippageBps, } = p;
    const priceIn = tokenIn.prices.minPrice;
    const priceOut = tokenOut.prices.maxPrice;
    const usdIn = (0, tokens_1.convertToUsd)(amountIn, tokenIn.decimals, priceIn);
    let amountOut = 0n;
    let usdOut = 0n;
    let minOutputAmount = 0n;
    const defaultAmounts = {
        amountIn,
        usdIn,
        amountOut,
        usdOut,
        minOutputAmount,
        priceIn,
        priceOut,
        swapPathStats: undefined,
    };
    if (amountIn <= 0) {
        return defaultAmounts;
    }
    if ((0, tokens_1.getIsEquivalentTokens)(tokenIn, tokenOut)) {
        amountOut = amountIn;
        usdOut = usdIn;
        minOutputAmount = amountOut;
        return {
            amountIn,
            usdIn,
            amountOut,
            usdOut,
            minOutputAmount,
            priceIn,
            priceOut,
            swapPathStats: undefined,
        };
    }
    if ((0, tokens_1.getIsStake)(tokenIn, tokenOut) || (0, tokens_1.getIsUnstake)(tokenIn, tokenOut)) {
        return getPlainSwapAmountsByFromToken(tokenIn, tokenOut, amountIn);
    }
    const swapPathStats = findSwapPath(defaultAmounts.usdIn, { order: swapOptimizationOrder });
    const totalSwapVolume = (0, fees_1.getTotalSwapVolumeFromSwapStats)(swapPathStats?.swapSteps);
    const swapUiFeeUsd = (0, numbers_1.applyFactor)(totalSwapVolume, uiFeeFactor);
    const swapUiFeeAmount = (0, tokens_1.convertToTokenAmount)(swapUiFeeUsd, tokenOut.decimals, priceOut);
    if (!swapPathStats) {
        return defaultAmounts;
    }
    if (isLimit) {
        if (!triggerRatio) {
            return defaultAmounts;
        }
        amountOut = (0, tokens_1.getAmountByRatio)({
            fromToken: tokenIn,
            toToken: tokenOut,
            fromTokenAmount: amountIn,
            ratio: triggerRatio.ratio,
            shouldInvertRatio: triggerRatio.largestToken.address === tokenOut.address,
            allowedSwapSlippageBps,
        });
        usdOut = (0, tokens_1.convertToUsd)(amountOut, tokenOut.decimals, priceOut);
        amountOut = (0, tokens_1.convertToTokenAmount)(usdOut, tokenOut.decimals, priceOut);
        minOutputAmount = amountOut;
    }
    else {
        usdOut = swapPathStats.usdOut - swapUiFeeUsd;
        amountOut = swapPathStats.amountOut - swapUiFeeAmount;
        minOutputAmount = amountOut;
    }
    if (amountOut < 0) {
        amountOut = 0n;
        usdOut = 0n;
        minOutputAmount = 0n;
    }
    return {
        amountIn,
        usdIn,
        amountOut,
        usdOut,
        priceIn,
        priceOut,
        minOutputAmount,
        swapPathStats,
    };
}
exports.getSwapAmountsByFromValue = getSwapAmountsByFromValue;
function getSwapAmountsByToValue(p) {
    const { tokenIn, tokenOut, amountOut, triggerRatio, isLimit, findSwapPath, uiFeeFactor, swapOptimizationOrder, allowedSwapSlippageBps, } = p;
    const priceIn = tokenIn.prices.minPrice;
    const priceOut = tokenOut.prices.maxPrice;
    const usdOut = (0, tokens_1.convertToUsd)(amountOut, tokenOut.decimals, priceOut);
    const uiFeeUsd = (0, numbers_1.applyFactor)(usdOut, uiFeeFactor);
    let minOutputAmount = amountOut;
    let amountIn = 0n;
    let usdIn = 0n;
    const defaultAmounts = {
        amountIn,
        usdIn,
        amountOut,
        usdOut,
        minOutputAmount,
        priceIn,
        priceOut,
        swapPathStats: undefined,
    };
    if (amountOut <= 0) {
        return defaultAmounts;
    }
    if ((0, tokens_1.getIsEquivalentTokens)(tokenIn, tokenOut)) {
        amountIn = amountOut;
        usdIn = usdOut;
        return {
            amountIn,
            usdIn,
            amountOut,
            usdOut,
            minOutputAmount,
            priceIn,
            priceOut,
            swapPathStats: undefined,
        };
    }
    if ((0, tokens_1.getIsStake)(tokenIn, tokenOut) || (0, tokens_1.getIsUnstake)(tokenIn, tokenOut)) {
        return getPlainSwapAmountsByToToken(tokenIn, tokenOut, amountOut);
    }
    const baseUsdIn = usdOut;
    const swapPathStats = findSwapPath(baseUsdIn, { order: swapOptimizationOrder });
    if (!swapPathStats) {
        return defaultAmounts;
    }
    if (isLimit) {
        if (!triggerRatio) {
            return defaultAmounts;
        }
        amountIn = (0, tokens_1.getAmountByRatio)({
            fromToken: tokenOut,
            toToken: tokenIn,
            fromTokenAmount: amountOut,
            ratio: triggerRatio.ratio,
            shouldInvertRatio: triggerRatio.largestToken.address === tokenIn.address,
        });
        usdIn = (0, tokens_1.convertToUsd)(amountIn, tokenIn.decimals, priceIn);
        if (allowedSwapSlippageBps !== undefined) {
            usdIn += bigmath_1.bigMath.mulDiv(usdIn, allowedSwapSlippageBps ?? 0n, factors_1.BASIS_POINTS_DIVISOR_BIGINT);
        }
        else {
            usdIn = usdIn + swapPathStats.totalSwapFeeUsd + uiFeeUsd - swapPathStats.totalSwapPriceImpactDeltaUsd;
        }
        amountIn = (0, tokens_1.convertToTokenAmount)(usdIn, tokenIn.decimals, priceIn);
    }
    else {
        const adjustedUsdIn = swapPathStats.usdOut > 0 ? bigmath_1.bigMath.mulDiv(baseUsdIn, usdOut, swapPathStats.usdOut) : 0n;
        usdIn = adjustedUsdIn + uiFeeUsd;
        amountIn = (0, tokens_1.convertToTokenAmount)(usdIn, tokenIn.decimals, priceIn);
    }
    if (amountIn < 0) {
        amountIn = 0n;
        usdIn = 0n;
    }
    return {
        amountIn,
        usdIn,
        amountOut,
        usdOut,
        minOutputAmount,
        priceIn,
        priceOut,
        swapPathStats,
    };
}
exports.getSwapAmountsByToValue = getSwapAmountsByToValue;
function getSwapPathComparator(order) {
    return function (a, b) {
        for (const field of order || []) {
            const isLiquidity = field === "liquidity";
            const aVal = isLiquidity ? a.liquidity : a.path.length;
            const bVal = isLiquidity ? b.liquidity : b.path.length;
            if (aVal !== bVal) {
                if (isLiquidity) {
                    return aVal < bVal ? 1 : -1;
                }
                else {
                    return aVal < bVal ? -1 : 1;
                }
            }
        }
        return 0;
    };
}
exports.getSwapPathComparator = getSwapPathComparator;
function getPlainSwapAmountsByFromToken(tokenIn, tokenOut, amountIn) {
    const usdIn = (0, tokens_1.convertToUsd)(amountIn, tokenIn.decimals, tokenIn.prices.minPrice);
    const usdOut = usdIn;
    const amountOut = (0, tokens_1.convertToTokenAmount)(usdOut, tokenOut.decimals, tokenOut.prices.maxPrice);
    const priceIn = tokenIn.prices.minPrice;
    const priceOut = tokenOut.prices.maxPrice;
    return {
        amountIn,
        usdIn,
        amountOut,
        usdOut,
        minOutputAmount: amountOut,
        priceIn,
        priceOut,
        swapPathStats: undefined,
    };
}
function getPlainSwapAmountsByToToken(tokenIn, tokenOut, amountOut) {
    const priceIn = tokenIn.prices.minPrice;
    const priceOut = tokenOut.prices.maxPrice;
    const usdOut = (0, tokens_1.convertToUsd)(amountOut, tokenOut.decimals, priceOut);
    const usdIn = usdOut;
    const amountIn = (0, tokens_1.convertToTokenAmount)(usdIn, tokenIn.decimals, priceIn);
    return {
        amountIn,
        usdIn,
        amountOut,
        usdOut,
        minOutputAmount: amountOut,
        priceIn,
        priceOut,
        swapPathStats: undefined,
    };
}
