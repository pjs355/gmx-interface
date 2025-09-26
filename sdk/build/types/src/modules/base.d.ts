import type { GmxSdk } from "..";
export declare class Module {
    sdk: GmxSdk;
    constructor(sdk: GmxSdk);
    get oracle(): import("modules/oracle").Oracle;
    get chainId(): import("configs/chains").UiContractsChain;
    get account(): `0x${string}`;
}
