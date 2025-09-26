"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bigNumberify = exports.createRawTradeActionTransformer = void 0;
const viem_1 = require("viem");
const objects_1 = require("./objects");
const orders_1 = require("./orders");
const swapStats_1 = require("./swap/swapStats");
const tokens_1 = require("./tokens");
function createRawTradeActionTransformer(marketsInfoData, wrappedToken, tokensData) {
    return (rawAction) => {
        const orderType = Number(rawAction.orderType);
        if ((0, orders_1.isSwapOrderType)(orderType)) {
            const initialCollateralTokenAddress = (0, viem_1.getAddress)(rawAction.initialCollateralTokenAddress);
            const swapPath = rawAction.swapPath.map((address) => (0, viem_1.getAddress)(address));
            const swapPathOutputAddresses = (0, swapStats_1.getSwapPathOutputAddresses)({
                marketsInfoData,
                swapPath,
                initialCollateralAddress: initialCollateralTokenAddress,
                wrappedNativeTokenAddress: wrappedToken.address,
                shouldUnwrapNativeToken: rawAction.shouldUnwrapNativeToken,
                isIncrease: false,
            });
            const initialCollateralToken = (0, objects_1.getByKey)(tokensData, initialCollateralTokenAddress);
            const targetCollateralToken = (0, objects_1.getByKey)(tokensData, swapPathOutputAddresses.outTokenAddress);
            if (!initialCollateralToken || !targetCollateralToken) {
                return undefined;
            }
            const tradeAction = {
                id: rawAction.id,
                eventName: rawAction.eventName,
                account: rawAction.account,
                swapPath,
                orderType,
                orderKey: rawAction.orderKey,
                initialCollateralTokenAddress: rawAction.initialCollateralTokenAddress,
                initialCollateralDeltaAmount: bigNumberify(rawAction.initialCollateralDeltaAmount),
                minOutputAmount: bigNumberify(rawAction.minOutputAmount),
                executionAmountOut: rawAction.executionAmountOut ? bigNumberify(rawAction.executionAmountOut) : undefined,
                shouldUnwrapNativeToken: rawAction.shouldUnwrapNativeToken,
                targetCollateralToken,
                initialCollateralToken,
                timestamp: rawAction.timestamp,
                transaction: rawAction.transaction,
                reason: rawAction.reason ?? undefined,
                reasonBytes: rawAction.reasonBytes ?? undefined,
                twapParams: rawAction.twapGroupId && rawAction.numberOfParts
                    ? {
                        twapGroupId: rawAction.twapGroupId,
                        numberOfParts: rawAction.numberOfParts,
                    }
                    : undefined,
            };
            return tradeAction;
        }
        else {
            const marketAddress = (0, viem_1.getAddress)(rawAction.marketAddress);
            const marketInfo = (0, objects_1.getByKey)(marketsInfoData, marketAddress);
            const indexToken = marketInfo?.indexToken;
            const initialCollateralTokenAddress = (0, viem_1.getAddress)(rawAction.initialCollateralTokenAddress);
            const swapPath = rawAction.swapPath.map((address) => (0, viem_1.getAddress)(address));
            const swapPathOutputAddresses = (0, swapStats_1.getSwapPathOutputAddresses)({
                marketsInfoData,
                swapPath,
                initialCollateralAddress: initialCollateralTokenAddress,
                wrappedNativeTokenAddress: wrappedToken.address,
                shouldUnwrapNativeToken: rawAction.shouldUnwrapNativeToken,
                isIncrease: (0, orders_1.isIncreaseOrderType)(rawAction.orderType),
            });
            const initialCollateralToken = (0, objects_1.getByKey)(tokensData, initialCollateralTokenAddress);
            const targetCollateralToken = (0, objects_1.getByKey)(tokensData, swapPathOutputAddresses.outTokenAddress);
            if (!marketInfo || !indexToken || !initialCollateralToken || !targetCollateralToken) {
                return undefined;
            }
            const tradeAction = {
                id: rawAction.id,
                eventName: rawAction.eventName,
                account: rawAction.account,
                marketAddress,
                marketInfo,
                indexToken,
                swapPath,
                initialCollateralTokenAddress,
                initialCollateralToken,
                targetCollateralToken,
                initialCollateralDeltaAmount: bigNumberify(rawAction.initialCollateralDeltaAmount),
                sizeDeltaUsd: bigNumberify(rawAction.sizeDeltaUsd),
                triggerPrice: rawAction.triggerPrice
                    ? (0, tokens_1.parseContractPrice)(bigNumberify(rawAction.triggerPrice), indexToken.decimals)
                    : undefined,
                acceptablePrice: (0, tokens_1.parseContractPrice)(bigNumberify(rawAction.acceptablePrice), indexToken.decimals),
                executionPrice: rawAction.executionPrice
                    ? (0, tokens_1.parseContractPrice)(bigNumberify(rawAction.executionPrice), indexToken.decimals)
                    : undefined,
                minOutputAmount: bigNumberify(rawAction.minOutputAmount),
                collateralTokenPriceMax: rawAction.collateralTokenPriceMax
                    ? (0, tokens_1.parseContractPrice)(bigNumberify(rawAction.collateralTokenPriceMax), initialCollateralToken.decimals)
                    : undefined,
                collateralTokenPriceMin: rawAction.collateralTokenPriceMin
                    ? (0, tokens_1.parseContractPrice)(bigNumberify(rawAction.collateralTokenPriceMin), initialCollateralToken.decimals)
                    : undefined,
                indexTokenPriceMin: rawAction.indexTokenPriceMin
                    ? (0, tokens_1.parseContractPrice)(BigInt(rawAction.indexTokenPriceMin), indexToken.decimals)
                    : undefined,
                indexTokenPriceMax: rawAction.indexTokenPriceMax
                    ? (0, tokens_1.parseContractPrice)(BigInt(rawAction.indexTokenPriceMax), indexToken.decimals)
                    : undefined,
                orderType,
                orderKey: rawAction.orderKey,
                isLong: rawAction.isLong,
                pnlUsd: rawAction.pnlUsd ? BigInt(rawAction.pnlUsd) : undefined,
                basePnlUsd: rawAction.basePnlUsd ? BigInt(rawAction.basePnlUsd) : undefined,
                priceImpactDiffUsd: rawAction.priceImpactDiffUsd ? BigInt(rawAction.priceImpactDiffUsd) : undefined,
                priceImpactUsd: rawAction.priceImpactUsd ? BigInt(rawAction.priceImpactUsd) : undefined,
                positionFeeAmount: rawAction.positionFeeAmount ? BigInt(rawAction.positionFeeAmount) : undefined,
                borrowingFeeAmount: rawAction.borrowingFeeAmount ? BigInt(rawAction.borrowingFeeAmount) : undefined,
                fundingFeeAmount: rawAction.fundingFeeAmount ? BigInt(rawAction.fundingFeeAmount) : undefined,
                liquidationFeeAmount: rawAction.liquidationFeeAmount ? BigInt(rawAction.liquidationFeeAmount) : undefined,
                reason: rawAction.reason ?? undefined,
                reasonBytes: rawAction.reasonBytes ?? undefined,
                transaction: rawAction.transaction,
                timestamp: rawAction.timestamp,
                shouldUnwrapNativeToken: rawAction.shouldUnwrapNativeToken,
                twapParams: rawAction.twapGroupId && rawAction.numberOfParts
                    ? {
                        twapGroupId: rawAction.twapGroupId,
                        numberOfParts: rawAction.numberOfParts,
                    }
                    : undefined,
            };
            return tradeAction;
        }
    };
}
exports.createRawTradeActionTransformer = createRawTradeActionTransformer;
function bigNumberify(n) {
    try {
        if (n === undefined)
            throw new Error("n is undefined");
        if (n === null)
            throw new Error("n is null");
        return BigInt(n);
    }
    catch (e) {
        // eslint-disable-next-line no-console
        console.error("bigNumberify error", e);
        return undefined;
    }
}
exports.bigNumberify = bigNumberify;
