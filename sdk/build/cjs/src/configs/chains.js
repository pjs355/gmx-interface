"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GAS_LIMITS_STATIC_CONFIG = exports.EXECUTION_FEE_CONFIG_V2 = exports.isSupportedChain = exports.getExcessiveExecutionFee = exports.getHighExecutionFee = exports.getViemChain = exports.getChainName = exports.botanix = exports.GAS_PRICE_BUFFER_MAP = exports.MIN_EXECUTION_FEE_USD = exports.EXCESSIVE_EXECUTION_FEES_MAP = exports.MAX_PRIORITY_FEE_PER_GAS_MAP = exports.GAS_PRICE_PREMIUM_MAP = exports.MAX_FEE_PER_GAS_MAP = exports.HIGH_EXECUTION_FEES_MAP = exports.CHAIN_NAMES_MAP = exports.SUPPORTED_CHAIN_IDS_DEV = exports.SUPPORTED_CHAIN_IDS = exports.BASE = exports.BOTANIX = exports.ETH_MAINNET = exports.ARBITRUM = exports.AVALANCHE_FUJI = exports.AVALANCHE = void 0;
const viem_1 = require("viem");
const chains_1 = require("viem/chains");
exports.AVALANCHE = 43114;
exports.AVALANCHE_FUJI = 43113;
exports.ARBITRUM = 42161;
exports.ETH_MAINNET = 1;
exports.BOTANIX = 3637;
exports.BASE = 8453;
exports.SUPPORTED_CHAIN_IDS = [exports.BASE];
exports.SUPPORTED_CHAIN_IDS_DEV = [...exports.SUPPORTED_CHAIN_IDS, exports.AVALANCHE_FUJI];
exports.CHAIN_NAMES_MAP = {
    [exports.ARBITRUM]: "Arbitrum",
    [exports.AVALANCHE]: "Avalanche",
    [exports.AVALANCHE_FUJI]: "Avalanche Fuji",
    [exports.BOTANIX]: "Botanix",
    [exports.BASE]: "Base",
};
exports.HIGH_EXECUTION_FEES_MAP = {
    [exports.ARBITRUM]: 5, // 5 USD
    [exports.AVALANCHE]: 5, // 5 USD
    [exports.AVALANCHE_FUJI]: 5, // 5 USD
    [exports.BOTANIX]: 1, // 5 USD
    [exports.BASE]: 1, // 5 USD
};
// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is not applied to execution fee calculation
exports.MAX_FEE_PER_GAS_MAP = {
    [exports.AVALANCHE]: 200000000000n, // 200 gwei
    [exports.BOTANIX]: 20n,
};
// added to maxPriorityFeePerGas
// applied to EIP-1559 transactions only
// is also applied to the execution fee calculation
exports.GAS_PRICE_PREMIUM_MAP = {
    [exports.ARBITRUM]: 0n,
    [exports.AVALANCHE]: 6000000000n, // 6 gwei
    [exports.BASE]: 0n,
};
/*
  that was a constant value in ethers v5, after ethers v6 migration we use it as a minimum for maxPriorityFeePerGas
*/
exports.MAX_PRIORITY_FEE_PER_GAS_MAP = {
    [exports.ARBITRUM]: 1500000000n,
    [exports.AVALANCHE]: 1500000000n,
    [exports.AVALANCHE_FUJI]: 1500000000n,
    [exports.BOTANIX]: 7n,
    [exports.BASE]: 50000000n, // Lowered to 0.05 gwei
};
exports.EXCESSIVE_EXECUTION_FEES_MAP = {
    [exports.ARBITRUM]: 10, // 10 USD
    [exports.AVALANCHE]: 10, // 10 USD
    [exports.AVALANCHE_FUJI]: 10, // 10 USD
    [exports.BOTANIX]: 10, // 10 USD
    [exports.BASE]: 1, // Lowered from 10
};
// avoid botanix gas spikes when chain is not actively used
// if set, execution fee value should not be less than this in USD equivalent
exports.MIN_EXECUTION_FEE_USD = {
    [exports.ARBITRUM]: undefined,
    [exports.AVALANCHE]: undefined,
    [exports.AVALANCHE_FUJI]: undefined,
    [exports.BOTANIX]: 1000000000000000000000000000n, // 1e27 $0.001
    [exports.BASE]: undefined,
};
// added to gasPrice
// applied to *non* EIP-1559 transactions only
//
// it is *not* applied to the execution fee calculation, and in theory it could cause issues
// if gas price used in the execution fee calculation is lower
// than the gas price used in the transaction (e.g. create order transaction)
// then the transaction will fail with InsufficientExecutionFee error.
// it is not an issue on Arbitrum though because the passed gas price does not affect the paid gas price.
// for example if current gas price is 0.1 gwei and UI passes 0.5 gwei the transaction
// Arbitrum will still charge 0.1 gwei per gas
//
// it doesn't make much sense to set this buffer higher than the execution fee buffer
// because if the paid gas price is higher than the gas price used in the execution fee calculation
// and the transaction will still fail with InsufficientExecutionFee
//
// this buffer could also cause issues on a blockchain that uses passed gas price
// especially if execution fee buffer and lower than gas price buffer defined bellow
exports.GAS_PRICE_BUFFER_MAP = {
    [exports.ARBITRUM]: 2000n, // 20%
    [exports.BASE]: 2000n, // 20%
};
exports.botanix = (0, viem_1.defineChain)({
    id: exports.BOTANIX,
    name: "Botanix",
    nativeCurrency: {
        name: "Bitcoin",
        symbol: "BTC",
        decimals: 18,
    },
    rpcUrls: {
        default: {
            http: [
                // this rpc returns incorrect gas price
                // "https://rpc.botanixlabs.com",
                "https://rpc.ankr.com/botanix_mainnet",
            ],
        },
    },
    blockExplorers: {
        default: {
            name: "BotanixScan",
            url: "https://botanixscan.io",
        },
    },
    contracts: {
        multicall3: {
            address: "0x4BaA24f93a657f0c1b4A0Ffc72B91011E35cA46b",
        },
    },
});
const VIEM_CHAIN_BY_CHAIN_ID = {
    [exports.AVALANCHE_FUJI]: chains_1.avalancheFuji,
    [exports.ARBITRUM]: chains_1.arbitrum,
    [exports.AVALANCHE]: chains_1.avalanche,
    [exports.BOTANIX]: exports.botanix,
    [exports.BASE]: chains_1.base,
};
function getChainName(chainId) {
    return exports.CHAIN_NAMES_MAP[chainId];
}
exports.getChainName = getChainName;
const getViemChain = (chainId) => {
    return VIEM_CHAIN_BY_CHAIN_ID[chainId];
};
exports.getViemChain = getViemChain;
function getHighExecutionFee(chainId) {
    return exports.HIGH_EXECUTION_FEES_MAP[chainId] ?? 5;
}
exports.getHighExecutionFee = getHighExecutionFee;
function getExcessiveExecutionFee(chainId) {
    return exports.EXCESSIVE_EXECUTION_FEES_MAP[chainId] ?? 10;
}
exports.getExcessiveExecutionFee = getExcessiveExecutionFee;
function isSupportedChain(chainId, dev = false) {
    return (dev ? exports.SUPPORTED_CHAIN_IDS_DEV : exports.SUPPORTED_CHAIN_IDS).includes(chainId);
}
exports.isSupportedChain = isSupportedChain;
exports.EXECUTION_FEE_CONFIG_V2 = {
    [exports.AVALANCHE]: {
        shouldUseMaxPriorityFeePerGas: true,
        defaultBufferBps: 1000, // 10%
    },
    [exports.AVALANCHE_FUJI]: {
        shouldUseMaxPriorityFeePerGas: true,
        defaultBufferBps: 1000, // 10%
    },
    [exports.ARBITRUM]: {
        shouldUseMaxPriorityFeePerGas: false,
        defaultBufferBps: 3000, // 30%
    },
    [exports.BOTANIX]: {
        shouldUseMaxPriorityFeePerGas: true,
        defaultBufferBps: 3000, // 30%
    },
    [exports.BASE]: {
        shouldUseMaxPriorityFeePerGas: false,
        defaultBufferBps: 3000, // 30%
    },
};
exports.GAS_LIMITS_STATIC_CONFIG = {
    [exports.ARBITRUM]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
    },
    [exports.AVALANCHE]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
    },
    [exports.AVALANCHE_FUJI]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
    },
    [exports.BOTANIX]: {
        createOrderGasLimit: 1000000n,
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
    },
    [exports.BASE]: {
        createOrderGasLimit: 500000n, // Lowered from 1_000_000n
        updateOrderGasLimit: 800000n,
        cancelOrderGasLimit: 700000n,
        tokenPermitGasLimit: 90000n,
    },
};
