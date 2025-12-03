/**
 * usePayments Hook
 * Centralizes all payment-related business logic
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useFundWallet } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { usePortfolio } from "context/PortfolioContext";
import type {
	PaymentTab,
	DepositMethod,
	PaymentMessage,
	FiatCurrency,
	PaymentRail,
	BankInstructions,
	Transaction,
} from "../types";
import {
	PAYMENT_RAILS_BY_CURRENCY,
	DEFAULT_CHAIN_ID,
	MESSAGE_AUTO_DISMISS_MS,
	COPY_SUCCESS_DURATION_MS,
	WALLET_ADDRESS_REGEX,
	MIN_DEPOSIT_AMOUNT,
	MIN_WITHDRAW_AMOUNT,
	MIN_TRANSFER_AMOUNT,
	PAYMENT_RAIL_LABELS,
} from "../constants";

// =============================================================================
// Hook Return Type
// =============================================================================

export interface UsePaymentsReturn {
	// Auth & Wallet State
	isAuthenticated: boolean;
	isReady: boolean;
	walletAddress: string | null;
	login: () => void;

	// Balance
	balance: number | string | null;
	balanceLoading: boolean;

	// UI State
	activeTab: PaymentTab;
	setActiveTab: (tab: PaymentTab) => void;
	depositMethod: DepositMethod;
	setDepositMethod: (method: DepositMethod) => void;
	message: PaymentMessage | null;
	isLoading: boolean;

	// Deposit State
	depositAmount: string;
	setDepositAmount: (amount: string) => void;
	selectedCurrency: FiatCurrency;
	setSelectedCurrency: (currency: FiatCurrency) => void;
	selectedPaymentRail: PaymentRail;
	setSelectedPaymentRail: (rail: PaymentRail) => void;
	availablePaymentRails: PaymentRail[];
	bankInstructions: BankInstructions | null;

	// Withdraw State
	withdrawAmount: string;
	setWithdrawAmount: (amount: string) => void;
	withdrawMethod: "ach" | "wire";
	setWithdrawMethod: (method: "ach" | "wire") => void;

	// Send State
	sendAddress: string;
	setSendAddress: (address: string) => void;
	sendAmount: string;
	setSendAmount: (amount: string) => void;

	// Transaction History
	transactions: Transaction[];
	historyLoading: boolean;

	// Copy
	copySuccess: boolean;
	handleCopyAddress: () => Promise<void>;

	// Actions
	handleCardDeposit: () => Promise<void>;
	handleBankDeposit: () => Promise<void>;
	handleWithdraw: () => Promise<void>;
	handleSend: () => Promise<void>;

	// Utilities
	formatCurrency: (value: number | string | null | undefined) => string;
	getBalanceAsNumber: () => number;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function usePayments(): UsePaymentsReturn {
	// External hooks
	const { authenticated, login, user, ready } = usePrivy();
	const { wallets: privyWallets } = usePrivyWallets();
	const { account } = useSignerContext();
	const { cashBalance, cashLoading } = usePortfolio();
	const { fundWallet } = useFundWallet();

	// UI State
	const [activeTab, setActiveTab] = useState<PaymentTab>("deposit");
	const [depositMethod, setDepositMethod] = useState<DepositMethod>("card");
	const [message, setMessage] = useState<PaymentMessage | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [copySuccess, setCopySuccess] = useState(false);

	// Deposit State
	const [depositAmount, setDepositAmount] = useState("");
	const [selectedCurrency, setSelectedCurrency] = useState<FiatCurrency>("usd");
	const [selectedPaymentRail, setSelectedPaymentRail] = useState<PaymentRail>("ach_push");
	const [bankInstructions, setBankInstructions] = useState<BankInstructions | null>(null);

	// Withdraw State
	const [withdrawAmount, setWithdrawAmount] = useState("");
	const [withdrawMethod, setWithdrawMethod] = useState<"ach" | "wire">("ach");

	// Send State
	const [sendAddress, setSendAddress] = useState("");
	const [sendAmount, setSendAmount] = useState("");

	// Transaction History
	const [transactions, setTransactions] = useState<Transaction[]>([]);
	const [historyLoading, setHistoryLoading] = useState(false);

	// Derived State
	const smartWallet = user?.linkedAccounts?.find(
		(acc: any) => acc.type === "smart_wallet"
	);
	const walletAddress = (smartWallet as any)?.address || account || null;

	const availablePaymentRails = useMemo(
		() => PAYMENT_RAILS_BY_CURRENCY[selectedCurrency] || [],
		[selectedCurrency]
	);

	// ==========================================================================
	// Effects
	// ==========================================================================

	// Auto-dismiss messages
	useEffect(() => {
		if (message) {
			const timer = setTimeout(() => setMessage(null), MESSAGE_AUTO_DISMISS_MS);
			return () => clearTimeout(timer);
		}
	}, [message]);

	// Update payment rail when currency changes
	useEffect(() => {
		if (availablePaymentRails.length > 0 && !availablePaymentRails.includes(selectedPaymentRail)) {
			setSelectedPaymentRail(availablePaymentRails[0]);
		}
	}, [availablePaymentRails, selectedPaymentRail]);

	// ==========================================================================
	// Utility Functions
	// ==========================================================================

	const formatCurrency = useCallback((value: number | string | null | undefined): string => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		if (num === null || num === undefined || !isFinite(num)) return "0.00";
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(num);
	}, []);

	const getBalanceAsNumber = useCallback((): number => {
		return parseFloat(cashBalance?.toString() || "0");
	}, [cashBalance]);

	const showMessage = useCallback((type: "success" | "error", text: string) => {
		setMessage({ type, text });
	}, []);

	// ==========================================================================
	// Copy Address
	// ==========================================================================

	const handleCopyAddress = useCallback(async () => {
		if (walletAddress) {
			try {
				await navigator.clipboard.writeText(walletAddress);
				setCopySuccess(true);
				setTimeout(() => setCopySuccess(false), COPY_SUCCESS_DURATION_MS);
			} catch (err) {
				console.error("Failed to copy address:", err);
				showMessage("error", "Failed to copy address");
			}
		}
	}, [walletAddress, showMessage]);

	// ==========================================================================
	// Deposit Actions
	// ==========================================================================

	const handleCardDeposit = useCallback(async () => {
		if (!walletAddress) {
			showMessage("error", "Wallet not connected");
			return;
		}
		if (!depositAmount || parseFloat(depositAmount) < MIN_DEPOSIT_AMOUNT) {
			showMessage("error", `Minimum deposit is $${MIN_DEPOSIT_AMOUNT}`);
			return;
		}

		try {
			setIsLoading(true);
			await fundWallet(walletAddress, {
				chain: { id: DEFAULT_CHAIN_ID },
				amount: depositAmount,
			});
			showMessage("success", "Deposit initiated successfully!");
			setDepositAmount("");
		} catch (error: any) {
			console.error("Deposit error:", error);
			showMessage("error", error?.message || "Failed to initiate deposit");
		} finally {
			setIsLoading(false);
		}
	}, [walletAddress, depositAmount, fundWallet, showMessage]);

	const handleBankDeposit = useCallback(async () => {
		if (!depositAmount || parseFloat(depositAmount) < MIN_DEPOSIT_AMOUNT) {
			showMessage("error", `Minimum deposit is $${MIN_DEPOSIT_AMOUNT}`);
			return;
		}

		try {
			setIsLoading(true);
			// Generate placeholder bank instructions
			// In production, this would call your backend API
			setBankInstructions({
				amount: depositAmount,
				currency: selectedCurrency.toUpperCase(),
				paymentRail: PAYMENT_RAIL_LABELS[selectedPaymentRail],
				bankName: "Bridge Bank",
				accountNumber: "Contact support for details",
				routingNumber: "Contact support for details",
				beneficiaryName: "LevelUp Predictions",
				depositMessage: `REF-${Date.now().toString(36).toUpperCase()}`,
				notice: "Bank transfers require backend API integration. Contact support for manual deposit instructions.",
			});
			showMessage("success", "Bank transfer instructions generated");
		} catch (error: any) {
			showMessage("error", error?.message || "Failed to generate bank instructions");
		} finally {
			setIsLoading(false);
		}
	}, [depositAmount, selectedCurrency, selectedPaymentRail, showMessage]);

	// ==========================================================================
	// Withdraw Actions
	// ==========================================================================

	const handleWithdraw = useCallback(async () => {
		if (!withdrawAmount || parseFloat(withdrawAmount) < MIN_WITHDRAW_AMOUNT) {
			showMessage("error", `Minimum withdrawal is $${MIN_WITHDRAW_AMOUNT}`);
			return;
		}

		const balance = getBalanceAsNumber();
		if (parseFloat(withdrawAmount) > balance) {
			showMessage("error", "Insufficient balance");
			return;
		}

		try {
			setIsLoading(true);
			// Off-ramp requires backend integration
			showMessage(
				"success",
				"Withdrawal request submitted. Off-ramp functionality requires KYC verification and bank account linking. Please contact support to complete the setup."
			);
			setWithdrawAmount("");
		} catch (error: any) {
			showMessage("error", error?.message || "Failed to initiate withdrawal");
		} finally {
			setIsLoading(false);
		}
	}, [withdrawAmount, getBalanceAsNumber, showMessage]);

	// ==========================================================================
	// Send Actions
	// ==========================================================================

	const handleSend = useCallback(async () => {
		if (!sendAddress || !sendAmount) {
			showMessage("error", "Please enter address and amount");
			return;
		}

		if (!WALLET_ADDRESS_REGEX.test(sendAddress)) {
			showMessage("error", "Invalid wallet address");
			return;
		}

		if (parseFloat(sendAmount) < MIN_TRANSFER_AMOUNT) {
			showMessage("error", `Minimum transfer is $${MIN_TRANSFER_AMOUNT}`);
			return;
		}

		const balance = getBalanceAsNumber();
		if (parseFloat(sendAmount) > balance) {
			showMessage("error", "Insufficient balance");
			return;
		}

		try {
			setIsLoading(true);
			// Manual transfers would go through smart wallet
			showMessage(
				"success",
				"Manual transfers require transaction signing. This feature is coming soon!"
			);
			setSendAddress("");
			setSendAmount("");
		} catch (error: any) {
			showMessage("error", error?.message || "Failed to send transfer");
		} finally {
			setIsLoading(false);
		}
	}, [sendAddress, sendAmount, getBalanceAsNumber, showMessage]);

	// ==========================================================================
	// Return
	// ==========================================================================

	return {
		// Auth & Wallet
		isAuthenticated: authenticated,
		isReady: ready,
		walletAddress,
		login,

		// Balance
		balance: cashBalance,
		balanceLoading: cashLoading,

		// UI State
		activeTab,
		setActiveTab,
		depositMethod,
		setDepositMethod,
		message,
		isLoading,

		// Deposit State
		depositAmount,
		setDepositAmount,
		selectedCurrency,
		setSelectedCurrency,
		selectedPaymentRail,
		setSelectedPaymentRail,
		availablePaymentRails,
		bankInstructions,

		// Withdraw State
		withdrawAmount,
		setWithdrawAmount,
		withdrawMethod,
		setWithdrawMethod,

		// Send State
		sendAddress,
		setSendAddress,
		sendAmount,
		setSendAmount,

		// Transaction History
		transactions,
		historyLoading,

		// Copy
		copySuccess,
		handleCopyAddress,

		// Actions
		handleCardDeposit,
		handleBankDeposit,
		handleWithdraw,
		handleSend,

		// Utilities
		formatCurrency,
		getBalanceAsNumber,
	};
}

