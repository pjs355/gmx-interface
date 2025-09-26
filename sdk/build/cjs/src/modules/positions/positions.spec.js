"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const testUtil_1 = require("utils/testUtil");
(0, vitest_1.describe)("Positions", () => {
    (0, vitest_1.describe)("getPositions", () => {
        (0, vitest_1.it)("should be able to get positions data", async () => {
            const { marketsInfoData, tokensData } = (await testUtil_1.arbitrumSdk.markets.getMarketsInfo()) ?? {};
            if (!tokensData || !marketsInfoData) {
                throw new Error("Tokens data or markets info is not available");
            }
            const positions = await testUtil_1.arbitrumSdk.positions.getPositions({ tokensData, marketsData: marketsInfoData });
            (0, vitest_1.expect)(positions).toBeDefined();
        });
        (0, vitest_1.it)("should be able to get positions info", async () => {
            const { marketsInfoData, tokensData } = (await testUtil_1.arbitrumSdk.markets.getMarketsInfo()) ?? {};
            if (!tokensData || !marketsInfoData) {
                throw new Error("Tokens data or markets info is not available");
            }
            const positions = await testUtil_1.arbitrumSdk.positions.getPositionsInfo({
                tokensData,
                marketsInfoData,
                showPnlInLeverage: true,
            });
            (0, vitest_1.expect)(positions).toBeDefined();
        });
    });
});
