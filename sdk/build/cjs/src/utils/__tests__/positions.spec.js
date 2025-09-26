"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const bigmath_1 = require("../bigmath");
const fees_1 = require("../fees");
const markets_1 = require("../markets");
const positions_1 = require("../positions");
const tokens_1 = require("../tokens");
vitest_1.vi.mock("../markets", () => ({
    ...vitest_1.vi.importActual("../markets"),
    getMarketPnl: vitest_1.vi.fn(),
    getPoolUsdWithoutPnl: vitest_1.vi.fn(),
    getCappedPoolPnl: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../tokens", () => ({
    ...vitest_1.vi.importActual("../tokens"),
    convertToUsd: vitest_1.vi.fn(),
    getIsEquivalentTokens: vitest_1.vi.fn(),
}));
vitest_1.vi.mock("../fees", () => ({
    getPositionFee: vitest_1.vi.fn(),
    getPriceImpactForPosition: vitest_1.vi.fn(),
}));
(0, vitest_1.describe)("getPositionKey", () => {
    (0, vitest_1.it)("returns key in expected format", () => {
        (0, vitest_1.expect)((0, positions_1.getPositionKey)("0xabc", "0xmarket", "0xcollateral", true)).toBe("0xabc:0xmarket:0xcollateral:true");
    });
});
(0, vitest_1.describe)("parsePositionKey", () => {
    (0, vitest_1.it)("parses position key string into an object", () => {
        const result = (0, positions_1.parsePositionKey)("0xabc:0xmarket:0xcollateral:false");
        (0, vitest_1.expect)(result).toEqual({
            account: "0xabc",
            marketAddress: "0xmarket",
            collateralAddress: "0xcollateral",
            isLong: false,
        });
    });
});
(0, vitest_1.describe)("getEntryPrice", () => {
    (0, vitest_1.it)("returns undefined if sizeInTokens <= 0", () => {
        const token = { decimals: 18 };
        (0, vitest_1.expect)((0, positions_1.getEntryPrice)({ sizeInUsd: 1000n, sizeInTokens: 0n, indexToken: token })).toBeUndefined();
    });
    (0, vitest_1.it)("returns mulDiv of sizeInUsd if sizeInTokens > 0", () => {
        const token = { decimals: 2 };
        const result = (0, positions_1.getEntryPrice)({ sizeInUsd: 1000n, sizeInTokens: 100n, indexToken: token });
        (0, vitest_1.expect)(result).toBe(1000n);
    });
});
(0, vitest_1.describe)("getPositionValueUsd", () => {
    (0, vitest_1.it)("uses convertToUsd under the hood", () => {
        tokens_1.convertToUsd.mockReturnValueOnce(5000n);
        const token = { decimals: 18 };
        const result = (0, positions_1.getPositionValueUsd)({ indexToken: token, sizeInTokens: 100n, markPrice: 10n });
        (0, vitest_1.expect)(tokens_1.convertToUsd).toHaveBeenCalledWith(100n, 18, 10n);
        (0, vitest_1.expect)(result).toBe(5000n);
    });
});
(0, vitest_1.describe)("getPositionPnlUsd", () => {
    const marketInfo = { indexToken: {}, maxPositionImpactFactorForLiquidations: 2n };
    (0, vitest_1.beforeEach)(() => {
        markets_1.getMarketPnl.mockReturnValue(1000n);
        markets_1.getPoolUsdWithoutPnl.mockReturnValue(5000n);
        markets_1.getCappedPoolPnl.mockReturnValue(800n);
    });
    (0, vitest_1.it)("returns negative PnL if positionValueUsd < sizeInUsd for a long", () => {
        tokens_1.convertToUsd.mockReturnValueOnce(900n); // positionValueUsd
        const result = (0, positions_1.getPositionPnlUsd)({
            marketInfo,
            sizeInUsd: 1000n,
            sizeInTokens: 100n,
            markPrice: 10n,
            isLong: true,
        });
        (0, vitest_1.expect)(result).toBe(900n - 1000n); // -100n
    });
});
(0, vitest_1.describe)("getPositionPendingFeesUsd", () => {
    (0, vitest_1.it)("sums up funding and borrowing fees", () => {
        (0, vitest_1.expect)((0, positions_1.getPositionPendingFeesUsd)({ pendingFundingFeesUsd: 10n, pendingBorrowingFeesUsd: 15n })).toBe(25n);
    });
});
(0, vitest_1.describe)("getPositionNetValue", () => {
    (0, vitest_1.it)("calculates net position value", () => {
        const result = (0, positions_1.getPositionNetValue)({
            collateralUsd: 1000n,
            pendingFundingFeesUsd: 10n,
            pendingBorrowingFeesUsd: 15n,
            closingFeeUsd: 5n,
            uiFeeUsd: 20n,
            pnl: 200n,
        });
        // netValue = 1000n - (10n+15n) -5n -20n + 200n = 1000n -25n -5n -20n +200n=1150n
        (0, vitest_1.expect)(result).toBe(1150n);
    });
});
(0, vitest_1.describe)("getLeverage", () => {
    (0, vitest_1.it)("returns undefined if remainingCollateralUsd <= 0", () => {
        const result = (0, positions_1.getLeverage)({
            sizeInUsd: 1000n,
            collateralUsd: 100n,
            pnl: -200n,
            pendingFundingFeesUsd: 100n,
            pendingBorrowingFeesUsd: 0n,
        });
        // remainingCollateralUsd=100n +(-200n)-100n= -200n
        (0, vitest_1.expect)(result).toBeUndefined();
    });
    (0, vitest_1.it)("returns correct leverage if collateralUsd > 0", () => {
        const result = (0, positions_1.getLeverage)({
            sizeInUsd: 2000n,
            collateralUsd: 1000n,
            pnl: 200n,
            pendingFundingFeesUsd: 50n,
            pendingBorrowingFeesUsd: 50n,
        });
        // remainingCollateralUsd=1000n +200n -100n=1100n
        // leverage= mulDiv(2000n, 10000n, 1100n)= (2000n*10000n)/1100n= ~18181n
        (0, vitest_1.expect)(result).toBe(bigmath_1.bigMath.mulDiv(2000n, 10000n, 1100n));
    });
});
(0, vitest_1.describe)("getLiquidationPrice", () => {
    (0, vitest_1.beforeEach)(() => {
        fees_1.getPositionFee.mockReturnValue({ positionFeeUsd: 50n });
        fees_1.getPriceImpactForPosition.mockReturnValue(-100n);
        tokens_1.getIsEquivalentTokens.mockReturnValue(false);
    });
    (0, vitest_1.it)("returns undefined if sizeInUsd <= 0 or sizeInTokens <= 0", () => {
        const marketInfo = { indexToken: { decimals: 18 } };
        (0, vitest_1.expect)((0, positions_1.getLiquidationPrice)({
            sizeInUsd: 0n,
            sizeInTokens: 100n,
            collateralAmount: 10n,
            collateralUsd: 1000n,
            collateralToken: {},
            marketInfo,
            pendingFundingFeesUsd: 0n,
            pendingBorrowingFeesUsd: 0n,
            minCollateralUsd: 100n,
            isLong: true,
            userReferralInfo: undefined,
        })).toBeUndefined();
        (0, vitest_1.expect)((0, positions_1.getLiquidationPrice)({
            sizeInUsd: 100n,
            sizeInTokens: 0n,
            collateralAmount: 10n,
            collateralUsd: 1000n,
            collateralToken: {},
            marketInfo,
            pendingFundingFeesUsd: 0n,
            pendingBorrowingFeesUsd: 0n,
            minCollateralUsd: 100n,
            isLong: true,
            userReferralInfo: undefined,
        })).toBeUndefined();
    });
    (0, vitest_1.it)("computes liquidation price for non-equivalent tokens and isLong=true", () => {
        tokens_1.getIsEquivalentTokens.mockReturnValue(false);
        const marketInfo = {
            indexToken: { decimals: 8 },
            minCollateralFactor: 1000n, // 0.001
            maxPositionImpactFactorForLiquidations: 500n, // 0.005
        };
        const result = (0, positions_1.getLiquidationPrice)({
            sizeInUsd: 1000n,
            sizeInTokens: 100n,
            collateralAmount: 50n, // not used if tokens not equivalent
            collateralToken: {},
            collateralUsd: 400n,
            marketInfo,
            pendingFundingFeesUsd: 0n,
            pendingBorrowingFeesUsd: 0n,
            minCollateralUsd: 200n,
            isLong: true,
            userReferralInfo: undefined,
        });
        (0, vitest_1.expect)(result).toBeDefined();
    });
});
