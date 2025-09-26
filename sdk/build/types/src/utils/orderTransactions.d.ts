import { ExecutionFee } from "types/fees";
import { DecreasePositionSwapType, OrderType } from "types/orders";
import { ContractPrice, ERC20Address, TokensData } from "types/tokens";
import { ExternalSwapQuote } from "types/trade";
import { TwapOrderParams } from "types/twap";
export type ExchangeRouterCall = {
    method: string;
    params: any[];
};
export type BatchOrderTxnParams = {
    createOrderParams: CreateOrderTxnParams<any>[];
    updateOrderParams: UpdateOrderTxnParams[];
    cancelOrderParams: CancelOrderTxnParams[];
};
export type CreateOrderTxnParams<TParams extends SwapOrderParams | IncreasePositionOrderParams | DecreasePositionOrderParams> = {
    params: TParams;
    orderPayload: CreateOrderPayload;
    tokenTransfersParams: TokenTransfersParams | undefined;
};
export type UpdateOrderTxnParams = {
    params: UpdateOrderParams;
    updatePayload: UpdateOrderPayload;
};
export type CancelOrderTxnParams = {
    orderKey: string;
};
export type CreateOrderPayload = {
    addresses: {
        receiver: string;
        cancellationReceiver: string;
        callbackContract: string;
        uiFeeReceiver: string;
        market: string;
        initialCollateralToken: ERC20Address;
        swapPath: string[];
    };
    numbers: {
        sizeDeltaUsd: bigint;
        /**
         * For express orders initialCollateralDeltaAmount will be transfered from user wallet to order vault in relay router logic,
         * for default orders - this field will be ignored in contracts and settled by actual value reveived in order vault
         * */
        initialCollateralDeltaAmount: bigint;
        triggerPrice: ContractPrice | 0n;
        acceptablePrice: ContractPrice | 0n;
        executionFee: bigint;
        callbackGasLimit: bigint;
        minOutputAmount: bigint;
        validFromTime: bigint;
    };
    orderType: OrderType;
    decreasePositionSwapType: DecreasePositionSwapType;
    isLong: boolean;
    shouldUnwrapNativeToken: boolean;
    autoCancel: boolean;
    referralCode: string;
};
export type UpdateOrderParams = {
    chainId: number;
    indexTokenAddress: string;
    orderKey: string;
    orderType: OrderType;
    sizeDeltaUsd: bigint;
    triggerPrice: bigint;
    acceptablePrice: bigint;
    minOutputAmount: bigint;
    autoCancel: boolean;
    validFromTime: bigint;
    executionFeeTopUp: bigint;
};
export type UpdateOrderPayload = {
    orderKey: string;
    sizeDeltaUsd: bigint;
    triggerPrice: ContractPrice;
    acceptablePrice: ContractPrice;
    minOutputAmount: bigint;
    autoCancel: boolean;
    validFromTime: bigint;
    executionFeeTopUp: bigint;
};
export type TokenTransfersParams = {
    isNativePayment: boolean;
    isNativeReceive: boolean;
    tokenTransfers: TokenTransfer[];
    value: bigint;
    payTokenAddress: string;
    payTokenAmount: bigint;
    initialCollateralTokenAddress: ERC20Address;
    initialCollateralDeltaAmount: bigint;
    minOutputAmount: bigint;
    swapPath: string[];
    externalCalls: ExternalCallsPayload | undefined;
};
export type TokenTransfer = {
    tokenAddress: string;
    destination: string;
    amount: bigint;
};
export type ExternalCallsPayload = {
    sendTokens: ERC20Address[];
    sendAmounts: bigint[];
    externalCallTargets: string[];
    externalCallDataList: string[];
    refundTokens: string[];
    refundReceivers: string[];
};
export type CommonOrderParams = {
    chainId: number;
    receiver: string;
    executionFeeAmount: bigint;
    executionGasLimit: bigint;
    referralCode: string | undefined;
    uiFeeReceiver: string | undefined;
    allowedSlippage: number;
    autoCancel: boolean;
    validFromTime: bigint | undefined;
};
export type PositionOrderParams = {
    marketAddress: string;
    indexTokenAddress: string;
    isLong: boolean;
    sizeDeltaUsd: bigint;
    sizeDeltaInTokens: bigint;
    acceptablePrice: bigint;
    triggerPrice: bigint | undefined;
};
export type SwapOrderParams = CommonOrderParams & {
    payTokenAddress: string;
    payTokenAmount: bigint;
    receiveTokenAddress: string;
    swapPath: string[];
    externalSwapQuote: ExternalSwapQuote | undefined;
    minOutputAmount: bigint;
    expectedOutputAmount?: bigint;
    orderType: OrderType.MarketSwap | OrderType.LimitSwap;
    triggerRatio: bigint | undefined;
};
export type IncreasePositionOrderParams = CommonOrderParams & PositionOrderParams & {
    payTokenAddress: string;
    payTokenAmount: bigint;
    swapPath: string[];
    collateralDeltaAmount: bigint;
    collateralTokenAddress: string;
    externalSwapQuote: ExternalSwapQuote | undefined;
    orderType: OrderType.MarketIncrease | OrderType.LimitIncrease | OrderType.StopIncrease;
};
export type DecreasePositionOrderParams = CommonOrderParams & PositionOrderParams & {
    collateralTokenAddress: string;
    collateralDeltaAmount: bigint;
    swapPath: string[];
    externalSwapQuote: undefined;
    receiveTokenAddress: string;
    minOutputUsd: bigint;
    decreasePositionSwapType: DecreasePositionSwapType;
    orderType: OrderType.MarketDecrease | OrderType.LimitDecrease | OrderType.StopLossDecrease;
};
export declare function buildSwapOrderPayload(p: SwapOrderParams): CreateOrderTxnParams<SwapOrderParams>;
export declare function buildIncreaseOrderPayload(p: IncreasePositionOrderParams): CreateOrderTxnParams<IncreasePositionOrderParams>;
export declare function buildDecreaseOrderPayload(p: DecreasePositionOrderParams): CreateOrderTxnParams<DecreasePositionOrderParams>;
export declare function buildTwapOrdersPayloads<T extends SwapOrderParams | IncreasePositionOrderParams | DecreasePositionOrderParams>(p: T, twapParams: TwapOrderParams): CreateOrderTxnParams<T>[];
export declare function getIsTwapOrderPayload(p: CreateOrderPayload): boolean;
export declare function buildUpdateOrderPayload(p: UpdateOrderParams): UpdateOrderTxnParams;
export declare function getBatchTotalExecutionFee({ batchParams: { createOrderParams, updateOrderParams }, tokensData, chainId, }: {
    batchParams: BatchOrderTxnParams;
    tokensData: TokensData;
    chainId: number;
}): ExecutionFee | undefined;
export declare function getBatchTotalPayCollateralAmount(batchParams: BatchOrderTxnParams): {
    [tokenAddress: string]: bigint;
};
export declare function getBatchExternalSwapGasLimit(batchParams: BatchOrderTxnParams): bigint;
export declare function buildTokenTransfersParamsForDecrease({ chainId, executionFeeAmount, collateralTokenAddress, collateralDeltaAmount, swapPath, minOutputUsd, receiveTokenAddress, }: {
    chainId: number;
    executionFeeAmount: bigint;
    collateralTokenAddress: string;
    collateralDeltaAmount: bigint;
    receiveTokenAddress: string;
    swapPath: string[];
    minOutputUsd: bigint;
}): TokenTransfersParams;
export declare function buildTokenTransfersParamsForIncreaseOrSwap({ chainId, receiver, payTokenAddress, payTokenAmount, receiveTokenAddress, executionFeeAmount, externalSwapQuote, minOutputAmount, swapPath, }: {
    chainId: number;
    receiver: string;
    payTokenAddress: string;
    payTokenAmount: bigint;
    receiveTokenAddress: string | undefined;
    executionFeeAmount: bigint;
    externalSwapQuote: ExternalSwapQuote | undefined;
    minOutputAmount: bigint;
    swapPath: string[];
}): TokenTransfersParams;
export declare function getBatchExternalCalls(batchParams: BatchOrderTxnParams): ExternalCallsPayload;
export declare function combineExternalCalls(externalCalls: ExternalCallsPayload[]): ExternalCallsPayload;
export declare function getEmptyExternalCallsPayload(): ExternalCallsPayload;
export declare function getExternalCallsPayload({ chainId, account, quote, }: {
    chainId: number;
    account: string;
    quote: ExternalSwapQuote;
}): ExternalCallsPayload;
export declare function getBatchOrderMulticallPayload({ params }: {
    params: BatchOrderTxnParams;
}): {
    multicall: ExchangeRouterCall[];
    value: bigint;
    encodedMulticall: `0x${string}`[];
    callData: `0x${string}`;
};
export declare function buildCreateOrderMulticall(params: CreateOrderTxnParams<any>): {
    multicall: ExchangeRouterCall[];
    value: bigint;
};
export declare function buildUpdateOrderMulticall(updateTxn: UpdateOrderTxnParams): {
    multicall: ExchangeRouterCall[];
    value: bigint;
};
export declare function buildCancelOrderMulticall({ params }: {
    params: CancelOrderTxnParams;
}): {
    multicall: ExchangeRouterCall[];
    value: bigint;
};
export declare function encodeExchangeRouterMulticall(multicall: ExchangeRouterCall[]): {
    encodedMulticall: `0x${string}`[];
    callData: `0x${string}`;
};
export declare function getBatchRequiredActions(orderParams: BatchOrderTxnParams | undefined): number;
export declare function getBatchSwapsCount(orderParams: BatchOrderTxnParams | undefined): number;
export declare function getIsEmptyBatch(orderParams: BatchOrderTxnParams | undefined): boolean;
export declare function getBatchIsNativePayment(orderParams: BatchOrderTxnParams): boolean;
export declare function getIsInvalidBatchReceiver(batchParams: BatchOrderTxnParams, signerAddress: string): boolean;
