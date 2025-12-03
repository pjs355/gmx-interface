/**
 * Payments Module - Type Definitions
 * Centralized types for the payments feature
 */

// =============================================================================
// UI State Types
// =============================================================================

export type PaymentTab = "deposit" | "withdraw" | "send" | "history";
export type DepositMethod = "card" | "bank" | "crypto";

export interface PaymentMessage {
	type: "success" | "error";
	text: string;
}

// =============================================================================
// Currency & Payment Rail Types
// =============================================================================

export type FiatCurrency = "usd" | "eur";
export type CryptoCurrency = "usdc";
export type PaymentRail = "ach_push" | "wire" | "sepa";
export type FiatProvider = "bridge" | "bridge-sandbox";
export type SupportedChain = "ethereum" | "base" | "arbitrum" | "polygon" | "optimism";

// =============================================================================
// Transaction Types
// =============================================================================

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

export type TransactionType = "onramp" | "offramp" | "transfer";

export interface Transaction {
	id: string;
	type: TransactionType;
	status: TransactionStatus;
	amount: string;
	currency: string;
	createdAt: string;
	chain?: SupportedChain;
	txHash?: string;
}

// =============================================================================
// On-Ramp Types (Fiat → Crypto)
// =============================================================================

export interface OnrampSource {
	payment_rail: PaymentRail;
	currency: FiatCurrency;
}

export interface OnrampDestination {
	chain: SupportedChain;
	currency: CryptoCurrency;
	to_address: string;
}

export interface OnrampRequest {
	amount: string;
	provider: FiatProvider;
	source: OnrampSource;
	destination: OnrampDestination;
}

export interface BankInstructions {
	amount: string;
	currency: string;
	paymentRail: string;
	bankName: string;
	accountNumber?: string;
	routingNumber?: string;
	beneficiaryName?: string;
	beneficiaryAddress?: string;
	bankAddress?: string;
	depositMessage: string;
	iban?: string;
	bic?: string;
	notice?: string;
}

// =============================================================================
// Off-Ramp Types (Crypto → Fiat)
// =============================================================================

export interface OfframpSource {
	currency: CryptoCurrency;
	chain: SupportedChain;
	from_address: string;
}

export interface OfframpDestination {
	currency: FiatCurrency;
	payment_rail: PaymentRail;
	external_account_id: string;
}

export interface OfframpRequest {
	amount: string;
	provider: FiatProvider;
	source: OfframpSource;
	destination: OfframpDestination;
}

export type WithdrawMethod = "ach" | "wire" | "sepa";

export interface WithdrawMethodOption {
	id: WithdrawMethod;
	name: string;
	fee: string;
	timing: string;
}

// =============================================================================
// Component Props Types
// =============================================================================

export interface BalanceCardProps {
	balance: number | string | null;
	isLoading: boolean;
	chain?: string;
	token?: string;
}

export interface DepositMethodSelectorProps {
	selected: DepositMethod;
	onSelect: (method: DepositMethod) => void;
}

export interface AmountInputProps {
	value: string;
	onChange: (value: string) => void;
	currency?: FiatCurrency;
	placeholder?: string;
	disabled?: boolean;
}

export interface QuickAmountButtonsProps {
	amounts?: number[];
	percentages?: number[];
	balance?: number;
	onSelect: (amount: string) => void;
}

export interface MessageDisplayProps {
	message: PaymentMessage | null;
}

export interface WalletAddressDisplayProps {
	address: string | null;
	onCopy: () => void;
	copied: boolean;
}

