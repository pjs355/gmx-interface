"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const vitest_1 = require("vitest");
const abis_1 = require("abis");
const chains_1 = require("configs/chains");
const tokens_1 = require("configs/tokens");
const validPermitErrorParts = ["ERC20Permit", "permit-expired", "permit is expired"];
(0, vitest_1.describe)("UI token permit configs", () => {
    chains_1.SUPPORTED_CHAIN_IDS.forEach(async (chainId) => {
        const publicClient = (0, viem_1.createPublicClient)({
            chain: (0, chains_1.getViemChain)(chainId),
            transport: (0, viem_1.http)(),
        });
        (0, vitest_1.it)(`tokens isPermitSupported should be consistent with contracts for ${(0, chains_1.getChainName)(chainId)}`, async () => {
            const tokens = (0, tokens_1.getV2Tokens)(chainId).filter((token) => !token.isNative && !token.isSynthetic);
            const calls = tokens.map((token) => ({
                address: token.address,
                abi: abis_1.abis.ERC20PermitInterface,
                functionName: "permit",
                args: [
                    viem_1.zeroAddress,
                    viem_1.zeroAddress,
                    0n,
                    0n,
                    0,
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                ],
            }));
            const results = await publicClient.multicall({
                contracts: calls,
                allowFailure: true,
            });
            const errors = [];
            tokens.forEach((token, index) => {
                const result = results[index];
                const supportsPermit = Boolean(result.error && validPermitErrorParts.some((part) => result.error.message.includes(part)));
                if (supportsPermit !== Boolean(token.isPermitSupported)) {
                    errors.push(`${(0, chains_1.getChainName)(chainId)} ${token.symbol} isPermitSupported should be ${supportsPermit}, address: ${token.address}, error: ${result.error?.message.slice(0, 100) || "none"}`);
                }
            });
            if (errors.length > 0) {
                throw new Error(errors.join("\n"));
            }
        });
        (0, vitest_1.it)(`tokens with permit support should have required methods for ${(0, chains_1.getChainName)(chainId)}`, async () => {
            const tokens = (0, tokens_1.getV2Tokens)(chainId).filter((token) => !token.isNative && !token.isSynthetic && token.isPermitSupported);
            const requiredMethodsAbi = [
                {
                    name: "name",
                    type: "function",
                    stateMutability: "view",
                    inputs: [],
                    outputs: [{ type: "string" }],
                },
                {
                    name: "version",
                    type: "function",
                    stateMutability: "view",
                    inputs: [],
                    outputs: [{ type: "string" }],
                },
                {
                    name: "nonces",
                    type: "function",
                    stateMutability: "view",
                    inputs: [{ name: "owner", type: "address" }],
                    outputs: [{ type: "uint256" }],
                    args: [viem_1.zeroAddress],
                },
            ];
            const methodsCount = requiredMethodsAbi.length;
            const calls = tokens.flatMap((token) => requiredMethodsAbi.map((method) => ({
                address: token.address,
                abi: [method],
                functionName: method.name,
                args: method.name === "nonces" ? [viem_1.zeroAddress] : [],
            })));
            const results = await publicClient.multicall({
                contracts: calls,
                allowFailure: true,
            });
            const errors = [];
            tokens.forEach((token, tokenIndex) => {
                const tokenResults = results.slice(tokenIndex * methodsCount, (tokenIndex + 1) * methodsCount);
                const hasName = !tokenResults[0].error;
                const hasVersion = !tokenResults[1].error;
                const hasNonces = !tokenResults[2].error;
                const missingMethods = [];
                if (!hasName && !token.name) {
                    missingMethods.push("name");
                }
                if (!hasVersion && !token.contractVersion) {
                    missingMethods.push("version");
                }
                if (!hasNonces) {
                    missingMethods.push("nonces");
                }
                if (missingMethods.length > 0) {
                    errors.push(`${(0, chains_1.getChainName)(chainId)} ${token.symbol} (${token.address}) is marked as permit supported but missing methods: ${missingMethods.join(", ")}`);
                }
            });
            if (errors.length > 0) {
                throw new Error(errors.join("\n"));
            }
        });
    });
});
