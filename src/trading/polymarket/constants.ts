import { getAddress } from "viem";

/**
 * Polygon mainnet Polymarket contracts (from Polymarket builder docs / example repo).
 * All addresses are EIP-55 checksummed via getAddress().
 */
export const POLYGON_USDC_E = getAddress("0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174");
export const POLYGON_CTF = getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
export const POLYGON_CTF_EXCHANGE = getAddress("0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E");
export const POLYGON_NEG_RISK_CTF_EXCHANGE = getAddress("0xC5d563A36AE78145C45a50134d48A1215220f80a");
export const POLYGON_NEG_RISK_ADAPTER = getAddress("0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296");

/** Minimum allowance treated as "approved" (1e12 = 1M USDC.e units @ 6 decimals). */
export const USDC_E_ALLOWANCE_THRESHOLD = 1_000_000n * 1_000_000n;
