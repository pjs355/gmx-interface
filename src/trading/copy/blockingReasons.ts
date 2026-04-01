const DEFAULT_FALLBACK =
	"This step is blocked. Open Account & venues for details.";

/** Server blockingReason / readiness codes → short UI copy */
const MAP: Record<string, string> = {
	NOT_AUTHENTICATED: "Sign in to continue.",
	MISSING_SIGNER: "Link your Polymarket signer (embedded wallet).",
	SAFE_NOT_DEPLOYED: "Deploy your Polymarket Safe to continue.",
	MISSING_L2_CREDENTIALS: "Complete API credentials setup for Polymarket.",
	MISSING_ALLOWANCES: "Approve Polymarket contracts for trading.",
	UNDERFUNDED_SAFE: "Fund your Polymarket Safe with USDC.e on Polygon.",
	BUILDER_NOT_READY: "Complete builder setup before trading.",
	KALSHI_WALLET: "Connect a Solana wallet for DFlow routing.",
	PROOF_KYC_REQUIRED: "Complete Proof KYC verification on your Profile page.",
	PROOF_WALLET_MISSING: "Link a Solana wallet to your account first.",
	DFLOW_NOT_READY: "Complete DFlow/Proof setup to enable trading.",
	LIMITLESS_NOT_READY: "Complete Limitless onboarding.",
};

export function blockingReasonToMessage(code: string | undefined | null): string {
	if (!code) return DEFAULT_FALLBACK;
	const mapped = MAP[code];
	if (mapped) return mapped;
	if (import.meta.env.DEV) {
		return `${DEFAULT_FALLBACK} (${code})`;
	}
	return DEFAULT_FALLBACK;
}

export function blockingReasonsToMessages(codes: string[] | undefined): string[] {
	if (!codes?.length) return [];
	return [...new Set(codes.map(blockingReasonToMessage))];
}
