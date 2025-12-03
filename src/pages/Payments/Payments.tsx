/**
 * Payments Page
 * Main entry point for deposits, withdrawals, and transfers
 * 
 * Architecture:
 * - /types.ts         - Type definitions
 * - /constants.ts     - Configuration & constants
 * - /hooks/           - Business logic (usePayments)
 * - /components/      - UI components
 *   - /shared/        - Reusable components (AmountInput, etc.)
 *   - /tabs/          - Tab-specific components
 */

import React from "react";
import { usePayments } from "./hooks";
import {
	BalanceCard,
	MessageDisplay,
	PaymentTabs,
	AuthRequired,
	PaymentsFooter,
	DepositTab,
	WithdrawTab,
	SendTab,
	HistoryTab,
} from "./components";
import "./Payments.scss";

export default function Payments() {
	const payments = usePayments();

	// Not authenticated - show login prompt
	if (!payments.isAuthenticated) {
		return (
			<div className="payments-page">
				<div className="payments-container">
					<AuthRequired onLogin={payments.login} />
				</div>
			</div>
		);
	}

	return (
		<div className="payments-page">
			<div className="payments-container">
				{/* Header */}
				<header className="payments-header">
					<h1 className="payments-title">Payments</h1>
					<p className="payments-subtitle">
						Deposit, withdraw, and manage your USDC on Base
					</p>
				</header>

				{/* Balance Card */}
				<BalanceCard
					balance={payments.balance}
					isLoading={payments.balanceLoading}
					formatCurrency={payments.formatCurrency}
				/>

				{/* Messages */}
				<MessageDisplay message={payments.message} />

				{/* Tabs */}
				<PaymentTabs
					activeTab={payments.activeTab}
					onTabChange={payments.setActiveTab}
					isAuthenticated={payments.isAuthenticated}
				/>

				{/* Tab Content */}
				<div className="tab-content">
					{payments.activeTab === "deposit" && (
						<DepositTab
							depositMethod={payments.depositMethod}
							onMethodChange={payments.setDepositMethod}
							amount={payments.depositAmount}
							onAmountChange={payments.setDepositAmount}
							selectedCurrency={payments.selectedCurrency}
							onCurrencyChange={payments.setSelectedCurrency}
							selectedPaymentRail={payments.selectedPaymentRail}
							onPaymentRailChange={payments.setSelectedPaymentRail}
							availablePaymentRails={payments.availablePaymentRails}
							bankInstructions={payments.bankInstructions}
							walletAddress={payments.walletAddress}
							copySuccess={payments.copySuccess}
							onCopyAddress={payments.handleCopyAddress}
							onCardDeposit={payments.handleCardDeposit}
							onBankDeposit={payments.handleBankDeposit}
							isLoading={payments.isLoading}
						/>
					)}

					{payments.activeTab === "withdraw" && (
						<WithdrawTab
							balance={payments.balance}
							balanceLoading={payments.balanceLoading}
							formatCurrency={payments.formatCurrency}
							getBalanceAsNumber={payments.getBalanceAsNumber}
							amount={payments.withdrawAmount}
							onAmountChange={payments.setWithdrawAmount}
							withdrawMethod={payments.withdrawMethod}
							onMethodChange={payments.setWithdrawMethod}
							onSubmit={payments.handleWithdraw}
							isLoading={payments.isLoading}
						/>
					)}

					{payments.activeTab === "send" && (
						<SendTab
							balance={payments.balance}
							balanceLoading={payments.balanceLoading}
							formatCurrency={payments.formatCurrency}
							getBalanceAsNumber={payments.getBalanceAsNumber}
							address={payments.sendAddress}
							onAddressChange={payments.setSendAddress}
							amount={payments.sendAmount}
							onAmountChange={payments.setSendAmount}
							onSubmit={payments.handleSend}
							isLoading={payments.isLoading}
						/>
					)}

					{payments.activeTab === "history" && (
						<HistoryTab
							transactions={payments.transactions}
							isLoading={payments.historyLoading}
						/>
					)}
				</div>

				{/* Footer */}
				<PaymentsFooter />
			</div>
		</div>
	);
}
