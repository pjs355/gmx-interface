import random from "lodash/random";
import sample from "lodash/sample";
import { ARBITRUM, AVALANCHE, AVALANCHE_FUJI, BOTANIX, BASE } from "./chains";
const ORACLE_KEEPER_URLS = {
    [ARBITRUM]: ["https://arbitrum-api.gmxinfra.io", "https://arbitrum-api.gmxinfra2.io"],
    [AVALANCHE]: ["https://avalanche-api.gmxinfra.io", "https://avalanche-api.gmxinfra2.io"],
    [AVALANCHE_FUJI]: ["https://synthetics-api-avax-fuji-upovm.ondigitalocean.app"],
    [BOTANIX]: ["https://botanix-api.gmxinfra.io", "https://botanix-api.gmxinfra2.io"],
    [BASE]: [
        "https://precious-youth-production-dcb5.up.railway.app",
        "https://precious-youth-production-dcb5.up.railway.app",
    ],
};
export function getOracleKeeperUrl(chainId, index) {
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
export function getOracleKeeperNextIndex(chainId, currentIndex) {
    const urls = ORACLE_KEEPER_URLS[chainId];
    if (!urls.length) {
        throw new Error(`No oracle keeper urls for chain ${chainId}`);
    }
    return urls[currentIndex + 1] ? currentIndex + 1 : 0;
}
export function getOracleKeeperRandomIndex(chainId, bannedIndexes) {
    const urls = ORACLE_KEEPER_URLS[chainId];
    if (bannedIndexes?.length) {
        const filteredUrls = urls.filter((url, i) => !bannedIndexes.includes(i));
        if (filteredUrls.length) {
            const url = sample(filteredUrls);
            if (!url) {
                throw new Error(`No oracle keeper urls for chain ${chainId}`);
            }
            return urls.indexOf(url);
        }
    }
    return random(0, urls.length - 1);
}
