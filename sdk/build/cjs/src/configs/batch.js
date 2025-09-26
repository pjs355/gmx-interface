"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BATCH_CONFIGS = void 0;
const chains_1 = require("./chains");
exports.BATCH_CONFIGS = {
    [chains_1.ARBITRUM]: {
        http: {
            batchSize: 0, // disable batches, here batchSize is the number of eth_calls in a batch
            wait: 0, // keep this setting in case batches are enabled in future
        },
        client: {
            multicall: {
                batchSize: 1024 * 1024, // here batchSize is the number of bytes in a multicall
                wait: 0, // zero delay means formation of a batch in the current macro-task, like setTimeout(fn, 0)
            },
        },
    },
    [chains_1.AVALANCHE]: {
        http: {
            batchSize: 0,
            wait: 0,
        },
        client: {
            multicall: {
                batchSize: 1024 * 1024,
                wait: 0,
            },
        },
    },
    [chains_1.BASE]: {
        http: {
            batchSize: 0,
            wait: 0,
        },
        client: {
            multicall: {
                batchSize: 1024 * 1024,
                wait: 0,
            },
        },
    },
    [chains_1.AVALANCHE_FUJI]: {
        http: {
            batchSize: 40,
            wait: 0,
        },
        client: {
            multicall: {
                batchSize: 1024 * 1024,
                wait: 0,
            },
        },
    },
};
