/**
 * WithdrawTab Component
 * Handles fiat off-ramp withdrawals
 */

import React from "react";
import { WITHDRAW_METHODS } from "../../constants";
import { AmountInput, QuickAmounts, PrimaryButton, BalanceDisplay, Notice } from "../shared";

interface WithdrawTabProps {
	balance: number | string | null;
	balanceLoading: boolean;
	formatCurrency: (value: number | string | null | undefined) => string;
	getBalanceAsNumber: () => number;
	
	amount: string;
	onAmountChange: (amount: string) => void;
	
	withdrawMethod: "ach" | "wire";
	onMethodChange: (method: "ach" | "wire") => void;
	
	onSubmit: () => void;
	isLoading: boolean;
}

export function WithdrawTab({
	balance,
	balanceLoading,
	formatCurrency,
	getBalanceAsNumber,
	amount,
	onAmountChange,
	withdrawMethod,
	onMethodChange,
	onSubmit,
	isLoading,
}: WithdrawTabProps) {
	const balanceNum = getBalanceAsNumber();

	return (
		<div className="withdraw-section">
			<div className="form-section">
				<h3 className="form-title">Withdraw to Bank</h3>
				<p className="form-description">
					Convert your USDC to fiat and withdraw to your linked bank account.
				</p>

				<BalanceDisplay
					balance={balance}
					isLoading={balanceLoading}
					formatCurrency={formatCurrency}
				/>

				<AmountInput
					value={amount}
					onChange={onAmountChange}
					label="Withdraw Amount"
				/>

				<QuickAmounts
					onSelect={onAmountChange}
					mode="percentage"
					balance={balanceNum}
				/>

				<div className="withdraw-methods">
					{WITHDRAW_METHODS.filter(m => m.id !== "sepa").map((method) => (
						<div key={method.id} className="method-option">
							<input
								type="radio"
								name="withdrawMethod"
								id={method.id}
								checked={withdrawMethod === method.id}
								onChange={() => onMethodChange(method.id as "ach" | "wire")}
							/>
							<label htmlFor={method.id}>
								<span className="method-name">{method.name}</span>
								<span className="method-fee">{method.fee} • {method.timing}</span>
							</label>
						</div>
					))}
				</div>

				<PrimaryButton
					onClick={onSubmit}
					disabled={!amount}
					loading={isLoading}
					variant="withdraw"
				>
					Withdraw Funds
				</PrimaryButton>

				<Notice variant="info">
					Withdrawals require identity verification (KYC) and a linked bank account.
				</Notice>
			</div>
		</div>
	);
}

