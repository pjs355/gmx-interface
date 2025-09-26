export type Numeric = number | bigint;
export type BigNumberish = string | Numeric;
export declare const USD_DECIMALS = 30;
export declare const BASIS_POINTS_DIVISOR = 10000;
export declare const BASIS_POINTS_DIVISOR_BIGINT = 10000n;
export declare const BASIS_POINTS_DECIMALS = 4;
export declare const PRECISION_DECIMALS = 30;
export declare const PRECISION: bigint;
export declare const BN_ZERO = 0n;
export declare const BN_ONE = 1n;
export declare const BN_NEGATIVE_ONE = -1n;
export declare const MaxUint256: bigint;
export declare const PERCENT_PRECISION_DECIMALS: number;
export declare const TRIGGER_PREFIX_ABOVE = ">";
export declare const TRIGGER_PREFIX_BELOW = "<";
export declare function expandDecimals(n: BigNumberish, decimals: number): bigint;
export declare function basisPointsToFloat(basisPoints: bigint): bigint;
export declare function getBasisPoints(numerator: bigint, denominator: bigint, shouldRoundUp?: boolean): bigint;
export declare function roundUpMagnitudeDivision(a: bigint, b: bigint): bigint;
export declare function applyFactor(value: bigint, factor: bigint): bigint;
export declare function numberToBigint(value: number, decimals: number): bigint;
export declare const trimZeroDecimals: (amount: string) => string;
export declare function bigintToNumber(value: bigint, decimals: number): number;
export declare function adjustForDecimals(amount: bigint, divDecimals: number, mulDecimals: number): bigint;
export declare function formatUsd(usd?: bigint, opts?: {
    fallbackToZero?: boolean;
    displayDecimals?: number;
    maxThreshold?: string | null;
    minThreshold?: string;
    displayPlus?: boolean;
    visualMultiplier?: number;
}): string | undefined;
export declare function formatDeltaUsd(deltaUsd?: bigint, percentage?: bigint, opts?: {
    fallbackToZero?: boolean;
    showPlusForZero?: boolean;
}): string | undefined;
export declare function formatPercentage(percentage?: bigint, opts?: {
    fallbackToZero?: boolean;
    signed?: boolean;
    displayDecimals?: number;
    bps?: boolean;
}): string | undefined;
export declare function formatTokenAmount(amount?: bigint, tokenDecimals?: number, symbol?: string, opts?: {
    showAllSignificant?: boolean;
    displayDecimals?: number;
    fallbackToZero?: boolean;
    useCommas?: boolean;
    minThreshold?: string;
    maxThreshold?: string;
    displayPlus?: boolean;
    isStable?: boolean;
}): string | undefined;
export declare function formatTokenAmountWithUsd(tokenAmount?: bigint, usdAmount?: bigint, tokenSymbol?: string, tokenDecimals?: number, opts?: {
    fallbackToZero?: boolean;
    displayDecimals?: number;
    displayPlus?: boolean;
    isStable?: boolean;
}): string | undefined;
/**
 *
 * @param opts.signed - Default `true`. whether to display a `+` or `-` sign for all non-zero values.
 */
export declare function formatRatePercentage(rate?: bigint, opts?: {
    displayDecimals?: number;
    signed?: boolean;
}): string;
export declare function formatUsdPrice(price?: bigint, opts?: Parameters<typeof formatUsd>[1]): string | undefined;
export declare function formatPercentageDisplay(percentage: number, hideThreshold?: number): string;
export declare function formatAmountHuman(amount: BigNumberish | undefined, tokenDecimals: number, showDollar?: boolean, displayDecimals?: number): string;
export declare function formatBalanceAmount(amount: bigint, tokenDecimals: number, tokenSymbol?: string, { showZero, toExponential, isStable, }?: {
    showZero?: boolean;
    toExponential?: boolean;
    isStable?: boolean;
}): string;
export declare function formatFactor(factor: bigint): string;
export declare function numberWithCommas(x: BigNumberish): string;
export declare const formatAmount: (amount: BigNumberish | undefined, tokenDecimals: number, displayDecimals?: number, useCommas?: boolean, defaultValue?: string, visualMultiplier?: number) => string;
export declare const formatKeyAmount: <T extends {}>(map: T | undefined, key: keyof T, tokenDecimals: number, displayDecimals: number, useCommas?: boolean) => string;
export declare const formatArrayAmount: (arr: any[], index: number, tokenDecimals: number, displayDecimals?: number, useCommas?: boolean) => string;
export declare const formatAmountFree: (amount: BigNumberish, tokenDecimals: number, displayDecimals?: number) => string;
export declare function getLimitedDisplay(amount: bigint, tokenDecimals: number, opts?: {
    maxThreshold?: BigNumberish | null;
    minThreshold?: BigNumberish;
}): {
    symbol: string;
    value: bigint;
};
export declare const limitDecimals: (amount: BigNumberish, maxDecimals?: number) => string;
export declare const padDecimals: (amount: BigNumberish, minDecimals: number) => string;
export declare function getPlusOrMinusSymbol(value?: bigint, opts?: {
    showPlusForZero?: boolean;
}): string;
export declare function roundWithDecimals(value: BigNumberish, opts: {
    displayDecimals: number;
    decimals: number;
}): bigint;
export declare function toBigNumberWithDecimals(value: string, decimals: number): bigint;
/**
 *
 * @deprecated Use BigInt instead
 */
export declare function bigNumberify(n?: BigNumberish | null | undefined): bigint | undefined;
export declare const parseValue: (value: string, tokenDecimals: number) => bigint | undefined;
export declare function roundUpDivision(a: bigint, b: bigint): bigint;
export declare function roundToTwoDecimals(n: number): number;
export declare function roundToOrder(n: bigint, significantDigits?: number): bigint;
export declare function roundBigIntToDecimals(value: bigint, tokenDecimals: number, roundToDecimals: number): bigint;
export declare function minBigNumber(...args: bigint[]): bigint | undefined;
export declare function maxbigint(...args: bigint[]): bigint | undefined;
export declare function removeTrailingZeros(amount: string | number): string | number;
type SerializedBigIntsInObject<T> = {
    [P in keyof T]: T[P] extends bigint ? {
        type: "bigint";
        value: bigint;
    } : T[P] extends object ? SerializedBigIntsInObject<T[P]> : T[P];
};
type DeserializeBigIntInObject<T> = {
    [P in keyof T]: T[P] extends {
        type: "bigint";
        value: bigint;
    } ? bigint : T[P] extends object ? DeserializeBigIntInObject<T[P]> : T[P];
};
export declare function serializeBigIntsInObject<T extends object>(obj: T): SerializedBigIntsInObject<T>;
export declare function deserializeBigIntsInObject<T extends object>(obj: T): DeserializeBigIntInObject<T>;
export declare function calculateDisplayDecimals(price?: bigint, decimals?: number, visualMultiplier?: number, isStable?: boolean): 5 | 2 | 3 | 4 | 6 | 7 | 8 | 9;
export declare function clamp(value: number, min: number, max: number): number;
export declare function absDiffBps(value: bigint, base: bigint): bigint;
export {};
