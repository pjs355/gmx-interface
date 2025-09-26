import { HIGH_PRICE_IMPACT_BPS } from "configs/factors";
import { bigMath } from "utils/bigmath";
import { applyFactor, getBasisPoints, PRECISION } from "utils/numbers";
export * from "./estimateOraclePriceCount";
export * from "./executionFee";
export * from "./priceImpact";
export function getSwapFee(marketInfo, swapAmount, forPositiveImpact, isAtomicSwap) {
    let factor;
    if (isAtomicSwap) {
        factor = marketInfo.atomicSwapFeeFactor;
    }
    else {
        factor = forPositiveImpact ? marketInfo.swapFeeFactorForPositiveImpact : marketInfo.swapFeeFactorForNegativeImpact;
    }
    return applyFactor(swapAmount, factor);
}
export function getPositionFee(marketInfo, sizeDeltaUsd, forPositiveImpact, referralInfo, uiFeeFactor) {
    const factor = forPositiveImpact
        ? marketInfo.positionFeeFactorForPositiveImpact
        : marketInfo.positionFeeFactorForNegativeImpact;
    let positionFeeUsd = applyFactor(sizeDeltaUsd, factor);
    const uiFeeUsd = applyFactor(sizeDeltaUsd, uiFeeFactor ?? 0n);
    if (!referralInfo) {
        return { positionFeeUsd, discountUsd: 0n, totalRebateUsd: 0n };
    }
    const totalRebateUsd = applyFactor(positionFeeUsd, referralInfo.totalRebateFactor);
    const discountUsd = applyFactor(totalRebateUsd, referralInfo.discountFactor);
    positionFeeUsd = positionFeeUsd - discountUsd;
    return {
        positionFeeUsd,
        discountUsd,
        totalRebateUsd,
        uiFeeUsd,
    };
}
export function getFundingFactorPerPeriod(marketInfo, isLong, periodInSeconds) {
    const { fundingFactorPerSecond, longsPayShorts, longInterestUsd, shortInterestUsd } = marketInfo;
    const largerInterestUsd = bigMath.max(longInterestUsd, shortInterestUsd);
    const payingInterestUsd = longsPayShorts ? longInterestUsd : shortInterestUsd;
    const receivingInterestUsd = longsPayShorts ? shortInterestUsd : longInterestUsd;
    let fundingForPayingSide = 0n;
    if (payingInterestUsd !== 0n) {
        fundingForPayingSide = bigMath.mulDiv(fundingFactorPerSecond, largerInterestUsd, payingInterestUsd);
    }
    let fundingForReceivingSide = 0n;
    if (receivingInterestUsd !== 0n) {
        fundingForReceivingSide = bigMath.mulDiv(fundingForPayingSide, payingInterestUsd, receivingInterestUsd);
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
export function getFundingFeeRateUsd(marketInfo, isLong, sizeInUsd, periodInSeconds) {
    const factor = getFundingFactorPerPeriod(marketInfo, isLong, periodInSeconds);
    return applyFactor(sizeInUsd, factor);
}
export function getBorrowingFactorPerPeriod(marketInfo, isLong, periodInSeconds) {
    const factorPerSecond = isLong
        ? marketInfo.borrowingFactorPerSecondForLongs
        : marketInfo.borrowingFactorPerSecondForShorts;
    return factorPerSecond * BigInt(periodInSeconds || 1);
}
export function getBorrowingFeeRateUsd(marketInfo, isLong, sizeInUsd, periodInSeconds) {
    const factor = getBorrowingFactorPerPeriod(marketInfo, isLong, periodInSeconds);
    return applyFactor(sizeInUsd, factor);
}
export function getIsHighPriceImpact(positionPriceImpact, swapPriceImpact) {
    const totalPriceImpact = getTotalFeeItem([positionPriceImpact, swapPriceImpact]);
    return totalPriceImpact.deltaUsd < 0 && bigMath.abs(totalPriceImpact.bps) >= HIGH_PRICE_IMPACT_BPS;
}
export function getFeeItem(feeDeltaUsd, basis, opts = {}) {
    const { shouldRoundUp = false } = opts;
    if (feeDeltaUsd === undefined)
        return undefined;
    return {
        deltaUsd: feeDeltaUsd,
        bps: basis !== undefined && basis > 0 ? getBasisPoints(feeDeltaUsd, basis, shouldRoundUp) : 0n,
        precisePercentage: basis !== undefined && basis > 0 ? bigMath.mulDiv(feeDeltaUsd, PRECISION, basis) : 0n,
    };
}
export function getTotalFeeItem(feeItems) {
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
export function getTotalSwapVolumeFromSwapStats(swapSteps) {
    if (!swapSteps)
        return 0n;
    return swapSteps.reduce((acc, curr) => {
        return acc + curr.usdIn;
    }, 0n);
}
