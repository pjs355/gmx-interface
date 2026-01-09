/**
 * Centralized Contract Addresses for LevelUp Predictions
 * 
 * THIS IS THE SINGLE SOURCE OF TRUTH FOR ALL CONTRACT ADDRESSES.
 * Do NOT hardcode addresses anywhere else in the codebase.
 * Import from this file instead.
 * 
 * Environment-aware: Returns testnet or production addresses based on environment.ts
 */

import { isTestnet } from "./environment";

// =============================================================================
// TESTNET ADDRESSES (for localhost development)
// =============================================================================
const TESTNET = {
	CTF_ADDRESS: "0xd51B2c739eE5Fe24Bd7d958C1EaE65572183530f",
	USDC_ADDRESS: "0x333C89b2857FA0EE8d9Bcb7328C8672A45637C65", // TestUSDC
	EXCHANGE_ADDRESS: "0xe29808927bF592e5B3F2068c5D7496C1dfA7dA11",
	FEE_WRAPPER_ADDRESS: "0xf4cb13220544e1f151bCb5367Fb0A87e185f78Df",
	FEE_MODULE_ADDRESS: "0x06d9BF59Bf94Ea43385C7CCAa44F2462649A3983",
} as const;

// =============================================================================
// PRODUCTION ADDRESSES (for live deployed app)
// =============================================================================
const PRODUCTION = {
	CTF_ADDRESS: "0x60Fb7481137012eA9001812f29BB4C269d8912ec",
	USDC_ADDRESS: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
	EXCHANGE_ADDRESS: "0x3450441E32bE06b89A6177a71514897193a4592e",
	FEE_WRAPPER_ADDRESS: "0x5B4D8130ec877595Dc4dFF043feEe1031Ede60c4",
	FEE_MODULE_ADDRESS: "0x93F750BEf2a0Bf8512c6618a6dc59110B541dBB9",
} as const;

// =============================================================================
// ENVIRONMENT-AWARE EXPORTS
// These automatically return the correct address based on current environment
// =============================================================================

function getAddresses() {
	return isTestnet() ? TESTNET : PRODUCTION;
}

// Dynamic getters that respect current environment
export const CTF_ADDRESS = (() => getAddresses().CTF_ADDRESS)();
export const USDC_ADDRESS = (() => getAddresses().USDC_ADDRESS)();
export const EXCHANGE_ADDRESS = (() => getAddresses().EXCHANGE_ADDRESS)();
export const FEE_WRAPPER_ADDRESS = (() => getAddresses().FEE_WRAPPER_ADDRESS)();
export const FEE_MODULE_ADDRESS = (() => getAddresses().FEE_MODULE_ADDRESS)();

// Alias for backward compatibility
export const COLLATERAL_ADDRESS = USDC_ADDRESS;

// =============================================================================
// FEE CONSTANTS (same for both environments)
// =============================================================================
export const FEE_RATE_BPS = 200; // 2% = 200 basis points (for SELL orders)
export const FEE_RATE_DECIMAL = 0.02; // 2% as decimal

// =============================================================================
// BUNDLED EXPORTS
// =============================================================================
export const ADDRESSES = {
	CTF_ADDRESS,
	USDC_ADDRESS,
	EXCHANGE_ADDRESS,
	FEE_WRAPPER_ADDRESS,
	FEE_MODULE_ADDRESS,
	COLLATERAL_ADDRESS,
} as const;

export type AddressKeys = keyof typeof ADDRESSES;

// =============================================================================
// DIRECT ACCESS (for cases where you need to specify environment explicitly)
// =============================================================================
export const TESTNET_ADDRESSES = TESTNET;
export const PRODUCTION_ADDRESSES = PRODUCTION;

/**
 * Get addresses for a specific environment (bypasses auto-detection)
 */
export function getAddressesForEnvironment(env: "testnet" | "production") {
	return env === "testnet" ? TESTNET : PRODUCTION;
}
