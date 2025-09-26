"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDefaultAcceptablePriceImpactBps = exports.getAcceptablePriceByPriceImpact = exports.getAcceptablePriceInfo = exports.getOrderThresholdType = exports.getShouldUseMaxPrice = exports.getMarkPrice = void 0;
const factors_1 = require("configs/factors");
const orders_1 = require("types/orders");
const trade_1 = require("types/trade");
const bigmath_1 = require("./bigmath");
const fees_1 = require("./fees");
const fees_2 = require("./fees");
const numbers_1 = require("./numbers");
const numbers_2 = require("./numbers");
const numbers_3 = require("./numbers");
const tokens_1 = require("./tokens");
function getMarkPrice(p) {
    const { prices, isIncrease, isLong } = p;
    const shouldUseMaxPrice = getShouldUseMaxPrice(isIncrease, isLong);
    return shouldUseMaxPrice ? prices.maxPrice : prices.minPrice;
}
exports.getMarkPrice = getMarkPrice;
function getShouldUseMaxPrice(isIncrease, isLong) {
    return isIncrease ? isLong : !isLong;
}
exports.getShouldUseMaxPrice = getShouldUseMaxPrice;
function getOrderThresholdType(orderType, isLong) {
    // limit increase order
    if (orderType === orders_1.OrderType.LimitIncrease) {
        return isLong ? trade_1.TriggerThresholdType.Below : trade_1.TriggerThresholdType.Above;
    }
    // stop market order
    if (orderType === orders_1.OrderType.StopIncrease) {
        return isLong ? trade_1.TriggerThresholdType.Above : trade_1.TriggerThresholdType.Below;
    }
    // take profit order
    if (orderType === orders_1.OrderType.LimitDecrease) {
        return isLong ? trade_1.TriggerThresholdType.Above : trade_1.TriggerThresholdType.Below;
    }
    // stop loss order
    if (orderType === orders_1.OrderType.StopLossDecrease) {
        return isLong ? trade_1.TriggerThresholdType.Below : trade_1.TriggerThresholdType.Above;
    }
    return undefined;
}
exports.getOrderThresholdType = getOrderThresholdType;
function getAcceptablePriceInfo(p) {
    const { marketInfo, isIncrease, isLong, indexPrice, sizeDeltaUsd, maxNegativePriceImpactBps } = p;
    const { indexToken } = marketInfo;
    const values = {
        acceptablePrice: 0n,
        acceptablePriceDeltaBps: 0n,
        priceImpactDeltaAmount: 0n,
        priceImpactDeltaUsd: 0n,
        priceImpactDiffUsd: 0n,
    };
    if (sizeDeltaUsd <= 0 || indexPrice == 0n) {
        return values;
    }
    const shouldFlipPriceImpact = getShouldUseMaxPrice(p.isIncrease, p.isLong);
    // For Limit / Trigger orders
    if (maxNegativePriceImpactBps !== undefined && maxNegativePriceImpactBps > 0) {
        let priceDelta = bigmath_1.bigMath.mulDiv(indexPrice, maxNegativePriceImpactBps, factors_1.BASIS_POINTS_DIVISOR_BIGINT);
        priceDelta = shouldFlipPriceImpact ? priceDelta * -1n : priceDelta;
        values.acceptablePrice = indexPrice - priceDelta;
        values.acceptablePriceDeltaBps = maxNegativePriceImpactBps * -1n;
        const priceImpact = (0, fees_1.getPriceImpactByAcceptablePrice)({
            sizeDeltaUsd,
            acceptablePrice: values.acceptablePrice,
            indexPrice,
            isLong,
            isIncrease,
        });
        values.priceImpactDeltaUsd = priceImpact.priceImpactDeltaUsd;
        values.priceImpactDeltaAmount = priceImpact.priceImpactDeltaAmount;
        return values;
    }
    values.priceImpactDeltaUsd = (0, fees_2.getCappedPositionImpactUsd)(marketInfo, isIncrease ? sizeDeltaUsd : sizeDeltaUsd * -1n, isLong, {
        fallbackToZero: !isIncrease,
    });
    if (!isIncrease && values.priceImpactDeltaUsd < 0) {
        const minPriceImpactUsd = (0, numbers_3.applyFactor)(sizeDeltaUsd, marketInfo.maxPositionImpactFactorNegative) * -1n;
        if (values.priceImpactDeltaUsd < minPriceImpactUsd) {
            values.priceImpactDiffUsd = minPriceImpactUsd - values.priceImpactDeltaUsd;
            values.priceImpactDeltaUsd = minPriceImpactUsd;
        }
    }
    if (values.priceImpactDeltaUsd > 0) {
        values.priceImpactDeltaAmount = (0, tokens_1.convertToTokenAmount)(values.priceImpactDeltaUsd, indexToken.decimals, indexToken.prices.maxPrice);
    }
    else {
        values.priceImpactDeltaAmount = (0, numbers_2.roundUpMagnitudeDivision)(values.priceImpactDeltaUsd * (0, numbers_1.expandDecimals)(1, indexToken.decimals), indexToken.prices.minPrice);
    }
    const acceptablePriceValues = getAcceptablePriceByPriceImpact({
        isIncrease,
        isLong,
        indexPrice,
        sizeDeltaUsd,
        priceImpactDeltaUsd: values.priceImpactDeltaUsd,
    });
    values.acceptablePrice = acceptablePriceValues.acceptablePrice;
    values.acceptablePriceDeltaBps = acceptablePriceValues.acceptablePriceDeltaBps;
    return values;
}
exports.getAcceptablePriceInfo = getAcceptablePriceInfo;
function getAcceptablePriceByPriceImpact(p) {
    const { indexPrice, sizeDeltaUsd, priceImpactDeltaUsd } = p;
    if (sizeDeltaUsd <= 0 || indexPrice == 0n) {
        return {
            acceptablePrice: indexPrice,
            acceptablePriceDeltaBps: 0n,
            priceDelta: 0n,
        };
    }
    const shouldFlipPriceImpact = getShouldUseMaxPrice(p.isIncrease, p.isLong);
    const priceImpactForPriceAdjustment = shouldFlipPriceImpact ? priceImpactDeltaUsd * -1n : priceImpactDeltaUsd;
    const acceptablePrice = bigmath_1.bigMath.mulDiv(indexPrice, sizeDeltaUsd + priceImpactForPriceAdjustment, sizeDeltaUsd);
    const priceDelta = (indexPrice - acceptablePrice) * (shouldFlipPriceImpact ? 1n : -1n);
    const acceptablePriceDeltaBps = (0, numbers_1.getBasisPoints)(priceDelta, p.indexPrice);
    return {
        acceptablePrice,
        acceptablePriceDeltaBps,
        priceDelta,
    };
}
exports.getAcceptablePriceByPriceImpact = getAcceptablePriceByPriceImpact;
function getDefaultAcceptablePriceImpactBps(p) {
    const { indexPrice, sizeDeltaUsd, priceImpactDeltaUsd, acceptablePriceImapctBuffer = factors_1.DEFAULT_ACCEPTABLE_PRICE_IMPACT_BUFFER, } = p;
    if (priceImpactDeltaUsd > 0) {
        return BigInt(acceptablePriceImapctBuffer);
    }
    const baseAcceptablePriceValues = getAcceptablePriceByPriceImpact({
        isIncrease: p.isIncrease,
        isLong: p.isLong,
        indexPrice,
        sizeDeltaUsd,
        priceImpactDeltaUsd,
    });
    if (baseAcceptablePriceValues.acceptablePriceDeltaBps < 0) {
        return bigmath_1.bigMath.abs(baseAcceptablePriceValues.acceptablePriceDeltaBps) + BigInt(acceptablePriceImapctBuffer);
    }
    return BigInt(acceptablePriceImapctBuffer);
}
exports.getDefaultAcceptablePriceImpactBps = getDefaultAcceptablePriceImpactBps;
