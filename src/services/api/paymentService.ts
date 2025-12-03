/**
 * Payment Service
 * API client for Privy Fiat On-Ramp and Off-Ramp
 * 
 * API Reference:
 * - On-ramp: https://docs.privy.io/api-reference/fiat/onramp/create
 * - Off-ramp: https://docs.privy.io/api-reference/fiat/offramp/create
 * - Status: https://docs.privy.io/api-reference/fiat/status
 * 
 * Note: These API calls require server-side authentication with your Privy app secret.
 * The functions here are for reference - implement via your backend.
 */

// =============================================================================
// Configuration
// =============================================================================

const PRIVY_API_BASE = "https://api.privy.io";

// =============================================================================
// Types (Re-exported from page types for API layer use)
// =============================================================================

export type FiatProvider = "bridge" | "bridge-sandbox";
export type FiatCurrency = "usd" | "eur";
export type CryptoCurrency = "usdc";
export type PaymentRail = "ach_push" | "wire" | "sepa";
export type SupportedChain = "ethereum" | "base" | "arbitrum" | "polygon" | "optimism";

export type TransactionStatus =
	| "awaiting_funds"
	| "in_review"
	| "funds_received"
	| "payment_submitted"
	| "payment_processed"
	| "canceled"
	| "error"
	| "undeliverable"
	| "returned"
	| "refunded";

// On-ramp request/response
export interface OnrampRequest {
	amount: string;
	provider: FiatProvider;
	source: {
		payment_rail: PaymentRail;
		currency: FiatCurrency;
	};
	destination: {
		chain: SupportedChain;
		currency: CryptoCurrency;
		to_address: string;
	};
}

export interface OnrampResponse {
	id: string;
	status: TransactionStatus;
	deposit_instructions: {
		amount: string;
		currency: FiatCurrency;
		payment_rail: PaymentRail;
		deposit_message?: string;
		bank_name?: string;
		bank_account_number?: string;
		bank_routing_number?: string;
		bank_beneficiary_name?: string;
		bank_beneficiary_address?: string;
		bank_address?: string;
		iban?: string;
		bic?: string;
	};
}

// Off-ramp request/response
export interface OfframpRequest {
	amount: string;
	provider: FiatProvider;
	source: {
		currency: CryptoCurrency;
		chain: SupportedChain;
		from_address: string;
	};
	destination: {
		currency: FiatCurrency;
		payment_rail: PaymentRail;
		external_account_id: string;
	};
}

export interface OfframpResponse {
	id: string;
	status: TransactionStatus;
	deposit_instructions: {
		amount: string;
		currency: CryptoCurrency;
		chain: SupportedChain;
		to_address: string;
		from_address: string;
	};
}

// Transaction status
export interface FiatTransaction {
	type: "onramp" | "offramp";
	id: string;
	status: TransactionStatus;
	created_at: string;
	is_sandbox: boolean;
	receipt?: {
		final_amount: string;
		transaction_hash?: string;
	};
}

// =============================================================================
// Auth Helper
// =============================================================================

function createBasicAuth(appId: string, appSecret: string): string {
	return "Basic " + btoa(`${appId}:${appSecret}`);
}

// =============================================================================
// API Functions
// =============================================================================

/**
 * Initiate an on-ramp transaction (fiat → USDC)
 * Returns bank deposit instructions
 * 
 * @note Requires server-side implementation with app secret
 */
export async function initiateOnramp(
	userId: string,
	appId: string,
	appSecret: string,
	request: OnrampRequest
): Promise<OnrampResponse> {
	const response = await fetch(
		`${PRIVY_API_BASE}/v1/users/${userId}/fiat/onramp`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: createBasicAuth(appId, appSecret),
				"privy-app-id": appId,
			},
			body: JSON.stringify(request),
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`On-ramp failed: ${error}`);
	}

	return response.json();
}

/**
 * Initiate an off-ramp transaction (USDC → fiat)
 * Returns the on-chain address to send funds to
 * 
 * @note Requires server-side implementation with app secret
 */
export async function initiateOfframp(
	userId: string,
	appId: string,
	appSecret: string,
	request: OfframpRequest
): Promise<OfframpResponse> {
	const response = await fetch(
		`${PRIVY_API_BASE}/v1/users/${userId}/fiat/offramp`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: createBasicAuth(appId, appSecret),
				"privy-app-id": appId,
			},
			body: JSON.stringify(request),
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Off-ramp failed: ${error}`);
	}

	return response.json();
}

/**
 * Get transaction status and history
 * 
 * @note Requires server-side implementation with app secret
 */
export async function getTransactionStatus(
	userId: string,
	appId: string,
	appSecret: string,
	provider: FiatProvider,
	txHash?: string
): Promise<{ transactions: FiatTransaction[] }> {
	const body: { provider: FiatProvider; tx_hash?: string } = { provider };
	if (txHash) body.tx_hash = txHash;

	const response = await fetch(
		`${PRIVY_API_BASE}/v1/users/${userId}/fiat/status`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: createBasicAuth(appId, appSecret),
				"privy-app-id": appId,
			},
			body: JSON.stringify(body),
		}
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Status fetch failed: ${error}`);
	}

	return response.json();
}
