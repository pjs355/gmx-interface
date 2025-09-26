"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundBigIntToDecimals = exports.roundToOrder = exports.roundToTwoDecimals = exports.roundUpDivision = exports.parseValue = exports.bigNumberify = exports.toBigNumberWithDecimals = exports.roundWithDecimals = exports.getPlusOrMinusSymbol = exports.padDecimals = exports.limitDecimals = exports.getLimitedDisplay = exports.formatAmountFree = exports.formatArrayAmount = exports.formatKeyAmount = exports.formatAmount = exports.numberWithCommas = exports.formatFactor = exports.formatBalanceAmount = exports.formatAmountHuman = exports.formatPercentageDisplay = exports.formatUsdPrice = exports.formatRatePercentage = exports.formatTokenAmountWithUsd = exports.formatTokenAmount = exports.formatPercentage = exports.formatDeltaUsd = exports.formatUsd = exports.adjustForDecimals = exports.bigintToNumber = exports.trimZeroDecimals = exports.numberToBigint = exports.applyFactor = exports.roundUpMagnitudeDivision = exports.getBasisPoints = exports.basisPointsToFloat = exports.expandDecimals = exports.TRIGGER_PREFIX_BELOW = exports.TRIGGER_PREFIX_ABOVE = exports.PERCENT_PRECISION_DECIMALS = exports.MaxUint256 = exports.BN_NEGATIVE_ONE = exports.BN_ONE = exports.BN_ZERO = exports.PRECISION = exports.PRECISION_DECIMALS = exports.BASIS_POINTS_DECIMALS = exports.BASIS_POINTS_DIVISOR_BIGINT = exports.BASIS_POINTS_DIVISOR = exports.USD_DECIMALS = void 0;
exports.absDiffBps = exports.clamp = exports.calculateDisplayDecimals = exports.deserializeBigIntsInObject = exports.serializeBigIntsInObject = exports.removeTrailingZeros = exports.maxbigint = exports.minBigNumber = void 0;
const viem_1 = require("viem");
const bigmath_1 = require("./bigmath");
exports.USD_DECIMALS = 30;
exports.BASIS_POINTS_DIVISOR = 10000;
exports.BASIS_POINTS_DIVISOR_BIGINT = 10000n;
exports.BASIS_POINTS_DECIMALS = 4;
exports.PRECISION_DECIMALS = 30;
exports.PRECISION = expandDecimals(1, exports.PRECISION_DECIMALS);
exports.BN_ZERO = 0n;
exports.BN_ONE = 1n;
exports.BN_NEGATIVE_ONE = -1n;
exports.MaxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
exports.PERCENT_PRECISION_DECIMALS = exports.PRECISION_DECIMALS - 2;
const MAX_EXCEEDING_THRESHOLD = "1000000000";
const MIN_EXCEEDING_THRESHOLD = "0.01";
exports.TRIGGER_PREFIX_ABOVE = ">";
exports.TRIGGER_PREFIX_BELOW = "<";
function expandDecimals(n, decimals) {
    return BigInt(n) * 10n ** BigInt(decimals);
}
exports.expandDecimals = expandDecimals;
function basisPointsToFloat(basisPoints) {
    return (basisPoints * exports.PRECISION) / exports.BASIS_POINTS_DIVISOR_BIGINT;
}
exports.basisPointsToFloat = basisPointsToFloat;
function getBasisPoints(numerator, denominator, shouldRoundUp = false) {
    const result = (numerator * exports.BASIS_POINTS_DIVISOR_BIGINT) / denominator;
    if (shouldRoundUp) {
        const remainder = (numerator * exports.BASIS_POINTS_DIVISOR_BIGINT) % denominator;
        if (remainder !== 0n) {
            return result < 0n ? result - 1n : result + 1n;
        }
    }
    return result;
}
exports.getBasisPoints = getBasisPoints;
function roundUpMagnitudeDivision(a, b) {
    if (a < 0n) {
        return (a - b + 1n) / b;
    }
    return (a + b - 1n) / b;
}
exports.roundUpMagnitudeDivision = roundUpMagnitudeDivision;
function applyFactor(value, factor) {
    return (value * factor) / exports.PRECISION;
}
exports.applyFactor = applyFactor;
function numberToBigint(value, decimals) {
    const negative = value < 0;
    if (negative)
        value *= -1;
    const int = Math.trunc(value);
    let frac = value - int;
    let res = BigInt(int);
    for (let i = 0; i < decimals; i++) {
        res *= 10n;
        if (frac !== 0) {
            frac *= 10;
            const fracInt = Math.trunc(frac);
            res += BigInt(fracInt);
            frac -= fracInt;
        }
    }
    return negative ? -res : res;
}
exports.numberToBigint = numberToBigint;
const trimZeroDecimals = (amount) => {
    if (parseFloat(amount) === parseInt(amount)) {
        return parseInt(amount).toString();
    }
    return amount;
};
exports.trimZeroDecimals = trimZeroDecimals;
function bigintToNumber(value, decimals) {
    const negative = value < 0;
    if (negative)
        value *= -1n;
    const precision = 10n ** BigInt(decimals);
    const int = value / precision;
    const frac = value % precision;
    const num = parseFloat(`${int}.${frac.toString().padStart(decimals, "0")}`);
    return negative ? -num : num;
}
exports.bigintToNumber = bigintToNumber;
function adjustForDecimals(amount, divDecimals, mulDecimals) {
    return (amount * expandDecimals(1, mulDecimals)) / expandDecimals(1, divDecimals);
}
exports.adjustForDecimals = adjustForDecimals;
function formatUsd(usd, opts = {}) {
    const { fallbackToZero = false, displayDecimals = 2 } = opts;
    if (typeof usd !== "bigint") {
        if (fallbackToZero) {
            usd = 0n;
        }
        else {
            return undefined;
        }
    }
    if (opts.visualMultiplier) {
        usd *= BigInt(opts.visualMultiplier);
    }
    const defaultMinThreshold = displayDecimals > 1 ? "0." + "0".repeat(displayDecimals - 1) + "1" : undefined;
    const exceedingInfo = getLimitedDisplay(usd, exports.USD_DECIMALS, {
        maxThreshold: opts.maxThreshold,
        minThreshold: opts.minThreshold ?? defaultMinThreshold,
    });
    const maybePlus = opts.displayPlus ? "+" : "";
    const sign = usd < 0n ? "-" : maybePlus;
    const symbol = exceedingInfo.symbol ? `${exceedingInfo.symbol} ` : "";
    const displayUsd = (0, exports.formatAmount)(exceedingInfo.value, exports.USD_DECIMALS, displayDecimals, true);
    return `${symbol}${sign}$${displayUsd}`;
}
exports.formatUsd = formatUsd;
function formatDeltaUsd(deltaUsd, percentage, opts = {}) {
    if (typeof deltaUsd !== "bigint") {
        if (opts.fallbackToZero) {
            return `${formatUsd(0n)} (${(0, exports.formatAmount)(0n, 2, 2)}%)`;
        }
        return undefined;
    }
    const sign = getPlusOrMinusSymbol(deltaUsd, { showPlusForZero: opts.showPlusForZero });
    const exceedingInfo = getLimitedDisplay(deltaUsd, exports.USD_DECIMALS);
    const percentageStr = percentage !== undefined ? ` (${sign}${formatPercentage(bigmath_1.bigMath.abs(percentage))})` : "";
    const deltaUsdStr = (0, exports.formatAmount)(exceedingInfo.value, exports.USD_DECIMALS, 2, true);
    const symbol = exceedingInfo.symbol ? `${exceedingInfo.symbol} ` : "";
    return `${symbol}${sign}$${deltaUsdStr}${percentageStr}`;
}
exports.formatDeltaUsd = formatDeltaUsd;
function formatPercentage(percentage, opts = {}) {
    const { fallbackToZero = false, signed = false, displayDecimals = 2, bps = true } = opts;
    if (percentage === undefined) {
        if (fallbackToZero) {
            return `${(0, exports.formatAmount)(0n, exports.PERCENT_PRECISION_DECIMALS, displayDecimals)}%`;
        }
        return undefined;
    }
    const sign = signed ? getPlusOrMinusSymbol(percentage) : "";
    return `${sign}${(0, exports.formatAmount)(bigmath_1.bigMath.abs(percentage), bps ? 2 : exports.PERCENT_PRECISION_DECIMALS, displayDecimals)}%`;
}
exports.formatPercentage = formatPercentage;
function formatTokenAmount(amount, tokenDecimals, symbol, opts = {}) {
    const { showAllSignificant = false, fallbackToZero = false, useCommas = false, minThreshold = "0", maxThreshold, } = opts;
    const displayDecimals = opts.displayDecimals ?? (opts.isStable ? 2 : 4);
    const symbolStr = symbol ? ` ${symbol}` : "";
    if (typeof amount !== "bigint" || !tokenDecimals) {
        if (fallbackToZero) {
            amount = 0n;
            tokenDecimals = displayDecimals;
        }
        else {
            return undefined;
        }
    }
    let amountStr;
    const maybePlus = opts.displayPlus ? "+" : "";
    const sign = amount < 0n ? "-" : maybePlus;
    if (showAllSignificant) {
        amountStr = (0, exports.formatAmountFree)(amount, tokenDecimals, tokenDecimals);
    }
    else {
        const exceedingInfo = getLimitedDisplay(amount, tokenDecimals, { maxThreshold, minThreshold });
        const symbol = exceedingInfo.symbol ? `${exceedingInfo.symbol} ` : "";
        amountStr = `${symbol}${sign}${(0, exports.formatAmount)(exceedingInfo.value, tokenDecimals, displayDecimals, useCommas, undefined)}`;
    }
    return `${amountStr}${symbolStr}`;
}
exports.formatTokenAmount = formatTokenAmount;
function formatTokenAmountWithUsd(tokenAmount, usdAmount, tokenSymbol, tokenDecimals, opts = {}) {
    if (typeof tokenAmount !== "bigint" || typeof usdAmount !== "bigint" || !tokenSymbol || !tokenDecimals) {
        if (!opts.fallbackToZero) {
            return undefined;
        }
    }
    const tokenStr = formatTokenAmount(tokenAmount, tokenDecimals, tokenSymbol, {
        ...opts,
        useCommas: true,
        displayPlus: opts.displayPlus,
    });
    const usdStr = formatUsd(usdAmount, {
        fallbackToZero: opts.fallbackToZero,
        displayPlus: opts.displayPlus,
    });
    return `${tokenStr} (${usdStr})`;
}
exports.formatTokenAmountWithUsd = formatTokenAmountWithUsd;
/**
 *
 * @param opts.signed - Default `true`. whether to display a `+` or `-` sign for all non-zero values.
 */
function formatRatePercentage(rate, opts) {
    if (typeof rate !== "bigint") {
        return "-";
    }
    const signed = opts?.signed ?? true;
    const plurOrMinus = signed ? getPlusOrMinusSymbol(rate) : "";
    const amount = bigmath_1.bigMath.abs(rate * 100n);
    return `${plurOrMinus}${(0, exports.formatAmount)(amount, 30, opts?.displayDecimals ?? 4)}%`;
}
exports.formatRatePercentage = formatRatePercentage;
function formatUsdPrice(price, opts = {}) {
    if (price === undefined) {
        return;
    }
    if (price < 0n) {
        return "NA";
    }
    const decimals = calculateDisplayDecimals(price, undefined, opts.visualMultiplier);
    return formatUsd(price, {
        ...opts,
        displayDecimals: decimals,
    });
}
exports.formatUsdPrice = formatUsdPrice;
function formatPercentageDisplay(percentage, hideThreshold) {
    if (hideThreshold && percentage < hideThreshold) {
        return "";
    }
    return `${percentage}%`;
}
exports.formatPercentageDisplay = formatPercentageDisplay;
function formatAmountHuman(amount, tokenDecimals, showDollar = false, displayDecimals = 1) {
    if (amount === undefined) {
        return "...";
    }
    let n = Number((0, exports.formatAmount)(amount, tokenDecimals));
    // For large numbers, we can neglect the decimals to avoid decimals in cases like 9999999.99999
    if (n >= 1000000) {
        n = Math.round(n);
    }
    const isNegative = n < 0;
    const absN = Math.abs(n);
    const sign = showDollar ? "$" : "";
    if (absN >= 1000000000) {
        return `${isNegative ? "-" : ""}${sign}${(absN / 1000000000).toFixed(displayDecimals)}b`;
    }
    if (absN >= 1000000) {
        return `${isNegative ? "-" : ""}${sign}${(absN / 1000000).toFixed(displayDecimals)}m`;
    }
    if (absN >= 1000) {
        return `${isNegative ? "-" : ""}${sign}${(absN / 1000).toFixed(displayDecimals)}k`;
    }
    return `${isNegative ? "-" : ""}${sign}${absN.toFixed(displayDecimals)}`;
}
exports.formatAmountHuman = formatAmountHuman;
function formatBalanceAmount(amount, tokenDecimals, tokenSymbol, { showZero = false, toExponential = true, isStable = false, } = {}) {
    if (amount === undefined)
        return "-";
    if (amount === 0n) {
        if (showZero === true) {
            if (tokenSymbol) {
                if (isStable) {
                    return `0.00 ${tokenSymbol}`;
                }
                return `0.0000 ${tokenSymbol}`;
            }
            if (isStable) {
                return "0.00";
            }
            return "0.0000";
        }
        return "-";
    }
    const absAmount = bigmath_1.bigMath.abs(amount);
    const absAmountFloat = bigintToNumber(absAmount, tokenDecimals);
    let value = "";
    const baseDecimals = isStable ? 2 : 4;
    if (absAmountFloat >= 1)
        value = (0, exports.formatAmount)(amount, tokenDecimals, baseDecimals, true);
    else if (absAmountFloat >= 0.1)
        value = (0, exports.formatAmount)(amount, tokenDecimals, baseDecimals + 1, true);
    else if (absAmountFloat >= 0.01)
        value = (0, exports.formatAmount)(amount, tokenDecimals, baseDecimals + 2, true);
    else if (absAmountFloat >= 0.001)
        value = (0, exports.formatAmount)(amount, tokenDecimals, baseDecimals + 3, true);
    else if (absAmountFloat >= 1e-8)
        value = (0, exports.formatAmount)(amount, tokenDecimals, 8, true);
    else {
        if (toExponential) {
            value = bigintToNumber(amount, tokenDecimals).toExponential(2);
        }
        else {
            value = bigintToNumber(amount, tokenDecimals).toFixed(8);
        }
    }
    if (tokenSymbol) {
        // Non-breaking space
        return `${value} ${tokenSymbol}`;
    }
    return value;
}
exports.formatBalanceAmount = formatBalanceAmount;
function formatFactor(factor) {
    if (factor == 0n) {
        return "0";
    }
    if (bigmath_1.bigMath.abs(factor) > exports.PRECISION * 1000n) {
        return (factor / exports.PRECISION).toString();
    }
    const trailingZeroes = bigmath_1.bigMath
        .abs(factor)
        .toString()
        .match(/^(.+?)(?<zeroes>0*)$/)?.groups?.zeroes?.length || 0;
    const factorDecimals = 30 - trailingZeroes;
    return (0, exports.formatAmount)(factor, 30, factorDecimals);
}
exports.formatFactor = formatFactor;
function numberWithCommas(x) {
    if (x === undefined || x === null) {
        return "...";
    }
    const parts = x.toString().split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
}
exports.numberWithCommas = numberWithCommas;
const formatAmount = (amount, tokenDecimals, displayDecimals, useCommas, defaultValue, visualMultiplier) => {
    if (defaultValue === undefined || defaultValue === null) {
        defaultValue = "...";
    }
    if (amount === undefined || amount === null || amount === "") {
        return defaultValue;
    }
    if (displayDecimals === undefined) {
        displayDecimals = 4;
    }
    const amountBigInt = roundWithDecimals(BigInt(amount) * BigInt(visualMultiplier ?? 1), {
        displayDecimals,
        decimals: tokenDecimals,
    });
    let amountStr = (0, viem_1.formatUnits)(amountBigInt, tokenDecimals);
    amountStr = (0, exports.limitDecimals)(amountStr, displayDecimals);
    if (displayDecimals !== 0) {
        amountStr = (0, exports.padDecimals)(amountStr, displayDecimals);
    }
    if (useCommas) {
        return numberWithCommas(amountStr);
    }
    return amountStr;
};
exports.formatAmount = formatAmount;
const formatKeyAmount = (map, key, tokenDecimals, displayDecimals, useCommas) => {
    const value = map ? map[key] ?? undefined : undefined;
    if (value === undefined || value === null) {
        return "...";
    }
    return (0, exports.formatAmount)(value, tokenDecimals, displayDecimals, useCommas);
};
exports.formatKeyAmount = formatKeyAmount;
const formatArrayAmount = (arr, index, tokenDecimals, displayDecimals, useCommas) => {
    if (!arr || arr[index] === undefined || arr[index] === null) {
        return "...";
    }
    return (0, exports.formatAmount)(arr[index], tokenDecimals, displayDecimals, useCommas);
};
exports.formatArrayAmount = formatArrayAmount;
const formatAmountFree = (amount, tokenDecimals, displayDecimals) => {
    if (amount === undefined || amount === null) {
        return "...";
    }
    amount = BigInt(amount);
    let amountStr = (0, viem_1.formatUnits)(amount, tokenDecimals);
    amountStr = (0, exports.limitDecimals)(amountStr, displayDecimals);
    return (0, exports.trimZeroDecimals)(amountStr);
};
exports.formatAmountFree = formatAmountFree;
function getLimitedDisplay(amount, tokenDecimals, opts = {}) {
    const { maxThreshold = MAX_EXCEEDING_THRESHOLD, minThreshold = MIN_EXCEEDING_THRESHOLD } = opts;
    const max = maxThreshold === null ? null : expandDecimals(BigInt(maxThreshold), tokenDecimals);
    const min = (0, viem_1.parseUnits)(minThreshold.toString(), tokenDecimals);
    const absAmount = bigmath_1.bigMath.abs(amount);
    if (absAmount == 0n) {
        return {
            symbol: "",
            value: absAmount,
        };
    }
    const symbol = max !== null && absAmount > max ? exports.TRIGGER_PREFIX_ABOVE : absAmount < min ? exports.TRIGGER_PREFIX_BELOW : "";
    const value = max !== null && absAmount > max ? max : absAmount < min ? min : absAmount;
    return {
        symbol,
        value,
    };
}
exports.getLimitedDisplay = getLimitedDisplay;
const limitDecimals = (amount, maxDecimals) => {
    let amountStr = amount.toString();
    if (maxDecimals === undefined) {
        return amountStr;
    }
    if (maxDecimals === 0) {
        return amountStr.split(".")[0];
    }
    const dotIndex = amountStr.indexOf(".");
    if (dotIndex !== -1) {
        let decimals = amountStr.length - dotIndex - 1;
        if (decimals > maxDecimals) {
            amountStr = amountStr.substr(0, amountStr.length - (decimals - maxDecimals));
        }
    }
    return amountStr;
};
exports.limitDecimals = limitDecimals;
const padDecimals = (amount, minDecimals) => {
    let amountStr = amount.toString();
    const dotIndex = amountStr.indexOf(".");
    if (dotIndex !== -1) {
        const decimals = amountStr.length - dotIndex - 1;
        if (decimals < minDecimals) {
            amountStr = amountStr.padEnd(amountStr.length + (minDecimals - decimals), "0");
        }
    }
    else {
        amountStr = amountStr + "." + "0".repeat(minDecimals);
    }
    return amountStr;
};
exports.padDecimals = padDecimals;
function getPlusOrMinusSymbol(value, opts = {}) {
    if (value === undefined) {
        return "";
    }
    const { showPlusForZero = false } = opts;
    return value === 0n ? (showPlusForZero ? "+" : "") : value < 0n ? "-" : "+";
}
exports.getPlusOrMinusSymbol = getPlusOrMinusSymbol;
function roundWithDecimals(value, opts) {
    if (opts.displayDecimals === opts.decimals) {
        return BigInt(value);
    }
    let valueString = value.toString();
    let isNegative = false;
    if (valueString[0] === "-") {
        valueString = valueString.slice(1);
        isNegative = true;
    }
    if (valueString.length < opts.decimals) {
        valueString = valueString.padStart(opts.decimals, "0");
    }
    const mainPart = valueString.slice(0, valueString.length - opts.decimals + opts.displayDecimals);
    const partToRound = valueString.slice(valueString.length - opts.decimals + opts.displayDecimals);
    let mainPartBigInt = BigInt(mainPart);
    let returnValue = mainPartBigInt;
    if (partToRound.length !== 0) {
        if (Number(partToRound[0]) >= 5) {
            mainPartBigInt += 1n;
        }
        returnValue = BigInt(mainPartBigInt.toString() + new Array(partToRound.length).fill("0").join(""));
    }
    return isNegative ? returnValue * -1n : returnValue;
}
exports.roundWithDecimals = roundWithDecimals;
// TODO: Remove this function
function toBigNumberWithDecimals(value, decimals) {
    if (!value)
        return exports.BN_ZERO;
    const parts = value.split(".");
    const integerPart = parts[0];
    const decimalPart = parts.length > 1 ? parts[1] : "";
    const paddingZeros = decimals - decimalPart.length;
    if (paddingZeros >= 0) {
        const result = integerPart + decimalPart + "0".repeat(paddingZeros);
        return BigInt(result);
    }
    else {
        const result = integerPart + decimalPart.substring(0, decimals);
        return BigInt(result);
    }
}
exports.toBigNumberWithDecimals = toBigNumberWithDecimals;
/**
 *
 * @deprecated Use BigInt instead
 */
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
const parseValue = (value, tokenDecimals) => {
    const pValue = parseFloat(value);
    if (isNaN(pValue)) {
        return undefined;
    }
    value = (0, exports.limitDecimals)(value, tokenDecimals);
    const amount = (0, viem_1.parseUnits)(value, tokenDecimals);
    return bigNumberify(amount);
};
exports.parseValue = parseValue;
function roundUpDivision(a, b) {
    return (a + b - 1n) / b;
}
exports.roundUpDivision = roundUpDivision;
function roundToTwoDecimals(n) {
    return Math.round(n * 100) / 100;
}
exports.roundToTwoDecimals = roundToTwoDecimals;
function roundToOrder(n, significantDigits = 1) {
    const decimals = Math.max(n.toString().length - significantDigits, 0);
    return (n / expandDecimals(1, decimals)) * expandDecimals(1, decimals);
}
exports.roundToOrder = roundToOrder;
function roundBigIntToDecimals(value, tokenDecimals, roundToDecimals) {
    const excessDecimals = tokenDecimals - roundToDecimals;
    const divisor = BigInt(10 ** excessDecimals);
    const scaledValue = value / divisor;
    const remainder = scaledValue % 10n;
    const roundedValue = remainder >= 5n ? scaledValue + 10n - remainder : scaledValue - remainder;
    return roundedValue * divisor;
}
exports.roundBigIntToDecimals = roundBigIntToDecimals;
function minBigNumber(...args) {
    if (!args.length)
        return undefined;
    return args.reduce((acc, num) => (num < acc ? num : acc), args[0]);
}
exports.minBigNumber = minBigNumber;
function maxbigint(...args) {
    if (!args.length)
        return undefined;
    return args.reduce((acc, num) => (num > acc ? num : acc), args[0]);
}
exports.maxbigint = maxbigint;
function removeTrailingZeros(amount) {
    const amountWithoutZeros = Number(amount);
    if (!amountWithoutZeros)
        return amount;
    return amountWithoutZeros;
}
exports.removeTrailingZeros = removeTrailingZeros;
function serializeBigIntsInObject(obj) {
    const result = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
        const value = obj[key];
        if (typeof value === "bigint") {
            result[key] = { type: "bigint", value: String(value) };
        }
        else if (value && typeof value === "object") {
            result[key] = serializeBigIntsInObject(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
exports.serializeBigIntsInObject = serializeBigIntsInObject;
function deserializeBigIntsInObject(obj) {
    const result = Array.isArray(obj) ? [] : {};
    for (const key in obj) {
        const value = obj[key];
        if (typeof value === "object" &&
            value !== null &&
            (("type" in value && value.type === "bigint") || ("_type" in value && value._type === "BigNumber"))) {
            if ("value" in value && typeof value.value === "string") {
                result[key] = BigInt(value.value);
            }
            else if ("hex" in value && typeof value.hex === "string") {
                if (value.hex.startsWith("-")) {
                    result[key] = BigInt(value.hex.slice(1)) * -1n;
                }
                else {
                    result[key] = BigInt(value.hex);
                }
            }
        }
        else if (value && typeof value === "object") {
            result[key] = deserializeBigIntsInObject(value);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
exports.deserializeBigIntsInObject = deserializeBigIntsInObject;
function calculateDisplayDecimals(price, decimals = exports.USD_DECIMALS, visualMultiplier = 1, isStable = false) {
    if (price === undefined || price === 0n)
        return 2;
    const priceNumber = bigintToNumber(bigmath_1.bigMath.abs(price) * BigInt(visualMultiplier), decimals);
    if (isNaN(priceNumber))
        return 2;
    if (isStable) {
        if (priceNumber >= 0.1)
            return 2;
        if (priceNumber >= 0.01)
            return 3;
        if (priceNumber >= 0.001)
            return 4;
        if (priceNumber >= 0.0001)
            return 5;
        if (priceNumber >= 0.00001)
            return 6;
        if (priceNumber >= 0.000001)
            return 7;
        if (priceNumber >= 0.0000001)
            return 8;
        if (priceNumber >= 0.00000001)
            return 9;
    }
    else {
        if (priceNumber >= 1000)
            return 2;
        if (priceNumber >= 100)
            return 3;
        if (priceNumber >= 1)
            return 4;
        if (priceNumber >= 0.1)
            return 5;
        if (priceNumber >= 0.01)
            return 6;
        if (priceNumber >= 0.0001)
            return 7;
        if (priceNumber >= 0.00001)
            return 8;
    }
    return 9;
}
exports.calculateDisplayDecimals = calculateDisplayDecimals;
function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
exports.clamp = clamp;
function absDiffBps(value, base) {
    if ((value === 0n && base !== 0n) || (value !== 0n && base === 0n)) {
        return exports.BASIS_POINTS_DIVISOR_BIGINT;
    }
    if (value === 0n && base === 0n) {
        return 0n;
    }
    return bigmath_1.bigMath.mulDiv(bigmath_1.bigMath.abs(value - base), exports.BASIS_POINTS_DIVISOR_BIGINT, base);
}
exports.absDiffBps = absDiffBps;
