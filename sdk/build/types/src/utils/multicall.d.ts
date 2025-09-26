import { AbiId } from "abis";
import type { GmxSdk } from "index";
export declare const MAX_TIMEOUT = 20000;
export type MulticallProviderUrls = {
    primary: string;
    secondary: string;
};
export declare class Multicall {
    sdk: GmxSdk;
    static instances: {
        [chainId: number]: Multicall | undefined;
    };
    static getInstance(sdk: GmxSdk): Promise<Multicall>;
    constructor(sdk: GmxSdk);
    get chainId(): import("configs/chains").UiContractsChain;
    call(request: MulticallRequestConfig<any>, maxTimeout: number): Promise<MulticallResult<any>>;
}
export type SkipKey = null | undefined | false;
export type ContractCallConfig = {
    methodName: string;
    params: any[];
};
export type ContractCallsConfig<T extends {
    calls: any;
}> = {
    contractAddress: string;
    abiId: AbiId;
    calls: {
        [callKey in keyof T["calls"]]: ContractCallConfig | SkipKey;
    };
};
export type MulticallRequestConfig<T extends {
    [key: string]: any;
}> = {
    [contractKey in keyof T]: ContractCallsConfig<T[contractKey]>;
};
export type ContractCallResult = {
    returnValues: {
        [key: string | number]: any;
    };
    contractKey: string;
    callKey: string;
    success?: boolean;
    error?: string;
};
export type MulticallErrors<T extends MulticallRequestConfig<any>> = {
    [contractKey in keyof T]: {
        [callKey in keyof T[contractKey]["calls"]]: {
            message: string;
            shortMessage: string;
            functionName: string;
            contractAddress: string;
        };
    };
};
export type ContractCallsResult<T extends ContractCallsConfig<any>> = {
    [callKey in keyof T["calls"]]: ContractCallResult;
};
export type MulticallResult<T extends MulticallRequestConfig<any>> = {
    success: boolean;
    errors: MulticallErrors<T>;
    data: {
        [contractKey in keyof T]: ContractCallsResult<T[contractKey]>;
    };
};
