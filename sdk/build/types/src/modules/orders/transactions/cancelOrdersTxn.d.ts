import type { GmxSdk } from "../../../index";
export type CancelOrderParams = {
    orderKeys: string[];
};
export declare function cancelOrdersTxn(sdk: GmxSdk, p: CancelOrderParams): Promise<`0x${string}`>;
export declare function createCancelEncodedPayload(orderKeys?: (string | null)[]): `0x${string}`[];
