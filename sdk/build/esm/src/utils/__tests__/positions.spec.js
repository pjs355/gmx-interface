import { describe, expect, it, vi, beforeEach } from "vitest";
import { bigMath } from "../bigmath";
import { getPositionFee, getPriceImpactForPosition } from "../fees";
import { getCappedPoolPnl, getMarketPnl, getPoolUsdWithoutPnl } from "../markets";
import { getEntryPrice, getLeverage, getLiquidationPrice, getPositionKey, getPositionNetValue, getPositionPendingFeesUsd, getPositionPnlUsd, getPositionValueUsd, parsePositionKey, } from "../positions";
import { convertToUsd, getIsEquivalentTokens } from "../tokens";
vi.mock("../markets", () => ({
    ...vi.importActual("../markets"),
    getMarketPnl: vi.fn(),
    getPoolUsdWithoutPnl: vi.fn(),
    getCappedPoolPnl: vi.fn(),
}));
vi.mock("../tokens", () => ({
    ...vi.importActual("../tokens"),
    convertToUsd: vi.fn(),
    getIsEquivalentTokens: vi.fn(),
}));
vi.mock("../fees", () => ({
    getPositionFee: vi.fn(),
    getPriceImpactForPosition: vi.fn(),
}));
describe("getPositionKey", () => {
    it("returns key in expected format", () => {
        expect(getPositionKey("0xabc", "0xmarket", "0xcollateral", true)).toBe("0xabc:0xmarket:0xcollateral:true");
    });
});
describe("parsePositionKey", () => {
    it("parses position key string into an object", () => {
        const result = parsePositionKey("0xabc:0xmarket:0xcollateral:false");
        expect(result).toEqual({
            account: "0xabc",
            marketAddress: "0xmarket",
            collateralAddress: "0xcollateral",
            isLong: false,
        });
    });
});
describe("getEntryPrice", () => {
    it("returns undefined if sizeInTokens <= 0", () => {
        const token = { decimals: 18 };
        expect(getEntryPrice({ sizeInUsd: 1000n, sizeInTokens: 0n, indexToken: token })).toBeUndefined();
    });
    it("returns mulDiv of sizeInUsd if sizeInTokens > 0", () => {
        const token = { decimals: 2 };
        const result = getEntryPrice({ sizeInUsd: 1000n, sizeInTokens: 100n, indexToken: token });
        expect(result).toBe(1000n);
    });
});
describe("getPositionValueUsd", () => {
    it("uses convertToUsd under the hood", () => {
        convertToUsd.mockReturnValueOnce(5000n);
        const token = { decimals: 18 };
        const result = getPositionValueUsd({ indexToken: token, sizeInTokens: 100n, markPrice: 10n });
        expect(convertToUsd).toHaveBeenCalledWith(100n, 18, 10n);
        expect(result).toBe(5000n);
    });
});
describe("getPositionPnlUsd", () => {
    const marketInfo = { indexToken: {}, maxPositionImpactFactorForLiquidations: 2n };
    beforeEach(() => {
        getMarketPnl.mockReturnValue(1000n);
        getPoolUsdWithoutPnl.mockReturnValue(5000n);
        getCappedPoolPnl.mockReturnValue(800n);
    });
    it("returns negative PnL if positionValueUsd < sizeInUsd for a long", () => {
        convertToUsd.mockReturnValueOnce(900n); // positionValueUsd
        const result = getPositionPnlUsd({
            marketInfo,
            sizeInUsd: 1000n,
            sizeInTokens: 100n,
            markPrice: 10n,
            isLong: true,
        });
        expect(result).toBe(900n - 1000n); // -100n
    });
});
describe("getPositionPendingFeesUsd", () => {
    it("sums up funding and borrowing fees", () => {
        expect(getPositionPendingFeesUsd({ pendingFundingFeesUsd: 10n, pendingBorrowingFeesUsd: 15n })).toBe(25n);
    });
});
describe("getPositionNetValue", () => {
    it("calculates net position value", () => {
        const result = getPositionNetValue({
            collateralUsd: 1000n,
            pendingFundingFeesUsd: 10n,
            pendingBorrowingFeesUsd: 15n,
            closingFeeUsd: 5n,
            uiFeeUsd: 20n,
            pnl: 200n,
        });
        // netValue = 1000n - (10n+15n) -5n -20n + 200n = 1000n -25n -5n -20n +200n=1150n
        expect(result).toBe(1150n);
    });
});
describe("getLeverage", () => {
    it("returns undefined if remainingCollateralUsd <= 0", () => {
        const result = getLeverage({
            sizeInUsd: 1000n,
            collateralUsd: 100n,
            pnl: -200n,
            pendingFundingFeesUsd: 100n,
            pendingBorrowingFeesUsd: 0n,
        });
        // remainingCollateralUsd=100n +(-200n)-100n= -200n
        expect(result).toBeUndefined();
    });
    it("returns correct leverage if collateralUsd > 0", () => {
        const result = getLeverage({
            sizeInUsd: 2000n,
            collateralUsd: 1000n,
            pnl: 200n,
            pendingFundingFeesUsd: 50n,
            pendingBorrowingFeesUsd: 50n,
        });
        // remainingCollateralUsd=1000n +200n -100n=1100n
        // leverage= mulDiv(2000n, 10000n, 1100n)= (2000n*10000n)/1100n= ~18181n
        expect(result).toBe(bigMath.mulDiv(2000n, 10000n, 1100n));
    });
});
describe("getLiquidationPrice", () => {
    beforeEach(() => {
        getPositionFee.mockReturnValue({ positionFeeUsd: 50n });
        getPriceImpactForPosition.mockReturnValue(-100n);
        getIsEquivalentTokens.mockReturnValue(false);
    });
    it("returns undefined if sizeInUsd <= 0 or sizeInTokens <= 0", () => {
        const marketInfo = { indexToken: { decimals: 18 } };
        expect(getLiquidationPrice({
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
        expect(getLiquidationPrice({
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
    it("computes liquidation price for non-equivalent tokens and isLong=true", () => {
        getIsEquivalentTokens.mockReturnValue(false);
        const marketInfo = {
            indexToken: { decimals: 8 },
            minCollateralFactor: 1000n, // 0.001
            maxPositionImpactFactorForLiquidations: 500n, // 0.005
        };
        const result = getLiquidationPrice({
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
        expect(result).toBeDefined();
    });
});
