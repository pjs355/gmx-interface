"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.bigMath = void 0;
exports.bigMath = {
    abs(x) {
        return x < 0n ? -x : x;
    },
    mulDiv(x, y, z) {
        return (x * y) / z;
    },
    max(max, ...rest) {
        return rest.reduce((currentMax, val) => (currentMax < val ? val : currentMax), max);
    },
    min(min, ...rest) {
        return rest.reduce((currentMin, val) => (currentMin > val ? val : currentMin), min);
    },
    avg(...values) {
        let sum = 0n;
        let count = 0n;
        for (const value of values) {
            if (value !== undefined) {
                sum += value;
                count += 1n;
            }
        }
        if (count === 0n) {
            return undefined;
        }
        return sum / count;
    },
    divRound(x, y) {
        return x / y + ((x % y) * 2n > y ? 1n : 0n);
    },
    divRoundUp(x, y) {
        return (x + y - 1n) / y;
    },
};
