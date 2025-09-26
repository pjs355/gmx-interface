"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const chains_1 = require("configs/chains");
const tokens_1 = require("configs/tokens");
const numbers_1 = require("../numbers");
const tokens_2 = require("../tokens");
function getToken(symbol) {
    return tokens_1.TOKENS[chains_1.ARBITRUM].find((token) => token.symbol === symbol);
}
(0, vitest_1.describe)("parseContractPrice", () => {
    (0, vitest_1.it)("multiplies price by 10^decimals", () => {
        (0, vitest_1.expect)((0, tokens_2.parseContractPrice)(100n, 2)).toBe(100n * (0, numbers_1.expandDecimals)(1, 2));
    });
});
(0, vitest_1.describe)("convertToContractPrice", () => {
    (0, vitest_1.it)("divides price by 10^decimals", () => {
        (0, vitest_1.expect)((0, tokens_2.convertToContractPrice)(10000n, 2)).toBe(10000n / (0, numbers_1.expandDecimals)(1, 2));
    });
});
(0, vitest_1.describe)("convertToContractTokenPrices", () => {
    (0, vitest_1.it)("returns min and max contract prices", () => {
        const result = (0, tokens_2.convertToContractTokenPrices)({ minPrice: 1000n, maxPrice: 2000n }, 2);
        (0, vitest_1.expect)(result.min).toBe(1000n / (0, numbers_1.expandDecimals)(1, 2));
        (0, vitest_1.expect)(result.max).toBe(2000n / (0, numbers_1.expandDecimals)(1, 2));
    });
});
(0, vitest_1.describe)("convertToTokenAmount", () => {
    (0, vitest_1.it)("returns undefined if inputs are invalid", () => {
        (0, vitest_1.expect)((0, tokens_2.convertToTokenAmount)(undefined, 18, 100n)).toBeUndefined();
        (0, vitest_1.expect)((0, tokens_2.convertToTokenAmount)(1000n, undefined, 100n)).toBeUndefined();
        (0, vitest_1.expect)((0, tokens_2.convertToTokenAmount)(1000n, 18, 0n)).toBeUndefined();
    });
    (0, vitest_1.it)("converts usd to token amount", () => {
        (0, vitest_1.expect)((0, tokens_2.convertToTokenAmount)(1000n, 2, 100n)).toBe((1000n * (0, numbers_1.expandDecimals)(1, 2)) / 100n);
    });
});
(0, vitest_1.describe)("convertToUsd", () => {
    (0, vitest_1.it)("returns undefined if inputs are invalid", () => {
        (0, vitest_1.expect)((0, tokens_2.convertToUsd)(undefined, 18, 100n)).toBeUndefined();
        (0, vitest_1.expect)((0, tokens_2.convertToUsd)(1000n, undefined, 100n)).toBeUndefined();
    });
    (0, vitest_1.it)("converts token amount to usd", () => {
        (0, vitest_1.expect)((0, tokens_2.convertToUsd)(1000n, 2, 100n)).toBe((1000n * 100n) / (0, numbers_1.expandDecimals)(1, 2));
    });
});
(0, vitest_1.describe)("getMidPrice", () => {
    (0, vitest_1.it)("returns the average of min and max price", () => {
        (0, vitest_1.expect)((0, tokens_2.getMidPrice)({ minPrice: 10n, maxPrice: 20n })).toBe(15n);
    });
});
(0, vitest_1.describe)("getIsEquivalentTokens", () => {
    (0, vitest_1.it)("checks address, wrappedAddress, synthetic, and symbol", () => {
        (0, vitest_1.expect)((0, tokens_2.getIsEquivalentTokens)(getToken("ETH"), getToken("WETH"))).toBe(true);
        (0, vitest_1.expect)((0, tokens_2.getIsEquivalentTokens)(getToken("ETH"), getToken("ETH"))).toBe(true);
        (0, vitest_1.expect)((0, tokens_2.getIsEquivalentTokens)({ address: "0xA", isSynthetic: true, symbol: "SYN" }, { address: "0xB", isSynthetic: true, symbol: "SYN" })).toBe(true);
        (0, vitest_1.expect)((0, tokens_2.getIsEquivalentTokens)(getToken("ETH"), getToken("BTC"))).toBe(false);
    });
});
(0, vitest_1.describe)("getTokenData", () => {
    (0, vitest_1.it)("returns undefined if no token data", () => {
        (0, vitest_1.expect)((0, tokens_2.getTokenData)()).toBeUndefined();
    });
    (0, vitest_1.it)("returns wrapped if convertTo=wrapped and token isNative", () => {
        const tokensData = {
            "0xnative": { address: "0xnative", isNative: true, wrappedAddress: "0xwrap" },
            "0xwrap": { address: "0xwrap", isWrapped: true },
        };
        (0, vitest_1.expect)((0, tokens_2.getTokenData)(tokensData, "0xnative", "wrapped")).toEqual(tokensData["0xwrap"]);
    });
});
(0, vitest_1.describe)("getTokensRatioByAmounts", () => {
    (0, vitest_1.it)("returns ratio of two token amounts", () => {
        const fromToken = { decimals: 2 };
        const toToken = { decimals: 2 };
        const result = (0, tokens_2.getTokensRatioByAmounts)({
            fromToken,
            toToken,
            fromTokenAmount: 1000n,
            toTokenAmount: 500n,
        });
        (0, vitest_1.expect)(result.largestToken).toEqual(fromToken);
        (0, vitest_1.expect)(result.ratio).toBe((((1000n * numbers_1.PRECISION) / (0, numbers_1.expandDecimals)(1, 2)) * numbers_1.PRECISION) / ((500n * numbers_1.PRECISION) / (0, numbers_1.expandDecimals)(1, 2)));
    });
});
(0, vitest_1.describe)("getTokensRatioByMinOutputAmountAndTriggerPrice", () => {
    (0, vitest_1.it)("returns ratio of two token amounts in case if triggerPrice is 0n", () => {
        const fromToken = { decimals: 2 };
        const toToken = { decimals: 2 };
        const result = (0, tokens_2.getTokensRatioByMinOutputAmountAndTriggerPrice)({
            fromToken,
            toToken,
            fromTokenAmount: 1000n,
            toTokenAmount: 500n,
            triggerPrice: 0n,
            minOutputAmount: 100n,
        });
        (0, vitest_1.expect)(result.ratio).toBe(10000000000000000000000000000000n);
        (0, vitest_1.expect)(result.allowedSwapSlippageBps).toBe(100n);
    });
    (0, vitest_1.it)("returns ratio of two token amounts in case if triggerPrice is not 0n", () => {
        const fromToken = { decimals: 2 };
        const toToken = { decimals: 2 };
        const result = (0, tokens_2.getTokensRatioByMinOutputAmountAndTriggerPrice)({
            fromToken,
            toToken,
            fromTokenAmount: 1000n,
            toTokenAmount: 500n,
            triggerPrice: 100n,
            minOutputAmount: 100n,
        });
        (0, vitest_1.expect)(result.ratio).toBe(100n);
        (0, vitest_1.expect)(result.allowedSwapSlippageBps).toBe(9999n);
    });
});
