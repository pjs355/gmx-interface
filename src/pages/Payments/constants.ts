/**
 * Payments Module - Constants & Configuration
 * Centralized configuration for the payments feature
 */

import type {
	DepositMethod,
	PaymentTab,
	PaymentRail,
	FiatCurrency,
	WithdrawMethodOption,
	TransactionStatus,
	SupportedChain,
} from "./types";

// =============================================================================
// Chain Configuration
// =============================================================================

export const DEFAULT_CHAIN: SupportedChain = "base";
export const DEFAULT_CHAIN_ID = 8453; // Base mainnet

export const SUPPORTED_CHAINS: Record<SupportedChain, { name: string; id: number }> = {
	base: { name: "Base", id: 8453 },
	ethereum: { name: "Ethereum", id: 1 },
	arbitrum: { name: "Arbitrum", id: 42161 },
	polygon: { name: "Polygon", id: 137 },
	optimism: { name: "Optimism", id: 10 },
};

// =============================================================================
// Tab Configuration
// =============================================================================

export interface TabConfig {
	id: PaymentTab;
	label: string;
	icon: string;
	requiresAuth: boolean;
}

export const PAYMENT_TABS: TabConfig[] = [
	{ id: "deposit", label: "Deposit", icon: "📥", requiresAuth: false },
	{ id: "withdraw", label: "Withdraw", icon: "📤", requiresAuth: true },
	{ id: "send", label: "Send", icon: "↗️", requiresAuth: true },
	{ id: "history", label: "History", icon: "📋", requiresAuth: true },
];

// =============================================================================
// Deposit Method Configuration
// =============================================================================

export interface DepositMethodConfig {
	id: DepositMethod;
	label: string;
	icon: string;
	description: string;
}

export const DEPOSIT_METHODS: DepositMethodConfig[] = [
	{
		id: "card",
		label: "Card / Coinbase",
		icon: "💳",
		description: "Instant deposits via card or Coinbase Pay",
	},
	{
		id: "bank",
		label: "Bank Transfer",
		icon: "🏦",
		description: "Lower fees, 1-3 business days",
	},
	{
		id: "crypto",
		label: "Crypto",
		icon: "⛓️",
		description: "Send USDC directly to your wallet",
	},
];

// =============================================================================
// Quick Amount Presets
// =============================================================================

export const QUICK_DEPOSIT_AMOUNTS = [10, 25, 50, 100, 250, 500];
export const QUICK_PERCENTAGE_OPTIONS = [25, 50, 75, 100];

// =============================================================================
// Currency & Payment Rail Configuration
// =============================================================================

export const CURRENCY_SYMBOLS: Record<FiatCurrency, string> = {
	usd: "$",
	eur: "€",
};

export const CURRENCY_OPTIONS: { value: FiatCurrency; label: string }[] = [
	{ value: "usd", label: "USD - US Dollar" },
	{ value: "eur", label: "EUR - Euro" },
];

export const PAYMENT_RAIL_LABELS: Record<PaymentRail, string> = {
	ach_push: "ACH Transfer",
	wire: "Wire Transfer",
	sepa: "SEPA Transfer",
};

export const PAYMENT_RAILS_BY_CURRENCY: Record<FiatCurrency, PaymentRail[]> = {
	usd: ["ach_push", "wire"],
	eur: ["sepa"],
};

// =============================================================================
// Withdraw Method Configuration
// =============================================================================

export const WITHDRAW_METHODS: WithdrawMethodOption[] = [
	{ id: "ach", name: "ACH Transfer", fee: "Free", timing: "2-3 business days" },
	{ id: "wire", name: "Wire Transfer", fee: "$25", timing: "Same day" },
	{ id: "sepa", name: "SEPA Transfer", fee: "€1", timing: "1-2 business days" },
];

// =============================================================================
// Transaction Status Configuration
// =============================================================================

export const STATUS_LABELS: Record<TransactionStatus, string> = {
	awaiting_funds: "Awaiting Funds",
	in_review: "In Review",
	funds_received: "Funds Received",
	payment_submitted: "Payment Submitted",
	payment_processed: "Completed",
	canceled: "Canceled",
	error: "Error",
	undeliverable: "Undeliverable",
	returned: "Returned",
	refunded: "Refunded",
};

export const STATUS_COLORS: Record<TransactionStatus, "success" | "pending" | "error"> = {
	awaiting_funds: "pending",
	in_review: "pending",
	funds_received: "pending",
	payment_submitted: "pending",
	payment_processed: "success",
	canceled: "error",
	error: "error",
	undeliverable: "error",
	returned: "error",
	refunded: "error",
};

// =============================================================================
// Provider Badges
// =============================================================================

export const PAYMENT_PROVIDERS = ["Coinbase", "Visa", "Mastercard", "Bank Transfer"];

// =============================================================================
// Validation
// =============================================================================

export const MIN_DEPOSIT_AMOUNT = 1;
export const MIN_WITHDRAW_AMOUNT = 1;
export const MIN_TRANSFER_AMOUNT = 0.01;

export const WALLET_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

// =============================================================================
// Timing
// =============================================================================

export const MESSAGE_AUTO_DISMISS_MS = 5000;
export const COPY_SUCCESS_DURATION_MS = 2000;

