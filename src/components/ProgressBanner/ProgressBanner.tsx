import React, { useCallback } from "react";
import { useLogin } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { PrivyGatedDepositButton } from "@/components/PrivyGatedFundWallet/PrivyGatedFundWallet";
import "./ProgressBanner.scss";

export function ProgressBanner() {
	const { login } = useLogin();
	const { account, authenticated, ready: signerReady } = useSignerContext();
	const venueAddressChainMap = useVenueAddressChainMap();
	const fundEvmTarget = venueAddressChainMap?.levelup.walletAddress;
	const { orders, loading: ordersLoading } = useUserData();
	const { cashBalance, cashLoading } = usePortfolio();

	// Handle Get Started - opens Privy login
	const handleGetStarted = useCallback(() => {
		login();
	}, [login]);

	// Banner 1: Welcome Banner - Show to non-authenticated users
	if (!authenticated || !account) {
		return (
			<div className="progress-banner progress-banner--loaded">
				<div className="progress-banner-container">
					<div className="progress-banner-content">
						<div className="progress-banner-subtitle">Welcome to LevelUp</div>
						<h3 className="progress-banner-title">
							Start trading gaming prediction markets today.
						</h3>
					</div>
					<button
						className="progress-banner-button"
						onClick={handleGetStarted}
					>
						Get Started
					</button>
				</div>
			</div>
		);
	}

	// For authenticated users, check if they need the Fund Account banner
	// Wait until we've finished loading balance and trading history
	const isLoading = cashLoading || ordersLoading;
	
	// Only show Fund Account banner if:
	// - Balance is 0
	// - User has never made a trade (no orders)
	// - Loading is complete
	const hasNoBalance = cashBalance === 0;
	const hasNeverTraded = orders.length === 0;
	const shouldShowFundBanner = !isLoading && hasNoBalance && hasNeverTraded;

	// Banner 2: Fund Account Banner - Show to authenticated users with 0 balance and no trades
	if (shouldShowFundBanner) {
		return (
			<div className="progress-banner progress-banner--loaded">
				<div className="progress-banner-container">
					<div className="progress-banner-content">
						<div className="progress-banner-subtitle">Fund your account</div>
						<h3 className="progress-banner-title">
							Add funds to your account so that you can place your first trade.
						</h3>
					</div>
					<PrivyGatedDepositButton
						className="progress-banner-button"
						fundTarget={fundEvmTarget}
						ready={signerReady}
					>
						Add Funds
					</PrivyGatedDepositButton>
				</div>
			</div>
		);
	}

	// Don't show any banner if user is authenticated, has balance or has traded
	return null;
}
