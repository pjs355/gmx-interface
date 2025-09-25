import { t } from "@lingui/macro";

import discordIcon from "img/ic_discord.svg";
import githubIcon from "img/ic_github.svg";
import substackIcon from "img/ic_substack.svg";
import telegramIcon from "img/ic_telegram.svg";
import xIcon from "img/ic_x.svg";

type Link = {
  label: string;
  link: string;
  external?: boolean;
  isAppLink?: boolean;
};

type SocialLink = {
  link: string;
  name: string;
  icon: string;
};

export function getFooterLinks(isHome: boolean) {
  const FOOTER_LINKS: { home: Link[]; app: Link[] } = {
    home: [
      { label: t`Terms and Conditions`, link: "/terms-and-conditions" },
      { label: t`Referral Terms`, link: "/referral-terms" },
      // { label: t`Media Kit`, link: "https://docs.gmx.io/docs/community/media-kit", external: true },
      // { label: "Jobs", link: "/jobs", isAppLink: true },
    ],
    app: [
      // { label: t`Media Kit`, link: "https://docs.gmx.io/docs/community/media-kit", external: true },
      // { label: "Jobs", link: "/jobs" },
    ],
  };
  return FOOTER_LINKS[isHome ? "home" : "app"];
}

export const SOCIAL_LINKS: SocialLink[] = [
  { link: "https://x.com/prinx_io", name: "Twitter", icon: xIcon },
  { link: "https://t.me/prinx_io", name: "Telegram", icon: telegramIcon },
  { link: "https://discord.gg/hmnSBU2XrA", name: "Discord", icon: discordIcon },
];
