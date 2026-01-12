import { useCallback, useState } from "react";
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
// ProgressBanner removed - welcome/fund banner no longer needed
// import { ProgressBanner } from "components/ProgressBanner";
// Commented out for production - Nintendo Switch countdown banner disabled
// import { CountdownBanner } from "components/CountdownBanner";
import { RPGPanel } from "components/RPGPanel";
import { TransfersModal } from "components/TransfersModal";

import { MainRoutes } from "./MainRoutes";

const Zoom = cssTransition({
	enter: "zoomIn",
	exit: "zoomOut",
	appendPosition: false,
	collapse: true,
	collapseDuration: 200,
});

export function AppRoutes() {
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
					{/* ProgressBanner removed - welcome/fund banner no longer needed */}
					{/* CountdownBanner commented out for production */}
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
			<TransfersModal />
		</>
	);
}
