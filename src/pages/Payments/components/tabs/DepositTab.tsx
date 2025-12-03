/**
 * DepositTab Component
 * Handles all deposit methods: Card/Coinbase, Bank Transfer, Crypto
 */

import React from "react";
import type { DepositMethod, FiatCurrency, PaymentRail, BankInstructions } from "../../types";
import { DEPOSIT_METHODS, CURRENCY_OPTIONS, PAYMENT_RAIL_LABELS, PAYMENT_PROVIDERS } from "../../constants";
import { AmountInput, QuickAmounts, PrimaryButton, Notice } from "../shared";

// =============================================================================
// Types
// =============================================================================

interface DepositTabProps {
	// Method selection
	depositMethod: DepositMethod;
	onMethodChange: (method: DepositMethod) => void;
	
	// Amount
	amount: string;
	onAmountChange: (amount: string) => void;
	
	// Bank transfer options
	selectedCurrency: FiatCurrency;
	onCurrencyChange: (currency: FiatCurrency) => void;
	selectedPaymentRail: PaymentRail;
	onPaymentRailChange: (rail: PaymentRail) => void;
	availablePaymentRails: PaymentRail[];
	bankInstructions: BankInstructions | null;
	
	// Wallet
	walletAddress: string | null;
	copySuccess: boolean;
	onCopyAddress: () => void;
	
	// Actions
	onCardDeposit: () => void;
	onBankDeposit: () => void;
	isLoading: boolean;
}

// =============================================================================
// Sub-components
// =============================================================================

function MethodSelector({
	selected,
	onSelect,
}: {
	selected: DepositMethod;
	onSelect: (method: DepositMethod) => void;
}) {
	return (
		<div className="deposit-methods">
			{DEPOSIT_METHODS.map((method) => (
				<button
					key={method.id}
					className={`method-btn ${selected === method.id ? "active" : ""}`}
					onClick={() => onSelect(method.id)}
				>
					<span className="method-icon">{method.icon}</span>
					<span className="method-label">{method.label}</span>
				</button>
			))}
		</div>
	);
}

function CardDeposit({
	amount,
	onAmountChange,
	onSubmit,
	isLoading,
}: {
	amount: string;
	onAmountChange: (amount: string) => void;
	onSubmit: () => void;
	isLoading: boolean;
}) {
	return (
		<div className="deposit-form">
			<div className="form-section">
				<h3 className="form-title">Deposit with Card or Coinbase</h3>
				<p className="form-description">
					Instantly buy USDC using your debit/credit card or Coinbase account.
					Funds arrive in your wallet within minutes.
				</p>

				<AmountInput
					value={amount}
					onChange={onAmountChange}
					label="Amount (USD)"
				/>

				<QuickAmounts onSelect={onAmountChange} mode="fixed" />

				<PrimaryButton
					onClick={onSubmit}
					disabled={!amount}
					loading={isLoading}
				>
					Continue to Payment
				</PrimaryButton>

				<div className="provider-badges">
					{PAYMENT_PROVIDERS.slice(0, 3).map((provider) => (
						<span
							key={provider}
							className={`badge ${provider.toLowerCase()}`}
						>
							{provider}
						</span>
					))}
				</div>
			</div>
		</div>
	);
}

function BankDeposit({
	amount,
	onAmountChange,
	currency,
	onCurrencyChange,
	paymentRail,
	onPaymentRailChange,
	availableRails,
	bankInstructions,
	onSubmit,
	isLoading,
}: {
	amount: string;
	onAmountChange: (amount: string) => void;
	currency: FiatCurrency;
	onCurrencyChange: (currency: FiatCurrency) => void;
	paymentRail: PaymentRail;
	onPaymentRailChange: (rail: PaymentRail) => void;
	availableRails: PaymentRail[];
	bankInstructions: BankInstructions | null;
	onSubmit: () => void;
	isLoading: boolean;
}) {
	return (
		<div className="deposit-form">
			<div className="form-section">
				<h3 className="form-title">Bank Transfer Deposit</h3>
				<p className="form-description">
					Transfer funds directly from your bank account. Lower fees, but takes 1-3 business days.
				</p>

				<div className="input-row">
					<div className="input-group">
						<label>Currency</label>
						<select
							value={currency}
							onChange={(e) => onCurrencyChange(e.target.value as FiatCurrency)}
						>
							{CURRENCY_OPTIONS.map((opt) => (
								<option key={opt.value} value={opt.value}>
									{opt.label}
								</option>
							))}
						</select>
					</div>

					<div className="input-group">
						<label>Transfer Method</label>
						<select
							value={paymentRail}
							onChange={(e) => onPaymentRailChange(e.target.value as PaymentRail)}
						>
							{availableRails.map((rail) => (
								<option key={rail} value={rail}>
									{PAYMENT_RAIL_LABELS[rail]}
								</option>
							))}
						</select>
					</div>
				</div>

				<AmountInput
					value={amount}
					onChange={onAmountChange}
					currency={currency}
				/>

				<PrimaryButton
					onClick={onSubmit}
					disabled={!amount}
					loading={isLoading}
					loadingText="Generating..."
				>
					Get Bank Instructions
				</PrimaryButton>

				{bankInstructions && (
					<BankInstructionsDisplay instructions={bankInstructions} />
				)}
			</div>
		</div>
	);
}

function BankInstructionsDisplay({ instructions }: { instructions: BankInstructions }) {
	return (
		<div className="bank-instructions">
			<h4>Bank Transfer Instructions</h4>
			<div className="instruction-row">
				<span className="label">Amount:</span>
				<span className="value">{instructions.currency} {instructions.amount}</span>
			</div>
			<div className="instruction-row">
				<span className="label">Method:</span>
				<span className="value">{instructions.paymentRail}</span>
			</div>
			<div className="instruction-row">
				<span className="label">Bank Name:</span>
				<span className="value">{instructions.bankName}</span>
			</div>
			<div className="instruction-row">
				<span className="label">Reference:</span>
				<span className="value highlight">{instructions.depositMessage}</span>
			</div>
			{instructions.notice && (
				<div className="instruction-notice">
					<strong>⚠️ Important:</strong> {instructions.notice}
				</div>
			)}
		</div>
	);
}

function CryptoDeposit({
	walletAddress,
	copySuccess,
	onCopyAddress,
}: {
	walletAddress: string | null;
	copySuccess: boolean;
	onCopyAddress: () => void;
}) {
	return (
		<div className="deposit-form">
			<div className="form-section">
				<h3 className="form-title">Deposit USDC</h3>
				<p className="form-description">
					Send USDC on Base network directly to your wallet. Instant and no fees.
				</p>

				<div className="wallet-display">
					<div className="wallet-label">Your Wallet Address (Base Network)</div>
					<div className="wallet-address-box">
						<code className="wallet-address">
							{walletAddress || "Connect wallet to view address"}
						</code>
						{walletAddress && (
							<button className="copy-btn" onClick={onCopyAddress}>
								{copySuccess ? "✓ Copied" : "Copy"}
							</button>
						)}
					</div>
				</div>

				<Notice variant="warning">
					Only send USDC on <strong>Base network</strong>. Sending other tokens or using other networks will result in loss of funds.
				</Notice>

				<div className="supported-tokens">
					<h4>Supported:</h4>
					<div className="token-badges">
						<span className="token-badge">
							<img
								src="https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png"
								alt="USDC"
							/>
							USDC
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}

// =============================================================================
// Main Component
// =============================================================================

export function DepositTab(props: DepositTabProps) {
	const {
		depositMethod,
		onMethodChange,
		amount,
		onAmountChange,
		selectedCurrency,
		onCurrencyChange,
		selectedPaymentRail,
		onPaymentRailChange,
		availablePaymentRails,
		bankInstructions,
		walletAddress,
		copySuccess,
		onCopyAddress,
		onCardDeposit,
		onBankDeposit,
		isLoading,
	} = props;

	return (
		<>
			<MethodSelector selected={depositMethod} onSelect={onMethodChange} />

			{depositMethod === "card" && (
				<CardDeposit
					amount={amount}
					onAmountChange={onAmountChange}
					onSubmit={onCardDeposit}
					isLoading={isLoading}
				/>
			)}

			{depositMethod === "bank" && (
				<BankDeposit
					amount={amount}
					onAmountChange={onAmountChange}
					currency={selectedCurrency}
					onCurrencyChange={onCurrencyChange}
					paymentRail={selectedPaymentRail}
					onPaymentRailChange={onPaymentRailChange}
					availableRails={availablePaymentRails}
					bankInstructions={bankInstructions}
					onSubmit={onBankDeposit}
					isLoading={isLoading}
				/>
			)}

			{depositMethod === "crypto" && (
				<CryptoDeposit
					walletAddress={walletAddress}
					copySuccess={copySuccess}
					onCopyAddress={onCopyAddress}
				/>
			)}
		</>
	);
}

