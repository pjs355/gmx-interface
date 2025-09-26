"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTotalSwapVolumeFromSwapStats = exports.getTotalFeeItem = exports.getFeeItem = exports.getIsHighPriceImpact = exports.getBorrowingFeeRateUsd = exports.getBorrowingFactorPerPeriod = exports.getFundingFeeRateUsd = exports.getFundingFactorPerPeriod = exports.getPositionFee = exports.getSwapFee = void 0;
const factors_1 = require("configs/factors");
const bigmath_1 = require("utils/bigmath");
const numbers_1 = require("utils/numbers");
__exportStar(require("./estimateOraclePriceCount"), exports);
__exportStar(require("./executionFee"), exports);
__exportStar(require("./priceImpact"), exports);
function getSwapFee(marketInfo, swapAmount, forPositiveImpact, isAtomicSwap) {
    let factor;
    if (isAtomicSwap) {
        factor = marketInfo.atomicSwapFeeFactor;
    }
    else {
        factor = forPositiveImpact ? marketInfo.swapFeeFactorForPositiveImpact : marketInfo.swapFeeFactorForNegativeImpact;
    }
    return (0, numbers_1.applyFactor)(swapAmount, factor);
}
exports.getSwapFee = getSwapFee;
function getPositionFee(marketInfo, sizeDeltaUsd, forPositiveImpact, referralInfo, uiFeeFactor) {
    const factor = forPositiveImpact
        ? marketInfo.positionFeeFactorForPositiveImpact
        : marketInfo.positionFeeFactorForNegativeImpact;
    let positionFeeUsd = (0, numbers_1.applyFactor)(sizeDeltaUsd, factor);
    const uiFeeUsd = (0, numbers_1.applyFactor)(sizeDeltaUsd, uiFeeFactor ?? 0n);
    if (!referralInfo) {
        return { positionFeeUsd, discountUsd: 0n, totalRebateUsd: 0n };
    }
    const totalRebateUsd = (0, numbers_1.applyFactor)(positionFeeUsd, referralInfo.totalRebateFactor);
    const discountUsd = (0, numbers_1.applyFactor)(totalRebateUsd, referralInfo.discountFactor);
    positionFeeUsd = positionFeeUsd - discountUsd;
    return {
        positionFeeUsd,
        discountUsd,
        totalRebateUsd,
        uiFeeUsd,
    };
}
exports.getPositionFee = getPositionFee;
function getFundingFactorPerPeriod(marketInfo, isLong, periodInSeconds) {
    const { fundingFactorPerSecond, longsPayShorts, longInterestUsd, shortInterestUsd } = marketInfo;
    const largerInterestUsd = bigmath_1.bigMath.max(longInterestUsd, shortInterestUsd);
    const payingInterestUsd = longsPayShorts ? longInterestUsd : shortInterestUsd;
    const receivingInterestUsd = longsPayShorts ? shortInterestUsd : longInterestUsd;
    let fundingForPayingSide = 0n;
    if (payingInterestUsd !== 0n) {
        fundingForPayingSide = bigmath_1.bigMath.mulDiv(fundingFactorPerSecond, largerInterestUsd, payingInterestUsd);
    }
    let fundingForReceivingSide = 0n;
    if (receivingInterestUsd !== 0n) {
        fundingForReceivingSide = bigmath_1.bigMath.mulDiv(fundingForPayingSide, payingInterestUsd, receivingInterestUsd);
    }
    if ((longsPayShorts && isLong) || (!longsPayShorts && !isLong)) {
        // paying side
        return fundingForPayingSide * BigInt(periodInSeconds) * -1n;
    }
    else {
        // receiving side
        return fundingForReceivingSide * BigInt(periodInSeconds);
    }
}
exports.getFundingFactorPerPeriod = getFundingFactorPerPeriod;
function getFundingFeeRateUsd(marketInfo, isLong, sizeInUsd, periodInSeconds) {
    const factor = getFundingFactorPerPeriod(marketInfo, isLong, periodInSeconds);
    return (0, numbers_1.applyFactor)(sizeInUsd, factor);
}
exports.getFundingFeeRateUsd = getFundingFeeRateUsd;
function getBorrowingFactorPerPeriod(marketInfo, isLong, periodInSeconds) {
    const factorPerSecond = isLong
        ? marketInfo.borrowingFactorPerSecondForLongs
        : marketInfo.borrowingFactorPerSecondForShorts;
    return factorPerSecond * BigInt(periodInSeconds || 1);
}
exports.getBorrowingFactorPerPeriod = getBorrowingFactorPerPeriod;
function getBorrowingFeeRateUsd(marketInfo, isLong, sizeInUsd, periodInSeconds) {
    const factor = getBorrowingFactorPerPeriod(marketInfo, isLong, periodInSeconds);
    return (0, numbers_1.applyFactor)(sizeInUsd, factor);
}
exports.getBorrowingFeeRateUsd = getBorrowingFeeRateUsd;
function getIsHighPriceImpact(positionPriceImpact, swapPriceImpact) {
    const totalPriceImpact = getTotalFeeItem([positionPriceImpact, swapPriceImpact]);
    return totalPriceImpact.deltaUsd < 0 && bigmath_1.bigMath.abs(totalPriceImpact.bps) >= factors_1.HIGH_PRICE_IMPACT_BPS;
}
exports.getIsHighPriceImpact = getIsHighPriceImpact;
function getFeeItem(feeDeltaUsd, basis, opts = {}) {
    const { shouldRoundUp = false } = opts;
    if (feeDeltaUsd === undefined)
        return undefined;
    return {
        deltaUsd: feeDeltaUsd,
        bps: basis !== undefined && basis > 0 ? (0, numbers_1.getBasisPoints)(feeDeltaUsd, basis, shouldRoundUp) : 0n,
        precisePercentage: basis !== undefined && basis > 0 ? bigmath_1.bigMath.mulDiv(feeDeltaUsd, numbers_1.PRECISION, basis) : 0n,
    };
}
exports.getFeeItem = getFeeItem;
function getTotalFeeItem(feeItems) {
    const totalFeeItem = {
        deltaUsd: 0n,
        bps: 0n,
        precisePercentage: 0n,
    };
    feeItems.filter(Boolean).forEach((feeItem) => {
        totalFeeItem.deltaUsd = totalFeeItem.deltaUsd + feeItem.deltaUsd;
        totalFeeItem.bps = totalFeeItem.bps + feeItem.bps;
        totalFeeItem.precisePercentage = totalFeeItem.precisePercentage + feeItem.precisePercentage;
    });
    return totalFeeItem;
}
exports.getTotalFeeItem = getTotalFeeItem;
function getTotalSwapVolumeFromSwapStats(swapSteps) {
    if (!swapSteps)
        return 0n;
    return swapSteps.reduce((acc, curr) => {
        return acc + curr.usdIn;
    }, 0n);
}
exports.getTotalSwapVolumeFromSwapStats = getTotalSwapVolumeFromSwapStats;
