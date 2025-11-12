import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
import { RiMenuLine } from "react-icons/ri";
import { Link, useNavigate } from "react-router-dom";
import { useMedia } from "react-use";

import { AppHeaderLinks } from "./AppHeaderLinks";
import { AppHeaderUser } from "./AppHeaderUser";
import { HomeHeaderLinks } from "./HomeHeaderLinks";
import { isHomeSite } from "@/config/ui";
import newLogo from "@/assets/img/new-logo.png";

import "./Header.scss";

const LogoImage = () => (
	<>
		<img
			src={newLogo}
			alt="LevelUp"
			className="App-header-logo-image big"
		/>
		<img
			src={newLogo}
			alt="LevelUp"
			className="App-header-logo-image small"
		/>
	</>
);

const MobileLogo = ({ onClick }: { onClick: () => void }) => (
	<div className="App-header-link-main clickable" onClick={onClick}>
		<LogoImage />
	</div>
);

const DesktopLogo = () => (
	<Link className="App-header-link-main" to="/">
		<LogoImage />
	</Link>
);

const MenuIcon = ({ onClick }: { onClick: () => void }) => (
	<div className="App-header-menu-icon-block" onClick={onClick}>
		<RiMenuLine className="App-header-menu-icon" />
	</div>
);

type Props = {
	disconnectAccountAndCloseSettings: () => void;
	openSettings: () => void;
	showRedirectModal: (to: string) => void;
};

type HeaderLeftProps = {
	isMobile: boolean;
	navigate: (path: string) => void;
	showRedirectModal: (to: string) => void;
};

type HeaderRightProps = {
	isMobile: boolean;
	toggleDrawer: () => void;
	disconnectAccountAndCloseSettings: () => void;
	openSettings: () => void;
	showRedirectModal: (to: string) => void;
};

const HeaderLeft = ({
	isMobile,
	navigate,
	showRedirectModal,
}: HeaderLeftProps) => {
	const HeaderContent = isHomeSite() ? HomeHeaderLinks : AppHeaderLinks;
	return (
		<div className="App-header-container-left">
			{isMobile && <MobileLogo onClick={() => navigate("/")} />}
			{!isMobile && <DesktopLogo />}
			{!isMobile && (
				<HeaderContent showRedirectModal={showRedirectModal} />
			)}
		</div>
	);
};

const HeaderRight = ({
	isMobile,
	toggleDrawer,
	disconnectAccountAndCloseSettings,
	openSettings,
	showRedirectModal,
}: HeaderRightProps) => (
	<div className="App-header-container-right">
		<AppHeaderUser
			disconnectAccountAndCloseSettings={
				disconnectAccountAndCloseSettings
			}
			openSettings={openSettings}
			showRedirectModal={showRedirectModal}
			small={isMobile}
			menuToggle={isMobile && <MenuIcon onClick={toggleDrawer} />}
		/>
	</div>
);

type DrawerProps = {
	closeDrawer: () => void;
	showRedirectModal: (to: string) => void;
	openSettings?: () => void;
	disconnectAccountAndCloseSettings?: () => void;
};

const Drawer = ({
	closeDrawer,
	showRedirectModal,
	openSettings,
	disconnectAccountAndCloseSettings,
}: DrawerProps) => {
	const HeaderContent = isHomeSite() ? HomeHeaderLinks : AppHeaderLinks;
	return (
		<div
			onClick={closeDrawer}
			className="App-header-links-container App-header-drawer"
		>
			<HeaderContent
				small
				clickCloseIcon={closeDrawer}
				showRedirectModal={showRedirectModal}
				openSettings={openSettings}
				disconnectAccountAndCloseSettings={
					disconnectAccountAndCloseSettings
				}
			/>
		</div>
	);
};

const Backdrop = ({
	isVisible,
	onClick,
}: {
	isVisible: boolean;
	onClick: () => void;
}) => {
	if (!isVisible) return null;
	return <div className="App-header-backdrop" onClick={onClick} />;
};

const SelectorBackdrop = ({
	isVisible,
	onClick,
}: {
	isVisible: boolean;
	onClick: () => void;
}) => {
	if (!isVisible) return null;
	return <div className="selector-backdrop" onClick={onClick} />;
};

type DrawerContainerProps = {
	isVisible: boolean;
	closeDrawer: () => void;
	showRedirectModal: (to: string) => void;
	openSettings?: () => void;
	disconnectAccountAndCloseSettings?: () => void;
};

const DrawerContainer = ({
	isVisible,
	closeDrawer,
	showRedirectModal,
	openSettings,
	disconnectAccountAndCloseSettings,
}: DrawerContainerProps) => {
	if (!isVisible) return null;
	return (
		<Drawer
			closeDrawer={closeDrawer}
			showRedirectModal={showRedirectModal}
			openSettings={openSettings}
			disconnectAccountAndCloseSettings={
				disconnectAccountAndCloseSettings
			}
		/>
	);
};

export function Header({
	disconnectAccountAndCloseSettings,
	openSettings,
	showRedirectModal,
}: Props) {
	const isMobile = useMedia("(max-width: 1335px)");
	const navigate = useNavigate();

	const [isDrawerVisible, setIsDrawerVisible] = useState(false);
	const [isNativeSelectorModalVisible, setIsNativeSelectorModalVisible] =
		useState(false);

	const toggleDrawer = useCallback(() => {
		setIsDrawerVisible(!isDrawerVisible);
	}, [isDrawerVisible]);

	useEffect(() => {
		document.body.style.overflow = isDrawerVisible ? "hidden" : "unset";
		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isDrawerVisible]);

	const closeDrawer = () => setIsDrawerVisible(false);
	const closeSelectorModal = () => setIsNativeSelectorModalVisible(false);

	const isHome = isHomeSite();
	const drawerOpenSettings = isHome ? undefined : openSettings;
	const drawerDisconnect = isHome
		? undefined
		: disconnectAccountAndCloseSettings;

	return (
		<>
			<Backdrop isVisible={isDrawerVisible} onClick={toggleDrawer} />
			<SelectorBackdrop
				isVisible={isNativeSelectorModalVisible}
				onClick={closeSelectorModal}
			/>
			<header data-qa="header">
				<div className={cx("App-header", { active: isDrawerVisible })}>
					<HeaderLeft
						isMobile={isMobile}
						navigate={navigate}
						showRedirectModal={showRedirectModal}
					/>
					<HeaderRight
						isMobile={isMobile}
						toggleDrawer={toggleDrawer}
						disconnectAccountAndCloseSettings={
							disconnectAccountAndCloseSettings
						}
						openSettings={openSettings}
						showRedirectModal={showRedirectModal}
					/>
				</div>
			</header>
			<DrawerContainer
				isVisible={isDrawerVisible}
				closeDrawer={closeDrawer}
				showRedirectModal={showRedirectModal}
				openSettings={drawerOpenSettings}
				disconnectAccountAndCloseSettings={drawerDisconnect}
			/>
		</>
	);
}
