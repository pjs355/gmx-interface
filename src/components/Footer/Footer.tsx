import { NavLink } from "react-router-dom";
import { useMedia } from "react-use";

import { isHomeSite } from "config/ui";
import ExternalLink from "components/ExternalLink/ExternalLink";
import { TrackingLink } from "components/TrackingLink/TrackingLink";

// Removed logo import - using text instead

import { SOCIAL_LINKS, getFooterLinks } from "./constants";
import "./Footer.scss";

type Props = {
  showRedirectModal?: (to: string) => void;
  redirectPopupTimestamp?: number;
  isMobileTradePage?: boolean;
};

export default function Footer({ showRedirectModal, redirectPopupTimestamp, isMobileTradePage }: Props) {
  const isHome = isHomeSite();
  const isMobile = useMedia("(max-width: 1024px)");
  const isVerySmall = useMedia("(max-width: 580px)");

  const linkClassName = `Footer-link ${!isVerySmall ? "text-body-medium" : "text-body-small"}`;

  return (
    <div className={`Footer ${isMobileTradePage ? "pb-large" : "pb-normal"}`}>
      <div className="Footer-content">
        <div className="Footer-left">
          <span className="Footer-logo-text">LevelUp</span>
        </div>
        <div className="Footer-center">
          {getFooterLinks(isHome).map(({ external, label, link, isAppLink }) => {
            if (external) {
              return (
                <ExternalLink key={label} href={link} className={linkClassName}>
                  {label}
                </ExternalLink>
              );
            }
            if (isAppLink) {
              const baseUrl = "";
              return (
                <a key={label} href={baseUrl + link} className={linkClassName}>
                  {label}
                </a>
              );
            }
            return (
              <NavLink key={link} to={link} className={({ isActive }) => `${linkClassName} ${isActive ? "active" : ""}`}>
                {label}
              </NavLink>
            );
          })}
        </div>
        <div className="Footer-right">
          {SOCIAL_LINKS.map((platform) => (
            <TrackingLink key={platform.name}>
              <ExternalLink href={platform.link} className="Footer-social">
                <img src={platform.icon} alt={platform.name} />
              </ExternalLink>
            </TrackingLink>
          ))}
        </div>
      </div>
    </div>
  );
}
