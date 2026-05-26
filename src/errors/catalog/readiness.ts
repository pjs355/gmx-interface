import { defineError } from "../types";

/** Shown when a server readiness code is unknown (prod). */
export const READINESS_BLOCKED_FALLBACK = defineError(
	"READINESS_BLOCKED_FALLBACK",
	"This step is blocked. Open Account & venues for details.",
);

/**
 * Server `blockingReasons` / readiness codes → short UI copy.
 * Keys align with `domain/accounts/adapters/*` and SOR routing eligibility.
 */
export const READINESS_BLOCKING_MESSAGES: Record<string, string> = {
	// ── Legacy / alternate code shapes ──
	NOT_AUTHENTICATED: "Sign in to continue.",
	MISSING_SIGNER: "Link your Polymarket signer (embedded wallet).",
	SAFE_NOT_DEPLOYED: "Deploy your Polymarket Safe to continue.",
	MISSING_L2_CREDENTIALS: "Complete API credentials setup for Polymarket.",
	MISSING_ALLOWANCES: "Approve Polymarket contracts for trading.",
	UNDERFUNDED_SAFE: "Fund your Polymarket Safe with pUSD on Polygon.",
	BUILDER_NOT_READY: "Complete builder setup before trading.",
	KALSHI_WALLET: "Connect a Solana wallet for Kalshi routing.",
	PROOF_KYC_REQUIRED: "Complete Proof KYC verification on your Profile page.",
	PROOF_WALLET_MISSING: "Link a Solana wallet to your account first.",
	DFLOW_NOT_READY: "Complete Kalshi/Proof setup to enable trading.",
	LIMITLESS_NOT_READY: "Complete Limitless onboarding.",

	// ── Polymarket (account adapter) ──
	"polymarket:not_connected": "Connect Polymarket on Account & venues.",
	"polymarket:missing_signer_wallet": "Link your Polymarket signer (embedded wallet).",
	"polymarket:api_credentials_not_ready": "Complete Polymarket API credentials setup.",
	"polymarket:funder_unresolved": "Finish Polymarket deposit wallet setup.",
	"polymarket:trading_not_enabled": "Enable Polymarket trading on Account & venues.",
	"polymarket:execution_fields_unresolved": "Finish Polymarket account setup before trading.",
	"polymarket:usdc_approval_required": "Approve USDC for Polymarket trading.",
	"polymarket:ctf_approval_required": "Approve outcome tokens for Polymarket trading.",
	"polymarket:stale_cache_provisioning":
		"Polymarket account is still provisioning. Refresh in a moment.",

	// ── Predict.fun ──
	"predict_fun:not_connected": "Connect Predict.fun on Account & venues.",
	"predict_fun:maker_or_signer_unresolved": "Link your Predict.fun trading wallet.",
	"predict_fun:jwt_missing_or_expired": "Sign in to Predict.fun again.",
	"predict_fun:funding_destination_unresolved": "Finish Predict.fun wallet setup on BNB Chain.",
	"predict_fun:trading_not_enabled": "Enable Predict.fun trading on Account & venues.",
	"predict_fun:approval_required": "Approve Predict.fun contracts for trading.",

	// ── Limitless ──
	"limitless:not_connected": "Connect Limitless on Account & venues.",
	"limitless:maker_or_signer_unresolved": "Link your Limitless trading wallet on Base.",
	"limitless:api_key_missing": "Complete Limitless API setup.",
	"limitless:owner_id_missing": "Finish Limitless account registration.",
	"limitless:funding_destination_unresolved": "Finish Limitless wallet setup on Base.",
	"limitless:trading_not_enabled": "Enable Limitless trading on Account & venues.",
	"limitless:approval_required": "Approve USDC for Limitless trading.",

	// ── DFlow / Proof ──
	"dflow_proof:not_connected": "Connect Kalshi/Proof on Account & venues.",
	"dflow_proof:solana_wallet_unbound": "Link a Solana wallet to your account first.",
	"dflow_proof:identity_or_ownership_incomplete":
		"Complete Proof KYC verification on your Profile page.",
	"dflow_proof:funding_destination_unresolved": "Finish Kalshi wallet setup on Solana.",
	"dflow_proof:no_solana_destination": "Link a Solana wallet for Kalshi routing.",

	// ── Routing eligibility fallbacks (account-overview / SOR) ──
	"routing:polymarket_not_ready": "Complete Polymarket setup before trading.",
	"routing:limitless_not_ready": "Complete Limitless setup before trading.",
	"routing:predict_fun_not_ready": "Complete Predict.fun setup before trading.",
	"routing:test": "Venue routing is not ready (test).",
	"routing:test_kalshi": "Kalshi routing is not ready (test).",
	"setup:pending": "Account setup is still in progress.",
	"proof:pending": "Proof KYC verification is still pending.",
};
