"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const factors_1 = require("configs/factors");
const numbers_1 = require("utils/numbers");
const fees_1 = require("../fees");
const dollar = 10n ** BigInt(factors_1.USD_DECIMALS);
const eightMillion = 8000000n;
const tenMillion = 10000000n;
function toFactor(percent) {
    const value = parseFloat(percent.replace("%", ""));
    return (0, numbers_1.numberToBigint)(value, 30 - 2);
}
const second = 1;
(0, vitest_1.describe)("getFundingFactorPerPeriod", () => {
    (0, vitest_1.it)("works when short pay, shorts OI bigger", () => {
        const marketInfo = {
            fundingFactorPerSecond: toFactor("50%"),
            longsPayShorts: false,
            longInterestUsd: eightMillion * dollar,
            shortInterestUsd: tenMillion * dollar,
        };
        const forLongs = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, true, second);
        (0, vitest_1.expect)(forLongs.toString()).toBe(toFactor("62.5%").toString());
        const forShorts = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, false, second);
        (0, vitest_1.expect)(forShorts.toString()).toBe(toFactor("-50%").toString());
    });
    (0, vitest_1.it)("works when short pay, longs OI bigger", () => {
        const marketInfo = {
            fundingFactorPerSecond: toFactor("50%"),
            longsPayShorts: false,
            longInterestUsd: tenMillion * dollar,
            shortInterestUsd: eightMillion * dollar,
        };
        const forLongs = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, true, second);
        (0, vitest_1.expect)(forLongs.toString()).toBe(toFactor("50%").toString());
        const forShorts = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, false, second);
        (0, vitest_1.expect)(forShorts.toString()).toBe(toFactor("-62.5%").toString());
    });
    (0, vitest_1.it)("works when long pay, shorts OI bigger", () => {
        const marketInfo = {
            fundingFactorPerSecond: toFactor("50%"),
            longsPayShorts: true,
            longInterestUsd: eightMillion * dollar,
            shortInterestUsd: tenMillion * dollar,
        };
        const forLongs = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, true, second);
        (0, vitest_1.expect)(forLongs.toString()).toBe(toFactor("-62.5%").toString());
        const forShorts = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, false, second);
        (0, vitest_1.expect)(forShorts.toString()).toBe(toFactor("50%").toString());
    });
    (0, vitest_1.it)("works when long pay, longs OI bigger", () => {
        const marketInfo = {
            fundingFactorPerSecond: toFactor("50%"),
            longsPayShorts: true,
            longInterestUsd: tenMillion * dollar,
            shortInterestUsd: eightMillion * dollar,
        };
        const forLongs = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, true, second);
        (0, vitest_1.expect)(forLongs.toString()).toBe(toFactor("-50%").toString());
        const forShorts = (0, fees_1.getFundingFactorPerPeriod)(marketInfo, false, second);
        (0, vitest_1.expect)(forShorts.toString()).toBe(toFactor("62.5%").toString());
    });
});
