import { FiX } from "react-icons/fi";

import { HeaderLink } from "./HeaderLink";
import { useSignerContext } from "context/SignerContext";
import { usePrivy } from "@privy-io/react-auth";
import { useCopyToClipboard } from "react-use";
import { useNavigate } from "react-router-dom";
import { shortenAddress } from "@/services/wallets/shortenAddress";
import { usePortfolio } from "@/context/PortfolioContext";
import { usePositionsPageMetricsGate } from "context/PositionsPageMetricsGateContext";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import {
	useClaimCashSyncPending,
	usePostTradePositionSyncPendingGlobal,
} from "@/features/trading/sor/post-trade/usePostTradeAccountSync";

import "./Header.scss";

type Props = {
	small?: boolean;
	clickCloseIcon?: () => void;
	openSettings?: () => void;
	showRedirectModal: (to: string) => void;
	disconnectAccountAndCloseSettings?: () => void;
};

export function AppHeaderLinks({
	small,
	clickCloseIcon,
	showRedirectModal,
	disconnectAccountAndCloseSettings,
}: Props) {
	// Removed unused openNotifyModal and currentLanguage
	// TODO: Re-enable when language support is fully implemented
	// const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

	// Add portfolio data for mobile display
	const { authenticated: active, account } = useSignerContext();
	const { logout, login, user } = usePrivy();
	useCopyToClipboard();
	const navigate = useNavigate();
	const { portfolioTotal, cashBalance, cashLoading, portfolioLoading } = usePortfolio();
	const { blockHeaderMetrics } = usePositionsPageMetricsGate();
	const claimCashSyncPending = useClaimCashSyncPending();
	const postTradePositionSyncPending = usePostTradePositionSyncPendingGlobal();
	const showPortfolioMetricSkeleton =
		portfolioLoading || blockHeaderMetrics || postTradePositionSyncPending;
	// Cash: show as soon as balance fetches complete, not when positions page is still loading
	const showCashMetricSkeleton = cashLoading || claimCashSyncPending;

	// Shared profile query -- avoids duplicate /profiles/me fetches
	const profileQuery = useCurrentProfile();
	const username = profileQuery.data?.username ?? null;

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

	// const handleLanguageModalClose = useCallback(() => {
	//   setIsLanguageModalOpen(false);
	// }, []);

	return (
		<>
			<div className="App-header-links">
				{small && (
					<div className="App-header-links-header">
						<div
							className="App-header-menu-icon-block max-w-[450px]:mr-12 mr-8 !border-0"
							onClick={() => clickCloseIcon && clickCloseIcon()}
						>
							<FiX className="App-header-menu-icon" />
						</div>
					</div>
				)}
				{/* Mobile Login/Signup Display - Only show when NOT connected */}
				{small && !active && (
					<div className="App-header-mobile-auth-buttons">
						<button
							className="mobile-auth-button login-button"
							onClick={() => {
								login();
								if (clickCloseIcon) clickCloseIcon();
							}}
						>
							Log In
						</button>
						<button
							className="mobile-auth-button signup-button"
							onClick={() => {
								login();
								if (clickCloseIcon) clickCloseIcon();
							}}
						>
							Sign Up
						</button>
					</div>
				)}
				{/* Mobile Cash/Portfolio Display - Only show when connected */}
				{small && active && (
					<div className="App-header-mobile-metrics">
						<HeaderLink
							className="mobile-metric-box"
							to="/positions"
							showRedirectModal={showRedirectModal}
							onClick={(e) => {
								e.stopPropagation();
								if (clickCloseIcon) clickCloseIcon();
							}}
						>
							<div className="flex flex-col items-center" style={{ pointerEvents: "none" }}>
								<span className="text-xs font-bold text-white">Portfolio</span>
								<span
									className="text-sm font-normal text-white"
									style={{ minHeight: 20, display: "inline-flex", alignItems: "center" }}
								>
									{showPortfolioMetricSkeleton ? (
										<span
											className="skeleton-box"
											style={{
												display: "inline-block",
												width: 70,
												height: 16,
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
						<HeaderLink
							className="mobile-metric-box"
							to="/transfers"
							showRedirectModal={showRedirectModal}
							onClick={(e) => {
								e.stopPropagation();
								if (clickCloseIcon) clickCloseIcon();
							}}
						>
							<div className="flex flex-col items-center" style={{ pointerEvents: "none" }}>
								<span className="text-xs font-bold text-white">Cash</span>
								<span
									className="text-sm font-normal text-white"
									style={{ minHeight: 20, display: "inline-flex", alignItems: "center" }}
								>
									{showCashMetricSkeleton ? (
										<span
											className="skeleton-box"
											style={{
												display: "inline-block",
												width: 70,
												height: 16,
												borderRadius: 4,
												backgroundColor: "rgba(255, 255, 255, 0.1)",
											}}
										/>
									) : (
										`$${formatCurrency(cashBalance)}`
									)}
								</span>
							</div>
						</HeaderLink>
					</div>
				)}
				<div className="App-header-link-container">
					{/* <HeaderLink qa="discover" to="/discover" showRedirectModal={showRedirectModal}>
            <Trans>Discover</Trans>
          </HeaderLink> */}
				</div>
				<div className="App-header-link-container">
					<HeaderLink
						qa="markets"
						to="/"
						showRedirectModal={showRedirectModal}
						onClick={small ? clickCloseIcon : undefined}
						isActive={(_match: any, location: any) => {
							const path = location.pathname;
							return (
								path === "/" ||
								path === "/predictions" ||
								path === "/predictions/esports" ||
								path === "/predictions/games"
							);
						}}
					>
						Markets
					</HeaderLink>
				</div>
				{/* Second Markets tab (games-only list) disabled — all markets on home */}
				{/* <div className="App-header-link-container">
				<HeaderLink
					qa="predictions"
					to="/predictions/games"
					showRedirectModal={showRedirectModal}
					onClick={small ? clickCloseIcon : undefined}
					isActive={(_match: any, location: any) => {
						const path = location.pathname;
						return path === "/predictions" || path === "/predictions/games";
					}}
				>
					Markets
				</HeaderLink>
			</div> */}
				{active && (
					<div className="App-header-link-container">
						<HeaderLink
							qa="transfers"
							to="/transfers"
							showRedirectModal={showRedirectModal}
							onClick={small ? clickCloseIcon : undefined}
							isActive={(_match: any, location: any) => location.pathname === "/transfers"}
						>
							Transfers
						</HeaderLink>
					</div>
				)}
				<div className="App-header-link-container">
					<HeaderLink
						qa="all-odds"
						to="/all-odds"
						showRedirectModal={showRedirectModal}
						onClick={small ? clickCloseIcon : undefined}
						isActive={(_match: any, location: any) => location.pathname === "/all-odds"}
					>
						All Odds
					</HeaderLink>
				</div>
				<div className="App-header-link-container">
					<HeaderLink
						qa="about"
						to="/about"
						showRedirectModal={showRedirectModal}
						onClick={small ? clickCloseIcon : undefined}
						isActive={(_match: any, location: any) => location.pathname === "/about"}
					>
						About
					</HeaderLink>
				</div>
				<div className="App-header-link-container">
					{/* <HeaderLink qa="trade" to="/trade" showRedirectModal={showRedirectModal}>
            <Trans>Trade</Trans>
          </HeaderLink> */}
				</div>
				{small && active && account && (
					<>
						<div className="App-header-link-container mobile-address-dropdown">
							<div className="mobile-user-display">
								{username
									? `@${username}`
									: isSmartWallet && userEmail
										? userEmail
										: shortenAddress(account as string, 13)}
							</div>
						</div>
						<div className="App-header-link-container">
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault();
									navigate("/profile");
									if (clickCloseIcon) clickCloseIcon();
								}}
							>
								Profile
							</a>
						</div>
						<div className="App-header-link-container">
							<a
								href="#"
								onClick={(e) => {
									e.preventDefault();
									(disconnectAccountAndCloseSettings || (() => {}))();
									logout();
								}}
							>
								Sign out
							</a>
						</div>
					</>
				)}
				{/* <div className="App-header-link-container">
          <HeaderLink qa="pools" to="/pools" showRedirectModal={showRedirectModal}>
            <Trans>Pools</Trans>
          </HeaderLink>
        </div> */}

				{/* {small && (
          <div className="App-header-link-container">
            <a href="#" onClick={openNotifyModal}>
              <Trans>Alerts</Trans>
            </a>
          </div>
        )}
        {small && !isHomeSite() && (
          <div className="App-header-link-container">
            <a href="#" data-qa="settings" onClick={openSettings}>
              <Trans>Settings</Trans>
            </a>
          </div>
        )} */}
				{/* TODO: Re-enable language selection when language support is fully implemented
        {small && (
          <div className="App-header-link-container">
            <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsLanguageModalOpen(true); }}>
              Language
            </a>
          </div>
        )}
        */}
			</div>

			{/* TODO: Re-enable language modal when language support is fully implemented
      <ModalWithPortal
        className="language-popup"
        isVisible={isLanguageModalOpen}
        setIsVisible={setIsLanguageModalOpen}
        label={t`Select Language`}
      >
        <div>
          <p>Language selection not needed for prediction markets</p>
          <button onClick={handleLanguageModalClose}>Close</button>
        </div>
      </ModalWithPortal>
      */}
		</>
	);
}
