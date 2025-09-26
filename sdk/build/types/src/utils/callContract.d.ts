import { Abi, Address, PublicClient } from "viem";
import type { GmxSdk } from "../index";
export declare function getGasPrice(client: PublicClient, chainId: number): Promise<{
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    gasPrice?: undefined;
} | {
    gasPrice: bigint;
    maxFeePerGas?: undefined;
    maxPriorityFeePerGas?: undefined;
}>;
export declare function getGasLimit(client: PublicClient, account: Address, contractAddress: Address, abi: Abi, method: string, params?: any[], value?: bigint | number): Promise<bigint>;
export interface CallContractOpts {
    value?: bigint | number;
    gasLimit?: bigint | number;
}
export declare function callContract(sdk: GmxSdk, contractAddress: Address, abi: Abi, method: string, params: any[], opts?: CallContractOpts): Promise<`0x${string}`>;
