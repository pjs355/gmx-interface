import { Chain } from "viem/chains";
export declare const AVALANCHE = 43114;
export declare const AVALANCHE_FUJI = 43113;
export declare const ARBITRUM = 42161;
export declare const ETH_MAINNET = 1;
export declare const BOTANIX = 3637;
export declare const BASE = 8453;
export declare const SUPPORTED_CHAIN_IDS: UiSupportedChain[];
export declare const SUPPORTED_CHAIN_IDS_DEV: UiSupportedChain[];
export type UiContractsChain = typeof ARBITRUM | typeof AVALANCHE | typeof AVALANCHE_FUJI | typeof BOTANIX | typeof BASE;
export type UiSupportedChain = UiContractsChain;
export declare const CHAIN_NAMES_MAP: Record<UiContractsChain, string>;
export declare const HIGH_EXECUTION_FEES_MAP: Record<UiContractsChain, number>;
export declare const MAX_FEE_PER_GAS_MAP: Record<number, bigint>;
export declare const GAS_PRICE_PREMIUM_MAP: Record<number, bigint>;
export declare const MAX_PRIORITY_FEE_PER_GAS_MAP: Record<UiSupportedChain, bigint | undefined>;
export declare const EXCESSIVE_EXECUTION_FEES_MAP: Record<UiSupportedChain, number>;
export declare const MIN_EXECUTION_FEE_USD: Record<UiSupportedChain, bigint | undefined>;
export declare const GAS_PRICE_BUFFER_MAP: Record<number, bigint>;
export declare const botanix: Chain;
export declare function getChainName(chainId: number): any;
export declare const getViemChain: (chainId: number) => Chain;
export declare function getHighExecutionFee(chainId: number): any;
export declare function getExcessiveExecutionFee(chainId: number): any;
export declare function isSupportedChain(chainId: number, dev?: boolean): boolean;
export declare const EXECUTION_FEE_CONFIG_V2: {
    [chainId in UiSupportedChain]: {
        shouldUseMaxPriorityFeePerGas: boolean;
        defaultBufferBps?: number;
    };
};
export declare const GAS_LIMITS_STATIC_CONFIG: Record<UiSupportedChain, {
    createOrderGasLimit: bigint;
    updateOrderGasLimit: bigint;
    cancelOrderGasLimit: bigint;
    tokenPermitGasLimit: bigint;
}>;
