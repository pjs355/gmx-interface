import { useCallback, useState } from "react";
// Removed useNavigate and useLocation imports - not used after cleanup
import { ToastContainer, cssTransition } from "react-toastify";
// Removed Hash import - not used

import {
  SHOULD_EAGER_CONNECT_LOCALSTORAGE_KEY,
  CURRENT_PROVIDER_LOCALSTORAGE_KEY,
} from "config/localStorage";
import { TOAST_AUTO_CLOSE_TIME } from "config/ui";
import { isHomeSite } from "config/ui";
// Removed useRouteQuery import - was only used for referral codes
// Removed referral code imports - not needed for prediction markets

import { Header } from "components/Header/Header";
import { SettingsModal } from "components/SettingsModal/SettingsModal";
import { NotifyModal } from "components/NotifyModal/NotifyModal";

import { HomeRoutes } from "./HomeRoutes";
import { MainRoutes } from "./MainRoutes";

const Zoom = cssTransition({
  enter: "zoomIn",
  exit: "zoomOut",
  appendPosition: false,
  collapse: true,
  collapseDuration: 200,
});

export function AppRoutes() {
  const isHome = isHomeSite();
  // Removed location and navigate - not used after cleanup

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

  return (
    <>
      <div className="App">
        <div className="App-content">
          <Header
            disconnectAccountAndCloseSettings={disconnectAccountAndCloseSettings}
            openSettings={openSettings}
            showRedirectModal={showRedirectModal}
          />
          {isHome && <HomeRoutes />}
          {!isHome && <MainRoutes />}
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
      <SettingsModal isSettingsVisible={isSettingsVisible} setIsSettingsVisible={setIsSettingsVisible} />
      <NotifyModal />
    </>
  );
}
