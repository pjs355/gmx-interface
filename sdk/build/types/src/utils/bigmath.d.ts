export declare const bigMath: {
    abs(x: bigint): bigint;
    mulDiv(x: bigint, y: bigint, z: bigint): bigint;
    max(max: bigint, ...rest: bigint[]): bigint;
    min(min: bigint, ...rest: bigint[]): bigint;
    avg(...values: (bigint | undefined)[]): bigint | undefined;
    divRound(x: bigint, y: bigint): bigint;
    divRoundUp(x: bigint, y: bigint): bigint;
};
