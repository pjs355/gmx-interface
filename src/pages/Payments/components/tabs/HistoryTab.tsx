/**
 * HistoryTab Component
 * Displays transaction history
 */

import React from "react";
import type { Transaction, TransactionStatus } from "../../types";
import { STATUS_LABELS, STATUS_COLORS } from "../../constants";

interface HistoryTabProps {
	transactions: Transaction[];
	isLoading: boolean;
}

function getStatusClass(status: TransactionStatus): string {
	const color = STATUS_COLORS[status] || "pending";
	return `status-${color}`;
}

function TransactionItem({ tx }: { tx: Transaction }) {
	const icon = tx.type === "onramp" ? "📥" : tx.type === "offramp" ? "📤" : "↗️";
	const typeLabel = tx.type === "onramp" ? "Deposit" : tx.type === "offramp" ? "Withdrawal" : "Transfer";
	const sign = tx.type === "onramp" ? "+" : "-";

	return (
		<div className="transaction-item">
			<div className="tx-icon">{icon}</div>
			<div className="tx-details">
				<div className="tx-type">{typeLabel}</div>
				<div className="tx-date">
					{new Date(tx.createdAt).toLocaleDateString()}
				</div>
			</div>
			<div className="tx-amount">
				{sign}${tx.amount}
			</div>
			<div className={`tx-status ${getStatusClass(tx.status)}`}>
				{STATUS_LABELS[tx.status]}
			</div>
		</div>
	);
}

function EmptyState() {
	return (
		<div className="empty-state">
			<span className="empty-icon">📭</span>
			<p>No transactions yet</p>
			<span className="empty-hint">
				Your deposit and withdrawal history will appear here
			</span>
		</div>
	);
}

function LoadingState() {
	return (
		<div className="loading-state">Loading transactions...</div>
	);
}

export function HistoryTab({ transactions, isLoading }: HistoryTabProps) {
	return (
		<div className="history-section">
			<div className="form-section">
				<h3 className="form-title">Transaction History</h3>

				{isLoading ? (
					<LoadingState />
				) : transactions.length === 0 ? (
					<EmptyState />
				) : (
					<div className="transaction-list">
						{transactions.map((tx) => (
							<TransactionItem key={tx.id} tx={tx} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

