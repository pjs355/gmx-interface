import { TokensData, Token as TToken } from "types/tokens";
import { Module } from "../base";
type TokensDataResult = {
    tokensData?: TokensData;
    pricesUpdatedAt?: number;
};
export declare class Tokens extends Module {
    _tokensConfigs: {
        [key: string]: TToken;
    } | undefined;
    get tokensConfig(): {
        [address: string]: TToken;
    };
    private getTokenRecentPrices;
    private getTokensBalances;
    getNativeToken(): TToken;
    getTokensData(): Promise<TokensDataResult>;
}
export {};
