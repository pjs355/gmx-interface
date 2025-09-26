"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const viem_1 = require("viem");
const vitest_1 = require("vitest");
const uiFeeReceiver_1 = require("utils/twap/uiFeeReceiver");
(0, vitest_1.describe)("uiFeeReceiver", () => {
    (0, vitest_1.describe)("decodeTwapUiFeeReceiver", () => {
        (0, vitest_1.it)("should return undefined if the address is not a valid address", () => {
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)("0x1234567890123456789012345678901234567890")).toBeUndefined();
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)("0xffffff")).toBeUndefined();
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)("")).toBeUndefined();
        });
        (0, vitest_1.it)("should return undefined if twapId inside is 0000", () => {
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)("0xff00000000000000000000000000000000000001")).toBeUndefined();
        });
        (0, vitest_1.it)("should correctly decode isExpress", () => {
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)("0xff0000000000000000000000000000010a123401")).toEqual({
                isExpress: true,
                twapId: "1234",
                numberOfParts: 10,
            });
        });
        (0, vitest_1.it)("should return the twapId and numberOfParts if the uiFeeReceiver is valid twap", () => {
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)("0xff0000000000000000000000000000000a123401")).toEqual({
                isExpress: false,
                twapId: "1234",
                numberOfParts: 10,
            });
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)("0xff000000000000000000000000000000153a4f01")).toEqual({
                isExpress: false,
                twapId: "3a4f",
                numberOfParts: 21,
            });
        });
    });
    (0, vitest_1.describe)("createTwapUiFeeReceiver", () => {
        (0, vitest_1.it)("should create a valid address", () => {
            (0, vitest_1.expect)((0, viem_1.isAddress)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 10 }))).toBeTruthy();
        });
        (0, vitest_1.it)("should correctly encode numberOfParts", () => {
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 10 }))?.numberOfParts).toEqual(10);
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 21 }))?.numberOfParts).toEqual(21);
        });
        (0, vitest_1.it)("should correctly encode twapId with length 4", () => {
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 10 }))?.twapId).toHaveLength(4);
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 10 }))?.twapId).toHaveLength(4);
            (0, vitest_1.expect)((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 21 }))?.twapId).toHaveLength(4);
        });
        (0, vitest_1.it)("should correctly encode twapId as hex", () => {
            (0, vitest_1.expect)(parseInt((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 10 }))?.twapId ?? "", 16)).not.toBeNaN();
            (0, vitest_1.expect)(parseInt((0, uiFeeReceiver_1.decodeTwapUiFeeReceiver)((0, uiFeeReceiver_1.createTwapUiFeeReceiver)({ numberOfParts: 21 }))?.twapId ?? "", 16)).not.toBeNaN();
        });
    });
});
(0, vitest_1.describe)("setUiFeeReceiverIsExpress", () => {
    (0, vitest_1.it)("should correctly set isExpress for simple uiFeeReceiver", () => {
        (0, vitest_1.expect)((0, uiFeeReceiver_1.setUiFeeReceiverIsExpress)("0xff00000000000000000000000000000000000001", true)).toEqual("0xff00000000000000000000000000000100000001");
        (0, vitest_1.expect)((0, uiFeeReceiver_1.setUiFeeReceiverIsExpress)("0xff00000000000000000000000000000000000001", false)).toEqual("0xff00000000000000000000000000000000000001");
    });
    (0, vitest_1.it)("should correctly set isExpress for twap uiFeeReceiver", () => {
        (0, vitest_1.expect)((0, uiFeeReceiver_1.setUiFeeReceiverIsExpress)("0xff0000000000000000000000000000000a123401", true)).toEqual("0xff0000000000000000000000000000010a123401");
        (0, vitest_1.expect)((0, uiFeeReceiver_1.setUiFeeReceiverIsExpress)("0xff0000000000000000000000000000000a123401", false)).toEqual("0xff0000000000000000000000000000000a123401");
    });
});
