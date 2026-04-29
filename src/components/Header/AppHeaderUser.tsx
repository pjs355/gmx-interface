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
import { useUserData } from "@/context/UserDataContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import {
	PrivyGatedFundTrigger,
	resolvePrivyEvmFundTarget,
} from "@/components/PrivyGatedFundWallet/PrivyGatedFundWallet";

import { OneClickButton } from "components/OneClickButton/OneClickButton";
import AddressDropdown from "components/AddressDropdown/AddressDropdown";

import { HeaderLink } from "./HeaderLink";
// Removed unused Link import
import ConnectWalletButton from "../Common/ConnectWalletButton";
// Removed GMX-specific components: AddressDropdown, LanguagePopupHome, NetworkDropdown

import "./Header.scss";
import { usePortfolio as usePortfolioContext } from "@/context/PortfolioContext";
import { usePositionsPageMetricsGate } from "context/PositionsPageMetricsGateContext";

type Props = {
	openSettings: () => void;
	small?: boolean;
	disconnectAccountAndCloseSettings: () => void;
	showRedirectModal: (to: string) => void;
	menuToggle?: React.ReactNode;
};

// Removed NETWORK_OPTIONS - not used since we removed NetworkDropdown

// Removed development networks - prediction markets only need Base

export function AppHeaderUser({
	small,
	menuToggle,
	openSettings,
	disconnectAccountAndCloseSettings,
	showRedirectModal,
}: Props) {
    // Simplified for prediction markets - centralized signer context
    const { authenticated: active, account, ready: signerReady } = useSignerContext();
	const { login, user, authenticated } = usePrivy();
	const { refresh: refreshUserData } = useUserData();
	const funding = useFundingAddresses();
	const fundEvmTarget = resolvePrivyEvmFundTarget(
		funding.baseSmartWallet,
		account
	);
	const { portfolioTotal, cashBalance, cashLoading, portfolioLoading } = usePortfolioContext();
	const { blockHeaderMetrics } = usePositionsPageMetricsGate();
	const showPortfolioMetricSkeleton = portfolioLoading || blockHeaderMetrics;
	// Cash: do not block on positions page shell — show when balance fetches complete
	const showCashMetricSkeleton = cashLoading;

	// Detect if user logged in with email (smart wallet) or external wallet
	const hasSmartWallet = user?.linkedAccounts?.some(
		(acct: any) => acct?.type === "smart_wallet"
	);
	const userEmail = user?.email?.address || user?.google?.email;
	const isSmartWallet = Boolean(hasSmartWallet && userEmail);

	const formatCurrency = (
		value: number | string | null | undefined
	): string => {
		const num = typeof value === "string" ? parseFloat(value) : value;
		if (num === null || num === undefined || !isFinite(num)) return "--";
		return new Intl.NumberFormat("en-US", {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		}).format(num);
	};
	// Removed GMX-specific variables and tracking functions

	if (!active || !account) {
		return (
			<div className="App-header-user">
				{false ? ( // Removed isHomeSite check
					<div
						data-qa="trade"
						className="App-header-trade-link homepage-header text-body-medium"
					>
						<HeaderLink
							className="default-btn"
							to="/"
							showRedirectModal={showRedirectModal}
						>
							Launch App
						</HeaderLink>
					</div>
				) : null}

				{/* Always show connection options for prediction markets */}
				{true ? (
					<>
						{!small && (
							<div
								className="login-text-link"
								onClick={() => {
									// Removed userAnalytics call
									login();
								}}
								style={{
									color: "#8b5cf6",
									cursor: "pointer",
									padding: "8px 12px",
									borderRadius: "6px",
									backgroundColor: "transparent",
									transition: "background-color 0.2s ease",
									fontSize: "var(--font-size-body-medium)",
									fontWeight: "700",
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor =
										"#1f2937";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor =
										"transparent";
								}}
							>
								Log In
							</div>
						)}
						<ConnectWalletButton
							onClick={() => {
								// Removed userAnalytics call
								login();
							}}
						>
							{small ? "Get Started" : "Sign Up"}
						</ConnectWalletButton>
						{!small && (
							<OneClickButton openSettings={openSettings} />
						)}
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

	// Build simple Base explorer URL
	const accountUrl = account ? `https://basescan.org/address/${account}` : "";

	return (
		<div className="App-header-user">
			{/* Removed isHomeSite check - not needed for prediction markets */}
			{false ? (
				<div
					data-qa="trade"
					className="App-header-trade-link text-body-medium"
				>
					<HeaderLink
						className="default-btn"
						to="/"
						showRedirectModal={showRedirectModal}
					>
						Launch App
					</HeaderLink>
				</div>
			) : null}

			{true ? ( // Always show for prediction markets
				<>
					{/* Portfolio Display - Hidden on mobile */}
					{!small && (
						<HeaderLink
							className="header-metric-box mr-4"
							to="/positions"
							showRedirectModal={showRedirectModal}
						>
							<div className="flex flex-col items-center">
								<span
									className="text-xs font-bold text-white"
									style={{ color: "white" }}
								>
									Portfolio
								</span>
								<span
									className="text-sm font-normal text-white"
									style={{ color: "white", minHeight: 20, display: "inline-flex", alignItems: "center" }}
								>
									{showPortfolioMetricSkeleton ? (
										<span className="skeleton-box" style={{ display: 'inline-block', width: 70, height: 16, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
									) : portfolioTotal === null || !isFinite(portfolioTotal) ? (
										"--"
									) : (
										`$${formatCurrency(portfolioTotal)}`
									)}
								</span>
							</div>
						</HeaderLink>
					)}
					{/* USDC Balance Display - Hidden on mobile - Clicks open Privy deposit */}
					{!small && (
						<PrivyGatedFundTrigger
							fundTarget={fundEvmTarget}
							ready={signerReady}
							onAfterFund={refreshUserData}
						>
							{({ openFund, canFund }) => (
						<div
							data-qa="header-cash"
							data-qa-cash-amount={
								!cashLoading &&
								typeof cashBalance === "number" &&
								isFinite(cashBalance)
									? cashBalance
									: undefined
							}
							className="header-metric-box mr-4"
							onClick={() => {
								if (canFund) void openFund();
							}}
							style={{ cursor: canFund ? "pointer" : "default" }}
						>
							<div className="flex flex-col items-center">
								<span
									className="text-xs font-bold text-white"
									style={{ color: "white" }}
								>
									Cash
								</span>
								<span
									className="text-sm font-normal text-white"
									style={{ color: "white", minHeight: 20, display: "inline-flex", alignItems: "center" }}
								>
									{showCashMetricSkeleton ? (
										<span className="skeleton-box" style={{ display: 'inline-block', width: 70, height: 16, borderRadius: 4, backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
									) : (
										`$${formatCurrency(cashBalance)}`
									)}
								</span>
							</div>
						</div>
							)}
						</PrivyGatedFundTrigger>
					)}

                    {!small && (
                        <div
                            data-qa="user-address"
                            className="App-header-user-address"
                        >
                            <AddressDropdown
                                account={account as string}
                                accountUrl={accountUrl}
                                disconnectAccountAndCloseSettings={
                                    disconnectAccountAndCloseSettings
                                }
                                userEmail={userEmail}
                                isSmartWallet={isSmartWallet}
                            />
                        </div>
                    )}
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
