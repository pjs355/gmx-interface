import { UiContractsChain } from "./chains";
export declare const SWAP_GRAPH_MAX_MARKETS_PER_TOKEN = 5;
export type MarketConfig = {
    marketTokenAddress: string;
    indexTokenAddress: string;
    longTokenAddress: string;
    shortTokenAddress: string;
};
export declare const MARKETS: Record<UiContractsChain, Record<string, MarketConfig>>;
