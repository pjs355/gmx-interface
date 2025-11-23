// import { t } from "@lingui/macro";
// import { Trans } from "@lingui/react";
// Removed useLingui - not used after cleanup
// import { useCallback, useState } from "react";
import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
// Removed useNotifyModalState - not used after cleanup
// Removed userAnalytics imports - not needed for prediction markets

// Removed ExternalLink - not used in this component

import { HeaderLink } from "./HeaderLink";
// import ModalWithPortal from "../Modal/ModalWithPortal";
// Removed LanguageModalContent - not needed for prediction markets
import { useSignerContext } from "context/SignerContext";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useCopyToClipboard } from "react-use";
import { useNavigate } from "react-router-dom";
import ExternalLink from "components/ExternalLink/ExternalLink";
import { shortenAddress } from "@/services/wallets/shortenAddress";
import { usePortfolio } from "context/PortfolioContext";
import { isHomeSite } from "config/ui";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

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
	const { logout, login, user, getAccessToken, ready, authenticated } = usePrivy();
	const { identityToken } = useIdentityToken();
	const [, copyToClipboard] = useCopyToClipboard();
	const navigate = useNavigate();
	const { portfolioTotal, cashBalance, cashLoading, portfolioLoading } =
		usePortfolio();
	const [username, setUsername] = useState<string | null>(null);

	// Detect if user logged in with email (smart wallet) or external wallet
	const hasSmartWallet = user?.linkedAccounts?.some(
		(acct: any) => acct?.type === "smart_wallet"
	);
	const userEmail = user?.email?.address || user?.google?.email;
	const isSmartWallet = Boolean(hasSmartWallet && userEmail);

	// Fetch username from profile API
	useEffect(() => {
		if (!ready || !authenticated || !identityToken) return;

		const fetchUsername = async () => {
			try {
				const serverUrl = getPredictionApiBaseUrl();
				const apiUrl = `${serverUrl}/profiles/me`;
				const accessToken = await getAccessToken();
				
				if (!accessToken) return;

				const headers: Record<string, string> = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
					"privy-id-token": identityToken,
				};

				const response = await fetch(apiUrl, { method: "GET", headers });
				if (!response.ok) return;

				const result = await response.json();
				if (result.success && result.data?.username) {
					setUsername(result.data.username);
				}
			} catch (error) {
				console.error("Failed to fetch username for mobile menu:", error);
			}
		};

		fetchUsername();
	}, [ready, authenticated, identityToken, getAccessToken]);

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

	// const isLeaderboardActive = useCallback(
	//   (match: any, location: any) => Boolean(match) || location.pathname.startsWith("/competitions"),
	//   []
	// );

	// TODO: Re-enable when language support is fully implemented
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
							onClick={clickCloseIcon}
						>
							<div className="flex flex-col items-center">
								<span className="text-xs font-bold text-white">
									Portfolio
								</span>
								<span className="text-sm font-normal text-white">
									{portfolioLoading ? (
										<span
											className="skeleton-box"
											style={{
												display: "inline-block",
												width: 70,
												height: 16,
												borderRadius: 4,
												backgroundColor:
													"rgba(255, 255, 255, 0.1)",
											}}
										/>
									) : portfolioTotal === null ||
									  !isFinite(portfolioTotal) ? (
										"--"
									) : (
										`$${formatCurrency(portfolioTotal)}`
									)}
								</span>
							</div>
						</HeaderLink>
						<HeaderLink
							className="mobile-metric-box"
							to="/get-test-usdc"
							showRedirectModal={showRedirectModal}
							onClick={clickCloseIcon}
						>
							<div className="flex flex-col items-center">
								<span className="text-xs font-bold text-white">
									Cash
								</span>
								<span className="text-sm font-normal text-white">
									{cashLoading ? (
										<span
											className="skeleton-box"
											style={{
												display: "inline-block",
												width: 70,
												height: 16,
												borderRadius: 4,
												backgroundColor:
													"rgba(255, 255, 255, 0.1)",
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
						qa="predictions"
						to="/predictions"
						showRedirectModal={showRedirectModal}
						onClick={small ? clickCloseIcon : undefined}
						isActive={(_match: any, location: any) => {
							const path = location.pathname;
							// Active on /predictions or /predictions/games, but NOT / (home) or /predictions/esports
							return path === "/predictions" || path === "/predictions/games";
						}}
					>
						Gaming
					</HeaderLink>
				</div>
				{/* Temporarily commented out - esports page disabled */}
				{/* <div className="App-header-link-container">
					<HeaderLink
						qa="esports"
						to="/predictions/esports"
						showRedirectModal={showRedirectModal}
						isActive={(_match: any, location: any) =>
							location.pathname === "/predictions/esports"
						}
					>
						Esports
					</HeaderLink>
				</div> */}
				<div className="App-header-link-container">
					<HeaderLink
						qa="leaderboard"
						to="/leaderboard"
						showRedirectModal={showRedirectModal}
						onClick={small ? clickCloseIcon : undefined}
						isActive={(_match: any, location: any) =>
							location.pathname === "/leaderboard"
						}
					>
						Leaderboard
					</HeaderLink>
				</div>
				<div className="App-header-link-container">
					<HeaderLink
						qa="prizes"
						to="/prizes"
						showRedirectModal={showRedirectModal}
						onClick={small ? clickCloseIcon : undefined}
						isActive={(_match: any, location: any) =>
							location.pathname === "/prizes"
						}
					>
						Prizes
					</HeaderLink>
				</div>
				{active && (
					<div className="App-header-link-container">
						<HeaderLink
							qa="get-test-usdc"
							to="/get-test-usdc"
							showRedirectModal={showRedirectModal}
							onClick={small ? clickCloseIcon : undefined}
						>
							Referral
						</HeaderLink>
					</div>
				)}
				<div className="App-header-link-container">
					<HeaderLink
						qa="about"
						to="/about"
						showRedirectModal={showRedirectModal}
						onClick={small ? clickCloseIcon : undefined}
						isActive={(_match: any, location: any) =>
							location.pathname === "/about"
						}
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
					<div className="App-header-link-container mobile-address-dropdown">
						<div className="mobile-address-inline">
							<div className="address-line">
								{username
									? `@${username}`
									: isSmartWallet && userEmail
									? userEmail
									: shortenAddress(account as string, 13)}
							</div>
							<button
								className="inline-item"
								onClick={() => {
									navigate("/profile");
									if (clickCloseIcon) clickCloseIcon();
								}}
							>
								Profile
							</button>
							<button
								className="inline-item"
								onClick={() => {
									(
										disconnectAccountAndCloseSettings ||
										(() => {})
									)();
									logout();
								}}
							>
								Sign out
							</button>
						</div>
					</div>
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
