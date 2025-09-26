export declare enum TxErrorType {
    NotEnoughFunds = "NOT_ENOUGH_FUNDS",
    UserDenied = "USER_DENIED",
    Slippage = "SLIPPAGE",
    RpcError = "RPC_ERROR",
    NetworkChanged = "NETWORK_CHANGED",
    Expired = "EXPIRED"
}
export type ErrorPattern = {
    msg?: string;
    code?: number;
};
export declare enum CustomErrorName {
    EndOfOracleSimulation = "EndOfOracleSimulation",
    InsufficientExecutionFee = "InsufficientExecutionFee",
    OrderNotFulfillableAtAcceptablePrice = "OrderNotFulfillableAtAcceptablePrice",
    InsufficientSwapOutputAmount = "InsufficientSwapOutputAmount"
}
export declare function getIsUserRejectedError(errorType: TxErrorType): boolean;
export declare function getIsUserError(errorType: TxErrorType): boolean;
export type TxError = {
    message?: string;
    code?: number | string;
    data?: any;
    error?: any;
};
/**
 * @deprecated Use `parseError` instead.
 */
export declare function extractTxnError(ex: TxError): [string, TxErrorType | null, any] | [];
/**
 * @deprecated Use `parseError` instead.
 */
export declare function extractDataFromError(errorMessage: unknown): string | null;
