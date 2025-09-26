"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIncreasePositionPrices = exports.leverageBySizeValues = exports.getTokensRatio = exports.getIncreasePositionAmounts = void 0;
const viem_1 = require("viem");
const factors_1 = require("configs/factors");
const orders_1 = require("types/orders");
const bigmath_1 = require("utils/bigmath");
const fees_1 = require("utils/fees");
const numbers_1 = require("utils/numbers");
const positions_1 = require("utils/positions");
const prices_1 = require("utils/prices");
const swap_1 = require("utils/swap");
const tokens_1 = require("utils/tokens");
function getIncreasePositionAmounts(p) {
    const { marketInfo, indexToken, initialCollateralToken, collateralToken, initialCollateralAmount, indexTokenAmount, isLong, leverage, triggerPrice, limitOrderType, position, fixedAcceptablePriceImpactBps, acceptablePriceImpactBuffer, externalSwapQuote, findSwapPath, userReferralInfo, uiFeeFactor, strategy, } = p;
    const values = {
        initialCollateralAmount: 0n,
        initialCollateralUsd: 0n,
        collateralDeltaAmount: 0n,
        collateralDeltaUsd: 0n,
        swapPathStats: undefined,
        externalSwapQuote: undefined,
        indexTokenAmount: 0n,
        sizeDeltaUsd: 0n,
        sizeDeltaInTokens: 0n,
        estimatedLeverage: 0n,
        indexPrice: 0n,
        initialCollateralPrice: 0n,
        collateralPrice: 0n,
        triggerPrice: 0n,
        acceptablePrice: 0n,
        acceptablePriceDeltaBps: 0n,
        positionFeeUsd: 0n,
        uiFeeUsd: 0n,
        swapUiFeeUsd: 0n,
        feeDiscountUsd: 0n,
        borrowingFeeUsd: 0n,
        fundingFeeUsd: 0n,
        positionPriceImpactDeltaUsd: 0n,
        limitOrderType: limitOrderType,
        triggerThresholdType: undefined,
    };
    const isLimit = limitOrderType !== undefined;
    const swapOptimizationOrder = isLimit ? ["length", "liquidity"] : undefined;
    const prices = getIncreasePositionPrices({
        triggerPrice,
        indexToken,
        initialCollateralToken,
        collateralToken,
        limitOrderType,
        isLong,
    });
    values.indexPrice = prices.indexPrice;
    values.initialCollateralPrice = prices.initialCollateralPrice;
    values.collateralPrice = prices.collateralPrice;
    values.triggerPrice = prices.triggerPrice;
    values.triggerThresholdType = prices.triggerThresholdType;
    values.borrowingFeeUsd = position?.pendingBorrowingFeesUsd || 0n;
    values.fundingFeeUsd = position?.pendingFundingFeesUsd || 0n;
    if (values.indexPrice <= 0 || values.initialCollateralPrice <= 0 || values.collateralPrice <= 0) {
        return values;
    }
    // Size and collateral
    if (strategy === "leverageByCollateral" &&
        leverage !== undefined &&
        initialCollateralAmount !== undefined &&
        initialCollateralAmount > 0) {
        values.estimatedLeverage = leverage;
        values.initialCollateralAmount = initialCollateralAmount;
        values.initialCollateralUsd = (0, tokens_1.convertToUsd)(initialCollateralAmount, initialCollateralToken.decimals, values.initialCollateralPrice);
        values.externalSwapQuote = externalSwapQuote;
        const swapAmounts = (0, swap_1.getSwapAmountsByFromValue)({
            tokenIn: initialCollateralToken,
            tokenOut: collateralToken,
            amountIn: initialCollateralAmount,
            isLimit: false,
            findSwapPath,
            uiFeeFactor,
            swapOptimizationOrder,
        });
        values.swapPathStats = swapAmounts.swapPathStats;
        const swapAmountOut = values.externalSwapQuote?.amountOut ?? swapAmounts.amountOut;
        const baseCollateralUsd = (0, tokens_1.convertToUsd)(swapAmountOut, collateralToken.decimals, values.collateralPrice);
        const baseSizeDeltaUsd = bigmath_1.bigMath.mulDiv(baseCollateralUsd, leverage, factors_1.BASIS_POINTS_DIVISOR_BIGINT);
        const basePriceImpactDeltaUsd = (0, fees_1.getPriceImpactForPosition)(marketInfo, baseSizeDeltaUsd, isLong);
        const basePositionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, baseSizeDeltaUsd, basePriceImpactDeltaUsd > 0, userReferralInfo);
        const baseUiFeeUsd = (0, numbers_1.applyFactor)(baseSizeDeltaUsd, uiFeeFactor);
        const totalSwapVolumeUsd = !values.externalSwapQuote
            ? (0, fees_1.getTotalSwapVolumeFromSwapStats)(values.swapPathStats?.swapSteps)
            : 0n;
        values.swapUiFeeUsd = (0, numbers_1.applyFactor)(totalSwapVolumeUsd, uiFeeFactor);
        values.sizeDeltaUsd = bigmath_1.bigMath.mulDiv(baseCollateralUsd - basePositionFeeInfo.positionFeeUsd - baseUiFeeUsd - values.swapUiFeeUsd, leverage, factors_1.BASIS_POINTS_DIVISOR_BIGINT);
        values.indexTokenAmount = (0, tokens_1.convertToTokenAmount)(values.sizeDeltaUsd, indexToken.decimals, values.indexPrice);
        const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, basePriceImpactDeltaUsd > 0, userReferralInfo);
        values.positionFeeUsd = positionFeeInfo.positionFeeUsd;
        values.feeDiscountUsd = positionFeeInfo.discountUsd;
        values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
        values.collateralDeltaUsd =
            baseCollateralUsd -
                values.positionFeeUsd -
                values.borrowingFeeUsd -
                values.fundingFeeUsd -
                values.uiFeeUsd -
                values.swapUiFeeUsd;
        values.collateralDeltaAmount = (0, tokens_1.convertToTokenAmount)(values.collateralDeltaUsd, collateralToken.decimals, values.collateralPrice);
    }
    else if (strategy === "leverageBySize" &&
        leverage !== undefined &&
        indexTokenAmount !== undefined &&
        indexTokenAmount > 0) {
        values.estimatedLeverage = leverage;
        values.indexTokenAmount = indexTokenAmount;
        values.sizeDeltaUsd = (0, tokens_1.convertToUsd)(indexTokenAmount, indexToken.decimals, values.indexPrice);
        const basePriceImpactDeltaUsd = (0, fees_1.getPriceImpactForPosition)(marketInfo, values.sizeDeltaUsd, isLong);
        const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, basePriceImpactDeltaUsd > 0, userReferralInfo);
        values.positionFeeUsd = positionFeeInfo.positionFeeUsd;
        values.feeDiscountUsd = positionFeeInfo.discountUsd;
        values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
        const { collateralDeltaUsd, collateralDeltaAmount, baseCollateralAmount } = leverageBySizeValues({
            collateralToken,
            leverage,
            sizeDeltaUsd: values.sizeDeltaUsd,
            collateralPrice: values.collateralPrice,
            uiFeeFactor,
            positionFeeUsd: values.positionFeeUsd,
            borrowingFeeUsd: values.borrowingFeeUsd,
            fundingFeeUsd: values.fundingFeeUsd,
            uiFeeUsd: values.uiFeeUsd,
            swapUiFeeUsd: values.swapUiFeeUsd,
        });
        values.collateralDeltaUsd = collateralDeltaUsd;
        values.collateralDeltaAmount = collateralDeltaAmount;
        values.externalSwapQuote = externalSwapQuote;
        const swapAmounts = (0, swap_1.getSwapAmountsByToValue)({
            tokenIn: initialCollateralToken,
            tokenOut: collateralToken,
            amountOut: baseCollateralAmount,
            isLimit: false,
            findSwapPath,
            uiFeeFactor,
        });
        values.swapPathStats = swapAmounts.swapPathStats;
        const swapAmountIn = values.externalSwapQuote?.amountIn ?? swapAmounts.amountIn;
        values.initialCollateralAmount = swapAmountIn;
        values.initialCollateralUsd = (0, tokens_1.convertToUsd)(values.initialCollateralAmount, initialCollateralToken.decimals, values.initialCollateralPrice);
    }
    else if (strategy === "independent") {
        if (indexTokenAmount !== undefined && indexTokenAmount > 0) {
            values.indexTokenAmount = indexTokenAmount;
            values.sizeDeltaUsd = (0, tokens_1.convertToUsd)(indexTokenAmount, indexToken.decimals, values.indexPrice);
            const basePriceImpactDeltaUsd = (0, fees_1.getPriceImpactForPosition)(marketInfo, values.sizeDeltaUsd, isLong);
            const positionFeeInfo = (0, fees_1.getPositionFee)(marketInfo, values.sizeDeltaUsd, basePriceImpactDeltaUsd > 0, userReferralInfo);
            values.positionFeeUsd = positionFeeInfo.positionFeeUsd;
            values.feeDiscountUsd = positionFeeInfo.discountUsd;
            values.uiFeeUsd = (0, numbers_1.applyFactor)(values.sizeDeltaUsd, uiFeeFactor);
        }
        if (initialCollateralAmount !== undefined && initialCollateralAmount > 0) {
            values.initialCollateralAmount = initialCollateralAmount;
            values.initialCollateralUsd = (0, tokens_1.convertToUsd)(initialCollateralAmount, initialCollateralToken.decimals, values.initialCollateralPrice);
            values.externalSwapQuote = externalSwapQuote;
            const swapAmounts = (0, swap_1.getSwapAmountsByFromValue)({
                tokenIn: initialCollateralToken,
                tokenOut: collateralToken,
                amountIn: initialCollateralAmount,
                isLimit: false,
                findSwapPath,
                uiFeeFactor,
                swapOptimizationOrder,
            });
            values.swapPathStats = swapAmounts.swapPathStats;
            const swapAmountIn = values.externalSwapQuote?.amountIn ?? swapAmounts.amountIn;
            const baseCollateralUsd = (0, tokens_1.convertToUsd)(swapAmountIn, initialCollateralToken.decimals, values.initialCollateralPrice);
            values.collateralDeltaUsd =
                baseCollateralUsd -
                    values.positionFeeUsd -
                    values.borrowingFeeUsd -
                    values.fundingFeeUsd -
                    values.uiFeeUsd -
                    values.swapUiFeeUsd;
            values.collateralDeltaAmount = (0, tokens_1.convertToTokenAmount)(values.collateralDeltaUsd, collateralToken.decimals, values.collateralPrice);
        }
        values.estimatedLeverage = (0, positions_1.getLeverage)({
            sizeInUsd: values.sizeDeltaUsd,
            collateralUsd: values.collateralDeltaUsd,
            pnl: 0n,
            pendingBorrowingFeesUsd: 0n,
            pendingFundingFeesUsd: 0n,
        });
    }
    const acceptablePriceInfo = (0, prices_1.getAcceptablePriceInfo)({
        marketInfo,
        isIncrease: true,
        isLong,
        indexPrice: values.indexPrice,
        sizeDeltaUsd: values.sizeDeltaUsd,
    });
    values.positionPriceImpactDeltaUsd = acceptablePriceInfo.priceImpactDeltaUsd;
    values.acceptablePrice = acceptablePriceInfo.acceptablePrice;
    values.acceptablePriceDeltaBps = acceptablePriceInfo.acceptablePriceDeltaBps;
    if (isLimit) {
        if (limitOrderType === orders_1.OrderType.StopIncrease) {
            if (isLong) {
                values.acceptablePrice = viem_1.maxUint256;
            }
            else {
                values.acceptablePrice = 0n;
            }
        }
        else {
            let maxNegativePriceImpactBps = fixedAcceptablePriceImpactBps;
            if (maxNegativePriceImpactBps === undefined) {
                maxNegativePriceImpactBps = (0, prices_1.getDefaultAcceptablePriceImpactBps)({
                    isIncrease: true,
                    isLong,
                    indexPrice: values.indexPrice,
                    sizeDeltaUsd: values.sizeDeltaUsd,
                    priceImpactDeltaUsd: values.positionPriceImpactDeltaUsd,
                    acceptablePriceImapctBuffer: acceptablePriceImpactBuffer,
                });
            }
            const limitAcceptablePriceInfo = (0, prices_1.getAcceptablePriceInfo)({
                marketInfo,
                isIncrease: true,
                isLong,
                indexPrice: values.indexPrice,
                sizeDeltaUsd: values.sizeDeltaUsd,
                maxNegativePriceImpactBps,
            });
            values.acceptablePrice = limitAcceptablePriceInfo.acceptablePrice;
            values.acceptablePriceDeltaBps = limitAcceptablePriceInfo.acceptablePriceDeltaBps;
        }
    }
    let priceImpactAmount = 0n;
    if (values.positionPriceImpactDeltaUsd > 0) {
        const price = triggerPrice !== undefined && triggerPrice > 0 ? triggerPrice : indexToken.prices.maxPrice;
        priceImpactAmount = (0, tokens_1.convertToTokenAmount)(values.positionPriceImpactDeltaUsd, indexToken.decimals, price);
    }
    else {
        const price = triggerPrice !== undefined && triggerPrice > 0 ? triggerPrice : indexToken.prices.minPrice;
        priceImpactAmount = (0, tokens_1.convertToTokenAmount)(values.positionPriceImpactDeltaUsd, indexToken.decimals, price);
    }
    values.sizeDeltaInTokens = (0, tokens_1.convertToTokenAmount)(values.sizeDeltaUsd, indexToken.decimals, values.indexPrice);
    if (isLong) {
        values.sizeDeltaInTokens = values.sizeDeltaInTokens + priceImpactAmount;
    }
    else {
        values.sizeDeltaInTokens = values.sizeDeltaInTokens - priceImpactAmount;
    }
    return values;
}
exports.getIncreasePositionAmounts = getIncreasePositionAmounts;
function getTokensRatio({ fromToken, toToken, triggerRatioValue, markPrice, }) {
    const fromTokenPrice = fromToken?.prices.minPrice;
    const markRatio = (0, tokens_1.getTokensRatioByPrice)({
        fromToken,
        toToken,
        fromPrice: fromTokenPrice,
        toPrice: markPrice,
    });
    if (triggerRatioValue === undefined) {
        return { markRatio };
    }
    const triggerRatio = {
        ratio: triggerRatioValue > 0 ? triggerRatioValue : markRatio.ratio,
        largestToken: markRatio.largestToken,
        smallestToken: markRatio.smallestToken,
    };
    return {
        markRatio,
        triggerRatio,
    };
}
exports.getTokensRatio = getTokensRatio;
function leverageBySizeValues({ collateralToken, leverage, sizeDeltaUsd, collateralPrice, positionFeeUsd, borrowingFeeUsd, uiFeeUsd, swapUiFeeUsd, fundingFeeUsd, }) {
    const collateralDeltaUsd = bigmath_1.bigMath.mulDiv(sizeDeltaUsd, factors_1.BASIS_POINTS_DIVISOR_BIGINT, leverage);
    const collateralDeltaAmount = (0, tokens_1.convertToTokenAmount)(collateralDeltaUsd, collateralToken.decimals, collateralPrice);
    const baseCollateralUsd = collateralDeltaUsd !== 0n
        ? collateralDeltaUsd + positionFeeUsd + borrowingFeeUsd + fundingFeeUsd + uiFeeUsd + swapUiFeeUsd
        : 0n;
    const baseCollateralAmount = (0, tokens_1.convertToTokenAmount)(baseCollateralUsd, collateralToken.decimals, collateralPrice);
    return {
        collateralDeltaUsd,
        collateralDeltaAmount,
        baseCollateralUsd,
        baseCollateralAmount,
    };
}
exports.leverageBySizeValues = leverageBySizeValues;
function getIncreasePositionPrices({ triggerPrice, indexToken, initialCollateralToken, collateralToken, limitOrderType, isLong, }) {
    let indexPrice;
    let initialCollateralPrice;
    let triggerThresholdType;
    let collateralPrice;
    if (triggerPrice !== undefined && triggerPrice > 0 && limitOrderType !== undefined) {
        indexPrice = triggerPrice;
        initialCollateralPrice = (0, tokens_1.getIsEquivalentTokens)(indexToken, initialCollateralToken)
            ? triggerPrice
            : initialCollateralToken.prices.minPrice;
        collateralPrice = (0, tokens_1.getIsEquivalentTokens)(indexToken, collateralToken)
            ? triggerPrice
            : collateralToken.prices.minPrice;
        triggerThresholdType = (0, prices_1.getOrderThresholdType)(limitOrderType, isLong);
    }
    else {
        indexPrice = (0, prices_1.getMarkPrice)({ prices: indexToken.prices, isIncrease: true, isLong });
        initialCollateralPrice = initialCollateralToken.prices.minPrice;
        collateralPrice = collateralToken.prices.minPrice;
    }
    return {
        indexPrice,
        initialCollateralPrice,
        collateralPrice,
        triggerThresholdType,
        triggerPrice,
    };
}
exports.getIncreasePositionPrices = getIncreasePositionPrices;
