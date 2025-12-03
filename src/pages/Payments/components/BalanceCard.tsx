/**
 * BalanceCard Component
 * Displays the user's current balance with network info
 */

import React from "react";

interface BalanceCardProps {
	balance: number | string | null;
	isLoading: boolean;
	formatCurrency: (value: number | string | null | undefined) => string;
}

export function BalanceCard({ balance, isLoading, formatCurrency }: BalanceCardProps) {
	return (
		<div className="balance-card">
			<div className="balance-info">
				<span className="balance-label">Available Balance</span>
				<span className="balance-amount">
					${isLoading ? "..." : formatCurrency(balance)}
				</span>
			</div>
			<div className="balance-network">
				<span className="network-badge">Base</span>
				<span className="token-name">USDC</span>
			</div>
		</div>
	);
}

