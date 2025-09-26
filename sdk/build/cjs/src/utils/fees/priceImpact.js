"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyImpactFactor = exports.calculateImpactForCrossoverRebalance = exports.calculateImpactForSameSideRebalance = exports.getPriceImpactUsd = exports.getNextPoolAmountsParams = exports.getPriceImpactForSwap = exports.getPriceImpactForPosition = exports.getCappedPositionImpactUsd = exports.applySwapImpactWithCap = exports.getPriceImpactByAcceptablePrice = void 0;
const bigmath_1 = require("utils/bigmath");
const markets_1 = require("utils/markets");
const numbers_1 = require("utils/numbers");
const tokens_1 = require("utils/tokens");
const tradeHistory_1 = require("utils/tradeHistory");
function getPriceImpactByAcceptablePrice(p) {
    const { sizeDeltaUsd, acceptablePrice, indexPrice: markPrice, isLong, isIncrease } = p;
    const shouldFlipPriceDiff = isIncrease ? !isLong : isLong;
    const priceDelta = (markPrice - acceptablePrice) * (shouldFlipPriceDiff ? -1n : 1n);
    const acceptablePriceDeltaBps = markPrice === 0n ? 0n : (0, numbers_1.getBasisPoints)(priceDelta, markPrice);
    const priceImpactDeltaUsd = acceptablePrice === 0n ? 0n : (sizeDeltaUsd * priceDelta) / acceptablePrice;
    const priceImpactDeltaAmount = markPrice === 0n ? 0n : priceImpactDeltaUsd / markPrice;
    return {
        priceImpactDeltaUsd,
        priceImpactDeltaAmount,
        priceDelta,
        acceptablePriceDeltaBps,
    };
}
exports.getPriceImpactByAcceptablePrice = getPriceImpactByAcceptablePrice;
function applySwapImpactWithCap(marketInfo, token, priceImpactDeltaUsd) {
    const tokenPoolType = (0, markets_1.getTokenPoolType)(marketInfo, token.address);
    if (!tokenPoolType) {
        throw new Error(`Token ${token.address} is not a collateral of the market ${marketInfo.marketTokenAddress}`);
    }
    const isLongCollateral = tokenPoolType === "long";
    const price = priceImpactDeltaUsd > 0 ? token.prices.maxPrice : token.prices.minPrice;
    let impactDeltaAmount;
    let cappedDiffUsd = 0n;
    if (priceImpactDeltaUsd > 0) {
        // round positive impactAmount down, this will be deducted from the swap impact pool for the user
        impactDeltaAmount = (0, tokens_1.convertToTokenAmount)(priceImpactDeltaUsd, token.decimals, price);
        const maxImpactAmount = isLongCollateral
            ? marketInfo.swapImpactPoolAmountLong
            : marketInfo.swapImpactPoolAmountShort;
        if (impactDeltaAmount > maxImpactAmount) {
            cappedDiffUsd = bigmath_1.bigMath.mulDiv(impactDeltaAmount - maxImpactAmount, price, (0, numbers_1.expandDecimals)(1, token.decimals));
            impactDeltaAmount = maxImpactAmount;
        }
    }
    else {
        // round negative impactAmount up, this will be deducted from the user
        impactDeltaAmount = (0, numbers_1.roundUpMagnitudeDivision)(priceImpactDeltaUsd * (0, numbers_1.expandDecimals)(1, token.decimals), price);
    }
    return { impactDeltaAmount, cappedDiffUsd };
}
exports.applySwapImpactWithCap = applySwapImpactWithCap;
function getCappedPositionImpactUsd(marketInfo, sizeDeltaUsd, isLong, opts = {}) {
    const priceImpactDeltaUsd = getPriceImpactForPosition(marketInfo, sizeDeltaUsd, isLong, opts);
    if (priceImpactDeltaUsd < 0) {
        return priceImpactDeltaUsd;
    }
    const { indexToken } = marketInfo;
    const impactPoolAmount = marketInfo?.positionImpactPoolAmount;
    const maxPriceImpactUsdBasedOnImpactPool = (0, tokens_1.convertToUsd)(impactPoolAmount, indexToken.decimals, indexToken.prices.minPrice);
    let cappedImpactUsd = priceImpactDeltaUsd;
    if (cappedImpactUsd > maxPriceImpactUsdBasedOnImpactPool) {
        cappedImpactUsd = maxPriceImpactUsdBasedOnImpactPool;
    }
    const maxPriceImpactFactor = marketInfo.maxPositionImpactFactorPositive;
    const maxPriceImpactUsdBasedOnMaxPriceImpactFactor = (0, numbers_1.applyFactor)(bigmath_1.bigMath.abs(sizeDeltaUsd), maxPriceImpactFactor);
    if (cappedImpactUsd > maxPriceImpactUsdBasedOnMaxPriceImpactFactor) {
        cappedImpactUsd = maxPriceImpactUsdBasedOnMaxPriceImpactFactor;
    }
    return cappedImpactUsd;
}
exports.getCappedPositionImpactUsd = getCappedPositionImpactUsd;
function getPriceImpactForPosition(marketInfo, sizeDeltaUsd, isLong, opts = {}) {
    const { longInterestUsd, shortInterestUsd } = marketInfo;
    const { currentLongUsd, currentShortUsd, nextLongUsd, nextShortUsd } = getNextOpenInterestParams({
        currentLongUsd: longInterestUsd,
        currentShortUsd: shortInterestUsd,
        usdDelta: sizeDeltaUsd,
        isLong: isLong,
    });
    const priceImpactUsd = getPriceImpactUsd({
        currentLongUsd,
        currentShortUsd,
        nextLongUsd,
        nextShortUsd,
        factorPositive: marketInfo.positionImpactFactorPositive,
        factorNegative: marketInfo.positionImpactFactorNegative,
        exponentFactor: marketInfo.positionImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    if (priceImpactUsd > 0) {
        return priceImpactUsd;
    }
    if (bigmath_1.bigMath.abs(marketInfo.virtualInventoryForPositions) <= 0) {
        return priceImpactUsd;
    }
    const virtualInventoryParams = getNextOpenInterestForVirtualInventory({
        virtualInventory: marketInfo.virtualInventoryForPositions,
        usdDelta: sizeDeltaUsd,
        isLong: isLong,
    });
    const priceImpactUsdForVirtualInventory = getPriceImpactUsd({
        currentLongUsd: virtualInventoryParams.currentLongUsd,
        currentShortUsd: virtualInventoryParams.currentShortUsd,
        nextLongUsd: virtualInventoryParams.nextLongUsd,
        nextShortUsd: virtualInventoryParams.nextShortUsd,
        factorPositive: marketInfo.positionImpactFactorPositive,
        factorNegative: marketInfo.positionImpactFactorNegative,
        exponentFactor: marketInfo.positionImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    return priceImpactUsdForVirtualInventory < priceImpactUsd ? priceImpactUsdForVirtualInventory : priceImpactUsd;
}
exports.getPriceImpactForPosition = getPriceImpactForPosition;
function getPriceImpactForSwap(marketInfo, tokenA, tokenB, usdDeltaTokenA, usdDeltaTokenB, opts = {}) {
    const tokenAPoolType = (0, markets_1.getTokenPoolType)(marketInfo, tokenA.address);
    const tokenBPoolType = (0, markets_1.getTokenPoolType)(marketInfo, tokenB.address);
    if (tokenAPoolType === undefined ||
        tokenBPoolType === undefined ||
        (tokenAPoolType === tokenBPoolType && !marketInfo.isSameCollaterals)) {
        throw new Error(`Invalid tokens to swap ${marketInfo.marketTokenAddress} ${tokenA.address} ${tokenB.address}`);
    }
    const [longToken, shortToken] = tokenAPoolType === "long" ? [tokenA, tokenB] : [tokenB, tokenA];
    const [longDeltaUsd, shortDeltaUsd] = tokenAPoolType === "long" ? [usdDeltaTokenA, usdDeltaTokenB] : [usdDeltaTokenB, usdDeltaTokenA];
    const { longPoolUsd, shortPoolUsd, nextLongPoolUsd, nextShortPoolUsd } = getNextPoolAmountsParams({
        marketInfo,
        longToken,
        shortToken,
        longPoolAmount: marketInfo.longPoolAmount,
        shortPoolAmount: marketInfo.shortPoolAmount,
        longDeltaUsd,
        shortDeltaUsd,
    });
    const priceImpactUsd = getPriceImpactUsd({
        currentLongUsd: longPoolUsd,
        currentShortUsd: shortPoolUsd,
        nextLongUsd: nextLongPoolUsd,
        nextShortUsd: nextShortPoolUsd,
        factorPositive: marketInfo.swapImpactFactorPositive,
        factorNegative: marketInfo.swapImpactFactorNegative,
        exponentFactor: marketInfo.swapImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    if (priceImpactUsd > 0) {
        return priceImpactUsd;
    }
    const virtualInventoryLong = marketInfo.virtualPoolAmountForLongToken;
    const virtualInventoryShort = marketInfo.virtualPoolAmountForShortToken;
    if (virtualInventoryLong <= 0 || virtualInventoryShort <= 0) {
        return priceImpactUsd;
    }
    const virtualInventoryParams = getNextPoolAmountsParams({
        marketInfo,
        longToken,
        shortToken,
        longPoolAmount: virtualInventoryLong,
        shortPoolAmount: virtualInventoryShort,
        longDeltaUsd,
        shortDeltaUsd,
    });
    const priceImpactUsdForVirtualInventory = getPriceImpactUsd({
        currentLongUsd: virtualInventoryParams.longPoolUsd,
        currentShortUsd: virtualInventoryParams.shortPoolUsd,
        nextLongUsd: virtualInventoryParams.nextLongPoolUsd,
        nextShortUsd: virtualInventoryParams.nextShortPoolUsd,
        factorPositive: marketInfo.swapImpactFactorPositive,
        factorNegative: marketInfo.swapImpactFactorNegative,
        exponentFactor: marketInfo.swapImpactExponentFactor,
        fallbackToZero: opts.fallbackToZero,
    });
    return priceImpactUsdForVirtualInventory < priceImpactUsd ? priceImpactUsdForVirtualInventory : priceImpactUsd;
}
exports.getPriceImpactForSwap = getPriceImpactForSwap;
function getNextOpenInterestForVirtualInventory(p) {
    const { virtualInventory, usdDelta, isLong } = p;
    let currentLongUsd = 0n;
    let currentShortUsd = 0n;
    if (virtualInventory > 0) {
        currentShortUsd = virtualInventory;
    }
    else {
        currentLongUsd = virtualInventory * -1n;
    }
    if (usdDelta < 0) {
        const offset = bigmath_1.bigMath.abs(usdDelta);
        currentLongUsd = currentLongUsd + offset;
        currentShortUsd = currentShortUsd + offset;
    }
    return getNextOpenInterestParams({
        currentLongUsd,
        currentShortUsd,
        usdDelta,
        isLong,
    });
}
function getNextOpenInterestParams(p) {
    const { currentLongUsd, currentShortUsd, usdDelta, isLong } = p;
    let nextLongUsd = currentLongUsd;
    let nextShortUsd = currentShortUsd;
    if (isLong) {
        nextLongUsd = (currentLongUsd ?? 0n) + (usdDelta ?? 0n);
    }
    else {
        nextShortUsd = (currentShortUsd ?? 0n) + (usdDelta ?? 0n);
    }
    return {
        currentLongUsd,
        currentShortUsd,
        nextLongUsd,
        nextShortUsd,
    };
}
function getNextPoolAmountsParams(p) {
    const { marketInfo, longToken, shortToken, longPoolAmount, shortPoolAmount, longDeltaUsd, shortDeltaUsd } = p;
    const longPrice = (0, tokens_1.getMidPrice)(longToken.prices);
    const shortPrice = (0, tokens_1.getMidPrice)(shortToken.prices);
    const longPoolUsd = (0, tokens_1.convertToUsd)(longPoolAmount, longToken.decimals, longPrice);
    const shortPoolUsd = (0, tokens_1.convertToUsd)(shortPoolAmount, shortToken.decimals, shortPrice);
    const longPoolUsdAdjustment = (0, tokens_1.convertToUsd)(marketInfo.longPoolAmountAdjustment, longToken.decimals, longPrice);
    const shortPoolUsdAdjustment = (0, tokens_1.convertToUsd)(marketInfo.shortPoolAmountAdjustment, shortToken.decimals, shortPrice);
    const nextLongPoolUsd = longPoolUsd + longDeltaUsd + longPoolUsdAdjustment;
    const nextShortPoolUsd = shortPoolUsd + shortDeltaUsd + shortPoolUsdAdjustment;
    return {
        longPoolUsd,
        shortPoolUsd,
        nextLongPoolUsd,
        nextShortPoolUsd,
    };
}
exports.getNextPoolAmountsParams = getNextPoolAmountsParams;
/**
 * @see https://github.com/gmx-io/gmx-synthetics/blob/updates/contracts/pricing/SwapPricingUtils.sol
 */
function getPriceImpactUsd(p) {
    const { nextLongUsd, nextShortUsd } = p;
    if (nextLongUsd < 0 || nextShortUsd < 0) {
        if (p.fallbackToZero) {
            return 0n;
        }
        else {
            throw new Error("Negative pool amount");
        }
    }
    const currentDiff = bigmath_1.bigMath.abs(p.currentLongUsd - p.currentShortUsd);
    const nextDiff = bigmath_1.bigMath.abs(nextLongUsd - nextShortUsd);
    const isSameSideRebalance = p.currentLongUsd < p.currentShortUsd === nextLongUsd < nextShortUsd;
    let impactUsd;
    if (isSameSideRebalance) {
        const hasPositiveImpact = nextDiff < currentDiff;
        const factor = hasPositiveImpact ? p.factorPositive : p.factorNegative;
        impactUsd = calculateImpactForSameSideRebalance({
            currentDiff,
            nextDiff,
            hasPositiveImpact,
            factor,
            exponentFactor: p.exponentFactor,
        });
    }
    else {
        impactUsd = calculateImpactForCrossoverRebalance({
            currentDiff,
            nextDiff,
            factorPositive: p.factorPositive,
            factorNegative: p.factorNegative,
            exponentFactor: p.exponentFactor,
        });
    }
    return impactUsd;
}
exports.getPriceImpactUsd = getPriceImpactUsd;
/**
 *  @see https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
function calculateImpactForSameSideRebalance(p) {
    const { currentDiff, nextDiff, hasPositiveImpact, factor, exponentFactor } = p;
    const currentImpact = applyImpactFactor(currentDiff, factor, exponentFactor);
    const nextImpact = applyImpactFactor(nextDiff, factor, exponentFactor);
    const deltaDiff = bigmath_1.bigMath.abs(currentImpact - nextImpact);
    return hasPositiveImpact ? deltaDiff : -deltaDiff;
}
exports.calculateImpactForSameSideRebalance = calculateImpactForSameSideRebalance;
/**
 *  @see  https://github.com/gmx-io/gmx-synthetics/blob/5fd9991ff2c37ae5f24f03bc9c132730b012ebf2/contracts/pricing/PricingUtils.sol
 */
function calculateImpactForCrossoverRebalance(p) {
    const { currentDiff, nextDiff, factorNegative, factorPositive, exponentFactor } = p;
    const positiveImpact = applyImpactFactor(currentDiff, factorPositive, exponentFactor);
    const negativeImpactUsd = applyImpactFactor(nextDiff, factorNegative, exponentFactor);
    const deltaDiffUsd = bigmath_1.bigMath.abs(positiveImpact - negativeImpactUsd);
    return positiveImpact > negativeImpactUsd ? deltaDiffUsd : -deltaDiffUsd;
}
exports.calculateImpactForCrossoverRebalance = calculateImpactForCrossoverRebalance;
function applyImpactFactor(diff, factor, exponent) {
    // Convert diff and exponent to float js numbers
    const _diff = Number(diff) / 10 ** 30;
    const _exponent = Number(exponent) / 10 ** 30;
    // Pow and convert back to BigInt with 30 decimals
    let result = (0, tradeHistory_1.bigNumberify)(BigInt(Math.round(_diff ** _exponent * 10 ** 30)));
    result = (result * factor) / (0, numbers_1.expandDecimals)(1, 30);
    return result;
}
exports.applyImpactFactor = applyImpactFactor;
