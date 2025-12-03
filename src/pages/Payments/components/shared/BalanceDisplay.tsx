/**
 * BalanceDisplay Component
 * Inline balance display for forms
 */

import React from "react";

interface BalanceDisplayProps {
	balance: number | string | null;
	isLoading: boolean;
	formatCurrency: (value: number | string | null | undefined) => string;
	label?: string;
}

export function BalanceDisplay({
	balance,
	isLoading,
	formatCurrency,
	label = "Available Balance",
}: BalanceDisplayProps) {
	return (
		<div className="balance-display">
			<span className="balance-label">{label}</span>
			<span className="balance-value">
				${isLoading ? "..." : formatCurrency(balance)}
			</span>
		</div>
	);
}

