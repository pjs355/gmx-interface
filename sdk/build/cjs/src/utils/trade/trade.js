"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTradeFlags = exports.getSwapCount = exports.applySlippageToMinOut = exports.applySlippageToPrice = void 0;
const factors_1 = require("configs/factors");
const orders_1 = require("types/orders");
const trade_1 = require("types/trade");
const bigmath_1 = require("../bigmath");
const prices_1 = require("../prices");
function applySlippageToPrice(allowedSlippage, price, isIncrease, isLong) {
    const shouldIncreasePrice = (0, prices_1.getShouldUseMaxPrice)(isIncrease, isLong);
    const slippageBasisPoints = shouldIncreasePrice
        ? factors_1.BASIS_POINTS_DIVISOR + allowedSlippage
        : factors_1.BASIS_POINTS_DIVISOR - allowedSlippage;
    return bigmath_1.bigMath.mulDiv(price, BigInt(slippageBasisPoints), factors_1.BASIS_POINTS_DIVISOR_BIGINT);
}
exports.applySlippageToPrice = applySlippageToPrice;
function applySlippageToMinOut(allowedSlippage, minOutputAmount) {
    const slippageBasisPoints = factors_1.BASIS_POINTS_DIVISOR - allowedSlippage;
    return bigmath_1.bigMath.mulDiv(minOutputAmount, BigInt(slippageBasisPoints), factors_1.BASIS_POINTS_DIVISOR_BIGINT);
}
exports.applySlippageToMinOut = applySlippageToMinOut;
function getSwapCount({ isSwap, isIncrease, increaseAmounts, decreaseAmounts, swapAmounts, }) {
    if (isSwap) {
        if (!swapAmounts)
            return undefined;
        return swapAmounts.swapPathStats?.swapPath.length ?? 0;
    }
    else if (isIncrease) {
        if (!increaseAmounts)
            return undefined;
        return increaseAmounts.swapPathStats?.swapPath.length ?? 0;
    }
    else {
        if (decreaseAmounts?.decreaseSwapType === undefined)
            return undefined;
        return decreaseAmounts.decreaseSwapType !== orders_1.DecreasePositionSwapType.NoSwap ? 1 : 0;
    }
}
exports.getSwapCount = getSwapCount;
const createTradeFlags = (tradeType, tradeMode) => {
    const isLong = tradeType === trade_1.TradeType.Long;
    const isShort = tradeType === trade_1.TradeType.Short;
    const isSwap = tradeType === trade_1.TradeType.Swap;
    const isPosition = isLong || isShort;
    const isMarket = tradeMode === trade_1.TradeMode.Market;
    const isLimit = tradeMode === trade_1.TradeMode.Limit || tradeMode === trade_1.TradeMode.StopMarket;
    const isTrigger = tradeMode === trade_1.TradeMode.Trigger;
    const isTwap = tradeMode === trade_1.TradeMode.Twap;
    const isIncrease = isPosition && (isMarket || isLimit || isTwap);
    const tradeFlags = {
        isLong,
        isShort,
        isSwap,
        isPosition,
        isIncrease,
        isMarket,
        isLimit,
        isTrigger,
        isTwap,
    };
    return tradeFlags;
};
exports.createTradeFlags = createTradeFlags;
