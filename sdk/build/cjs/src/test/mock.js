"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockExternalSwap = exports.mockMarketsInfoData = exports.mockMarketsData = exports.mockTokensData = exports.mockMarketKeys = exports.MOCK_GAS_PRICE = exports.usdToToken = void 0;
const viem_1 = require("viem");
const factors_1 = require("configs/factors");
const trade_1 = require("types/trade");
const markets_1 = require("utils/markets");
const numbers_1 = require("utils/numbers");
const tokens_1 = require("utils/tokens");
function usdToToken(usd, token) {
    return (0, tokens_1.convertToTokenAmount)((0, numbers_1.expandDecimals)(usd, factors_1.USD_DECIMALS), token.decimals, token.prices?.minPrice);
}
exports.usdToToken = usdToToken;
exports.MOCK_GAS_PRICE = 100000000n; // (0.1 gwei)
function mockMarketKeys() {
    return [
        "AVAX-AVAX-USDC",
        "ETH-ETH-USDC",
        "ETH-ETH-DAI",
        "SOL-ETH-USDC",
        "BTC-BTC-DAI",
        "SPOT-USDC-DAI",
        "SPOT-DAI-USDC",
        // same collaterals, should be disabled for swaps
        "ETH-USDC-USDC",
        // Unreachable markets
        "TBTC-TBTC-TBTC",
        "TETH_A-TETH_A-TETH_B",
        // Partially unreachable markets
        "TEST_B-TEST_B-TEST_A",
        "TEST_C-TEST_C-TEST_A",
    ];
}
exports.mockMarketKeys = mockMarketKeys;
function mockTokensData(overrides = {}) {
    const tokens = {
        ...overrides,
        AVAX: {
            address: "AVAX",
            wrappedAddress: "WAVAX",
            name: "Avalanche",
            symbol: "AVAX",
            decimals: 18,
            isNative: true,
            prices: {
                minPrice: (0, numbers_1.expandDecimals)(12, 30),
                maxPrice: (0, numbers_1.expandDecimals)(12, 30),
            },
            ...(overrides.AVAX || {}),
        },
        WAVAX: {
            address: "WAVAX",
            name: "Wrapped Avalanche",
            symbol: "WAVAX",
            decimals: 18,
            isNative: true,
            prices: {
                minPrice: (0, numbers_1.expandDecimals)(12, 30),
                maxPrice: (0, numbers_1.expandDecimals)(12, 30),
            },
            ...(overrides.AVAX || {}),
        },
        USDC: {
            address: "USDC",
            name: "USD Coin",
            symbol: "USDC",
            decimals: 6,
            isStable: true,
            prices: {
                minPrice: (0, numbers_1.expandDecimals)(1, 30),
                maxPrice: (0, numbers_1.expandDecimals)(1, 30),
            },
            ...(overrides.USDC || {}),
        },
        ETH: {
            address: "ETH",
            name: "Ethereum",
            symbol: "ETH",
            decimals: 18,
            prices: {
                minPrice: (0, numbers_1.expandDecimals)(1200, 30),
                maxPrice: (0, numbers_1.expandDecimals)(1200, 30),
            },
            ...(overrides.ETH || {}),
        },
        BTC: {
            address: "BTC",
            name: "Bitcoin",
            symbol: "BTC",
            decimals: 8,
            prices: {
                minPrice: (0, numbers_1.expandDecimals)(20000, 30),
                maxPrice: (0, numbers_1.expandDecimals)(20000, 30),
            },
            ...(overrides.BTC || {}),
        },
        DAI: {
            address: "DAI",
            name: "Dai",
            symbol: "DAI",
            decimals: 30,
            isStable: true,
            prices: {
                minPrice: (0, numbers_1.expandDecimals)(1, 30),
                maxPrice: (0, numbers_1.expandDecimals)(1, 30),
            },
            ...(overrides.DAI || {}),
        },
        SOL: {
            address: "SOL",
            name: "Solana",
            symbol: "SOL",
            decimals: 18,
            isSynthetic: true,
            prices: {
                minPrice: (0, numbers_1.expandDecimals)(16, 30),
                maxPrice: (0, numbers_1.expandDecimals)(16, 30),
            },
            ...(overrides.SOL || {}),
        },
        SPOT: {
            address: "SPOT",
            name: "SPOT",
            decimals: 30,
            symbol: "SPOT",
            prices: {
                minPrice: BigInt(1),
                maxPrice: BigInt(1),
            },
            ...(overrides.SPOT || {}),
        },
    };
    return tokens;
}
exports.mockTokensData = mockTokensData;
/**
 * @param marketKeys - array of market keys in the following format: indexToken-longToken-shortToken
 */
function mockMarketsData(marketKeys) {
    return marketKeys.reduce((acc, key) => {
        const [indexTokenAddress, longTokenAddress, shortTokenAddress] = key.split("-");
        acc[key] = {
            marketTokenAddress: key,
            indexTokenAddress,
            longTokenAddress,
            shortTokenAddress,
            isSameCollaterals: longTokenAddress === shortTokenAddress,
            isSpotOnly: indexTokenAddress === "SPOT",
            data: "",
            name: "Test Market",
        };
        return acc;
    }, {});
}
exports.mockMarketsData = mockMarketsData;
function mockMarketsInfoData(tokensData, marketKeys, overrides = {}) {
    return marketKeys.reduce((acc, key) => {
        const [indexTokenAddress, longTokenAddress, shortTokenAddress] = key.split("-");
        const indexToken = (0, tokens_1.getTokenData)(tokensData, indexTokenAddress);
        const longToken = (0, tokens_1.getTokenData)(tokensData, longTokenAddress);
        const shortToken = (0, tokens_1.getTokenData)(tokensData, shortTokenAddress);
        const isSpotOnly = indexTokenAddress === "SPOT";
        acc[key] = {
            isDisabled: false,
            marketTokenAddress: key,
            indexTokenAddress,
            longTokenAddress,
            shortTokenAddress,
            isSameCollaterals: longTokenAddress === shortTokenAddress,
            isSpotOnly,
            name: (0, markets_1.getMarketFullName)({ longToken, shortToken, indexToken, isSpotOnly }),
            longToken,
            shortToken,
            indexToken,
            longPoolAmount: usdToToken(1000, longToken),
            shortPoolAmount: usdToToken(1000, shortToken),
            maxLongPoolAmount: usdToToken(10000, longToken),
            maxShortPoolAmount: usdToToken(10000, shortToken),
            maxLongPoolUsdForDeposit: usdToToken(10000, longToken),
            maxShortPoolUsdForDeposit: usdToToken(10000, shortToken),
            poolValueMax: (0, numbers_1.expandDecimals)(2000, factors_1.USD_DECIMALS),
            poolValueMin: (0, numbers_1.expandDecimals)(2000, factors_1.USD_DECIMALS),
            reserveFactorLong: (0, numbers_1.expandDecimals)(5, 29),
            reserveFactorShort: (0, numbers_1.expandDecimals)(5, 29),
            openInterestReserveFactorLong: (0, numbers_1.expandDecimals)(5, 29),
            openInterestReserveFactorShort: (0, numbers_1.expandDecimals)(5, 29),
            maxOpenInterestLong: (0, numbers_1.expandDecimals)(5, 29),
            maxOpenInterestShort: (0, numbers_1.expandDecimals)(5, 29),
            positionImpactPoolAmount: usdToToken(1000, indexToken),
            positionImpactPoolDistributionRate: 0n,
            minPositionImpactPoolAmount: 0n,
            swapImpactPoolAmountLong: usdToToken(1000, longToken),
            swapImpactPoolAmountShort: usdToToken(1000, shortToken),
            positionFeeFactorForPositiveImpact: (0, numbers_1.expandDecimals)(5, 26),
            positionFeeFactorForNegativeImpact: (0, numbers_1.expandDecimals)(5, 26),
            positionImpactFactorPositive: (0, numbers_1.expandDecimals)(2, 23),
            positionImpactFactorNegative: (0, numbers_1.expandDecimals)(1, 23),
            maxPositionImpactFactorPositive: (0, numbers_1.expandDecimals)(2, 23),
            maxPositionImpactFactorNegative: (0, numbers_1.expandDecimals)(1, 23),
            maxPositionImpactFactorForLiquidations: (0, numbers_1.expandDecimals)(1, 23),
            positionImpactExponentFactor: (0, numbers_1.expandDecimals)(2, 30),
            swapFeeFactorForPositiveImpact: (0, numbers_1.expandDecimals)(2, 27),
            swapFeeFactorForNegativeImpact: (0, numbers_1.expandDecimals)(2, 27),
            atomicSwapFeeFactor: (0, numbers_1.expandDecimals)(2, 27),
            swapImpactFactorPositive: (0, numbers_1.expandDecimals)(2, 23),
            swapImpactFactorNegative: (0, numbers_1.expandDecimals)(1, 23),
            swapImpactExponentFactor: (0, numbers_1.expandDecimals)(2, 30),
            // MarketInfo
            borrowingFactorPerSecondForLongs: 0n,
            borrowingFactorPerSecondForShorts: 0n,
            borrowingExponentFactorLong: 0n,
            borrowingExponentFactorShort: 0n,
            fundingFactor: 0n,
            fundingExponentFactor: 0n,
            fundingIncreaseFactorPerSecond: 0n,
            fundingDecreaseFactorPerSecond: 0n,
            maxFundingFactorPerSecond: 0n,
            minFundingFactorPerSecond: 0n,
            thresholdForDecreaseFunding: 0n,
            thresholdForStableFunding: 0n,
            totalBorrowingFees: 0n,
            minCollateralFactor: 0n,
            minCollateralFactorForOpenInterestLong: 0n,
            minCollateralFactorForOpenInterestShort: 0n,
            longPoolAmountAdjustment: 0n,
            shortPoolAmountAdjustment: 0n,
            borrowingFactorLong: 0n,
            borrowingFactorShort: 0n,
            fundingFactorPerSecond: 0n,
            longsPayShorts: false,
            longInterestUsd: (0, numbers_1.expandDecimals)(500, factors_1.USD_DECIMALS),
            shortInterestUsd: (0, numbers_1.expandDecimals)(500, factors_1.USD_DECIMALS),
            longInterestInTokens: usdToToken(500, indexToken),
            shortInterestInTokens: usdToToken(500, indexToken),
            maxPnlFactorForTradersLong: (0, numbers_1.expandDecimals)(1, 30),
            maxPnlFactorForTradersShort: (0, numbers_1.expandDecimals)(1, 30),
            data: "",
            virtualPoolAmountForLongToken: 0n,
            virtualPoolAmountForShortToken: 0n,
            virtualInventoryForPositions: 0n,
            virtualMarketId: viem_1.zeroAddress,
            virtualLongTokenId: viem_1.zeroAddress,
            virtualShortTokenId: viem_1.zeroAddress,
            ...(overrides[key] || {}),
        };
        return acc;
    }, {});
}
exports.mockMarketsInfoData = mockMarketsInfoData;
function mockExternalSwap({ inToken, outToken, amountIn, amountOut, priceIn, priceOut, feesUsd = (0, numbers_1.expandDecimals)(5, factors_1.USD_DECIMALS), // $5 default fee
data = "0x1", to = "0x6352a56caadC4F1E25CD6c75970Fa768A3304e64", receiver = "0x1234567890123456789012345678901234567890", }) {
    const usdIn = (amountIn * priceIn) / (0, numbers_1.expandDecimals)(1, inToken.decimals);
    const usdOut = (amountOut * priceOut) / (0, numbers_1.expandDecimals)(1, outToken.decimals);
    return {
        aggregator: trade_1.ExternalSwapAggregator.OpenOcean,
        inTokenAddress: inToken.address,
        outTokenAddress: outToken.address,
        receiver,
        usdIn,
        usdOut,
        amountIn,
        amountOut,
        priceIn,
        priceOut,
        feesUsd,
        txnData: {
            to,
            data,
            value: 0n,
            estimatedGas: 100000n,
            estimatedExecutionFee: 100000n,
        },
    };
}
exports.mockExternalSwap = mockExternalSwap;
