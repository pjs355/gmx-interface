import discordIcon from "@/assets/img/ic_discord.svg";
import xIcon from "@/assets/img/ic_x.svg";

type Link = {
	label: string;
	link: string;
	external?: boolean;
	isAppLink?: boolean;
	opensModal?: boolean;
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
			{ label: "Learn", link: "/learn", isAppLink: true },
			{ label: "Blog", link: "/blog", isAppLink: true },
			{ label: "About", link: "/about", isAppLink: true },
			{ label: "Privacy Policy", link: "privacy-policy", opensModal: true },
			// { label: t`Media Kit`, link: "https://docs.gmx.io/docs/community/media-kit", external: true },
			// { label: "Jobs", link: "/jobs" },
		],
	};
	return FOOTER_LINKS[isHome ? "home" : "app"];
}

export const SOCIAL_LINKS: SocialLink[] = [
	{ link: "https://x.com/levelup_markets", name: "Twitter", icon: xIcon },
	{ link: "https://discord.gg/JFD6MPZbSq", name: "Discord", icon: discordIcon },
	//{ link: "https://t.me/prinx_io", name: "Telegram", icon: telegramIcon },
];
