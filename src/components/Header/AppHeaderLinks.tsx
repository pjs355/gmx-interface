import { t } from "@lingui/macro";
// import { Trans } from "@lingui/react";
// Removed useLingui - not used after cleanup
import { useCallback, useState } from "react";
import { FiX } from "react-icons/fi";
import { Link } from "react-router-dom";

// Removed useNotifyModalState - not used after cleanup
// Removed userAnalytics imports - not needed for prediction markets

// Removed ExternalLink - not used in this component

import logoImg from "img/prinx.png";

import { HeaderLink } from "./HeaderLink";
import ModalWithPortal from "../Modal/ModalWithPortal";
// Removed LanguageModalContent - not needed for prediction markets

import "./Header.scss";

type Props = {
  small?: boolean;
  clickCloseIcon?: () => void;
  openSettings?: () => void;
  showRedirectModal: (to: string) => void;
};

export function AppHeaderLinks({ small, clickCloseIcon, showRedirectModal }: Props) {
  // Removed unused openNotifyModal and currentLanguage
  const [isLanguageModalOpen, setIsLanguageModalOpen] = useState(false);

  // const isLeaderboardActive = useCallback(
  //   (match: any, location: any) => Boolean(match) || location.pathname.startsWith("/competitions"),
  //   []
  // );

  const handleLanguageModalClose = useCallback(() => {
    setIsLanguageModalOpen(false);
  }, []);

  return (
    <>
      <div className="App-header-links">
        {small && (
          <div className="App-header-links-header">
            <Link className="App-header-link-main" to="/">
              <img src={logoImg} alt="GMX Logo" />
            </Link>
            <div
              className="App-header-menu-icon-block max-w-[450px]:mr-12 mr-8 !border-0"
              onClick={() => clickCloseIcon && clickCloseIcon()}
            >
              <FiX className="App-header-menu-icon" />
            </div>
          </div>
        )}
        <div className="App-header-link-container">
          {/* <HeaderLink qa="discover" to="/discover" showRedirectModal={showRedirectModal}>
            <Trans>Discover</Trans>
          </HeaderLink> */}
        </div>
        <div className="App-header-link-container">
          <HeaderLink
            qa="all"
            to="/predictions"
            showRedirectModal={showRedirectModal}
            exact
            isActive={(_match: any, location: any) => location.pathname === "/predictions"}
            onClick={() => {
              // Dispatch event to reset game filter on predictions page
              window.dispatchEvent(new CustomEvent("resetGameFilter"));
            }}
          >
            All
          </HeaderLink>
        </div>
        <div className="App-header-link-container">
          <HeaderLink 
            qa="esports" 
            to="/predictions/esports" 
            showRedirectModal={showRedirectModal}
            isActive={(_match: any, location: any) => location.pathname === "/predictions/esports"}
          >
            Esports
          </HeaderLink>
        </div>
        <div className="App-header-link-container">
          <HeaderLink 
            qa="games" 
            to="/predictions/games" 
            showRedirectModal={showRedirectModal}
            isActive={(_match: any, location: any) => location.pathname === "/predictions/games"}
          >
            Games
          </HeaderLink>
        </div>
        <div className="App-header-link-container">
          <HeaderLink qa="get-test-usdc" to="/get_test_usdc" showRedirectModal={showRedirectModal}>
            Get Test USDC
          </HeaderLink>
        </div>
        {/* Intentionally no Leaderboard or Positions text links here. Portfolio and Cash are separate buttons in AppHeaderUser. */}
        <div className="App-header-link-container">
          {/* <HeaderLink qa="trade" to="/trade" showRedirectModal={showRedirectModal}>
            <Trans>Trade</Trans>
          </HeaderLink> */}
        </div>
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
        {small && (
          <div className="App-header-link-container">
            <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsLanguageModalOpen(true); }}>
              Language
            </a>
          </div>
        )}
      </div>

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
    </>
  );
}
