"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const testUtil_1 = require("utils/testUtil");
const __1 = require("../..");
(0, vitest_1.describe)("Tokens", () => {
    (0, vitest_1.it)("should be able to fetch tokens", async () => {
        const response = await testUtil_1.arbitrumSdk.oracle.getTokens();
        (0, vitest_1.expect)(response).toBeDefined();
    });
    (0, vitest_1.it)("should respect passed config", async () => {
        const ARB = "0x912CE59144191C1204E64559FE8253a0e49E6548";
        const sdk = new __1.GmxSdk({
            ...testUtil_1.arbitrumSdkConfig,
            tokens: {
                [ARB]: {
                    symbol: "testARB",
                },
            },
        });
        const data = await sdk.tokens.getTokensData();
        (0, vitest_1.expect)(sdk.tokens.tokensConfig[ARB]?.symbol).toBe("testARB");
        (0, vitest_1.expect)(data.tokensData?.[ARB].symbol).toBe("testARB");
    });
    (0, vitest_1.it)("should be able to get tokens data", async () => {
        const response = await testUtil_1.arbitrumSdk.tokens.getTokensData();
        (0, vitest_1.expect)(response).toBeDefined();
    });
});
