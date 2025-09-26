"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIMEZONE_OFFSET_SEC = exports.sleep = void 0;
const sleep = (ms, abortSignal) => new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    if (abortSignal) {
        abortSignal.addEventListener("abort", () => {
            clearTimeout(timeout);
            resolve(undefined);
        });
    }
});
exports.sleep = sleep;
exports.TIMEZONE_OFFSET_SEC = -new Date().getTimezoneOffset() * 60;
