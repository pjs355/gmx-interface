"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOracleKeeperRandomIndex = exports.getOracleKeeperNextIndex = exports.getOracleKeeperUrl = void 0;
const random_1 = __importDefault(require("lodash/random"));
const sample_1 = __importDefault(require("lodash/sample"));
const chains_1 = require("./chains");
const ORACLE_KEEPER_URLS = {
    [chains_1.ARBITRUM]: ["https://arbitrum-api.gmxinfra.io", "https://arbitrum-api.gmxinfra2.io"],
    [chains_1.AVALANCHE]: ["https://avalanche-api.gmxinfra.io", "https://avalanche-api.gmxinfra2.io"],
    [chains_1.AVALANCHE_FUJI]: ["https://synthetics-api-avax-fuji-upovm.ondigitalocean.app"],
    [chains_1.BOTANIX]: ["https://botanix-api.gmxinfra.io", "https://botanix-api.gmxinfra2.io"],
    [chains_1.BASE]: [
        "https://precious-youth-production-dcb5.up.railway.app",
        "https://precious-youth-production-dcb5.up.railway.app",
    ],
};
function getOracleKeeperUrl(chainId, index) {
    // Allow overriding the Oracle Keeper base URL at runtime via Vite env
    // When developing locally, set VITE_ORACLE_KEEPER_BASE_URL=http://localhost:3002
    // e.g. through an npm script.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // const localOverride: string | undefined =
    //   (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_ORACLE_KEEPER_BASE_URL) || undefined;
    // if (localOverride) {
    //   return localOverride;
    // }
    const urls = ORACLE_KEEPER_URLS[chainId];
    if (!urls.length) {
        throw new Error(`No oracle keeper urls for chain ${chainId}`);
    }
    return urls[index] || urls[0];
}
exports.getOracleKeeperUrl = getOracleKeeperUrl;
function getOracleKeeperNextIndex(chainId, currentIndex) {
    const urls = ORACLE_KEEPER_URLS[chainId];
    if (!urls.length) {
        throw new Error(`No oracle keeper urls for chain ${chainId}`);
    }
    return urls[currentIndex + 1] ? currentIndex + 1 : 0;
}
exports.getOracleKeeperNextIndex = getOracleKeeperNextIndex;
function getOracleKeeperRandomIndex(chainId, bannedIndexes) {
    const urls = ORACLE_KEEPER_URLS[chainId];
    if (bannedIndexes?.length) {
        const filteredUrls = urls.filter((url, i) => !bannedIndexes.includes(i));
        if (filteredUrls.length) {
            const url = (0, sample_1.default)(filteredUrls);
            if (!url) {
                throw new Error(`No oracle keeper urls for chain ${chainId}`);
            }
            return urls.indexOf(url);
        }
    }
    return (0, random_1.default)(0, urls.length - 1);
}
exports.getOracleKeeperRandomIndex = getOracleKeeperRandomIndex;
