"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const factors_1 = require("configs/factors");
const tokens_1 = require("configs/tokens");
const mock_1 = require("../../../test/mock");
const swapStats_1 = require("../swapStats");
const someWrappedToken = "0x0000000000000000000000000000000000000001";
const someNativeToken = "0x0000000000000000000000000000000000000000";
const unrelatedToken = "0x0000000000000000000000000000000000000002";
const marketA = "0x0000000000000000000000000000000000000003";
const marketB = "0x0000000000000000000000000000000000000004";
const mockMarketsInfoData = {
    [marketA]: {
        longToken: {
            address: someWrappedToken,
        },
        shortToken: {
            address: unrelatedToken,
        },
    },
    [marketB]: {
        longToken: {
            address: unrelatedToken,
        },
        shortToken: {
            address: someWrappedToken,
        },
    },
};
(0, vitest_1.describe)("getSwapPathOutputAddresses", () => {
    (0, vitest_1.it)("increase, pay native, collateral wrapped, swap empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [],
            initialCollateralAddress: someWrappedToken,
            isIncrease: true,
            shouldUnwrapNativeToken: true,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: someWrappedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("increase, pay native, collateral unrelated", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [marketA],
            initialCollateralAddress: someWrappedToken,
            isIncrease: true,
            shouldUnwrapNativeToken: true,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: unrelatedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("increase, pay wrapped, collateral wrapped, swap empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [],
            initialCollateralAddress: someWrappedToken,
            isIncrease: true,
            shouldUnwrapNativeToken: false,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: someWrappedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("increase, pay wrapped, collateral unrelated", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [marketA],
            initialCollateralAddress: someWrappedToken,
            isIncrease: true,
            shouldUnwrapNativeToken: false,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: unrelatedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("increase, pay unrelated, collateral unrelated, swap empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [],
            initialCollateralAddress: unrelatedToken,
            isIncrease: true,
            shouldUnwrapNativeToken: false,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: unrelatedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("increase, pay native, collateral wrapped, swap NOT empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [marketB, marketA],
            initialCollateralAddress: someWrappedToken,
            isIncrease: true,
            shouldUnwrapNativeToken: true,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: someWrappedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("decrease, pay native, collateral wrapped, swap empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [],
            initialCollateralAddress: someWrappedToken,
            isIncrease: false,
            shouldUnwrapNativeToken: true,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: someNativeToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("decrease, pay native, collateral unrelated", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [marketA],
            initialCollateralAddress: someWrappedToken,
            isIncrease: false,
            shouldUnwrapNativeToken: true,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: unrelatedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("decrease, pay wrapped, collateral wrapped, swap empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [],
            initialCollateralAddress: someWrappedToken,
            isIncrease: false,
            shouldUnwrapNativeToken: false,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: someWrappedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("decrease, pay wrapped, collateral unrelated", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [marketA],
            initialCollateralAddress: someWrappedToken,
            isIncrease: false,
            shouldUnwrapNativeToken: false,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: unrelatedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("decrease, pay unrelated, collateral unrelated, swap empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [],
            initialCollateralAddress: unrelatedToken,
            isIncrease: false,
            shouldUnwrapNativeToken: false,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: unrelatedToken,
            outMarketAddress: undefined,
        });
    });
    (0, vitest_1.it)("decreases, pay native, collateral wrapped, swap NOT empty", () => {
        const input = {
            marketsInfoData: mockMarketsInfoData,
            swapPath: [marketB, marketA],
            initialCollateralAddress: someWrappedToken,
            isIncrease: false,
            shouldUnwrapNativeToken: true,
            wrappedNativeTokenAddress: someWrappedToken,
        };
        const result = (0, swapStats_1.getSwapPathOutputAddresses)(input);
        (0, vitest_1.expect)(result).toEqual({
            outTokenAddress: someNativeToken,
            outMarketAddress: undefined,
        });
    });
});
(0, vitest_1.describe)("getSwapPathStats", () => {
    const marketKeys = ["ETH-WETH-USDC", "BTC-BTC-USDC", "BTC-BTC-WETH"];
    const tokensData = (0, mock_1.mockTokensData)({
        ETH: {
            isNative: true,
            wrappedAddress: "WETH",
        },
        WETH: {
            ...(0, mock_1.mockTokensData)().ETH,
            wrappedAddress: undefined,
            address: "WETH",
            isWrapped: true,
            isNative: false,
        },
        USDC: {
            isNative: false,
        },
        BTC: {
            isNative: false,
        },
    });
    const testMarketsInfoData = (0, mock_1.mockMarketsInfoData)(tokensData, marketKeys, {
        "ETH-WETH-USDC": {
            longPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.WETH),
            shortPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.USDC),
        },
        "BTC-BTC-USDC": {
            longPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.BTC),
            shortPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.USDC),
        },
        "BTC-BTC-WETH": {
            longPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.BTC),
            shortPoolAmount: (0, mock_1.usdToToken)(100000, tokensData.WETH),
        },
    });
    const dollar = 10n ** BigInt(factors_1.USD_DECIMALS);
    (0, vitest_1.it)("returns undefined for empty swap path", () => {
        const result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: [],
            initialCollateralAddress: tokensData.ETH.address,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        (0, vitest_1.expect)(result).toBeUndefined();
    });
    (0, vitest_1.it)("calculates stats for single-hop swap", () => {
        const result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["ETH-WETH-USDC"],
            initialCollateralAddress: tokensData.ETH.wrappedAddress,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        (0, vitest_1.expect)(result).toBeDefined();
        (0, vitest_1.expect)(result?.swapPath).toEqual(["ETH-WETH-USDC"]);
        (0, vitest_1.expect)(result?.swapSteps).toHaveLength(1);
        (0, vitest_1.expect)(result?.tokenInAddress).toBe(tokensData.ETH.wrappedAddress);
        (0, vitest_1.expect)(result?.tokenOutAddress).toBe(tokensData.USDC.address);
        (0, vitest_1.expect)(result?.targetMarketAddress).toBe("ETH-WETH-USDC");
        (0, vitest_1.expect)(result?.usdOut).toBeLessThan(100n * dollar); // Due to fees and price impact
        (0, vitest_1.expect)(result?.totalSwapFeeUsd).toBeGreaterThan(0n);
        (0, vitest_1.expect)(result?.totalSwapPriceImpactDeltaUsd).toBeLessThan(0n); // Negative impact
        (0, vitest_1.expect)(result?.totalFeesDeltaUsd).toBeLessThan(0n); // Total fees are negative
    });
    (0, vitest_1.it)("calculates stats for multi-hop swap", () => {
        const result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["BTC-BTC-WETH", "BTC-BTC-USDC"],
            initialCollateralAddress: tokensData.ETH.wrappedAddress,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        (0, vitest_1.expect)(result).toBeDefined();
        (0, vitest_1.expect)(result?.swapPath).toEqual(["BTC-BTC-WETH", "BTC-BTC-USDC"]);
        (0, vitest_1.expect)(result?.swapSteps).toHaveLength(2);
        (0, vitest_1.expect)(result?.tokenInAddress).toBe(tokensData.ETH.wrappedAddress);
        (0, vitest_1.expect)(result?.tokenOutAddress).toBe(tokensData.USDC.address);
        (0, vitest_1.expect)(result?.targetMarketAddress).toBe("BTC-BTC-USDC");
        (0, vitest_1.expect)(result?.usdOut).toBeLessThan(100n * dollar); // Due to fees and price impact
        (0, vitest_1.expect)(result?.totalSwapFeeUsd).toBeGreaterThan(0n);
        (0, vitest_1.expect)(result?.totalSwapPriceImpactDeltaUsd).toBeLessThan(0n); // Negative impact
        (0, vitest_1.expect)(result?.totalFeesDeltaUsd).toBeLessThan(0n); // Total fees are negative
    });
    (0, vitest_1.it)("handles native token unwrapping", () => {
        const result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["ETH-WETH-USDC"],
            initialCollateralAddress: tokensData.USDC.address,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: true,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        (0, vitest_1.expect)(result).toBeDefined();
        (0, vitest_1.expect)(result?.tokenOutAddress).toBe(tokens_1.NATIVE_TOKEN_ADDRESS);
    });
    (0, vitest_1.it)("handles non-existent market in path", () => {
        const result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["NONEXISTENT-MARKET"],
            initialCollateralAddress: tokensData.ETH.address,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        (0, vitest_1.expect)(result).toBeUndefined();
    });
    (0, vitest_1.it)("applies price impact when shouldApplyPriceImpact is true", () => {
        const resultWithImpact = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["ETH-WETH-USDC"],
            initialCollateralAddress: tokensData.ETH.wrappedAddress,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        const resultWithoutImpact = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["ETH-WETH-USDC"],
            initialCollateralAddress: tokensData.ETH.wrappedAddress,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: false,
            isAtomicSwap: false,
        });
        if (!resultWithImpact || !resultWithoutImpact) {
            throw new Error("Results should be defined");
        }
        (0, vitest_1.expect)(resultWithImpact.usdOut).toBeLessThan(resultWithoutImpact.usdOut);
    });
    (0, vitest_1.it)("accumulates fees and price impact across multiple hops", () => {
        const result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["BTC-BTC-WETH", "BTC-BTC-USDC"],
            initialCollateralAddress: tokensData.ETH.wrappedAddress,
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        (0, vitest_1.expect)(result).toBeDefined();
        (0, vitest_1.expect)(result?.swapSteps).toHaveLength(2);
        if (!result) {
            throw new Error("Result should be defined");
        }
        // Total fees should be sum of individual step fees
        const totalFeesFromSteps = result.swapSteps.reduce((sum, step) => sum + step.swapFeeUsd, 0n);
        (0, vitest_1.expect)(result.totalSwapFeeUsd).toBe(totalFeesFromSteps);
        // Total price impact should be sum of individual step impacts
        const totalImpactFromSteps = result.swapSteps.reduce((sum, step) => sum + step.priceImpactDeltaUsd, 0n);
        (0, vitest_1.expect)(result.totalSwapPriceImpactDeltaUsd).toBe(totalImpactFromSteps);
        // Total fees delta should be negative (fees reduce output)
        (0, vitest_1.expect)(result.totalFeesDeltaUsd).toBeLessThan(0n);
    });
    (0, vitest_1.it)("returns undefined when swap path contains market unrelated to initial collateral token", () => {
        const result = (0, swapStats_1.getSwapPathStats)({
            marketsInfoData: testMarketsInfoData,
            swapPath: ["BTC-BTC-USDC"], // A market that doesn't contain WETH
            initialCollateralAddress: tokensData.ETH.wrappedAddress, // WETH
            wrappedNativeTokenAddress: tokensData.WETH.address,
            usdIn: 100n * dollar,
            shouldUnwrapNativeToken: false,
            shouldApplyPriceImpact: true,
            isAtomicSwap: false,
        });
        (0, vitest_1.expect)(result).toBeUndefined();
    });
});
