import type { Addresses } from "@predictdotfun/sdk";

/** Mirrors `OrderBuilder.getExchangeIdentifier` for static address lookup. */
export function predictExchangeKey(
	isNegRisk: boolean,
	isYieldBearing: boolean
): keyof Addresses {
	if (isNegRisk) {
		return isYieldBearing ? "YIELD_BEARING_NEG_RISK_CTF_EXCHANGE" : "NEG_RISK_CTF_EXCHANGE";
	}
	return isYieldBearing ? "YIELD_BEARING_CTF_EXCHANGE" : "CTF_EXCHANGE";
}

/** Mirrors `OrderBuilder.getCtfIdentifier`. */
export function predictCtfKey(
	isNegRisk: boolean,
	isYieldBearing: boolean
): keyof Addresses {
	if (isYieldBearing) {
		return isNegRisk ? "YIELD_BEARING_NEG_RISK_CONDITIONAL_TOKENS" : "YIELD_BEARING_CONDITIONAL_TOKENS";
	}
	return isNegRisk ? "NEG_RISK_CONDITIONAL_TOKENS" : "CONDITIONAL_TOKENS";
}

/** `setNegRiskAdapterApproval` targets this operator on the CTF (`isApprovedForAll`). */
export function predictNegRiskAdapterKey(isYieldBearing: boolean): keyof Addresses {
	return isYieldBearing ? "YIELD_BEARING_NEG_RISK_ADAPTER" : "NEG_RISK_ADAPTER";
}
