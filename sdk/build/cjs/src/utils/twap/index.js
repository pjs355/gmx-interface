"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.makeTwapValidFromTimeGetter = exports.getTwapOrderKey = exports.changeTwapNumberOfPartsValue = exports.getTwapValidFromTime = exports.getTwapDurationInSeconds = exports.getIsValidTwapParams = void 0;
const twap_1 = require("configs/twap");
const orders_1 = require("utils/orders");
function getIsValidTwapParams(duration, numberOfParts) {
    return (duration.hours >= 0 &&
        duration.minutes >= 0 &&
        numberOfParts >= twap_1.MIN_TWAP_NUMBER_OF_PARTS &&
        numberOfParts <= twap_1.MAX_TWAP_NUMBER_OF_PARTS);
}
exports.getIsValidTwapParams = getIsValidTwapParams;
function getTwapDurationInSeconds(duration) {
    return duration.hours * 60 * 60 + duration.minutes * 60;
}
exports.getTwapDurationInSeconds = getTwapDurationInSeconds;
function getTwapValidFromTime(duration, numberOfParts, partIndex) {
    const durationMinutes = duration.hours * 60 + duration.minutes;
    const durationMs = durationMinutes * 60;
    const startTime = Math.ceil(Date.now() / 1000);
    return BigInt(Math.floor(startTime + (durationMs / (numberOfParts - 1)) * partIndex));
}
exports.getTwapValidFromTime = getTwapValidFromTime;
function changeTwapNumberOfPartsValue(value) {
    if (value < twap_1.MIN_TWAP_NUMBER_OF_PARTS) {
        return twap_1.MIN_TWAP_NUMBER_OF_PARTS;
    }
    if (value > twap_1.MAX_TWAP_NUMBER_OF_PARTS) {
        return twap_1.MAX_TWAP_NUMBER_OF_PARTS;
    }
    if (isNaN(value)) {
        return twap_1.DEFAULT_TWAP_NUMBER_OF_PARTS;
    }
    return value;
}
exports.changeTwapNumberOfPartsValue = changeTwapNumberOfPartsValue;
function getTwapOrderKey({ twapId, orderType, pool, isLong, collateralTokenSymbol, swapPath, account, initialCollateralToken, }) {
    if ((0, orders_1.isSwapOrderType)(orderType)) {
        return `${twapId}-${swapPath.join("-")}-${account}-${initialCollateralToken}`;
    }
    const type = isLong ? "long" : "short";
    return `${twapId}-${type}-${pool}-${collateralTokenSymbol}`;
}
exports.getTwapOrderKey = getTwapOrderKey;
function makeTwapValidFromTimeGetter(duration, numberOfParts) {
    const durationMinutes = duration.hours * 60 + duration.minutes;
    const durationMs = durationMinutes * 60;
    const startTime = Math.ceil(Date.now() / 1000);
    return (part) => {
        return BigInt(Math.floor(startTime + (durationMs / (numberOfParts - 1)) * part));
    };
}
exports.makeTwapValidFromTimeGetter = makeTwapValidFromTimeGetter;
