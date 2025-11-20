import { useCallback, useState } from "react";
import { useLocation } from "react-router-dom";
import { ToastContainer, cssTransition } from "react-toastify";
// Removed Hash import - not used

import {
	SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY,
	CURRENT_PROVIDER_LOCALSTORAGE_KEY,
} from "config/localStorage";
import { TOAST_AUTO_CLOSE_TIME } from "config/ui";
// Removed useRouteQuery import - was only used for referral codes
// Removed referral code imports - not needed for prediction markets

import { Header } from "components/Header/Header";
import { SettingsModal } from "components/SettingsModal/SettingsModal";
import { NotifyModal } from "components/NotifyModal/NotifyModal";
import Footer from "components/Footer/Footer";
import { ProgressBanner } from "components/ProgressBanner";
import { CountdownBanner } from "components/CountdownBanner";
import { RPGPanel } from "components/RPGPanel";

import { MainRoutes } from "./MainRoutes";

const Zoom = cssTransition({
	enter: "zoomIn",
	exit: "zoomOut",
	appendPosition: false,
	collapse: true,
	collapseDuration: 200,
});

export function AppRoutes() {
	const location = useLocation();

	// Removed referral code logic - not needed for prediction markets

	const [isSettingsVisible, setIsSettingsVisible] = useState(false);

	const openSettings = useCallback(() => {
		setIsSettingsVisible(true);
	}, []);

	const disconnectAccountAndCloseSettings = () => {
		// Handle disconnect logic here if needed
		localStorage.removeItem(SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY);
		localStorage.removeItem(CURRENT_PROVIDER_LOCALSTORAGE_KEY);
		setIsSettingsVisible(false);
	};

	const showRedirectModal = useCallback((to: string) => {
		// Handle redirect modal logic if needed
		console.log("Redirect to:", to);
	}, []);

	// Don't show ProgressBanner on Get Test USD page
	const showProgressBanner = location.pathname !== "/get-test-usdc";
	
	// Don't show CountdownBanner on umbrella trading pages
	const isUmbrellaPage = location.pathname.includes("/predictions/umbrella/");

	return (
		<>
			<div className="App">
				<div className="App-content">
					<Header
						disconnectAccountAndCloseSettings={
							disconnectAccountAndCloseSettings
						}
						openSettings={openSettings}
						showRedirectModal={showRedirectModal}
					/>
					<RPGPanel />
					{showProgressBanner && <ProgressBanner />}
					{!isUmbrellaPage && <CountdownBanner />}
					<MainRoutes />
					<Footer />
				</div>
			</div>
			<ToastContainer
				limit={1}
				transition={Zoom}
				position="bottom-right"
				autoClose={TOAST_AUTO_CLOSE_TIME}
				hideProgressBar={true}
				newestOnTop={false}
				closeOnClick={false}
				draggable={false}
				pauseOnHover
				theme="dark"
				icon={false}
			/>
			<SettingsModal
				isSettingsVisible={isSettingsVisible}
				setIsSettingsVisible={setIsSettingsVisible}
			/>
			<NotifyModal />
		</>
	);
}
