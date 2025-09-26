"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const vitest_1 = require("vitest");
const chains_1 = require("configs/chains");
const oracleKeeper_1 = require("configs/oracleKeeper");
const tokens_1 = require("configs/tokens");
const getKeeperTokens = async (chainId) => {
    const res = await fetch(`${(0, oracleKeeper_1.getOracleKeeperUrl)(chainId, 0)}/tokens`);
    const data = (await res.json());
    if (!data || !data.tokens || data.tokens.length === 0)
        throw Error("No tokens in response");
    return data;
};
const IGNORED_TOKENS = ["ESGMX", "GLP", "GM", "GLV"];
const getIgnoredTokensByChain = (chainId) => {
    return IGNORED_TOKENS.concat({
        [chains_1.ARBITRUM]: ["FRAX", "MIM"],
        [chains_1.AVALANCHE]: ["MIM", "WBTC"],
        [chains_1.BOTANIX]: ["GMX"],
    }[chainId] ?? []);
};
(0, vitest_1.describe)("tokens config", () => {
    chains_1.SUPPORTED_CHAIN_IDS.forEach(async (chainId) => {
        (0, vitest_1.it)(`tokens should be consistent with keeper for ${(0, chains_1.getChainName)(chainId)}`, async () => {
            const keeperTokens = await (0, viem_1.withRetry)(() => getKeeperTokens(chainId), {
                retryCount: 2,
            });
            tokens_1.TOKENS[chainId]
                .filter((token) => token.address !== viem_1.zeroAddress)
                .filter((token) => !getIgnoredTokensByChain(chainId).includes(token.symbol))
                .forEach((token) => {
                const keeperToken = keeperTokens.tokens.find((t) => t.address === token.address);
                (0, vitest_1.expect)(keeperToken).toBeDefined();
                (0, vitest_1.expect)(keeperToken?.address).toBe(token.address);
                (0, vitest_1.expect)(keeperToken?.decimals).toBe(token.decimals);
                (0, vitest_1.expect)(Boolean(keeperToken?.synthetic)).toBe(Boolean(token.isSynthetic));
            });
        });
    });
});
