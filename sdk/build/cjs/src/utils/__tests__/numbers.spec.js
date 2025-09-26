"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const factors_1 = require("configs/factors");
const ONE_USD = 1000000000000000000000000000000n;
const numbers_1 = require("../numbers");
(0, vitest_1.describe)("numbers utils", () => {
    (0, vitest_1.it)("constants", () => {
        // Just to confirm they exist and have no unexpected changes
        (0, vitest_1.expect)(numbers_1.PRECISION).toBe((0, numbers_1.expandDecimals)(1, 30));
        (0, vitest_1.expect)(numbers_1.BN_ZERO).toBe(0n);
        (0, vitest_1.expect)(numbers_1.BN_ONE).toBe(1n);
        (0, vitest_1.expect)(numbers_1.BN_NEGATIVE_ONE).toBe(-1n);
    });
    (0, vitest_1.describe)("expandDecimals", () => {
        (0, vitest_1.it)("multiplies by 10^decimals", () => {
            (0, vitest_1.expect)((0, numbers_1.expandDecimals)(1, 0)).toBe(1n);
            (0, vitest_1.expect)((0, numbers_1.expandDecimals)(1, 1)).toBe(10n);
            (0, vitest_1.expect)((0, numbers_1.expandDecimals)(1, 2)).toBe(100n);
            (0, vitest_1.expect)((0, numbers_1.expandDecimals)(5, 3)).toBe(5000n);
        });
        (0, vitest_1.it)("handles zero gracefully", () => {
            (0, vitest_1.expect)((0, numbers_1.expandDecimals)(0, 5)).toBe(0n);
        });
    });
    (0, vitest_1.describe)("basisPointsToFloat", () => {
        (0, vitest_1.it)("converts basis points to scaled big int float using PRECISION", () => {
            const result = (0, numbers_1.basisPointsToFloat)(100n);
            (0, vitest_1.expect)(result).toBe((0, numbers_1.expandDecimals)(1, 28));
        });
    });
    (0, vitest_1.describe)("getBasisPoints", () => {
        (0, vitest_1.it)("calculates basis points as (numerator * 10000) / denominator", () => {
            (0, vitest_1.expect)((0, numbers_1.getBasisPoints)(2n, 1n)).toBe(2n * factors_1.BASIS_POINTS_DIVISOR_BIGINT);
            (0, vitest_1.expect)((0, numbers_1.getBasisPoints)(1n, 2n)).toBe(5000n);
        });
        (0, vitest_1.it)("rounds up if remainder != 0 and shouldRoundUp=true", () => {
            (0, vitest_1.expect)((0, numbers_1.getBasisPoints)(7n, 3n, true)).toBe(23334n);
        });
        (0, vitest_1.it)("returns same result if remainder=0, even if shouldRoundUp=true", () => {
            (0, vitest_1.expect)((0, numbers_1.getBasisPoints)(2n, 1n, true)).toBe(20000n);
        });
    });
    (0, vitest_1.describe)("roundUpMagnitudeDivision", () => {
        (0, vitest_1.it)("rounds positive numbers up", () => {
            (0, vitest_1.expect)((0, numbers_1.roundUpMagnitudeDivision)(10n, 3n)).toBe(4n);
            (0, vitest_1.expect)((0, numbers_1.roundUpMagnitudeDivision)(9n, 3n)).toBe(3n);
        });
        (0, vitest_1.it)("rounds negative numbers up in magnitude", () => {
            (0, vitest_1.expect)((0, numbers_1.roundUpMagnitudeDivision)(-10n, 3n)).toBe(-4n);
        });
    });
    (0, vitest_1.describe)("applyFactor", () => {
        (0, vitest_1.it)("applies factor by (value * factor)/PRECISION", () => {
            const value = (0, numbers_1.expandDecimals)(100, 30);
            const factor = 200n;
            (0, vitest_1.expect)((0, numbers_1.applyFactor)(value, factor)).toBe(20000n);
        });
    });
    (0, vitest_1.it)("bigintToNumber", () => {
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(0n, 30)).toEqual(0);
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(1n, 30)).toEqual(1e-30);
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(numbers_1.PRECISION, 30)).toEqual(1);
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(numbers_1.PRECISION * 100n, 30)).toEqual(100);
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(numbers_1.PRECISION * 2n, 30)).toEqual(2);
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(numbers_1.PRECISION / 2n, 30)).toEqual(0.5);
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(1123456n, 6)).toEqual(1.123456);
        (0, vitest_1.expect)((0, numbers_1.bigintToNumber)(-1123456n, 6)).toEqual(-1.123456);
    });
    (0, vitest_1.it)("numberToBigint", () => {
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(0, 30)).toEqual(0n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(1e-30, 30)).toEqual(1n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(-1e-30, 30)).toEqual(-1n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(1, 30)).toEqual(numbers_1.PRECISION);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(100, 30)).toEqual(numbers_1.PRECISION * 100n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(2, 30)).toEqual(numbers_1.PRECISION * 2n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(0.5, 30)).toEqual(numbers_1.PRECISION / 2n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(-0.5, 30)).toEqual(-numbers_1.PRECISION / 2n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(1.1234567, 6)).toEqual(1123456n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(1.12345678, 6)).toEqual(1123456n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(1.123456789, 6)).toEqual(1123456n);
        (0, vitest_1.expect)((0, numbers_1.numberToBigint)(-1.123456789, 6)).toEqual(-1123456n);
    });
});
(0, vitest_1.describe)("toBigNumberWithDecimals", () => {
    (0, vitest_1.it)("should convert string to big number with decimals", () => {
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("0", numbers_1.PRECISION_DECIMALS)).toBe(0n);
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("1", numbers_1.PRECISION_DECIMALS)).toBe(1000000000000000000000000000000n);
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("123.456", numbers_1.PRECISION_DECIMALS)).toBe(123456000000000000000000000000000n);
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("123.456789", numbers_1.PRECISION_DECIMALS)).toBe(123456789000000000000000000000000n);
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("-1.5", numbers_1.PRECISION_DECIMALS)).toBe(-1500000000000000000000000000000n);
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("0.000001", numbers_1.PRECISION_DECIMALS)).toBe(1000000000000000000000000n);
    });
    (0, vitest_1.it)("should handle strings with more decimals than token decimals parameter", () => {
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("0.123456789012345678901234567890", 5)).toBe(12345n);
    });
    (0, vitest_1.it)("should handle cases with different token decimals ", () => {
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("0.1234567890123456789012345678901", 18)).toBe(123456789012345678n);
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("0.12345", 5)).toBe(12345n);
        (0, vitest_1.expect)((0, numbers_1.toBigNumberWithDecimals)("0.1", 1)).toBe(1n);
    });
    (0, vitest_1.it)("should be compatible with formatAmount", () => {
        (0, vitest_1.expect)((0, numbers_1.formatAmount)((0, numbers_1.toBigNumberWithDecimals)("123.456", numbers_1.PRECISION_DECIMALS), factors_1.USD_DECIMALS, 3)).toBe("123.456");
        (0, vitest_1.expect)((0, numbers_1.formatAmount)((0, numbers_1.toBigNumberWithDecimals)("0.789", numbers_1.PRECISION_DECIMALS), factors_1.USD_DECIMALS, 2)).toBe("0.79");
    });
});
(0, vitest_1.describe)("roundWithDecimals", () => {
    (0, vitest_1.it)("should round small numbers correctly", () => {
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("0.0000001", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 0,
        })).toBe(0n);
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("0.5", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 0,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("1", numbers_1.PRECISION_DECIMALS));
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("0.499", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 0,
        })).toBe(0n);
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("1", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 1,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("1", numbers_1.PRECISION_DECIMALS));
    });
    (0, vitest_1.it)("should round numbers at specific decimal places", () => {
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("1.49", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 1,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("1.5", numbers_1.PRECISION_DECIMALS));
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("1.44", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 1,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("1.4", numbers_1.PRECISION_DECIMALS));
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("1.499", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 2,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("1.50", numbers_1.PRECISION_DECIMALS));
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("1.495", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 2,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("1.50", numbers_1.PRECISION_DECIMALS));
    });
    (0, vitest_1.it)("should round large numbers correctly", () => {
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("499.999999", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 5,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("500.00000", numbers_1.PRECISION_DECIMALS));
    });
    (0, vitest_1.it)("should handle complex rounding cases", () => {
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("0.0000000000000000000000000001", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 25,
        })).toBe(0n);
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("0.4999999999999999999999999999", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 25,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("0.5", numbers_1.PRECISION_DECIMALS));
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("123.456789", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 4,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("123.4568", numbers_1.PRECISION_DECIMALS));
    });
    (0, vitest_1.it)("should round numbers with different token decimals correctly", () => {
        const differentTokenDecimals = [18, 5, 1, 22];
        for (const tokenDecimals of differentTokenDecimals) {
            (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("123.456789", tokenDecimals), {
                decimals: tokenDecimals,
                displayDecimals: 4,
            })).toBe((0, numbers_1.toBigNumberWithDecimals)("123.4568", tokenDecimals));
        }
    });
    (0, vitest_1.it)("should handle edge cases", () => {
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)(0n, { decimals: numbers_1.PRECISION_DECIMALS, displayDecimals: 10 })).toBe(0n);
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("-1.5", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 0,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("-2", numbers_1.PRECISION_DECIMALS));
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("-1.4", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 0,
        })).toBe((0, numbers_1.toBigNumberWithDecimals)("-1", numbers_1.PRECISION_DECIMALS));
        (0, vitest_1.expect)((0, numbers_1.roundWithDecimals)((0, numbers_1.toBigNumberWithDecimals)("0.0000001", numbers_1.PRECISION_DECIMALS), {
            decimals: numbers_1.PRECISION_DECIMALS,
            displayDecimals: 5,
        })).toBe(0n);
    });
});
(0, vitest_1.describe)("formatUsdPrice", () => {
    (0, vitest_1.it)("should tolerate undefined", () => {
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)()).toBeUndefined();
    });
    (0, vitest_1.it)("should return NA if negative", () => {
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(-1n)).toBe("NA");
    });
    (0, vitest_1.it)("should calculate correct decimals if displayDecimals not passed", () => {
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD * 10000n)).toBe("$10,000.00");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD * 1000n)).toBe("$1,000.00");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD * 100n)).toBe("$100.000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD * 10n)).toBe("$10.0000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD)).toBe("$1.0000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD / 10n)).toBe("$0.10000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD / 100n)).toBe("$0.010000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD / 1000n)).toBe("$0.0010000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD / 10000n)).toBe("$0.0001000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD / 100000n)).toBe("$0.00001000");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD / 1000000000n)).toBe("$0.000000001");
        (0, vitest_1.expect)((0, numbers_1.formatUsdPrice)(ONE_USD / 10000000000n)).toBe("< $0.000000001");
    });
});
(0, vitest_1.describe)("formatAmountHuman", () => {
    (0, vitest_1.it)("positive", () => {
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD, factors_1.USD_DECIMALS)).toBe("1.0");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD * 1000n, factors_1.USD_DECIMALS)).toBe("1.0k");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD * 1000000n, factors_1.USD_DECIMALS)).toBe("1.0m");
    });
    (0, vitest_1.it)("negative", () => {
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(-1n * ONE_USD, factors_1.USD_DECIMALS)).toBe("-1.0");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(-1n * ONE_USD * 1000n, factors_1.USD_DECIMALS)).toBe("-1.0k");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(-1n * ONE_USD * 1000000n, factors_1.USD_DECIMALS)).toBe("-1.0m");
    });
    (0, vitest_1.it)("should display dollar sign", () => {
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD, factors_1.USD_DECIMALS, true)).toBe("$1.0");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(-1n * ONE_USD, factors_1.USD_DECIMALS, true)).toBe("-$1.0");
    });
    (0, vitest_1.it)("should display decimals", () => {
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD * 1000n, factors_1.USD_DECIMALS, false, 2)).toBe("1.00k");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD * 1500000n, factors_1.USD_DECIMALS, false, 2)).toBe("1.50m");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD * 1000n, factors_1.USD_DECIMALS, false, 0)).toBe("1k");
        (0, vitest_1.expect)((0, numbers_1.formatAmountHuman)(ONE_USD * 1500000n, factors_1.USD_DECIMALS, false, 0)).toBe("2m");
    });
});
(0, vitest_1.describe)("formatBalanceAmount", () => {
    (0, vitest_1.it)("should display balance amount", () => {
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD * 1000n, factors_1.USD_DECIMALS)).toBe("1,000.0000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(0n, factors_1.USD_DECIMALS)).toBe("-");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(0n, factors_1.USD_DECIMALS, undefined, { showZero: true })).toBe("0.0000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD * 1n, factors_1.USD_DECIMALS)).toBe("1.0000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 10n, factors_1.USD_DECIMALS)).toBe("0.10000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 100n, factors_1.USD_DECIMALS)).toBe("0.010000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 1000n, factors_1.USD_DECIMALS)).toBe("0.0010000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 10000n, factors_1.USD_DECIMALS)).toBe("0.00010000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 100000n, factors_1.USD_DECIMALS)).toBe("0.00001000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 1000000n, factors_1.USD_DECIMALS)).toBe("0.00000100");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 10000000n, factors_1.USD_DECIMALS)).toBe("0.00000010");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 100000000n, factors_1.USD_DECIMALS)).toBe("0.00000001");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 1000000000n, factors_1.USD_DECIMALS)).toBe("1.00e-9");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 1000000000000n, factors_1.USD_DECIMALS)).toBe("1.00e-12");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD * -1n, factors_1.USD_DECIMALS)).toBe("-1.0000");
    });
    (0, vitest_1.it)("should display balance amount with symbol", () => {
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD, factors_1.USD_DECIMALS, "USDC")).toBe("1.0000 USDC");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(0n, factors_1.USD_DECIMALS, "USDC", { showZero: true })).toBe("0.0000 USDC");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(0n, factors_1.USD_DECIMALS, "USDC", { showZero: false })).toBe("-");
    });
    (0, vitest_1.it)("should display balance of stable token correctly", () => {
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("1.00");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 10n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.100");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 100n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.0100");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 1000n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.00100");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 10000n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.00010000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 100000n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.00001000");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 1000000n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.00000100");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 10000000n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.00000010");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 100000000n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("0.00000001");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(ONE_USD / 1000000000n, factors_1.USD_DECIMALS, undefined, { isStable: true })).toBe("1.00e-9");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(0n, factors_1.USD_DECIMALS, undefined, { isStable: true, showZero: true })).toBe("0.00");
        (0, vitest_1.expect)((0, numbers_1.formatBalanceAmount)(0n, factors_1.USD_DECIMALS, undefined, { isStable: true, showZero: false })).toBe("-");
    });
});
(0, vitest_1.describe)("formatFactor", () => {
    (0, vitest_1.it)("should format factor", () => {
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(0n)).toBe("0");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1n)).toBe("0.000000000000000000000000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000n)).toBe("0.000000000000000000000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000n)).toBe("0.000000000000000000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000n)).toBe("0.000000000000000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000000n)).toBe("0.000000000000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000000000n)).toBe("0.000000000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000000000000n)).toBe("0.000000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000000000000000n)).toBe("0.000000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000000000000000000n)).toBe("0.000001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000000000000000000000n)).toBe("0.001");
        (0, vitest_1.expect)((0, numbers_1.formatFactor)(1000000000000000000000000000000n)).toBe("1");
    });
});
(0, vitest_1.describe)("formatPercentage", () => {
    (0, vitest_1.it)("should format a basic percentage", () => {
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(100n, { displayDecimals: 4 })).toBe("1.0000%");
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(2500n)).toBe("25.00%");
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(123456n)).toBe("1234.56%");
    });
    (0, vitest_1.it)("should handle undefined input with fallbackToZero", () => {
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(undefined, { fallbackToZero: true })).toBe("0.00%");
    });
    (0, vitest_1.it)("should display signed percentage", () => {
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(100n, { signed: true })).toBe("+1.00%");
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(-100n, { signed: true })).toBe("-1.00%");
    });
    (0, vitest_1.it)("should format with different displayDecimals", () => {
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(100n, { displayDecimals: 2 })).toBe("1.00%");
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)(123456n, { displayDecimals: 1 })).toBe("1234.6%");
    });
    (0, vitest_1.it)("should handle basis points (bps) formatting", () => {
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)((0, numbers_1.toBigNumberWithDecimals)("1", numbers_1.PERCENT_PRECISION_DECIMALS), { bps: false, displayDecimals: 4 })).toBe("1.0000%");
        (0, vitest_1.expect)((0, numbers_1.formatPercentage)((0, numbers_1.toBigNumberWithDecimals)("0.999", numbers_1.PERCENT_PRECISION_DECIMALS), { bps: false, displayDecimals: 5 })).toBe("0.99900%");
    });
});
