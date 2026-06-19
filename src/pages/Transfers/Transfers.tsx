/**
 * Transfers Page (/transfers)
 *
 * Deposits: Privy fiat onramp (card → Base USDC) and crypto deposit addresses (bridge to Base USDC).
 * Withdrawals: TransfersModal for USDC transfers on Base.
 */

import { useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePortfolio } from "@/context/PortfolioContext";
import { useSignerContext } from "@/context/SignerContext";
import { useTransfersModal } from "@/context/TransfersModalContext";
import { DepositFundingPanel } from "@/features/funding/DepositFundingPanel";
import { useAfterDepositRefresh } from "@/features/funding/useAfterDepositRefresh";
import "@/pages/Profile/Details/Details.scss";
import "./Transfers.scss";

export default function Transfers() {
	const { login, authenticated } = usePrivy();
	const { account } = useSignerContext();
	const { portfolioTotal, cashBalance, portfolioLoading, cashLoading } = usePortfolio();
	const refreshAfterDeposit = useAfterDepositRefresh();
	const { openModal: openWithdrawModal } = useTransfersModal();

	const formatCurrency = useCallback((value: number | null): string => {
		if (value === null || !isFinite(value)) return "0.00";
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		}).format(value);
	}, []);

	const handleWithdraw = useCallback(() => {
		openWithdrawModal();
	}, [openWithdrawModal]);

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
				<header className="transfers-header">
					<h1 className="transfers-title">Transfers</h1>
				</header>

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

				<div className="transfers-actions transfers-actions--below-summary">
					<DepositFundingPanel onComplete={refreshAfterDeposit} />
					<button
						className="transfers-btn transfers-btn-withdraw"
						onClick={handleWithdraw}
						disabled={cashLoading || cashBalance === null || cashBalance <= 0}
					>
						Withdraw Funds
					</button>
				</div>
			</div>
		</div>
	);
}
