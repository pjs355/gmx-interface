import { Address } from "viem";
import { MarketFilterLongShortDirection, MarketFilterLongShortItemData } from "modules/trades/trades";
import { GasLimitsConfig } from "types/fees";
import { MarketsInfoData } from "types/markets";
import { DecreasePositionSwapType, Order } from "types/orders";
import { SidecarLimitOrderEntry, SidecarSlTpOrderEntry } from "types/sidecarOrders";
import { TokensData } from "types/tokens";
import type { MulticallResult } from "utils/multicall";
import type { GmxSdk } from "../../index";
export declare const getOrderExecutionFee: (sdk: GmxSdk, swapsCount: number, decreasePositionSwapType: DecreasePositionSwapType | undefined, gasLimits: GasLimitsConfig | undefined, tokensData: TokensData | undefined, gasPrice: bigint | undefined) => import("types/fees").ExecutionFee | undefined;
export declare const getExecutionFeeAmountForEntry: (sdk: GmxSdk, entry: SidecarSlTpOrderEntry | SidecarLimitOrderEntry, gasLimits: GasLimitsConfig, tokensData: TokensData, gasPrice: bigint | undefined) => bigint | undefined;
export declare function matchByMarket({ order, nonSwapRelevantDefinedFiltersLowercased, hasNonSwapRelevantDefinedMarkets, pureDirectionFilters, hasPureDirectionFilters, swapRelevantDefinedMarketsLowercased, hasSwapRelevantDefinedMarkets, marketsInfoData, chainId, }: {
    order: ReturnType<typeof parseGetOrdersResponse>["orders"][number];
    nonSwapRelevantDefinedFiltersLowercased: MarketFilterLongShortItemData[];
    hasNonSwapRelevantDefinedMarkets: boolean;
    pureDirectionFilters: MarketFilterLongShortDirection[];
    hasPureDirectionFilters: boolean;
    swapRelevantDefinedMarketsLowercased: Address[];
    hasSwapRelevantDefinedMarkets: boolean;
    marketsInfoData?: MarketsInfoData;
    chainId: number;
}): boolean;
export declare const DEFAULT_COUNT = 1000;
export declare function buildGetOrdersMulticall(chainId: number, account: string): {
    dataStore: {
        contractAddress: `0x${string}`;
        abiId: "DataStore";
        calls: {
            count: {
                methodName: string;
                params: string[];
            };
            keys: {
                methodName: string;
                params: (string | number)[];
            };
        };
    };
    reader: {
        contractAddress: `0x${string}`;
        abiId: "SyntheticsReader";
        calls: {
            orders: {
                methodName: string;
                params: (string | number)[];
            };
        };
    };
};
export declare function parseGetOrdersResponse(res: MulticallResult<ReturnType<typeof buildGetOrdersMulticall>>): {
    count: number;
    orders: Order[];
};
