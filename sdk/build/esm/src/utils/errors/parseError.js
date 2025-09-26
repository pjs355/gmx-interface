import cryptoJs from "crypto-js";
import { decodeErrorResult } from "viem";
import { abis } from "abis";
import { extractDataFromError, extractTxnError, getIsUserError, getIsUserRejectedError, } from "./transactionsErrors";
const URL_REGEXP = /((?:http[s]?:\/\/.)?(?:www\.)?[-a-zA-Z0-9@%._\\+~#=]{2,256}\.[a-z]{2,6}\b(?::\d+)?)(?:[-a-zA-Z0-9@:%_\\+.~#?&\\/\\/=]*)/gi;
const MAX_ERRORS_DEPTH = 1;
export function extendError(error, params) {
    error.errorContext = params.errorContext;
    error.errorSource = params.errorSource;
    error.isAdditionalValidationPassed = params.isAdditionalValidationPassed;
    error.additionalValidationType = params.additionalValidationType;
    error.data = params.data;
    return error;
}
export function parseError(error, errorDepth = 0) {
    if (errorDepth > MAX_ERRORS_DEPTH) {
        return undefined;
    }
    // all human readable details are in info field
    const errorInfo = typeof error === "string" ? undefined : error?.info?.error;
    const errorSource = typeof error === "string" ? undefined : error?.errorSource;
    const errorContext = typeof error === "string" ? undefined : error?.errorContext;
    const isAdditionalValidationPassed = typeof error === "string" ? undefined : error?.isAdditionalValidationPassed;
    const additionalValidationType = typeof error === "string" ? undefined : error?.additionalValidationType;
    const data = typeof error === "string" ? undefined : error?.data;
    let errorMessage = "Unknown error";
    let errorStack = undefined;
    let errorStackHash = undefined;
    let errorName = undefined;
    let contractError = undefined;
    let contractErrorArgs = undefined;
    let txErrorType = undefined;
    let errorGroup = "Unknown group";
    let errorStackGroup = "Unknown stack group";
    let txErrorData = undefined;
    let isUserError = undefined;
    let isUserRejectedError = undefined;
    let parentError = undefined;
    try {
        errorMessage = hasMessage(errorInfo)
            ? errorInfo.message ?? (hasMessage(error) ? error.message : String(error))
            : String(error);
        errorStack = hasStack(error) ? error.stack : undefined;
        if (hasName(errorInfo)) {
            errorName = errorInfo.name;
        }
        else if (hasName(error)) {
            errorName = error.name;
        }
        try {
            let txError;
            if (errorInfo) {
                txError = extractTxnError(errorInfo);
            }
            else if (error && typeof error === "object") {
                txError = extractTxnError(error);
            }
            if (txError && txError.length) {
                const [message, type, errorData] = txError;
                errorMessage = message;
                txErrorType = type || undefined;
                txErrorData = errorData;
                isUserError = type ? getIsUserError(type) : false;
                isUserRejectedError = type ? getIsUserRejectedError(type) : false;
            }
        }
        catch (e) {
            //
        }
        if (errorMessage) {
            const errorData = extractDataFromError(errorMessage) ?? extractDataFromError(error?.message);
            if (errorData) {
                const parsedError = decodeErrorResult({
                    abi: abis.CustomErrors,
                    data: errorData,
                });
                if (parsedError) {
                    contractError = parsedError.errorName;
                    contractErrorArgs = parsedError.args;
                }
            }
        }
        if (typeof error !== "string" && error?.parentError) {
            parentError = parseError(error.parentError, errorDepth + 1);
        }
    }
    catch (e) {
        //
    }
    if (errorStack) {
        errorStackHash = cryptoJs.SHA256(errorStack).toString(cryptoJs.enc.Hex);
        errorStackGroup = errorStack.slice(0, 300);
        errorStackGroup = errorStackGroup.replace(URL_REGEXP, "$1");
        errorStackGroup = errorStackGroup.replace(/\d+/g, "XXX");
    }
    if (txErrorType) {
        errorGroup = `Txn Error: ${txErrorType}`;
    }
    else if (errorMessage) {
        errorGroup = errorMessage.slice(0, 300);
        errorGroup = errorGroup.replace(URL_REGEXP, "$1");
        errorGroup = errorGroup.replace(/\d+/g, "XXX");
        errorGroup = errorGroup.slice(0, 50);
    }
    else if (errorName) {
        errorGroup = errorName;
    }
    return {
        errorMessage,
        errorGroup,
        errorStackGroup,
        errorStack,
        errorStackHash,
        errorName,
        contractError,
        contractErrorArgs,
        errorContext,
        isUserError,
        data,
        isUserRejectedError,
        txErrorType,
        txErrorData,
        errorSource,
        parentError,
        isAdditionalValidationPassed,
        additionalValidationType,
        errorDepth,
    };
}
export function isContractError(error, errorType) {
    return error.contractError === errorType;
}
function hasMessage(error) {
    return !!error && typeof error === "object" && typeof error.message === "string";
}
function hasStack(error) {
    return !!error && typeof error === "object" && typeof error.stack === "string";
}
function hasName(error) {
    return !!error && typeof error === "object" && typeof error.name === "string";
}
