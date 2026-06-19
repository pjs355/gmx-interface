import { useCallback } from "react";
import { useLogin } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { useLevelUpOrders } from "@/features/trading/venues/levelup/portfolio/useLevelUpOrders";
import { usePortfolio } from "@/context/PortfolioContext";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { DepositFundingButton } from "@/features/funding/DepositFundingTrigger";
import { useAfterDepositRefresh } from "@/features/funding/useAfterDepositRefresh";
import "./ProgressBanner.scss";

export function ProgressBanner() {
	const { login } = useLogin();
	const { account, authenticated, ready: signerReady } = useSignerContext();
	const venueAddressChainMap = useVenueAddressChainMap();
	const fundEvmTarget = venueAddressChainMap?.levelup.walletAddress;
	const refreshAfterDeposit = useAfterDepositRefresh();
	const { orders, isLoading: ordersLoading } = useLevelUpOrders(
		fundEvmTarget,
		Boolean(authenticated && account && fundEvmTarget),
	);
	const { cashBalance, cashLoading } = usePortfolio();

	const handleGetStarted = useCallback(() => {
		login();
	}, [login]);

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
					<button className="progress-banner-button" onClick={handleGetStarted}>
						Get Started
					</button>
				</div>
			</div>
		);
	}

	const isLoading = cashLoading || ordersLoading;
	const hasNoBalance = cashBalance === 0;
	const hasNeverTraded = orders.length === 0;
	const shouldShowFundBanner = !isLoading && hasNoBalance && hasNeverTraded;

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
					<DepositFundingButton
						className="progress-banner-button"
						ready={signerReady}
						onComplete={refreshAfterDeposit}
					>
						Add Funds
					</DepositFundingButton>
				</div>
			</div>
		);
	}

	return null;
}
