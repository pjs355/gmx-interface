// import { Trans } from "@lingui/react";
import { usePrivy } from "@privy-io/react-auth";

// Removed BASE and getChainName - not used after cleanup
// Removed isDevelopment - not used
// Removed getIcon - GMX-specific
// Replace synthetic token balance with direct USDC balance hook
// import { usePortfolio } from "context/PortfolioContext";
// Removed useChainId - not used
// Removed lib/legacy imports - GMX-specific

// Removed all userAnalytics and GMX-specific imports
import { useSignerContext } from "context/SignerContext";
import { DepositFundingTrigger } from "@/features/funding/DepositFundingTrigger";
import { useAfterDepositRefresh } from "@/features/funding/useAfterDepositRefresh";

import { OneClickButton } from "components/OneClickButton/OneClickButton";
import { shortenAddress } from "@/services/wallets/shortenAddress";

import { HeaderLink } from "./HeaderLink";
// Removed unused Link import
import ConnectWalletButton from "../Common/ConnectWalletButton";
// Removed GMX-specific components: AddressDropdown, LanguagePopupHome, NetworkDropdown

import "./Header.scss";
import { usePortfolio as usePortfolioContext } from "@/context/PortfolioContext";
import { usePositionsPageMetricsGate } from "context/PositionsPageMetricsGateContext";
import {
	useClaimCashSyncPending,
	usePostTradePositionSyncPendingGlobal,
} from "@/features/trading/sor/post-trade/usePostTradeAccountSync";

type Props = {
	openSettings: () => void;
	small?: boolean;
	disconnectAccountAndCloseSettings: () => void;
	showRedirectModal: (to: string) => void;
	menuToggle?: React.ReactNode;
};

// Removed NETWORK_OPTIONS - not used since we removed NetworkDropdown

// Removed development networks - prediction markets only need Base

/* `disconnectAccountAndCloseSettings` stays in Props (callers still pass it;
 * the tablet drawer uses it) but this component no longer needs it — sign-out
 * moved to the profile page. */
export function AppHeaderUser({ small, menuToggle, openSettings, showRedirectModal }: Props) {
	// Simplified for prediction markets - centralized signer context
	const { authenticated: active, account, ready: signerReady } = useSignerContext();
	const { login, user } = usePrivy();
	const refreshAfterDeposit = useAfterDepositRefresh();
	const { portfolioTotal, cashBalance, cashLoading, portfolioLoading } = usePortfolioContext();
	const { blockHeaderMetrics } = usePositionsPageMetricsGate();
	const claimCashSyncPending = useClaimCashSyncPending();
	const postTradePositionSyncPending = usePostTradePositionSyncPendingGlobal();
	const showPortfolioMetricSkeleton =
		portfolioLoading || blockHeaderMetrics || postTradePositionSyncPending;
	// Cash: do not block on positions page shell — show when balance fetches complete
	const showCashMetricSkeleton = cashLoading || claimCashSyncPending;

	// Detect if user logged in with email (smart wallet) or external wallet
	const hasSmartWallet = user?.linkedAccounts?.some((acct: any) => acct?.type === "smart_wallet");
	const userEmail = user?.email?.address || user?.google?.email;
	const isSmartWallet = Boolean(hasSmartWallet && userEmail);

	const formatCurrency = (value: number | string | null | undefined): string => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		if (num === null || num === undefined || !isFinite(num)) return "--";
		const isInt = Math.abs(num % 1) < 1e-9;
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: isInt ? 0 : 2,
			maximumFractionDigits: isInt ? 0 : 2,
		}).format(num);
	};
	// Removed GMX-specific variables and tracking functions

	if (!active || !account) {
		return (
			<div className="App-header-user">
				{false ? ( // Removed isHomeSite check
					<div data-qa="trade" className="App-header-trade-link homepage-header text-body-medium">
						<HeaderLink className="default-btn" to="/" showRedirectModal={showRedirectModal}>
							Launch App
						</HeaderLink>
					</div>
				) : null}

				{/* Always show connection options for prediction markets */}
				{true ? (
					<>
						{/* Log In + Sign Up pair on every size — the burger (and its
						    drawer auth buttons) no longer exists on phones. */}
						<div
							className="login-text-link"
							onClick={() => {
								// Removed userAnalytics call
								login();
							}}
							style={{
								color: "var(--brand-primary)",
								cursor: "pointer",
								padding: "8px 12px",
								borderRadius: "6px",
								backgroundColor: "transparent",
								transition: "background-color 0.2s ease",
								fontSize: "var(--font-size-body-medium)",
								fontWeight: "700",
							}}
							onMouseEnter={(e) => {
								e.currentTarget.style.backgroundColor = "#1f2937";
							}}
							onMouseLeave={(e) => {
								e.currentTarget.style.backgroundColor = "transparent";
							}}
						>
							Log In
						</div>
						<ConnectWalletButton
							onClick={() => {
								// Removed userAnalytics call
								login();
							}}
						>
							Sign Up
						</ConnectWalletButton>
						{!small && <OneClickButton openSettings={openSettings} />}
						{/* <NetworkDropdown
              small={small}
              networkOptions={NETWORK_OPTIONS}
              selectorLabel={selectorLabel}
              openSettings={openSettings}
            /> */}
					</>
				) : null}
				{menuToggle}
			</div>
		);
	}

	/* Portfolio + Cash chips: shared by desktop and phone headers. */
	const portfolioMetric = (
		<div className="App-header-nav-portfolio" data-qa="header-portfolio-wrap">
			<HeaderLink
				className="header-metric-box header-metric-box--portfolio"
				to="/positions"
				showRedirectModal={showRedirectModal}
			>
				<div className="header-metric-row">
					<span className="header-metric-label">Portfolio</span>
					<span className="header-metric-value">
						{showPortfolioMetricSkeleton ? (
							<span
								className="skeleton-box"
								style={{
									display: "inline-block",
									width: 64,
									height: 14,
									borderRadius: 4,
									backgroundColor: "rgba(255, 255, 255, 0.1)",
								}}
							/>
						) : portfolioTotal === null || !isFinite(portfolioTotal) ? (
							"--"
						) : (
							`$${formatCurrency(portfolioTotal)}`
						)}
					</span>
				</div>
			</HeaderLink>
		</div>
	);

	const cashMetric = (
		<div className="App-header-nav-cash" data-qa="header-cash-wrap">
			<DepositFundingTrigger ready={signerReady} onComplete={refreshAfterDeposit}>
				{({ buyWithCard, canBuyWithCard }) => (
					<div
						data-qa="header-cash"
						data-qa-cash-amount={
							!cashLoading && typeof cashBalance === "number" && isFinite(cashBalance)
								? cashBalance
								: undefined
						}
						className="header-metric-box header-metric-box--cash"
						onClick={() => {
							if (canBuyWithCard) void buyWithCard();
						}}
						style={{
							cursor: canBuyWithCard ? "pointer" : "default",
						}}
					>
						<div className="header-metric-row">
							<span className="header-metric-label">Cash</span>
							<span className="header-metric-value">
								{showCashMetricSkeleton ? (
									<span
										className="skeleton-box"
										style={{
											display: "inline-block",
											width: 64,
											height: 14,
											borderRadius: 4,
											backgroundColor: "rgba(255, 255, 255, 0.1)",
										}}
									/>
								) : (
									`$${formatCurrency(cashBalance)}`
								)}
							</span>
						</div>
					</div>
				)}
			</DepositFundingTrigger>
		</div>
	);

	/* Desktop: metrics + profile chip under `.App-header-container-right`.
	 * The old AddressDropdown menu is gone — the chip goes straight to the
	 * profile page, where Sign Out now lives. */
	if (!small) {
		return (
			<>
				{portfolioMetric}
				{cashMetric}
				<div data-qa="user-address" className="App-header-nav-email">
					<HeaderLink
						className="header-metric-box header-profile-link"
						to="/profile"
						showRedirectModal={showRedirectModal}
					>
						<div className="header-metric-row">
							<span className="header-metric-value header-profile-link__label">
								{isSmartWallet && userEmail ? userEmail : shortenAddress(account as string, 13)}
							</span>
						</div>
					</HeaderLink>
				</div>
			</>
		);
	}

	/* Logged-in phone/tablet: balances live in the bar itself (no burger on
	 * phones — profile/sign-out are reachable via the bottom tabs). */
	return (
		<>
			{portfolioMetric}
			{cashMetric}
			{menuToggle}
		</>
	);
}
