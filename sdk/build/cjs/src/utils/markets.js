"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIsMarketAvailableForExpressSwaps = exports.getPriceForPnl = exports.getOpenInterestInTokens = exports.getOpenInterestUsd = exports.getMarketPnl = exports.getMarketDivisor = exports.getReservedUsd = exports.getAvailableUsdLiquidityForCollateral = exports.getOppositeCollateral = exports.getMaxAllowedLeverageByMinCollateralFactor = exports.getMaxLeverageByMinCollateralFactor = exports.getCappedPoolPnl = exports.getPoolUsdWithoutPnl = exports.getTokenPoolType = exports.getContractMarketPrices = exports.getMarketPoolName = exports.getMarketIndexName = exports.getMarketFullName = void 0;
const factors_1 = require("configs/factors");
const marketDisplayNames_1 = require("configs/marketDisplayNames");
const tokens_1 = require("configs/tokens");
const numbers_1 = require("./numbers");
const objects_1 = require("./objects");
const tokens_2 = require("./tokens");
function getMarketFullName(p) {
    const { indexToken, longToken, shortToken, isSpotOnly } = p;
    return `${getMarketIndexName({ indexToken, isSpotOnly })} [${getMarketPoolName({ longToken, shortToken })}]`;
}
exports.getMarketFullName = getMarketFullName;
function getMarketIndexName(p) {
    const { isSpotOnly } = p;
    const firstToken = "indexToken" in p ? p.indexToken : p.glvToken;
    if (isSpotOnly) {
        return `SWAP-ONLY`;
    }
    // Check for custom display name
    const customName = marketDisplayNames_1.CUSTOM_MARKET_NAMES[firstToken.address];
    if (customName) {
        return customName;
    }
    const prefix = (0, tokens_1.getTokenVisualMultiplier)(firstToken);
    return `${prefix}${firstToken.baseSymbol || firstToken.symbol}`;
}
exports.getMarketIndexName = getMarketIndexName;
function getMarketPoolName(p, separator = "-") {
    const { longToken, shortToken } = p;
    return `${longToken.symbol}${separator}${shortToken.symbol}`;
}
exports.getMarketPoolName = getMarketPoolName;
function getContractMarketPrices(tokensData, market) {
    const indexToken = (0, objects_1.getByKey)(tokensData, market.indexTokenAddress);
    const longToken = (0, objects_1.getByKey)(tokensData, market.longTokenAddress);
    const shortToken = (0, objects_1.getByKey)(tokensData, market.shortTokenAddress);
    if (!indexToken || !longToken || !shortToken) {
        return undefined;
    }
    return {
        indexTokenPrice: indexToken && (0, tokens_2.convertToContractTokenPrices)(indexToken.prices, indexToken.decimals),
        longTokenPrice: longToken && (0, tokens_2.convertToContractTokenPrices)(longToken.prices, longToken.decimals),
        shortTokenPrice: shortToken && (0, tokens_2.convertToContractTokenPrices)(shortToken.prices, shortToken.decimals),
    };
}
exports.getContractMarketPrices = getContractMarketPrices;
/**
 * Apart from usual cases, returns `long` for single token backed markets.
 */
function getTokenPoolType(marketInfo, tokenAddress) {
    const { longToken, shortToken } = marketInfo;
    if (longToken.address === shortToken.address && tokenAddress === longToken.address) {
        return "long";
    }
    if (tokenAddress === longToken.address || (tokenAddress === tokens_1.NATIVE_TOKEN_ADDRESS && longToken.isWrapped)) {
        return "long";
    }
    if (tokenAddress === shortToken.address || (tokenAddress === tokens_1.NATIVE_TOKEN_ADDRESS && shortToken.isWrapped)) {
        return "short";
    }
    return undefined;
}
exports.getTokenPoolType = getTokenPoolType;
function getPoolUsdWithoutPnl(marketInfo, isLong, priceType) {
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
        price = (0, tokens_2.getMidPrice)(token.prices);
    }
    return (0, tokens_2.convertToUsd)(poolAmount, token.decimals, price);
}
exports.getPoolUsdWithoutPnl = getPoolUsdWithoutPnl;
function getCappedPoolPnl(p) {
    const { marketInfo, poolUsd, poolPnl, isLong } = p;
    if (poolPnl < 0) {
        return poolPnl;
    }
    const maxPnlFactor = isLong ? marketInfo.maxPnlFactorForTradersLong : marketInfo.maxPnlFactorForTradersShort;
    const maxPnl = (0, numbers_1.applyFactor)(poolUsd, maxPnlFactor);
    return poolPnl > maxPnl ? maxPnl : poolPnl;
}
exports.getCappedPoolPnl = getCappedPoolPnl;
function getMaxLeverageByMinCollateralFactor(minCollateralFactor) {
    if (minCollateralFactor === undefined)
        return 100 * factors_1.BASIS_POINTS_DIVISOR;
    if (minCollateralFactor === 0n)
        return 100 * factors_1.BASIS_POINTS_DIVISOR;
    const x = Number(numbers_1.PRECISION / minCollateralFactor);
    const rounded = Math.round(x / 10) * 10;
    return rounded * factors_1.BASIS_POINTS_DIVISOR;
}
exports.getMaxLeverageByMinCollateralFactor = getMaxLeverageByMinCollateralFactor;
function getMaxAllowedLeverageByMinCollateralFactor(minCollateralFactor) {
    return getMaxLeverageByMinCollateralFactor(minCollateralFactor) / 2;
}
exports.getMaxAllowedLeverageByMinCollateralFactor = getMaxAllowedLeverageByMinCollateralFactor;
function getOppositeCollateral(marketInfo, tokenAddress) {
    const poolType = getTokenPoolType(marketInfo, tokenAddress);
    if (poolType === "long") {
        return marketInfo.shortToken;
    }
    if (poolType === "short") {
        return marketInfo.longToken;
    }
    return undefined;
}
exports.getOppositeCollateral = getOppositeCollateral;
function getAvailableUsdLiquidityForCollateral(marketInfo, isLong) {
    const poolUsd = getPoolUsdWithoutPnl(marketInfo, isLong, "minPrice");
    if (marketInfo.isSpotOnly) {
        return poolUsd;
    }
    const reservedUsd = getReservedUsd(marketInfo, isLong);
    const maxReserveFactor = isLong ? marketInfo.reserveFactorLong : marketInfo.reserveFactorShort;
    if (maxReserveFactor === 0n) {
        return 0n;
    }
    const minPoolUsd = (reservedUsd * numbers_1.PRECISION) / maxReserveFactor;
    const liquidity = poolUsd - minPoolUsd;
    return liquidity;
}
exports.getAvailableUsdLiquidityForCollateral = getAvailableUsdLiquidityForCollateral;
function getReservedUsd(marketInfo, isLong) {
    const { indexToken } = marketInfo;
    if (isLong) {
        return (0, tokens_2.convertToUsd)(marketInfo.longInterestInTokens, marketInfo.indexToken.decimals, indexToken.prices.maxPrice);
    }
    else {
        return marketInfo.shortInterestUsd;
    }
}
exports.getReservedUsd = getReservedUsd;
function getMarketDivisor({ longTokenAddress, shortTokenAddress, }) {
    return longTokenAddress === shortTokenAddress ? 2n : 1n;
}
exports.getMarketDivisor = getMarketDivisor;
function getMarketPnl(marketInfo, isLong, forMaxPoolValue) {
    const maximize = !forMaxPoolValue;
    const openInterestUsd = getOpenInterestUsd(marketInfo, isLong);
    const openInterestInTokens = getOpenInterestInTokens(marketInfo, isLong);
    if (openInterestUsd === 0n || openInterestInTokens === 0n) {
        return 0n;
    }
    const price = getPriceForPnl(marketInfo.indexToken.prices, isLong, maximize);
    const openInterestValue = (0, tokens_2.convertToUsd)(openInterestInTokens, marketInfo.indexToken.decimals, price);
    const pnl = isLong ? openInterestValue - openInterestUsd : openInterestUsd - openInterestValue;
    return pnl;
}
exports.getMarketPnl = getMarketPnl;
function getOpenInterestUsd(marketInfo, isLong) {
    return isLong ? marketInfo.longInterestUsd : marketInfo.shortInterestUsd;
}
exports.getOpenInterestUsd = getOpenInterestUsd;
function getOpenInterestInTokens(marketInfo, isLong) {
    return isLong ? marketInfo.longInterestInTokens : marketInfo.shortInterestInTokens;
}
exports.getOpenInterestInTokens = getOpenInterestInTokens;
function getPriceForPnl(prices, isLong, maximize) {
    // for long positions, pick the larger price to maximize pnl
    // for short positions, pick the smaller price to maximize pnl
    if (isLong) {
        return maximize ? prices.maxPrice : prices.minPrice;
    }
    return maximize ? prices.minPrice : prices.maxPrice;
}
exports.getPriceForPnl = getPriceForPnl;
function getIsMarketAvailableForExpressSwaps(marketInfo) {
    return [marketInfo.indexToken, marketInfo.longToken, marketInfo.shortToken].every((token) => token.hasPriceFeedProvider);
}
exports.getIsMarketAvailableForExpressSwaps = getIsMarketAvailableForExpressSwaps;
