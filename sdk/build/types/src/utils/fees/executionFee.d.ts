import { ExecutionFee, GasLimitsConfig, L1ExpressOrderGasReference } from "types/fees";
import { DecreasePositionSwapType } from "types/orders";
import { TokenData, TokensData } from "types/tokens";
export declare function getExecutionFee(chainId: number, gasLimits: GasLimitsConfig, tokensData: TokensData, estimatedGasLimit: bigint, gasPrice: bigint, oraclePriceCount: bigint, numberOfParts?: number): ExecutionFee | undefined;
export declare function estimateRelayerGasLimit({ gasLimits, tokenPermitsCount, feeSwapsCount, feeExternalCallsGasLimit, oraclePriceCount, transactionPayloadGasLimit, l1GasLimit, }: {
    gasLimits: GasLimitsConfig;
    tokenPermitsCount: number;
    feeSwapsCount: number;
    feeExternalCallsGasLimit: bigint;
    oraclePriceCount: number;
    transactionPayloadGasLimit: bigint;
    l1GasLimit: bigint;
}): bigint;
export declare function approximateL1GasBuffer({ l1Reference, sizeOfData, }: {
    l1Reference: L1ExpressOrderGasReference;
    sizeOfData: bigint;
}): bigint;
export declare function estimateBatchGasLimit({ gasLimits, createOrdersCount, updateOrdersCount, cancelOrdersCount, externalCallsGasLimit, }: {
    gasLimits: GasLimitsConfig;
    createOrdersCount: number;
    updateOrdersCount: number;
    cancelOrdersCount: number;
    externalCallsGasLimit: bigint;
}): bigint;
export declare function estimateBatchMinGasPaymentTokenAmount({ chainId, gasPaymentToken, relayFeeToken, gasPrice, gasLimits, l1Reference, tokensData, createOrdersCount, updateOrdersCount, cancelOrdersCount, executionFeeAmount, }: {
    chainId: number;
    gasLimits: GasLimitsConfig;
    gasPaymentToken: TokenData;
    relayFeeToken: TokenData;
    tokensData: TokensData;
    gasPrice: bigint;
    l1Reference: L1ExpressOrderGasReference | undefined;
    createOrdersCount: number;
    updateOrdersCount: number;
    cancelOrdersCount: number;
    executionFeeAmount: bigint | undefined;
}): bigint;
/**
 * Copy from contract: `estimateExecuteIncreaseOrderGasLimit`
 */
export declare function estimateExecuteIncreaseOrderGasLimit(gasLimits: GasLimitsConfig, order: {
    swapsCount?: number;
    callbackGasLimit?: bigint;
}): bigint;
/**
 * Copy from contract: `estimateExecuteDecreaseOrderGasLimit`
 */
export declare function estimateExecuteDecreaseOrderGasLimit(gasLimits: GasLimitsConfig, order: {
    swapsCount: number;
    callbackGasLimit?: bigint;
    decreaseSwapType?: DecreasePositionSwapType;
}): bigint;
export declare function estimateExecuteSwapOrderGasLimit(gasLimits: GasLimitsConfig, order: {
    swapsCount: number;
    callbackGasLimit?: bigint;
}): bigint;
/**
 * Only GM deposits. Do not confuse with increase with zero delta size.
 *
 * Copy from contract: `estimateExecuteDepositGasLimit`
 */
export declare function estimateExecuteDepositGasLimit(gasLimits: GasLimitsConfig, deposit: {
    longTokenSwapsCount?: number;
    shortTokenSwapsCount?: number;
    callbackGasLimit?: bigint;
}): bigint;
export declare function estimateExecuteGlvDepositGasLimit(gasLimits: GasLimitsConfig, { marketsCount, isMarketTokenDeposit, }: {
    isMarketTokenDeposit: boolean;
    marketsCount: bigint;
    initialLongTokenAmount: bigint;
    initialShortTokenAmount: bigint;
}): bigint;
export declare function estimateExecuteGlvWithdrawalGasLimit(gasLimits: GasLimitsConfig, { marketsCount, }: {
    marketsCount: bigint;
}): bigint;
/**
 * Only GM withdrawals. Do not confuse with decrease with zero delta size.
 *
 * Copy from contract: `estimateExecuteWithdrawalGasLimit`
 */
export declare function estimateExecuteWithdrawalGasLimit(gasLimits: GasLimitsConfig, withdrawal: {
    callbackGasLimit?: bigint;
}): bigint;
/**
 * Copy from contract: `estimateExecuteShiftGasLimit`
 */
export declare function estimateExecuteShiftGasLimit(gasLimits: GasLimitsConfig, shift: {
    callbackGasLimit?: bigint;
}): bigint;
