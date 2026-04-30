import { getAddress } from "viem";

/**
 * Polygon mainnet Polymarket contracts (builder docs / public contract lists).
 * All addresses are EIP-55 checksummed via `getAddress()`.
 *
 * **Why these matter:** CLOB settlement, approvals, and USDC.e → pUSD wrapping
 * target these contracts. For architecture (EOA vs Safe, wrap-before-buy, Data API
 * lag), read `POLYMARKET_TRADING.md` in this folder.
 */
export const POLYGON_PUSD = getAddress(
	"0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB"
);
/** Polygon bridged USDC (USDC.e) — Polymarket Safe may hold this until wrapped to pUSD. */
export const POLYGON_USDC_E = getAddress(
	"0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174"
);
/** Collateral Onramp — wrap USDC.e → pUSD on the Safe (gasless Relay batch after approve). */
export const POLYGON_COLLATERAL_ONRAMP = getAddress(
	"0x93070a847efef7f70739046a929d47a521f5b8ee"
);
export const POLYGON_CTF = getAddress("0x4d97dcd97ec945f40cf65f87097ace5ea0476045");
/** CTF Exchange V2 — https://docs.polymarket.com/resources/contracts */
export const POLYGON_CTF_EXCHANGE = getAddress("0xE111180000d2663C0091e4f400237545B87B996B");
/** Neg Risk CTF Exchange V2 — https://docs.polymarket.com/resources/contracts */
export const POLYGON_NEG_RISK_CTF_EXCHANGE = getAddress(
	"0xe2222d279d744050d28e00520010520000310F59"
);
export const POLYGON_NEG_RISK_ADAPTER = getAddress("0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296");

/** Minimum allowance treated as "approved" (1e12 = 1M pUSD units @ 6 decimals). */
export const PUSD_ALLOWANCE_THRESHOLD = 1_000_000n * 1_000_000n;
