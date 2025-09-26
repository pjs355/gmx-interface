import { GasLimitsConfig } from "types/fees";
import { MarketsInfoData } from "types/markets";
import { TokensData } from "types/tokens";
import { MarketEdge, MarketEdgeLiquidityGetter, NaiveNetworkEstimator, NaiveSwapEstimator, SwapEstimator, SwapPaths } from "types/trade";
import { MarketsGraph } from "utils/swap/buildMarketsAdjacencyGraph";
export declare const createSwapEstimator: (marketsInfoData: MarketsInfoData, isAtomicSwap: boolean) => SwapEstimator;
export declare const createMarketEdgeLiquidityGetter: (marketsInfoData: MarketsInfoData) => MarketEdgeLiquidityGetter;
export declare const createNaiveSwapEstimator: (marketsInfoData: MarketsInfoData, isAtomicSwap: boolean) => NaiveSwapEstimator;
export declare const createNaiveNetworkEstimator: ({ gasLimits, tokensData, gasPrice, chainId, }: {
    gasLimits: GasLimitsConfig;
    tokensData: TokensData;
    gasPrice: bigint;
    chainId: number;
}) => NaiveNetworkEstimator;
export declare function getBestSwapPath({ routes, usdIn, estimator, networkEstimator, }: {
    routes: MarketEdge[][];
    usdIn: bigint;
    estimator: SwapEstimator;
    networkEstimator?: NaiveNetworkEstimator;
}): MarketEdge[] | undefined;
export declare function getNaiveBestMarketSwapPathsFromTokenSwapPaths({ graph, tokenSwapPaths, usdIn, tokenInAddress, tokenOutAddress, estimator, topPathsCount, networkEstimator, }: {
    graph: MarketsGraph;
    tokenSwapPaths: string[][];
    usdIn: bigint;
    tokenInAddress: string;
    tokenOutAddress: string;
    estimator: NaiveSwapEstimator;
    topPathsCount?: number;
    networkEstimator?: NaiveNetworkEstimator;
}): string[][];
export declare function getMarketsForTokenPair(graph: MarketsGraph, tokenAAddress: string, tokenBAddress: string): string[];
export declare function getBestMarketForTokenEdge({ marketAddresses, usdIn, tokenInAddress, tokenOutAddress, estimator, marketPath, calculatedCache, }: {
    marketAddresses: string[];
    usdIn: bigint;
    tokenInAddress: string;
    tokenOutAddress: string;
    estimator: NaiveSwapEstimator;
    marketPath?: string[];
    calculatedCache?: Record<string, number>;
}): {
    marketAddress: string;
    swapYield: number;
} | undefined;
export declare function marketRouteToMarketEdges(marketPath: string[], from: string, marketsInfoData: MarketsInfoData): MarketEdge[];
export declare function getTokenSwapPathsForTokenPair(tokenSwapPaths: SwapPaths, tokenAAddress: string, tokenBAddress: string): string[][];
export declare function getTokenSwapPathsForTokenPairPrebuilt(chainId: number, from: string, to: string): string[][];
export declare function getMarketAdjacencyGraph(chainId: number): MarketsGraph;
export declare function findAllReachableTokens(chainId: number, from: string): string[];
export declare function getMaxLiquidityMarketSwapPathFromTokenSwapPaths({ graph, tokenSwapPaths, tokenInAddress, tokenOutAddress, getLiquidity, }: {
    graph: MarketsGraph;
    tokenSwapPaths: string[][];
    tokenInAddress: string;
    tokenOutAddress: string;
    getLiquidity: MarketEdgeLiquidityGetter;
}): {
    path: string[];
    liquidity: bigint;
} | undefined;
export declare function getMaxLiquidityMarketForTokenEdge({ markets, tokenInAddress, tokenOutAddress, getLiquidity, }: {
    markets: string[];
    tokenInAddress: string;
    tokenOutAddress: string;
    getLiquidity: MarketEdgeLiquidityGetter;
}): {
    marketAddress: string;
    liquidity: bigint;
};
