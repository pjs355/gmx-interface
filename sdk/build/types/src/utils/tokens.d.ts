import { ContractPrice, Token, TokenData, TokenPrices, TokensData, TokensRatio, TokensRatioAndSlippage } from "types/tokens";
export declare function parseContractPrice(price: bigint, tokenDecimals: number): bigint;
export declare function convertToContractPrice(price: bigint, tokenDecimals: number): ContractPrice;
export declare function convertToContractTokenPrices(prices: TokenPrices, tokenDecimals: number): {
    min: ContractPrice;
    max: ContractPrice;
};
export declare function convertToTokenAmount(usd: bigint | undefined, tokenDecimals: number | undefined, price: bigint | undefined): bigint | undefined;
export declare function convertToUsd(tokenAmount: bigint | undefined, tokenDecimals: number | undefined, price: bigint | undefined): bigint | undefined;
export declare function convertBetweenTokens(tokenAmount: bigint | undefined, fromToken: TokenData | undefined, toToken: TokenData | undefined, maximize: boolean): bigint | undefined;
export declare function getMidPrice(prices: TokenPrices): bigint;
export declare function getIsEquivalentTokens(token1: Token, token2: Token): boolean;
export declare function getTokenData(tokensData?: TokensData, address?: string, convertTo?: "wrapped" | "native"): TokenData | undefined;
/**
 * Even though its not a generic function, it return the same type as the input.
 * If `TokenData` is passed, it returns `TokenData`, if `Token` is passed, it returns `Token`.
 */
export declare function getTokensRatioByAmounts(p: {
    fromToken: Token;
    toToken: Token;
    fromTokenAmount: bigint;
    toTokenAmount: bigint;
}): TokensRatio;
export declare function getTokensRatioByMinOutputAmountAndTriggerPrice(p: {
    fromToken: Token;
    toToken: Token;
    fromTokenAmount: bigint;
    toTokenAmount: bigint;
    triggerPrice: bigint;
    minOutputAmount: bigint;
}): TokensRatioAndSlippage;
export declare function getAmountByRatio(p: {
    fromToken: Token;
    toToken: Token;
    fromTokenAmount: bigint;
    ratio: bigint;
    shouldInvertRatio?: boolean;
    allowedSwapSlippageBps?: bigint;
}): bigint;
export declare function getIsWrap(token1: Token, token2: Token): boolean | undefined;
export declare function getIsUnwrap(token1: Token, token2: Token): boolean | undefined;
export declare function getIsStake(token1: Token, token2: Token): boolean | undefined;
export declare function getIsUnstake(token1: Token, token2: Token): boolean | undefined;
export declare function getTokensRatioByPrice(p: {
    fromToken: Token;
    toToken: Token;
    fromPrice: bigint;
    toPrice: bigint;
}): TokensRatio;
