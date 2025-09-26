"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const chains_1 = require("configs/chains");
const marketDisplayNames_1 = require("configs/marketDisplayNames");
const tokens_1 = require("configs/tokens");
const markets_1 = require("../markets");
const numbers_1 = require("../numbers");
function getToken(symbol) {
    return tokens_1.TOKENS[chains_1.ARBITRUM].find((token) => token.symbol === symbol);
}
(0, vitest_1.describe)("getMarketFullName", () => {
    (0, vitest_1.it)("returns proper full name", () => {
        const longToken = getToken("ETH");
        const shortToken = getToken("USDC");
        const indexToken = getToken("BTC");
        const name = (0, markets_1.getMarketFullName)({
            longToken,
            shortToken,
            indexToken,
            isSpotOnly: false,
        });
        (0, vitest_1.expect)(name).toBe("BTC/USD [ETH-USDC]");
    });
    (0, vitest_1.it)("returns swap-only name", () => {
        const indexToken = { symbol: "ETH", address: "0xeth", decimals: 18 };
        const name = (0, markets_1.getMarketFullName)({
            longToken: indexToken,
            shortToken: indexToken,
            indexToken,
            isSpotOnly: true,
        });
        (0, vitest_1.expect)(name).toBe("SWAP-ONLY [ETH-ETH]");
    });
});
(0, vitest_1.describe)("getMarketIndexName", () => {
    (0, vitest_1.it)("returns 'SWAP-ONLY' if isSpotOnly is true", () => {
        (0, vitest_1.expect)((0, markets_1.getMarketIndexName)({
            indexToken: getToken("ETH"),
            isSpotOnly: true,
        })).toBe("SWAP-ONLY");
    });
    (0, vitest_1.it)("returns prefix + baseSymbol/symbol + /USD", () => {
        const eth = getToken("ETH");
        (0, vitest_1.expect)((0, markets_1.getMarketIndexName)({ indexToken: eth, isSpotOnly: false })).toBe("ETH/USD");
        const pepe = getToken("PEPE");
        (0, vitest_1.expect)((0, markets_1.getMarketIndexName)({ indexToken: pepe, isSpotOnly: false })).toBe("kPEPE/USD");
    });
    (0, vitest_1.it)("returns custom name for configured tokens", () => {
        const appleToken = {
            ...getToken("ETH"), // Use ETH as base but override address
            address: "0x8341530234CE887A974155c9107b6321632eb854",
            symbol: "Apple",
        };
        (0, vitest_1.expect)((0, markets_1.getMarketIndexName)({ indexToken: appleToken, isSpotOnly: false })).toBe("PUBG");
    });
    (0, vitest_1.it)("returns custom name for Honey token", () => {
        const honeyToken = {
            ...getToken("ETH"), // Use ETH as base but override address
            address: "0x0b6620E87d914114cd518B66Ce2103370efE9558",
            symbol: "Honey",
        };
        (0, vitest_1.expect)((0, markets_1.getMarketIndexName)({ indexToken: honeyToken, isSpotOnly: false })).toBe("The Weeknd");
    });
    (0, vitest_1.it)("returns custom name for Rice token", () => {
        const riceToken = {
            ...getToken("ETH"), // Use ETH as base but override address
            address: "0xF8F66Dc1F98c4E77FC0c7c97fac59E0322d75d1c",
            symbol: "Rice",
        };
        (0, vitest_1.expect)((0, markets_1.getMarketIndexName)({ indexToken: riceToken, isSpotOnly: false })).toBe("Planes");
    });
    (0, vitest_1.it)("returns default name for non-configured tokens", () => {
        const customToken = {
            ...getToken("ETH"), // Use ETH as base but override address
            address: "0x1234567890123456789012345678901234567890",
            symbol: "CUSTOM",
        };
        (0, vitest_1.expect)((0, markets_1.getMarketIndexName)({ indexToken: customToken, isSpotOnly: false })).toBe("CUSTOM/USD");
    });
});
(0, vitest_1.describe)("CUSTOM_MARKET_NAMES", () => {
    (0, vitest_1.it)("contains the Apple token mapping", () => {
        (0, vitest_1.expect)(marketDisplayNames_1.CUSTOM_MARKET_NAMES["0x8341530234CE887A974155c9107b6321632eb854"]).toBe("PUBG");
    });
    (0, vitest_1.it)("contains the Honey token mapping", () => {
        (0, vitest_1.expect)(marketDisplayNames_1.CUSTOM_MARKET_NAMES["0x0b6620E87d914114cd518B66Ce2103370efE9558"]).toBe("The Weeknd");
    });
    (0, vitest_1.it)("contains the Rice token mapping", () => {
        (0, vitest_1.expect)(marketDisplayNames_1.CUSTOM_MARKET_NAMES["0xF8F66Dc1F98c4E77FC0c7c97fac59E0322d75d1c"]).toBe("Planes");
    });
    (0, vitest_1.it)("is an object with string keys and string values", () => {
        (0, vitest_1.expect)(typeof marketDisplayNames_1.CUSTOM_MARKET_NAMES).toBe("object");
        Object.entries(marketDisplayNames_1.CUSTOM_MARKET_NAMES).forEach(([key, value]) => {
            (0, vitest_1.expect)(typeof key).toBe("string");
            (0, vitest_1.expect)(typeof value).toBe("string");
        });
    });
});
(0, vitest_1.describe)("getMarketPoolName", () => {
    (0, vitest_1.it)("returns single token symbol if long and short are the same", () => {
        const token = getToken("ETH");
        (0, vitest_1.expect)((0, markets_1.getMarketPoolName)({ longToken: token, shortToken: token })).toBe("ETH-ETH");
    });
    (0, vitest_1.it)("returns combined symbol otherwise", () => {
        const longToken = getToken("ETH");
        const shortToken = getToken("USDC");
        (0, vitest_1.expect)((0, markets_1.getMarketPoolName)({ longToken, shortToken })).toBe("ETH-USDC");
    });
});
(0, vitest_1.describe)("getContractMarketPrices", () => {
    (0, vitest_1.it)("returns undefined if any token is missing", () => {
        const market = {
            indexTokenAddress: "0xbtc",
            longTokenAddress: "0xeth",
            shortTokenAddress: "0xusdc",
        };
        (0, vitest_1.expect)((0, markets_1.getContractMarketPrices)({}, market)).toBeUndefined();
    });
    (0, vitest_1.it)("returns converted contract prices if all tokens exist", () => {
        const tokensData = {
            "0xbtc": { decimals: 8, prices: { minPrice: 1000n, maxPrice: 2000n } },
            "0xeth": { decimals: 18, prices: { minPrice: 3000n, maxPrice: 4000n } },
            "0xusdc": { decimals: 6, prices: { minPrice: 1n, maxPrice: 2n } },
        };
        const market = {
            indexTokenAddress: "0xbtc",
            longTokenAddress: "0xeth",
            shortTokenAddress: "0xusdc",
        };
        const result = (0, markets_1.getContractMarketPrices)(tokensData, market);
        (0, vitest_1.expect)(result).toBeDefined();
        (0, vitest_1.expect)(result?.indexTokenPrice?.min).toBeDefined();
    });
});
(0, vitest_1.describe)("getTokenPoolType", () => {
    (0, vitest_1.it)("returns 'long' for single-token markets if matches address", () => {
        const token = getToken("ETH");
        (0, vitest_1.expect)((0, markets_1.getTokenPoolType)({ longToken: token, shortToken: token }, token.address)).toBe("long");
    });
    (0, vitest_1.it)("returns 'short' for shortToken match", () => {
        const longToken = getToken("ETH");
        const shortToken = getToken("USDC");
        (0, vitest_1.expect)((0, markets_1.getTokenPoolType)({ longToken, shortToken }, shortToken.address)).toBe("short");
    });
});
(0, vitest_1.describe)("getPoolUsdWithoutPnl", () => {
    const marketInfo = {
        longPoolAmount: 1n,
        shortPoolAmount: 1n,
        longToken: { decimals: 18, prices: { minPrice: (0, numbers_1.expandDecimals)(5, 30), maxPrice: (0, numbers_1.expandDecimals)(15, 30) } },
        shortToken: { decimals: 18, prices: { minPrice: (0, numbers_1.expandDecimals)(2, 30), maxPrice: (0, numbers_1.expandDecimals)(4, 30) } },
    };
    (0, vitest_1.it)("calculates poolUsd for isLong = true", () => {
        (0, vitest_1.expect)((0, markets_1.getPoolUsdWithoutPnl)(marketInfo, true, "minPrice")).toBe(5000000000000n);
        (0, vitest_1.expect)((0, markets_1.getPoolUsdWithoutPnl)(marketInfo, true, "maxPrice")).toBe(15000000000000n);
    });
    (0, vitest_1.it)("calculates poolUsd for isLong = false", () => {
        (0, vitest_1.expect)((0, markets_1.getPoolUsdWithoutPnl)(marketInfo, false, "minPrice")).toBe(2000000000000n);
        (0, vitest_1.expect)((0, markets_1.getPoolUsdWithoutPnl)(marketInfo, false, "maxPrice")).toBe(4000000000000n);
    });
});
(0, vitest_1.describe)("getCappedPoolPnl", () => {
    (0, vitest_1.it)("returns capped pnl if poolPnl > maxPnl", () => {
        const marketInfo = {
            maxPnlFactorForTradersLong: 20000n,
            maxPnlFactorForTradersShort: 10000n,
        };
        const result = (0, markets_1.getCappedPoolPnl)({
            marketInfo,
            poolUsd: (0, numbers_1.expandDecimals)(1000, 30),
            poolPnl: 30000n,
            isLong: true,
        });
        (0, vitest_1.expect)(result).toBe(30000n);
    });
    (0, vitest_1.it)("returns poolPnl if below maxPnl", () => {
        const marketInfo = { maxPnlFactorForTradersLong: 20000n };
        (0, vitest_1.expect)((0, markets_1.getCappedPoolPnl)({
            marketInfo,
            poolUsd: (0, numbers_1.expandDecimals)(1000, 30),
            poolPnl: 5000n,
            isLong: true,
        })).toBe(5000n);
    });
});
(0, vitest_1.describe)("getMaxLeverageByMinCollateralFactor", () => {
    (0, vitest_1.it)("returns default if minCollateralFactor is undefined", () => {
        (0, vitest_1.expect)((0, markets_1.getMaxLeverageByMinCollateralFactor)(undefined)).toBe(1000000);
    });
    (0, vitest_1.it)("returns correct leverage for a given factor", () => {
        (0, vitest_1.expect)((0, markets_1.getMaxLeverageByMinCollateralFactor)(1000000000000000000n)).toBe(10000000000000000);
    });
});
(0, vitest_1.describe)("getMaxAllowedLeverageByMinCollateralFactor", () => {
    (0, vitest_1.it)("returns half of max leverage", () => {
        (0, vitest_1.expect)((0, markets_1.getMaxAllowedLeverageByMinCollateralFactor)(1000000000000000000n)).toBe(5000000000000000);
    });
});
(0, vitest_1.describe)("getOppositeCollateral", () => {
    const marketInfo = {
        longToken: getToken("ETH"),
        shortToken: getToken("USDC"),
    };
    (0, vitest_1.it)("returns shortToken if token is long", () => {
        (0, vitest_1.expect)((0, markets_1.getOppositeCollateral)(marketInfo, marketInfo.longToken.address)).toEqual(marketInfo.shortToken);
    });
    (0, vitest_1.it)("returns undefined if pool type is not found", () => {
        (0, vitest_1.expect)((0, markets_1.getOppositeCollateral)(marketInfo, "0xbtc")).toBeUndefined();
    });
});
(0, vitest_1.describe)("getAvailableUsdLiquidityForCollateral", () => {
    (0, vitest_1.it)("returns poolUsd if isSpotOnly", () => {
        const marketInfo = {
            isSpotOnly: true,
            longPoolAmount: 1n,
            indexToken: {
                ...getToken("ETH"),
                prices: { minPrice: (0, numbers_1.expandDecimals)(10, 18), maxPrice: (0, numbers_1.expandDecimals)(15, 18) },
            },
            longToken: { decimals: 18, prices: { minPrice: (0, numbers_1.expandDecimals)(1, 18), maxPrice: (0, numbers_1.expandDecimals)(2, 18) } },
        };
        (0, vitest_1.expect)((0, markets_1.getAvailableUsdLiquidityForCollateral)(marketInfo, true)).toBe(1n);
    });
    (0, vitest_1.it)("calculates liquidity if not spot only", () => {
        const marketInfo = {
            isSpotOnly: false,
            reserveFactorLong: 1n,
            longPoolAmount: (0, numbers_1.expandDecimals)(5, 30),
            longInterestInTokens: 1n,
            indexToken: {
                ...getToken("ETH"),
                prices: { minPrice: (0, numbers_1.expandDecimals)(10, 18), maxPrice: (0, numbers_1.expandDecimals)(15, 18) },
            },
            longToken: { decimals: 18, prices: { minPrice: (0, numbers_1.expandDecimals)(10, 18), maxPrice: (0, numbers_1.expandDecimals)(15, 18) } },
        };
        (0, vitest_1.expect)((0, markets_1.getAvailableUsdLiquidityForCollateral)(marketInfo, true)).toBe((0, numbers_1.expandDecimals)(35, 30));
    });
});
(0, vitest_1.describe)("getReservedUsd", () => {
    (0, vitest_1.it)("calculates reservedUsd for long side", () => {
        const marketInfo = {
            longInterestInTokens: 100n,
            indexToken: {
                decimals: 18,
                prices: { maxPrice: (0, numbers_1.expandDecimals)(10, 18) },
            },
        };
        (0, vitest_1.expect)((0, markets_1.getReservedUsd)(marketInfo, true)).toBe(1000n);
    });
    (0, vitest_1.it)("returns shortInterestUsd if isLong=false", () => {
        const marketInfo = { shortInterestUsd: 9999n };
        (0, vitest_1.expect)((0, markets_1.getReservedUsd)(marketInfo, false)).toBe(9999n);
    });
});
(0, vitest_1.describe)("getMarketDivisor", () => {
    (0, vitest_1.it)("returns 2n if longTokenAddress equals shortTokenAddress", () => {
        (0, vitest_1.expect)((0, markets_1.getMarketDivisor)({
            longTokenAddress: "0xsame",
            shortTokenAddress: "0xsame",
        })).toBe(2n);
    });
    (0, vitest_1.it)("returns 1n otherwise", () => {
        (0, vitest_1.expect)((0, markets_1.getMarketDivisor)({
            longTokenAddress: "0xeth",
            shortTokenAddress: "0xusdc",
        })).toBe(1n);
    });
});
(0, vitest_1.describe)("getMarketPnl", () => {
    (0, vitest_1.it)("returns 0n if openInterest is 0", () => {
        const marketInfo = {
            indexToken: {
                decimals: 18,
                prices: { minPrice: (0, numbers_1.expandDecimals)(1000, 18), maxPrice: (0, numbers_1.expandDecimals)(2000, 18) },
            },
            longInterestUsd: 0n,
            longInterestInTokens: 0n,
        };
        (0, vitest_1.expect)((0, markets_1.getMarketPnl)(marketInfo, true, false)).toBe(0n);
    });
    (0, vitest_1.it)("calculates pnl for long positions", () => {
        const marketInfo = {
            indexToken: {
                decimals: 18,
                prices: { minPrice: (0, numbers_1.expandDecimals)(1000, 18), maxPrice: (0, numbers_1.expandDecimals)(2000, 18) },
            },
            longInterestUsd: 1000n,
            longInterestInTokens: 1n,
        };
        // maximize = false => use minPrice for long
        (0, vitest_1.expect)((0, markets_1.getMarketPnl)(marketInfo, true, true)).toBe(0n); // openInterestValue(1000n) - openInterestUsd(1000n) = 0
    });
});
(0, vitest_1.describe)("getOpenInterestUsd", () => {
    (0, vitest_1.it)("returns longInterestUsd for isLong", () => {
        (0, vitest_1.expect)((0, markets_1.getOpenInterestUsd)({ longInterestUsd: 1234n, shortInterestUsd: 9999n }, true)).toBe(1234n);
    });
    (0, vitest_1.it)("returns shortInterestUsd for !isLong", () => {
        (0, vitest_1.expect)((0, markets_1.getOpenInterestUsd)({ longInterestUsd: 1234n, shortInterestUsd: 9999n }, false)).toBe(9999n);
    });
});
(0, vitest_1.describe)("getOpenInterestInTokens", () => {
    (0, vitest_1.it)("returns longInterestInTokens for isLong", () => {
        (0, vitest_1.expect)((0, markets_1.getOpenInterestInTokens)({ longInterestInTokens: 100n, shortInterestInTokens: 200n }, true)).toBe(100n);
    });
    (0, vitest_1.it)("returns shortInterestInTokens for !isLong", () => {
        (0, vitest_1.expect)((0, markets_1.getOpenInterestInTokens)({ longInterestInTokens: 100n, shortInterestInTokens: 200n }, false)).toBe(200n);
    });
});
(0, vitest_1.describe)("getPriceForPnl", () => {
    (0, vitest_1.it)("uses maxPrice for long when maximize=true", () => {
        (0, vitest_1.expect)((0, markets_1.getPriceForPnl)({ minPrice: 1000n, maxPrice: 2000n }, true, true)).toBe(2000n);
    });
    (0, vitest_1.it)("uses maxPrice for short when maximize=false", () => {
        (0, vitest_1.expect)((0, markets_1.getPriceForPnl)({ minPrice: 1000n, maxPrice: 2000n }, false, false)).toBe(2000n);
    });
});
