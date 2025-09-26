import type { GmxSdk } from "../../../index";
export type WrapOrUnwrapParams = {
    amount: bigint;
    isWrap: boolean;
};
export declare function createWrapOrUnwrapTxn(sdk: GmxSdk, p: WrapOrUnwrapParams): Promise<`0x${string}`>;
