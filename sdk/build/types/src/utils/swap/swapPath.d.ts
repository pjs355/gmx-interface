import { GasLimitsConfig } from "types/fees";
import { MarketsInfoData } from "types/markets";
import { TokensData } from "types/tokens";
import { FindSwapPath } from "types/trade";
export declare const getWrappedAddress: (chainId: number, address: string | undefined) => import("types/tokens").ERC20Address | undefined;
export declare const createFindSwapPath: (params: {
    chainId: number;
    fromTokenAddress: string | undefined;
    toTokenAddress: string | undefined;
    marketsInfoData: MarketsInfoData | undefined;
    /**
     * Pass gas limits to take into account gas costs in swap path
     */
    gasEstimationParams?: {
        gasPrice: bigint;
        gasLimits: GasLimitsConfig;
        tokensData: TokensData;
    } | undefined;
    isExpressFeeSwap: boolean | undefined;
    disabledMarkets?: string[] | undefined;
    manualPath?: string[] | undefined;
    maxSwapPathLength?: number | undefined;
}) => FindSwapPath;
