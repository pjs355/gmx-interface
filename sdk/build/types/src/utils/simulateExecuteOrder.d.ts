import { SwapPricingType } from "types/orders";
import { TokenPrices, TokensData } from "types/tokens";
import type { GmxSdk } from "..";
export type PriceOverrides = {
    [address: string]: TokenPrices | undefined;
};
type SimulateExecuteParams = {
    createMulticallPayload: string[];
    primaryPriceOverrides: PriceOverrides;
    tokensData: TokensData;
    value: bigint;
    swapPricingType?: SwapPricingType;
};
/**
 *
 * @deprecated use simulateExecution instead
 */
export declare function simulateExecuteOrder(sdk: GmxSdk, p: SimulateExecuteParams): Promise<void>;
export declare function extractDataFromError(errorMessage: unknown): string | null;
export {};
