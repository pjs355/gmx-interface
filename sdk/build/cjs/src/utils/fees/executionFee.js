"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.estimateExecuteShiftGasLimit = exports.estimateExecuteWithdrawalGasLimit = exports.estimateExecuteGlvWithdrawalGasLimit = exports.estimateExecuteGlvDepositGasLimit = exports.estimateExecuteDepositGasLimit = exports.estimateExecuteSwapOrderGasLimit = exports.estimateExecuteDecreaseOrderGasLimit = exports.estimateExecuteIncreaseOrderGasLimit = exports.estimateBatchMinGasPaymentTokenAmount = exports.estimateBatchGasLimit = exports.approximateL1GasBuffer = exports.estimateRelayerGasLimit = exports.getExecutionFee = void 0;
const chains_1 = require("configs/chains");
const factors_1 = require("configs/factors");
const tokens_1 = require("configs/tokens");
const orders_1 = require("types/orders");
const bigmath_1 = require("utils/bigmath");
const numbers_1 = require("utils/numbers");
const tokens_2 = require("utils/tokens");
function getExecutionFee(chainId, gasLimits, 
// TODO optimize we only need the native token data
tokensData, estimatedGasLimit, gasPrice, oraclePriceCount, numberOfParts) {
    const nativeToken = (0, tokens_2.getTokenData)(tokensData, tokens_1.NATIVE_TOKEN_ADDRESS);
    if (!nativeToken)
        return undefined;
    // #region adjustGasLimitForEstimate. Copy from contract.
    let baseGasLimit = gasLimits.estimatedGasFeeBaseAmount;
    baseGasLimit += gasLimits.estimatedGasFeePerOraclePrice * oraclePriceCount;
    const multiplierFactor = gasLimits.estimatedFeeMultiplierFactor;
    const gasLimit = baseGasLimit + (0, numbers_1.applyFactor)(estimatedGasLimit, multiplierFactor);
    // #endregion
    // avoid botanix gas spikes when chain is not actively used
    const minGasCostUsd = chains_1.MIN_EXECUTION_FEE_USD[chainId];
    const minGasCost = (0, tokens_2.convertToTokenAmount)(minGasCostUsd, nativeToken.decimals, nativeToken.prices.minPrice);
    let feeTokenAmountPerExecution = gasLimit * gasPrice;
    if (minGasCost) {
        feeTokenAmountPerExecution = bigmath_1.bigMath.max(feeTokenAmountPerExecution, minGasCost);
    }
    const feeTokenAmount = feeTokenAmountPerExecution * BigInt(numberOfParts ?? 1);
    const feeUsd = (0, tokens_2.convertToUsd)(feeTokenAmount, nativeToken.decimals, nativeToken.prices.minPrice);
    const isFeeHigh = feeUsd > (0, numbers_1.expandDecimals)((0, chains_1.getHighExecutionFee)(chainId), factors_1.USD_DECIMALS);
    const isFeeVeryHigh = feeUsd > (0, numbers_1.expandDecimals)((0, chains_1.getExcessiveExecutionFee)(chainId), factors_1.USD_DECIMALS);
    return {
        feeUsd,
        feeTokenAmount,
        feeToken: nativeToken,
        gasLimit,
        isFeeHigh,
        isFeeVeryHigh,
    };
}
exports.getExecutionFee = getExecutionFee;
function estimateRelayerGasLimit({ gasLimits, tokenPermitsCount, feeSwapsCount, feeExternalCallsGasLimit, oraclePriceCount, transactionPayloadGasLimit, l1GasLimit, }) {
    const feeSwapsGasLimit = gasLimits.singleSwap * BigInt(feeSwapsCount);
    const oraclePricesGasLimit = gasLimits.estimatedGasFeePerOraclePrice * BigInt(oraclePriceCount);
    const tokenPermitsGasLimit = gasLimits.tokenPermitGasLimit * BigInt(tokenPermitsCount);
    const relayParamsGasLimit = feeSwapsGasLimit + oraclePricesGasLimit + tokenPermitsGasLimit + feeExternalCallsGasLimit;
    return relayParamsGasLimit + transactionPayloadGasLimit + l1GasLimit;
}
exports.estimateRelayerGasLimit = estimateRelayerGasLimit;
function approximateL1GasBuffer({ l1Reference, sizeOfData, }) {
    const evaluated = Math.round((Number(l1Reference.gasLimit) * Math.log(Number(sizeOfData))) / Math.log(Number(l1Reference.sizeOfData)));
    const l1GasLimit = Math.abs(evaluated) < Infinity ? BigInt(evaluated) : l1Reference.gasLimit;
    return l1GasLimit;
}
exports.approximateL1GasBuffer = approximateL1GasBuffer;
function estimateBatchGasLimit({ gasLimits, createOrdersCount, updateOrdersCount, cancelOrdersCount, externalCallsGasLimit, }) {
    const createOrdersGasLimit = gasLimits.createOrderGasLimit * BigInt(createOrdersCount);
    const updateOrdersGasLimit = gasLimits.updateOrderGasLimit * BigInt(updateOrdersCount);
    const cancelOrdersGasLimit = gasLimits.cancelOrderGasLimit * BigInt(cancelOrdersCount);
    return createOrdersGasLimit + updateOrdersGasLimit + cancelOrdersGasLimit + externalCallsGasLimit;
}
exports.estimateBatchGasLimit = estimateBatchGasLimit;
function estimateBatchMinGasPaymentTokenAmount({ chainId, gasPaymentToken, relayFeeToken, gasPrice, gasLimits, l1Reference, tokensData, createOrdersCount = 1, updateOrdersCount = 0, cancelOrdersCount = 0, executionFeeAmount, }) {
    const batchGasLimit = estimateBatchGasLimit({
        gasLimits,
        createOrdersCount,
        updateOrdersCount,
        cancelOrdersCount,
        externalCallsGasLimit: 0n,
    });
    const relayerGasLimit = estimateRelayerGasLimit({
        gasLimits,
        tokenPermitsCount: 0,
        feeSwapsCount: relayFeeToken.address === gasPaymentToken.address ? 0 : 1,
        feeExternalCallsGasLimit: 0n,
        oraclePriceCount: 2,
        transactionPayloadGasLimit: batchGasLimit,
        l1GasLimit: l1Reference?.gasLimit ?? 0n,
    });
    const gasLimit = relayerGasLimit + batchGasLimit;
    const feeAmount = gasLimit * gasPrice;
    const executionGasLimit = estimateExecuteIncreaseOrderGasLimit(gasLimits, {
        swapsCount: 2,
        callbackGasLimit: 0n,
    });
    const executionFee = executionFeeAmount ??
        getExecutionFee(chainId, gasLimits, tokensData, executionGasLimit, gasPrice, 4n)?.feeTokenAmount;
    let totalFee = feeAmount + (executionFee ?? 0n);
    const minGasPaymentTokenBalance = (0, tokens_2.convertBetweenTokens)(totalFee, relayFeeToken, gasPaymentToken, false);
    return minGasPaymentTokenBalance;
}
exports.estimateBatchMinGasPaymentTokenAmount = estimateBatchMinGasPaymentTokenAmount;
/**
 * Copy from contract: `estimateExecuteIncreaseOrderGasLimit`
 */
function estimateExecuteIncreaseOrderGasLimit(gasLimits, order) {
    const gasPerSwap = gasLimits.singleSwap;
    const swapsCount = BigInt(order.swapsCount ?? 0);
    return gasLimits.increaseOrder + gasPerSwap * swapsCount + (order.callbackGasLimit ?? 0n);
}
exports.estimateExecuteIncreaseOrderGasLimit = estimateExecuteIncreaseOrderGasLimit;
/**
 * Copy from contract: `estimateExecuteDecreaseOrderGasLimit`
 */
function estimateExecuteDecreaseOrderGasLimit(gasLimits, order) {
    const gasPerSwap = gasLimits.singleSwap;
    let swapsCount = BigInt(order.swapsCount);
    if (order.decreaseSwapType !== orders_1.DecreasePositionSwapType.NoSwap) {
        swapsCount += 1n;
    }
    return gasLimits.decreaseOrder + gasPerSwap * swapsCount + (order.callbackGasLimit ?? 0n);
}
exports.estimateExecuteDecreaseOrderGasLimit = estimateExecuteDecreaseOrderGasLimit;
function estimateExecuteSwapOrderGasLimit(gasLimits, order) {
    const gasPerSwap = gasLimits.singleSwap;
    const swapsCount = BigInt(order.swapsCount);
    return gasLimits.swapOrder + gasPerSwap * swapsCount + (order.callbackGasLimit ?? 0n);
}
exports.estimateExecuteSwapOrderGasLimit = estimateExecuteSwapOrderGasLimit;
/**
 * Only GM deposits. Do not confuse with increase with zero delta size.
 *
 * Copy from contract: `estimateExecuteDepositGasLimit`
 */
function estimateExecuteDepositGasLimit(gasLimits, deposit) {
    const gasPerSwap = gasLimits.singleSwap;
    const swapsCount = BigInt((deposit.longTokenSwapsCount ?? 0) + (deposit.shortTokenSwapsCount ?? 0));
    const gasForSwaps = swapsCount * gasPerSwap;
    return gasLimits.depositToken + (deposit.callbackGasLimit ?? 0n) + gasForSwaps;
}
exports.estimateExecuteDepositGasLimit = estimateExecuteDepositGasLimit;
function estimateExecuteGlvDepositGasLimit(gasLimits, { marketsCount, isMarketTokenDeposit, }) {
    const gasPerGlvPerMarket = gasLimits.glvPerMarketGasLimit;
    const gasForGlvMarkets = gasPerGlvPerMarket * marketsCount;
    const glvDepositGasLimit = gasLimits.glvDepositGasLimit;
    const gasLimit = glvDepositGasLimit + gasForGlvMarkets;
    if (isMarketTokenDeposit) {
        return gasLimit;
    }
    return gasLimit + gasLimits.depositToken;
}
exports.estimateExecuteGlvDepositGasLimit = estimateExecuteGlvDepositGasLimit;
function estimateExecuteGlvWithdrawalGasLimit(gasLimits, { marketsCount, }) {
    const gasPerGlvPerMarket = gasLimits.glvPerMarketGasLimit;
    const gasForGlvMarkets = gasPerGlvPerMarket * marketsCount;
    const glvWithdrawalGasLimit = gasLimits.glvWithdrawalGasLimit;
    const gasLimit = glvWithdrawalGasLimit + gasForGlvMarkets;
    return gasLimit + gasLimits.withdrawalMultiToken;
}
exports.estimateExecuteGlvWithdrawalGasLimit = estimateExecuteGlvWithdrawalGasLimit;
/**
 * Only GM withdrawals. Do not confuse with decrease with zero delta size.
 *
 * Copy from contract: `estimateExecuteWithdrawalGasLimit`
 */
function estimateExecuteWithdrawalGasLimit(gasLimits, withdrawal) {
    // Swap is not used but supported in the contract.
    // const gasPerSwap = gasLimits.singleSwap;
    // const swapsCount = 0n;
    // const gasForSwaps = swapsCount * gasPerSwap;
    return gasLimits.withdrawalMultiToken + (withdrawal.callbackGasLimit ?? 0n);
}
exports.estimateExecuteWithdrawalGasLimit = estimateExecuteWithdrawalGasLimit;
/**
 * Copy from contract: `estimateExecuteShiftGasLimit`
 */
function estimateExecuteShiftGasLimit(gasLimits, shift) {
    return gasLimits.shift + (shift.callbackGasLimit ?? 0n);
}
exports.estimateExecuteShiftGasLimit = estimateExecuteShiftGasLimit;
