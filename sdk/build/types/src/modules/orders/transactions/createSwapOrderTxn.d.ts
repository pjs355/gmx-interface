import { OrderType } from "types/orders";
import { TokensData } from "types/tokens";
import type { GmxSdk } from "../../..";
export type SwapOrderParams = {
    fromTokenAddress: string;
    fromTokenAmount: bigint;
    toTokenAddress: string;
    swapPath: string[];
    referralCode?: string;
    tokensData: TokensData;
    minOutputAmount: bigint;
    orderType: OrderType.MarketSwap | OrderType.LimitSwap;
    executionFee: bigint;
    allowedSlippage: number;
    triggerPrice?: bigint;
};
export declare function createSwapOrderTxn(sdk: GmxSdk, p: SwapOrderParams): Promise<void>;
