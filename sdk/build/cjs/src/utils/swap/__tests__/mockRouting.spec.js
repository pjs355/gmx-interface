"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const factors_1 = require("configs/factors");
const tokens_1 = require("configs/tokens");
const numbers_1 = require("utils/numbers");
const buildMarketsAdjacencyGraph_1 = require("utils/swap/buildMarketsAdjacencyGraph");
const findSwapPathsBetweenTokens_1 = require("utils/swap/findSwapPathsBetweenTokens");
const swapRouting_1 = require("utils/swap/swapRouting");
const mock_1 = require("../../../test/mock");
const marketKeys = [
    "ETH-ETH-USDC",
    "BTC-BTC-USDC",
    "BTC-BTC-DAI",
    "SOL-SOL-USDC",
    "SOL-ETH-USDC",
    "SOL-BTC-USDC",
    "SPOT-DAI-USDC",
    "SPOT-USDC-DAI",
];
const tokensData = (0, mock_1.mockTokensData)();
const baseMarketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys);
const marketAdjacencyGraph = (0, buildMarketsAdjacencyGraph_1.buildMarketsAdjacencyGraph)(baseMarketsInfoData);
const swapPaths = (0, findSwapPathsBetweenTokens_1.findSwapPathsBetweenTokens)(marketAdjacencyGraph);
const baseGasLimits = {
    decreaseOrder: 4000000n,
    depositToken: 1800000n,
    estimatedFeeMultiplierFactor: 1000000000000000000000000000000n,
    estimatedGasFeeBaseAmount: 600000n,
    estimatedGasFeePerOraclePrice: 250000n,
    glvDepositGasLimit: 2000000n,
    glvPerMarketGasLimit: 100000n,
    glvWithdrawalGasLimit: 2000000n,
    increaseOrder: 4000000n,
    shift: 2500000n,
    singleSwap: 1000000n,
    swapOrder: 3000000n,
    withdrawalMultiToken: 1500000n,
    createOrderGasLimit: 1000000n,
    updateOrderGasLimit: 1000000n,
    cancelOrderGasLimit: 1000000n,
    gelatoRelayFeeMultiplierFactor: 1000000000000000000000000000000n,
    tokenPermitGasLimit: 1000000n,
};
const baseGasPrice = 1650000002n;
(0, vitest_1.describe)("mockRouting", () => {
    (0, vitest_1.it)("selects SPOT [USDC-DAI] path for USDC->DAI swap when pool has excess of DAI", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                marketKey,
                longPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            "SPOT-USDC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(600, tokensData.USDC),
                shortPoolAmount: (0, mock_1.usdToToken)(1100, tokensData.DAI),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "USDC", "DAI");
        const estimator = (0, swapRouting_1.createNaiveSwapEstimator)(marketsInfoData, false);
        const paths = (0, swapRouting_1.getNaiveBestMarketSwapPathsFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            topPathsCount: 1,
            tokenInAddress: "USDC",
            tokenOutAddress: "DAI",
            estimator,
            usdIn: (0, numbers_1.expandDecimals)(100n, factors_1.USD_DECIMALS),
        });
        const topPath = paths?.[0];
        (0, vitest_1.expect)(topPath).toBeDefined();
        (0, vitest_1.expect)(topPath).toEqual(["SPOT-USDC-DAI"]);
    });
    (0, vitest_1.it)("selects SPOT [DAI-USDC] path for USDC->DAI swap when pool has excess of DAI", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                longPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].shortToken),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].longToken),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            "SPOT-DAI-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(110000, tokensData.DAI),
                shortPoolAmount: (0, mock_1.usdToToken)(60000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.DAI),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "USDC", "DAI");
        const estimator = (0, swapRouting_1.createNaiveSwapEstimator)(marketsInfoData, false);
        const paths = (0, swapRouting_1.getNaiveBestMarketSwapPathsFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            topPathsCount: 1,
            tokenInAddress: "USDC",
            tokenOutAddress: "DAI",
            estimator,
            usdIn: (0, numbers_1.expandDecimals)(100n, factors_1.USD_DECIMALS),
        });
        const topPath = paths?.[0];
        (0, vitest_1.expect)(topPath).toBeDefined();
        (0, vitest_1.expect)(topPath).toEqual(["SPOT-DAI-USDC"]);
    });
    (0, vitest_1.it)("routes through BTC [BTC-USDC] -> SOL [BTC-USDC] -> BTC [BTC-DAI] for optimal pricing", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                longPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].longToken),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].shortToken),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            // Desired swaps BTC -> USDC, USDC -> BTC, BTC -> DAI
            // 1st desired swap BTC -> USDC, profitable
            "BTC-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(60000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(120000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
            },
            // 2nd desired swap USDC -> BTC, back to BTC but profitable
            "SOL-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(120000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(60000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
            },
            // 3d desired swap BTC -> DAI, just balanced
            "BTC-BTC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.DAI),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.DAI),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "BTC", "DAI");
        const estimator = (0, swapRouting_1.createNaiveSwapEstimator)(marketsInfoData, false);
        const paths = (0, swapRouting_1.getNaiveBestMarketSwapPathsFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            topPathsCount: 1,
            tokenInAddress: "BTC",
            tokenOutAddress: "DAI",
            estimator,
            usdIn: (0, numbers_1.expandDecimals)(30000n, factors_1.USD_DECIMALS),
        });
        const topPath = paths?.[0];
        (0, vitest_1.expect)(topPath).toBeDefined();
        (0, vitest_1.expect)(topPath).toEqual(["BTC-BTC-USDC", "SOL-BTC-USDC", "BTC-BTC-DAI"]);
    });
    (0, vitest_1.it)("does not route USDC-BTC through BTC [BTC-USDC] -> SOL [BTC-USDC] -> BTC [BTC-USDC] for imbalanced liquidity, because of duplicate BTC-BTC-USDC", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                longPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].shortToken),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].longToken),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            // Desired swap USDC -> BTC -> USDC -> BTC, but first and third steps are through BTC-BTC-USDC
            // 1st and 3rd desired swap USDC -> BTC, profitable
            "BTC-BTC-USDC": {
                // Huge imbalance
                longPoolAmount: (0, mock_1.usdToToken)(120000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(20000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
            },
            // 2nd desired swap BTC -> USDC, back to BTC but profitable
            "SOL-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(70000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "USDC", "BTC");
        const estimator = (0, swapRouting_1.createNaiveSwapEstimator)(marketsInfoData, false);
        const paths = (0, swapRouting_1.getNaiveBestMarketSwapPathsFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            topPathsCount: 1,
            tokenInAddress: "USDC",
            tokenOutAddress: "BTC",
            estimator,
            usdIn: (0, numbers_1.expandDecimals)(30000n, factors_1.USD_DECIMALS),
        });
        const topPath = paths?.[0];
        (0, vitest_1.expect)(topPath).toBeDefined();
        (0, vitest_1.expect)(topPath).toEqual(["BTC-BTC-USDC"]);
    });
    (0, vitest_1.it)("selects BTC [BTC-USDC] direct path when impact factors penalize multi-hop routes", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                // ensure non relevant markets have enough liquidity, so that test includes all relevant markets but chooses desired
                longPoolAmount: (0, mock_1.usdToToken)(500000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(500000, baseMarketsInfoData[marketKey].shortToken),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].longToken),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            // Desired swap USDC -> BTC. even with huge imbalance because second swap through BTC-BTC-USDC would be bad
            // 1st and 3rd desired swap USDC -> BTC, profitable
            "BTC-BTC-USDC": {
                // Huge imbalance
                longPoolAmount: (0, mock_1.usdToToken)(150000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(20000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
                swapImpactFactorPositive: (0, numbers_1.expandDecimals)(1, 23),
                // Punish super hard for worsening price impact
                swapImpactFactorNegative: (0, numbers_1.expandDecimals)(3, 23),
            },
            // trap step to trick algorithm into picking 3 step path
            "SOL-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(80000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
                swapImpactFactorPositive: (0, numbers_1.expandDecimals)(1, 23),
                // Punish super hard for worsening price impact
                swapImpactFactorNegative: (0, numbers_1.expandDecimals)(3, 23),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "USDC", "BTC");
        const estimator = (0, swapRouting_1.createNaiveSwapEstimator)(marketsInfoData, false);
        const paths = (0, swapRouting_1.getNaiveBestMarketSwapPathsFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            topPathsCount: 1,
            tokenInAddress: "USDC",
            tokenOutAddress: "BTC",
            estimator,
            usdIn: (0, numbers_1.expandDecimals)(70000n, factors_1.USD_DECIMALS),
        });
        const topPath = paths?.[0];
        (0, vitest_1.expect)(topPath).toBeDefined();
        (0, vitest_1.expect)(topPath).toEqual(["BTC-BTC-USDC"]);
    });
    (0, vitest_1.it)("selects BTC [BTC-DAI] direct path when high gas fees outweigh multi-hop benefits", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                longPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].longToken),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, baseMarketsInfoData[marketKey].shortToken),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            // Desired swaps BTC -> USDC, USDC -> BTC, BTC -> DAI
            // 1st desired swap BTC -> USDC, profitable
            "BTC-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(60000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(120000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
            },
            // 2nd desired swap USDC -> BTC, back to BTC but profitable
            "SOL-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(120000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(60000, tokensData.USDC),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.USDC),
            },
            // 3d desired swap BTC -> DAI, just balanced
            "BTC-BTC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.DAI),
                maxLongPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                maxShortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.DAI),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "BTC", "DAI");
        const estimator = (0, swapRouting_1.createNaiveSwapEstimator)(marketsInfoData, false);
        const fakeMultiplier = 100n;
        const networkEstimator = (0, swapRouting_1.createNaiveNetworkEstimator)({
            chainId: 1,
            gasLimits: {
                ...baseGasLimits,
                singleSwap: baseGasLimits.singleSwap * fakeMultiplier,
            },
            gasPrice: baseGasPrice * fakeMultiplier,
            tokensData: {
                ...tokensData,
                [tokens_1.NATIVE_TOKEN_ADDRESS]: {
                    ...tokensData.ETH,
                    address: tokens_1.NATIVE_TOKEN_ADDRESS,
                },
            },
        });
        const paths = (0, swapRouting_1.getNaiveBestMarketSwapPathsFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            topPathsCount: 1,
            tokenInAddress: "BTC",
            tokenOutAddress: "DAI",
            estimator,
            usdIn: (0, numbers_1.expandDecimals)(30000n, factors_1.USD_DECIMALS),
            networkEstimator,
        });
        const topPath = paths?.[0];
        (0, vitest_1.expect)(topPath).toBeDefined();
        (0, vitest_1.expect)(topPath).toEqual(["BTC-BTC-DAI"]);
    });
});
(0, vitest_1.describe)("getMaxLiquidityMarketSwapPathFromTokenSwapPaths", () => {
    (0, vitest_1.it)("selects SPOT [USDC-DAI] path when it has highest liquidity", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                marketKey,
                longPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            "SPOT-USDC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(2000, tokensData.USDC),
                shortPoolAmount: (0, mock_1.usdToToken)(2000, tokensData.DAI),
            },
            "SPOT-DAI-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(1000, tokensData.USDC),
                shortPoolAmount: (0, mock_1.usdToToken)(1000, tokensData.DAI),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "USDC", "DAI");
        const result = (0, swapRouting_1.getMaxLiquidityMarketSwapPathFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            tokenInAddress: "USDC",
            tokenOutAddress: "DAI",
            getLiquidity: (0, swapRouting_1.createMarketEdgeLiquidityGetter)(marketsInfoData),
        });
        (0, vitest_1.expect)(result).toEqual({
            path: ["SPOT-USDC-DAI"],
            liquidity: (0, mock_1.usdToToken)(2000, tokensData.DAI),
        });
    });
    (0, vitest_1.it)("selects multi-hop path when intermediate markets have higher liquidity", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                marketKey,
                longPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            "BTC-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(3000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(3000, tokensData.USDC),
            },
            "SPOT-USDC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(3000, tokensData.USDC),
                shortPoolAmount: (0, mock_1.usdToToken)(3000, tokensData.DAI),
            },
            "BTC-BTC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(1000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(1000, tokensData.DAI),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "BTC", "DAI");
        const result = (0, swapRouting_1.getMaxLiquidityMarketSwapPathFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            tokenInAddress: "BTC",
            tokenOutAddress: "DAI",
            getLiquidity: (0, swapRouting_1.createMarketEdgeLiquidityGetter)(marketsInfoData),
        });
        (0, vitest_1.expect)(result).toEqual({
            path: ["BTC-BTC-USDC", "SPOT-USDC-DAI"],
            liquidity: 2000000000000000000000000000000000n,
        });
    });
    (0, vitest_1.it)("selects direct path when multi-hop path has lower minimum liquidity", () => {
        const allPoolsBalanced = Object.fromEntries(marketKeys.map((marketKey) => [
            marketKey,
            {
                marketKey,
                longPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].longToken),
                shortPoolAmount: (0, mock_1.usdToToken)(1000, baseMarketsInfoData[marketKey].shortToken),
            },
        ]));
        const marketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
            ...allPoolsBalanced,
            "BTC-BTC-USDC": {
                longPoolAmount: (0, mock_1.usdToToken)(1000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(100, tokensData.USDC),
            },
            "SPOT-USDC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(1000, tokensData.USDC),
                shortPoolAmount: (0, mock_1.usdToToken)(1000, tokensData.DAI),
            },
            "BTC-BTC-DAI": {
                longPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.BTC),
                shortPoolAmount: (0, mock_1.usdToToken)(1000000, tokensData.DAI),
            },
        });
        const tokenSwapPaths = (0, swapRouting_1.getTokenSwapPathsForTokenPair)(swapPaths, "BTC", "DAI");
        const result = (0, swapRouting_1.getMaxLiquidityMarketSwapPathFromTokenSwapPaths)({
            graph: marketAdjacencyGraph,
            tokenSwapPaths,
            tokenInAddress: "BTC",
            tokenOutAddress: "DAI",
            getLiquidity: (0, swapRouting_1.createMarketEdgeLiquidityGetter)(marketsInfoData),
        });
        // Should choose direct path because multi-hop path's minimum liquidity (500) is less than direct path (2000)
        (0, vitest_1.expect)(result).toEqual({
            path: ["BTC-BTC-DAI"],
            liquidity: 999000000000000000000000000000000000n,
        });
    });
});
