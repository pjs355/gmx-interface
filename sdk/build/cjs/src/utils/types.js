"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertDefined = exports.mustNeverExist = void 0;
const mustNeverExist = (x) => {
    throw new Error(`Must never exist: ${x}`);
};
exports.mustNeverExist = mustNeverExist;
const assertDefined = (x) => {
    if (x === undefined)
        throw new Error(`Expected defined value, got undefined`);
    return x;
};
exports.assertDefined = assertDefined;
