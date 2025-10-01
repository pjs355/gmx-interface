import { Trans } from "@lingui/macro";
import cx from "classnames";
import React, { useCallback, useEffect, useState } from "react"; // react in scope for JSX
import { RiMenuLine } from "react-icons/ri";
import { Link } from "react-router-dom";
import { useMedia } from "react-use";

// Removed GMX legacy imports - not needed for prediction markets

import { HeaderPromoBanner } from "components/HeaderPromoBanner/HeaderPromoBanner";
// Removed GMX OneClickPromoBanner import - not needed for prediction markets

// Removed logo imports - using text instead

import { AppHeaderLinks } from "./AppHeaderLinks";
import { AppHeaderUser } from "./AppHeaderUser";
import { HeaderLink } from "./HeaderLink";
import { HomeHeaderLinks } from "./HomeHeaderLinks";
import { isHomeSite } from "lib/legacy";

import "./Header.scss";

type Props = {
	disconnectAccountAndCloseSettings: () => void;
	openSettings: () => void;
	showRedirectModal: (to: string) => void;
};

export function Header({
	disconnectAccountAndCloseSettings,
	openSettings,
	showRedirectModal,
}: Props) {
	const isMobile = useMedia("(max-width: 1335px)");

	// Removed unused media queries for GMX banners

	const [isDrawerVisible, setIsDrawerVisible] = useState(false);
	const [isNativeSelectorModalVisible, setIsNativeSelectorModalVisible] =
		useState(false);
	const isTradingIncentivesActive = false;

	const toggleDrawer = useCallback(() => {
		setIsDrawerVisible(!isDrawerVisible);
	}, [isDrawerVisible]);

	useEffect(() => {
		if (isDrawerVisible) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}

		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isDrawerVisible]);

	return (
		<>
			{isDrawerVisible && (
				<div
					className="App-header-backdrop"
					onClick={toggleDrawer}
				></div>
			)}
			{isNativeSelectorModalVisible && (
				<div
					className="selector-backdrop"
					onClick={() =>
						setIsNativeSelectorModalVisible(
							!isNativeSelectorModalVisible
						)
					}
				></div>
			)}
			<header data-qa="header">
				{!isMobile && (
					<div className="App-header large">
						<div className="App-header-container-left">
							<Link className="App-header-link-main" to="/">
								<span className="App-header-logo-text big">
									LevelUp
								</span>
								<span className="App-header-logo-text small">
									LevelUp
								</span>
							</Link>
							{isHomeSite() ? (
								<HomeHeaderLinks
									showRedirectModal={showRedirectModal}
								/>
							) : (
								<AppHeaderLinks
									showRedirectModal={showRedirectModal}
								/>
							)}
						</div>
						<div className="App-header-container-right">
							{/* Removed GMX promo banner logic */}

							<AppHeaderUser
								disconnectAccountAndCloseSettings={
									disconnectAccountAndCloseSettings
								}
								openSettings={openSettings}
								showRedirectModal={showRedirectModal}
							/>
						</div>
					</div>
				)}
				{isMobile && (
					<div
						className={cx("App-header", "small", {
							active: isDrawerVisible,
						})}
					>
						<div
							className={cx(
								"App-header-link-container",
								"App-header-top",
								{
									active: isDrawerVisible,
								}
							)}
						>
							<div className="App-header-container-left">
								<div
									className="App-header-link-main clickable"
									onClick={toggleDrawer}
								>
									<span className="App-header-logo-text big">
										LevelUp
									</span>
									<span className="App-header-logo-text small">
										LevelUp
									</span>
								</div>
							</div>
							<div className="App-header-container-right">
								{/* {!shouldHide1CTBanner && <OneClickPromoBanner openSettings={openSettings} />} */}
								<div>
									<AppHeaderUser
										disconnectAccountAndCloseSettings={
											disconnectAccountAndCloseSettings
										}
										openSettings={openSettings}
										small
										showRedirectModal={showRedirectModal}
										menuToggle={
											<div
												className="App-header-menu-icon-block"
												onClick={toggleDrawer}
											>
												<RiMenuLine className="App-header-menu-icon" />
											</div>
										}
									/>
								</div>
							</div>
						</div>
					</div>
				)}
				{isTradingIncentivesActive && (
					<HeaderPromoBanner>
						<Trans>
							Trade&nbsp;on GMX&nbsp;V2 in&nbsp;Arbitrum and
							win&nbsp;280,000&nbsp;ARB ({">"} $500k) in prizes in{" "}
							<HeaderLink
								to="/competitions/"
								showRedirectModal={showRedirectModal}
								className="clickable inline-block underline"
							>
								two&nbsp;weekly
							</HeaderLink>{" "}
							competitions. Live&nbsp;from&nbsp;March 13th to
							27th.
						</Trans>
					</HeaderPromoBanner>
				)}
			</header>
			{isDrawerVisible && (
				<div
					onClick={() => setIsDrawerVisible(false)}
					className="App-header-links-container App-header-drawer"
				>
					{isHomeSite() ? (
						<HomeHeaderLinks
							small
							clickCloseIcon={() => setIsDrawerVisible(false)}
							showRedirectModal={showRedirectModal}
						/>
					) : (
						<AppHeaderLinks
							small
							openSettings={openSettings}
							clickCloseIcon={() => setIsDrawerVisible(false)}
							showRedirectModal={showRedirectModal}
						/>
					)}
				</div>
			)}
		</>
	);
}
