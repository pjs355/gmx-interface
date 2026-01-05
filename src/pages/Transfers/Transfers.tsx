/**
 * Transfers Page (/transfers)
 * 
 * PURPOSE:
 * Main page for managing deposits and withdrawals. Replaced the old complex Payments page
 * with a clean, simple interface showing portfolio summary and two action buttons.
 * 
 * ARCHITECTURE:
 * - Deposits: Uses Privy's native fundWallet() - opens Privy's deposit modal
 *   (supports card payments, crypto transfers, Coinbase integration)
 * - Withdrawals: Opens TransfersModal for USDC transfers to external addresses
 * 
 * DEPOSIT FLOW:
 * 1. User clicks "Deposit Funds"
 * 2. Privy's fundWallet() is called with user's account address
 * 3. Privy modal opens (we cannot customize the text in this modal)
 * 4. After completion, refreshUserData() updates balances
 * 
 * WITHDRAW FLOW:
 * 1. User clicks "Withdraw Funds"
 * 2. Opens TransfersModal (controlled by TransfersModalContext)
 * 3. User enters address + amount, reviews, confirms
 * 4. USDC transfer executed on Base network
 * 
 * RELATED FILES:
 * - TransfersModal.tsx - The withdrawal modal component
 * - TransfersModalContext.tsx - Controls modal visibility
 * - AppHeaderUser.tsx - "Cash" button in header also triggers deposit
 * - PositionsHeader.tsx - "+" button on portfolio page also triggers deposit
 * 
 * ROUTES:
 * - /transfers - This page
 * - Old /payments route was removed
 * 
 * CREATED: Jan 2026 - Simplified from old Payments page
 */

import React, { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useFundWallet } from "@privy-io/react-auth";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { useTransfersModal } from "@/context/TransfersModalContext";
import "./Transfers.scss";

export default function Transfers() {
	const { login, authenticated } = usePrivy();
	const { account } = useSignerContext();
	const { portfolioTotal, cashBalance, portfolioLoading, cashLoading } = usePortfolio();
	const { refresh: refreshUserData } = useUserData();
	const { fundWallet } = useFundWallet();
	const { openModal: openWithdrawModal } = useTransfersModal();

	// Format currency helper
	const formatCurrency = useCallback((value: number | null): string => {
		if (value === null || !isFinite(value)) return "0.00";
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);
	}, []);

	// Handle deposit - triggers Privy funding modal
	const handleDeposit = useCallback(async () => {
		if (!account) return;

		try {
			await fundWallet(account, {
				chain: { id: 8453 }, // Base mainnet
			});
			// Refresh balance after Privy modal closes
			refreshUserData();
		} catch (err) {
			console.error("Deposit error:", err);
			// User likely cancelled - no need to show error
		}
	}, [account, fundWallet, refreshUserData]);

	// Handle withdraw - opens withdraw modal
	const handleWithdraw = useCallback(() => {
		openWithdrawModal();
	}, [openWithdrawModal]);

	// Not authenticated - show login prompt
	if (!authenticated || !account) {
		return (
			<div className="transfers-page">
				<div className="transfers-container">
					<div className="transfers-auth-required">
						<h2>Sign in to access transfers</h2>
						<p>Connect your account to deposit and withdraw funds.</p>
						<button className="transfers-btn-primary" onClick={() => login()}>
							Sign In
						</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className="transfers-page">
			<div className="transfers-container">
				{/* Header */}
				<header className="transfers-header">
					<h1 className="transfers-title">Transfers</h1>
				</header>

				{/* Portfolio Summary */}
				<div className="transfers-summary-section">
					<div className="transfers-summary-row">
						<span className="transfers-summary-label">Portfolio</span>
						<span className="transfers-summary-value">
							{portfolioLoading ? (
								<span className="transfers-skeleton" />
							) : (
								`$${formatCurrency(portfolioTotal)}`
							)}
						</span>
					</div>
					<div className="transfers-summary-row">
						<span className="transfers-summary-label">Cash</span>
						<span className="transfers-summary-value transfers-cash-value">
							{cashLoading ? (
								<span className="transfers-skeleton" />
							) : (
								`$${formatCurrency(cashBalance)}`
							)}
						</span>
					</div>
				</div>

				{/* Action Buttons */}
				<div className="transfers-actions">
					<button
						className="transfers-btn transfers-btn-deposit"
						onClick={handleDeposit}
					>
						Deposit Funds
					</button>
					<button
						className="transfers-btn transfers-btn-withdraw"
						onClick={handleWithdraw}
						disabled={cashBalance <= 0}
					>
						Withdraw Funds
					</button>
				</div>
			</div>
		</div>
	);
}
