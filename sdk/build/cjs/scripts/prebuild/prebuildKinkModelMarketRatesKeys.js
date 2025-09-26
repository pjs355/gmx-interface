"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.prebuildKinkModelMarketRatesKeys = void 0;
const fs_1 = __importDefault(require("fs"));
const entries_1 = __importDefault(require("lodash/entries"));
const path_1 = require("path");
const hash_1 = require("utils/hash");
const dataStore_1 = require("../../src/configs/dataStore");
const markets_1 = require("../../src/configs/markets");
function prebuildKinkModelMarketRatesKeys(outputDir) {
    const chainMarketKeys = (0, entries_1.default)(markets_1.MARKETS).reduce((chainsAcc, [chainId, markets]) => {
        const chainMarkets = (0, entries_1.default)(markets).reduce((marketsAcc, [marketAddress]) => {
            const marketKeys = (0, hash_1.hashDataMap)({
                optimalUsageFactorLong: [
                    ["bytes32", "address", "bool"],
                    [dataStore_1.OPTIMAL_USAGE_FACTOR, marketAddress, true],
                ],
                optimalUsageFactorShort: [
                    ["bytes32", "address", "bool"],
                    [dataStore_1.OPTIMAL_USAGE_FACTOR, marketAddress, false],
                ],
                baseBorrowingFactorLong: [
                    ["bytes32", "address", "bool"],
                    [dataStore_1.BASE_BORROWING_FACTOR, marketAddress, true],
                ],
                baseBorrowingFactorShort: [
                    ["bytes32", "address", "bool"],
                    [dataStore_1.BASE_BORROWING_FACTOR, marketAddress, false],
                ],
                aboveOptimalUsageBorrowingFactorLong: [
                    ["bytes32", "address", "bool"],
                    [dataStore_1.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR, marketAddress, true],
                ],
                aboveOptimalUsageBorrowingFactorShort: [
                    ["bytes32", "address", "bool"],
                    [dataStore_1.ABOVE_OPTIMAL_USAGE_BORROWING_FACTOR, marketAddress, false],
                ],
            });
            marketsAcc[marketAddress] = marketKeys;
            return marketsAcc;
        }, {});
        chainsAcc[chainId] = chainMarkets;
        return chainsAcc;
    }, {});
    fs_1.default.writeFileSync((0, path_1.resolve)(outputDir, "hashedKinkModelMarketRatesKeys.json"), JSON.stringify(chainMarketKeys, null, 2));
    return chainMarketKeys;
}
exports.prebuildKinkModelMarketRatesKeys = prebuildKinkModelMarketRatesKeys;
