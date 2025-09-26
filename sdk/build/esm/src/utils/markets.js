import { BASIS_POINTS_DIVISOR } from "configs/factors";
import { CUSTOM_MARKET_NAMES } from "configs/marketDisplayNames";
import { getTokenVisualMultiplier, NATIVE_TOKEN_ADDRESS } from "configs/tokens";
import { applyFactor, PRECISION } from "./numbers";
import { getByKey } from "./objects";
import { convertToContractTokenPrices, convertToUsd, getMidPrice } from "./tokens";
export function getMarketFullName(p) {
    const { indexToken, longToken, shortToken, isSpotOnly } = p;
    return `${getMarketIndexName({ indexToken, isSpotOnly })} [${getMarketPoolName({ longToken, shortToken })}]`;
}
export function getMarketIndexName(p) {
    const { isSpotOnly } = p;
    const firstToken = "indexToken" in p ? p.indexToken : p.glvToken;
    if (isSpotOnly) {
        return `SWAP-ONLY`;
    }
    // Check for custom display name
    const customName = CUSTOM_MARKET_NAMES[firstToken.address];
    if (customName) {
        return customName;
    }
    const prefix = getTokenVisualMultiplier(firstToken);
    return `${prefix}${firstToken.baseSymbol || firstToken.symbol}`;
}
export function getMarketPoolName(p, separator = "-") {
    const { longToken, shortToken } = p;
    return `${longToken.symbol}${separator}${shortToken.symbol}`;
}
export function getContractMarketPrices(tokensData, market) {
    const indexToken = getByKey(tokensData, market.indexTokenAddress);
    const longToken = getByKey(tokensData, market.longTokenAddress);
    const shortToken = getByKey(tokensData, market.shortTokenAddress);
    if (!indexToken || !longToken || !shortToken) {
        return undefined;
    }
    return {
        indexTokenPrice: indexToken && convertToContractTokenPrices(indexToken.prices, indexToken.decimals),
        longTokenPrice: longToken && convertToContractTokenPrices(longToken.prices, longToken.decimals),
        shortTokenPrice: shortToken && convertToContractTokenPrices(shortToken.prices, shortToken.decimals),
    };
}
/**
 * Apart from usual cases, returns `long` for single token backed markets.
 */
export function getTokenPoolType(marketInfo, tokenAddress) {
    const { longToken, shortToken } = marketInfo;
    if (longToken.address === shortToken.address && tokenAddress === longToken.address) {
        return "long";
    }
    if (tokenAddress === longToken.address || (tokenAddress === NATIVE_TOKEN_ADDRESS && longToken.isWrapped)) {
        return "long";
    }
    if (tokenAddress === shortToken.address || (tokenAddress === NATIVE_TOKEN_ADDRESS && shortToken.isWrapped)) {
        return "short";
    }
    return undefined;
}
export function getPoolUsdWithoutPnl(marketInfo, isLong, priceType) {
    const poolAmount = isLong ? marketInfo.longPoolAmount : marketInfo.shortPoolAmount;
    const token = isLong ? marketInfo.longToken : marketInfo.shortToken;
    let price;
    if (priceType === "minPrice") {
        price = token.prices?.minPrice;
    }
    else if (priceType === "maxPrice") {
        price = token.prices?.maxPrice;
    }
    else {
        price = getMidPrice(token.prices);
    }
    return convertToUsd(poolAmount, token.decimals, price);
}
export function getCappedPoolPnl(p) {
    const { marketInfo, poolUsd, poolPnl, isLong } = p;
    if (poolPnl < 0) {
        return poolPnl;
    }
    const maxPnlFactor = isLong ? marketInfo.maxPnlFactorForTradersLong : marketInfo.maxPnlFactorForTradersShort;
    const maxPnl = applyFactor(poolUsd, maxPnlFactor);
    return poolPnl > maxPnl ? maxPnl : poolPnl;
}
export function getMaxLeverageByMinCollateralFactor(minCollateralFactor) {
    if (minCollateralFactor === undefined)
        return 100 * BASIS_POINTS_DIVISOR;
    if (minCollateralFactor === 0n)
        return 100 * BASIS_POINTS_DIVISOR;
    const x = Number(PRECISION / minCollateralFactor);
    const rounded = Math.round(x / 10) * 10;
    return rounded * BASIS_POINTS_DIVISOR;
}
export function getMaxAllowedLeverageByMinCollateralFactor(minCollateralFactor) {
    return getMaxLeverageByMinCollateralFactor(minCollateralFactor) / 2;
}
export function getOppositeCollateral(marketInfo, tokenAddress) {
    const poolType = getTokenPoolType(marketInfo, tokenAddress);
    if (poolType === "long") {
        return marketInfo.shortToken;
    }
    if (poolType === "short") {
        return marketInfo.longToken;
    }
    return undefined;
}
export function getAvailableUsdLiquidityForCollateral(marketInfo, isLong) {
    const poolUsd = getPoolUsdWithoutPnl(marketInfo, isLong, "minPrice");
    if (marketInfo.isSpotOnly) {
        return poolUsd;
    }
    const reservedUsd = getReservedUsd(marketInfo, isLong);
    const maxReserveFactor = isLong ? marketInfo.reserveFactorLong : marketInfo.reserveFactorShort;
    if (maxReserveFactor === 0n) {
        return 0n;
    }
    const minPoolUsd = (reservedUsd * PRECISION) / maxReserveFactor;
    const liquidity = poolUsd - minPoolUsd;
    return liquidity;
}
export function getReservedUsd(marketInfo, isLong) {
    const { indexToken } = marketInfo;
    if (isLong) {
        return convertToUsd(marketInfo.longInterestInTokens, marketInfo.indexToken.decimals, indexToken.prices.maxPrice);
    }
    else {
        return marketInfo.shortInterestUsd;
    }
}
export function getMarketDivisor({ longTokenAddress, shortTokenAddress, }) {
    return longTokenAddress === shortTokenAddress ? 2n : 1n;
}
export function getMarketPnl(marketInfo, isLong, forMaxPoolValue) {
    const maximize = !forMaxPoolValue;
    const openInterestUsd = getOpenInterestUsd(marketInfo, isLong);
    const openInterestInTokens = getOpenInterestInTokens(marketInfo, isLong);
    if (openInterestUsd === 0n || openInterestInTokens === 0n) {
        return 0n;
    }
    const price = getPriceForPnl(marketInfo.indexToken.prices, isLong, maximize);
    const openInterestValue = convertToUsd(openInterestInTokens, marketInfo.indexToken.decimals, price);
    const pnl = isLong ? openInterestValue - openInterestUsd : openInterestUsd - openInterestValue;
    return pnl;
}
export function getOpenInterestUsd(marketInfo, isLong) {
    return isLong ? marketInfo.longInterestUsd : marketInfo.shortInterestUsd;
}
export function getOpenInterestInTokens(marketInfo, isLong) {
    return isLong ? marketInfo.longInterestInTokens : marketInfo.shortInterestInTokens;
}
export function getPriceForPnl(prices, isLong, maximize) {
    // for long positions, pick the larger price to maximize pnl
    // for short positions, pick the smaller price to maximize pnl
    if (isLong) {
        return maximize ? prices.maxPrice : prices.minPrice;
    }
    return maximize ? prices.minPrice : prices.maxPrice;
}
export function getIsMarketAvailableForExpressSwaps(marketInfo) {
    return [marketInfo.indexToken, marketInfo.longToken, marketInfo.shortToken].every((token) => token.hasPriceFeedProvider);
}
