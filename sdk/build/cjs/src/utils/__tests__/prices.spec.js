"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const orders_1 = require("types/orders");
const trade_1 = require("types/trade");
const prices_1 = require("../prices");
(0, vitest_1.describe)("getMarkPrice", () => {
    (0, vitest_1.it)("returns maxPrice if getShouldUseMaxPrice => true", () => {
        const prices = { minPrice: 1000n, maxPrice: 1500n };
        // isIncrease=true, isLong=true => getShouldUseMaxPrice => true
        const result = (0, prices_1.getMarkPrice)({ prices, isIncrease: true, isLong: true });
        (0, vitest_1.expect)(result).toBe(1500n);
    });
    (0, vitest_1.it)("returns minPrice if getShouldUseMaxPrice => false", () => {
        const prices = { minPrice: 1000n, maxPrice: 1500n };
        // isIncrease=false, isLong=true => getShouldUseMaxPrice => false
        const result = (0, prices_1.getMarkPrice)({ prices, isIncrease: false, isLong: true });
        (0, vitest_1.expect)(result).toBe(1000n);
    });
});
(0, vitest_1.describe)("getShouldUseMaxPrice", () => {
    (0, vitest_1.it)("returns isLong if isIncrease=true", () => {
        // isIncrease=true => return isLong
        (0, vitest_1.expect)((0, prices_1.getShouldUseMaxPrice)(true, true)).toBe(true);
        (0, vitest_1.expect)((0, prices_1.getShouldUseMaxPrice)(true, false)).toBe(false);
    });
    (0, vitest_1.it)("returns !isLong if isIncrease=false", () => {
        // isIncrease=false => return !isLong
        (0, vitest_1.expect)((0, prices_1.getShouldUseMaxPrice)(false, true)).toBe(false);
        (0, vitest_1.expect)((0, prices_1.getShouldUseMaxPrice)(false, false)).toBe(true);
    });
});
(0, vitest_1.describe)("getTriggerThresholdType", () => {
    (0, vitest_1.it)("returns Below for LimitIncrease when isLong=true", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.LimitIncrease, true);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Below);
    });
    (0, vitest_1.it)("returns Above for LimitIncrease when isLong=false", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.LimitIncrease, false);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Above);
    });
    (0, vitest_1.it)("returns Above for LimitDecrease when isLong=true", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.LimitDecrease, true);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Above);
    });
    (0, vitest_1.it)("returns Below for LimitDecrease when isLong=false", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.LimitDecrease, false);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Below);
    });
    (0, vitest_1.it)("returns Below for StopLossDecrease when isLong=true", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.StopLossDecrease, true);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Below);
    });
    (0, vitest_1.it)("returns Above for StopLossDecrease when isLong=false", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.StopLossDecrease, false);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Above);
    });
    (0, vitest_1.it)("returns Above for StopMarketIncrease when isLong=true", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.StopIncrease, true);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Above);
    });
    (0, vitest_1.it)("returns Below for StopMarketIncrease when isLong=false", () => {
        const result = (0, prices_1.getOrderThresholdType)(orders_1.OrderType.StopIncrease, false);
        (0, vitest_1.expect)(result).toBe(trade_1.TriggerThresholdType.Below);
    });
    (0, vitest_1.it)("returns undefined for invalid order type", () => {
        const result = (0, prices_1.getOrderThresholdType)("SomeInvalidType", true);
        (0, vitest_1.expect)(result).toBeUndefined();
    });
});
