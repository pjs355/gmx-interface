/**
 * Centralized Contract Addresses for LevelUp Predictions
 *
 * Production Base mainnet contracts — same for localhost and deployed app.
 * Local dev differs only in API host (`environment.ts`), not contract addresses.
 */

const LEVELUP_CONTRACTS = {
	CTF_ADDRESS: "0x60Fb7481137012eA9001812f29BB4C269d8912ec",
	USDC_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	EXCHANGE_ADDRESS: "0x3450441E32bE06b89A6177a71514897193a4592e",
	FEE_WRAPPER_ADDRESS: "0x5B4D8130ec877595Dc4dFF043feEe1031Ede60c4",
	FEE_MODULE_ADDRESS: "0x93F750BEf2a0Bf8512c6618a6dc59110B541dBB9",
} as const;

export function getCTFAddress(): string {
	return LEVELUP_CONTRACTS.CTF_ADDRESS;
}
export function getUSDCAddress(): string {
	return LEVELUP_CONTRACTS.USDC_ADDRESS;
}
export function getExchangeAddress(): string {
	return LEVELUP_CONTRACTS.EXCHANGE_ADDRESS;
}
export function getFeeWrapperAddress(): string {
	return LEVELUP_CONTRACTS.FEE_WRAPPER_ADDRESS;
}
export function getFeeModuleAddress(): string {
	return LEVELUP_CONTRACTS.FEE_MODULE_ADDRESS;
}

// =============================================================================
// LIMITLESS (Base mainnet) — not the same as LevelUp `CTF_ADDRESS` on Base.
// =============================================================================
const LIMITLESS_BASE_MAINNET_CTF = "0xC9c98965297Bc527861c898329Ee280632B76e18" as const;
const LIMITLESS_BASE_MAINNET_NEG_RISK_ADAPTER_V3 =
	"0x6151EF8368b6316c1aa3C68453EF083ad31E712D" as const;

export function getLimitlessBaseCtfAddress(): string {
	return LIMITLESS_BASE_MAINNET_CTF;
}

export function getLimitlessBaseNegRiskAdapterAddress(): string {
	return LIMITLESS_BASE_MAINNET_NEG_RISK_ADAPTER_V3;
}

export const CTF_ADDRESS = getCTFAddress();
export const USDC_ADDRESS = getUSDCAddress();
export const EXCHANGE_ADDRESS = getExchangeAddress();
export const FEE_WRAPPER_ADDRESS = getFeeWrapperAddress();
export const FEE_MODULE_ADDRESS = getFeeModuleAddress();
export const COLLATERAL_ADDRESS = USDC_ADDRESS;

export const FEE_RATE_BPS = 200;
export const FEE_RATE_DECIMAL = 0.02;

export const ADDRESSES = {
	CTF_ADDRESS,
	USDC_ADDRESS,
	EXCHANGE_ADDRESS,
	FEE_WRAPPER_ADDRESS,
	FEE_MODULE_ADDRESS,
	COLLATERAL_ADDRESS,
} as const;

export type AddressKeys = keyof typeof ADDRESSES;

export const PRODUCTION_ADDRESSES = LEVELUP_CONTRACTS;

/** BNB Smart Chain mainnet — USDT BEP-20 (18 decimals). */
export const BSC_MAINNET_USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955" as const;

/** Solana mainnet — USDC SPL token mint (6 decimals). */
export const SOLANA_USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const;
