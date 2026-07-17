import cx from "classnames";
import { useCallback, useEffect, useState } from "react";
import { RiMenuLine } from "react-icons/ri";
import { FiX } from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { useMedia } from "react-use";

import { AppHeaderLinks } from "./AppHeaderLinks";
import { AppHeaderUser } from "./AppHeaderUser";
import { HomeHeaderLinks } from "./HomeHeaderLinks";
import { isHomeSite } from "@/config/ui";

import "./Header.scss";
import { BRAND_NAME, clutchCometLogo } from "@/assets/brandLogo";

const LogoImage = () => (
	<img src={clutchCometLogo} alt={BRAND_NAME} className="App-header-logo-img" />
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
	<button type="button" aria-label="Open menu" className="App-header-menu-icon-block" onClick={onClick}>
		<RiMenuLine className="App-header-menu-icon" />
	</button>
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
	showMenuToggle: boolean;
	toggleDrawer: () => void;
	disconnectAccountAndCloseSettings: () => void;
	openSettings: () => void;
	showRedirectModal: (to: string) => void;
};

const HeaderLeft = ({ isMobile, navigate, showRedirectModal }: HeaderLeftProps) => {
	const HeaderContent = isHomeSite() ? HomeHeaderLinks : AppHeaderLinks;
	return (
		<div className="App-header-container-left">
			{isMobile && <MobileLogo onClick={() => navigate("/")} />}
			{!isMobile && <DesktopLogo />}
			{!isMobile && <HeaderContent showRedirectModal={showRedirectModal} />}
		</div>
	);
};

const HeaderRight = ({
	isMobile,
	showMenuToggle,
	toggleDrawer,
	disconnectAccountAndCloseSettings,
	openSettings,
	showRedirectModal,
}: HeaderRightProps) => (
	<div className="App-header-container-right">
		<AppHeaderUser
			disconnectAccountAndCloseSettings={disconnectAccountAndCloseSettings}
			openSettings={openSettings}
			showRedirectModal={showRedirectModal}
			small={isMobile}
			menuToggle={showMenuToggle && <MenuIcon onClick={toggleDrawer} />}
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
		<div className="App-header-drawer">
			<div className="App-header-drawer-close">
				<span className="App-header-drawer-title">Menu</span>
				<button
					type="button"
					aria-label="Close menu"
					className="App-header-menu-icon-block App-header-drawer-close-btn"
					onClick={closeDrawer}
				>
					<FiX className="App-header-menu-icon" />
				</button>
			</div>
			<div className="App-header-drawer-scrollable">
				<HeaderContent
					small
					clickCloseIcon={closeDrawer}
					showRedirectModal={showRedirectModal}
					openSettings={openSettings}
					disconnectAccountAndCloseSettings={disconnectAccountAndCloseSettings}
				/>
			</div>
		</div>
	);
};

const Backdrop = ({ onClick }: { onClick: () => void }) => (
	<div className="App-header-backdrop" onClick={onClick} />
);

const SelectorBackdrop = ({ isVisible, onClick }: { isVisible: boolean; onClick: () => void }) => {
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

/*
 * Stays mounted so the drawer can animate in AND out (translate/opacity via
 * the `is-open` class). Pointer events are disabled while closed in CSS.
 */
const DrawerContainer = ({
	isVisible,
	closeDrawer,
	showRedirectModal,
	openSettings,
	disconnectAccountAndCloseSettings,
}: DrawerContainerProps) => (
	<div
		className={cx("App-header-drawer-layer", { "is-open": isVisible })}
		aria-hidden={!isVisible}
	>
		<Backdrop onClick={closeDrawer} />
		<Drawer
			closeDrawer={closeDrawer}
			showRedirectModal={showRedirectModal}
			openSettings={openSettings}
			disconnectAccountAndCloseSettings={disconnectAccountAndCloseSettings}
		/>
	</div>
);

export function Header({
	disconnectAccountAndCloseSettings,
	openSettings,
	showRedirectModal,
}: Props) {
	const isMobile = useMedia("(max-width: 1335px)");
	// Phones have the bottom tab bar — no burger there. Tablets (769–1335px)
	// keep the drawer since the tab bar only renders ≤768px.
	const isPhone = useMedia("(max-width: 768px)");
	const navigate = useNavigate();

	const [isDrawerVisible, setIsDrawerVisible] = useState(false);
	const [isNativeSelectorModalVisible, setIsNativeSelectorModalVisible] = useState(false);
	const [isHeaderHidden, setIsHeaderHidden] = useState(false);

	const toggleDrawer = useCallback(() => {
		setIsDrawerVisible(!isDrawerVisible);
	}, [isDrawerVisible]);

	const closeDrawer = () => setIsDrawerVisible(false);
	const closeSelectorModal = () => setIsNativeSelectorModalVisible(false);

	// Lock body scroll when drawer is open
	useEffect(() => {
		if (isDrawerVisible) {
			// Save current scroll position
			const scrollY = window.scrollY;

			// Store scroll position
			document.body.setAttribute("data-scroll-y", scrollY.toString());

			// Add class to both html and body for CSS-based scroll lock
			document.documentElement.classList.add("drawer-open");
			document.body.classList.add("drawer-open");
			document.body.style.top = `-${scrollY}px`;

			// Get the drawer element (entire drawer, not just scrollable)
			const drawer = document.querySelector(".App-header-drawer");

			// Prevent wheel scroll on background (for mouse/laptop)
			const preventWheelScroll = (e: WheelEvent) => {
				const target = e.target as HTMLElement;
				// Allow scrolling within the drawer
				if (drawer && drawer.contains(target)) {
					return;
				}
				// Prevent background scrolling
				e.preventDefault();
			};

			// Prevent touch scroll on background (for mobile)
			const preventTouchScroll = (e: TouchEvent) => {
				const target = e.target as HTMLElement;
				// Allow scrolling within the drawer
				if (drawer && drawer.contains(target)) {
					return;
				}
				// Prevent background scrolling
				e.preventDefault();
			};

			// Add event listeners
			document.addEventListener("wheel", preventWheelScroll, { passive: false });
			document.addEventListener("touchmove", preventTouchScroll, { passive: false });

			return () => {
				// Remove classes
				document.documentElement.classList.remove("drawer-open");
				document.body.classList.remove("drawer-open");

				// Restore scroll position
				const scrollY = document.body.getAttribute("data-scroll-y");
				document.body.removeAttribute("data-scroll-y");
				document.body.style.top = "";

				if (scrollY) {
					window.scrollTo(0, parseInt(scrollY, 10));
				}

				// Remove event listeners
				document.removeEventListener("wheel", preventWheelScroll);
				document.removeEventListener("touchmove", preventTouchScroll);
			};
		}
		return undefined;
	}, [isDrawerVisible]);

	// Hide-on-scroll-down / show-on-scroll-up for mobile + tablet.
	// Threshold avoids jitter from tiny scroll deltas; rAF avoids layout thrash.
	useEffect(() => {
		if (!isMobile || isDrawerVisible) {
			setIsHeaderHidden(false);
			return;
		}

		// Commit to hiding almost immediately on any downward scroll — the sticky
		// filter pills reach the top within ~120px, so a large reveal offset left
		// the header lingering behind them. Small offset + delta = it's gone first.
		const SCROLL_DELTA = 5;
		const TOP_REVEAL_OFFSET = 8;
		let lastY = window.scrollY;
		let ticking = false;

		const update = () => {
			const currentY = window.scrollY;
			const diff = currentY - lastY;

			if (currentY <= TOP_REVEAL_OFFSET) {
				setIsHeaderHidden(false);
			} else if (Math.abs(diff) >= SCROLL_DELTA) {
				setIsHeaderHidden(diff > 0);
			}

			lastY = currentY;
			ticking = false;
		};

		const onScroll = () => {
			if (ticking) return;
			ticking = true;
			window.requestAnimationFrame(update);
		};

		window.addEventListener("scroll", onScroll, { passive: true });
		return () => window.removeEventListener("scroll", onScroll);
	}, [isMobile, isDrawerVisible]);

	// Publish hidden state so the sticky mobile filter pills can stick just below
	// the header while it's shown and slide up to the top edge as it leaves —
	// they move in sync instead of the header overlapping them mid-scroll.
	useEffect(() => {
		document.body.classList.toggle("app-header-hidden", isHeaderHidden);
		return () => document.body.classList.remove("app-header-hidden");
	}, [isHeaderHidden]);

	const isHome = isHomeSite();
	const drawerOpenSettings = isHome ? undefined : openSettings;
	const drawerDisconnect = isHome ? undefined : disconnectAccountAndCloseSettings;

	return (
		<>
			<SelectorBackdrop isVisible={isNativeSelectorModalVisible} onClick={closeSelectorModal} />
			<header data-qa="header">
				<div
					className={cx("App-header", {
						active: isDrawerVisible,
						"is-hidden": isHeaderHidden && !isDrawerVisible,
					})}
				>
					<HeaderLeft
						isMobile={isMobile}
						navigate={navigate}
						showRedirectModal={showRedirectModal}
					/>
					<HeaderRight
						isMobile={isMobile}
						showMenuToggle={isMobile && !isPhone}
						toggleDrawer={toggleDrawer}
						disconnectAccountAndCloseSettings={disconnectAccountAndCloseSettings}
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
