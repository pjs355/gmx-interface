import { t } from "@lingui/macro";

import discordIcon from "@/assets/img/ic_discord.svg";
import githubIcon from "@/assets/img/ic_github.svg";
import substackIcon from "@/assets/img/ic_substack.svg";
import telegramIcon from "@/assets/img/ic_telegram.svg";
import xIcon from "@/assets/img/ic_x.svg";

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
		home: [],
		app: [
			// { label: t`Media Kit`, link: "https://docs.gmx.io/docs/community/media-kit", external: true },
			// { label: "Jobs", link: "/jobs" },
		],
	};
	return FOOTER_LINKS[isHome ? "home" : "app"];
}

export const SOCIAL_LINKS: SocialLink[] = [
	{ link: "https://x.com/levelup_markets", name: "Twitter", icon: xIcon },
	//{ link: "https://t.me/prinx_io", name: "Telegram", icon: telegramIcon },
	// {
	// 	link: "https://discord.gg/hmnSBU2XrA",
	// 	name: "Discord",
	// 	icon: discordIcon,
	// },
];
