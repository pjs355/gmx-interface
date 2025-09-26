import { MarketInfo, MarketsData, MarketsInfoData } from "types/markets";
import { Token, TokenData, TokensData } from "types/tokens";
import { ExternalSwapQuote } from "types/trade";
export declare function usdToToken(usd: number, token: TokenData): bigint;
export declare const MOCK_GAS_PRICE = 100000000n;
export declare function mockMarketKeys(): string[];
export declare function mockTokensData(overrides?: {
    [symbol: string]: Partial<TokenData>;
}): TokensData;
/**
 * @param marketKeys - array of market keys in the following format: indexToken-longToken-shortToken
 */
export declare function mockMarketsData(marketKeys: string[]): MarketsData;
export declare function mockMarketsInfoData(tokensData: TokensData, marketKeys: string[], overrides?: {
    [marketKey: string]: Partial<MarketInfo>;
}): MarketsInfoData;
export declare function mockExternalSwap({ inToken, outToken, amountIn, amountOut, priceIn, priceOut, feesUsd, // $5 default fee
data, to, receiver, }: {
    inToken: Token;
    outToken: Token;
    amountIn: bigint;
    amountOut: bigint;
    priceIn: bigint;
    priceOut: bigint;
    feesUsd?: bigint;
    data?: string;
    to?: string;
    receiver?: string;
}): ExternalSwapQuote;
