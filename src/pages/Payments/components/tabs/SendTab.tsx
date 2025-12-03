/**
 * SendTab Component
 * Handles manual USDC transfers to external wallets
 */

import React from "react";
import { AmountInput, QuickAmounts, PrimaryButton, BalanceDisplay, Notice } from "../shared";

interface SendTabProps {
	balance: number | string | null;
	balanceLoading: boolean;
	formatCurrency: (value: number | string | null | undefined) => string;
	getBalanceAsNumber: () => number;
	
	address: string;
	onAddressChange: (address: string) => void;
	
	amount: string;
	onAmountChange: (amount: string) => void;
	
	onSubmit: () => void;
	isLoading: boolean;
}

export function SendTab({
	balance,
	balanceLoading,
	formatCurrency,
	getBalanceAsNumber,
	address,
	onAddressChange,
	amount,
	onAmountChange,
	onSubmit,
	isLoading,
}: SendTabProps) {
	const balanceNum = getBalanceAsNumber();

	return (
		<div className="manual-section">
			<div className="form-section">
				<h3 className="form-title">Send USDC</h3>
				<p className="form-description">
					Transfer USDC to any wallet address on Base network.
				</p>

				<BalanceDisplay
					balance={balance}
					isLoading={balanceLoading}
					formatCurrency={formatCurrency}
				/>

				<div className="input-group">
					<label>Recipient Address</label>
					<input
						type="text"
						value={address}
						onChange={(e) => onAddressChange(e.target.value)}
						placeholder="0x..."
						className="address-input"
					/>
				</div>

				<AmountInput
					value={amount}
					onChange={onAmountChange}
					label="Amount (USDC)"
				/>

				<QuickAmounts
					onSelect={onAmountChange}
					mode="percentage"
					balance={balanceNum}
				/>

				<PrimaryButton
					onClick={onSubmit}
					disabled={!address || !amount}
					loading={isLoading}
					loadingText="Sending..."
				>
					Send USDC
				</PrimaryButton>

				<Notice variant="warning">
					Double-check the address. Transactions on blockchain are irreversible.
				</Notice>
			</div>
		</div>
	);
}

