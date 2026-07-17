import { useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useMedia } from "react-use";
import {
	RiHome5Line,
	RiHome5Fill,
	RiPieChartLine,
	RiPieChartFill,
	RiWallet3Line,
	RiWallet3Fill,
	RiUser3Line,
	RiUser3Fill,
} from "react-icons/ri";

/**
 * App-style bottom tab bar (phones only, ≤768px via CSS).
 *
 * Pure navigation chrome over existing routes — no new functionality. Hidden
 * on the umbrella trading page, whose bottom edge belongs to the trade peek
 * bar / curtain. Styles live in `styles/mobile-app.css`.
 */

type TabSpec = {
	to: string;
	label: string;
	Icon: React.ComponentType<{ className?: string }>;
	ActiveIcon: React.ComponentType<{ className?: string }>;
	isActive: (pathname: string) => boolean;
};

const TABS: TabSpec[] = [
	{
		to: "/",
		label: "Markets",
		Icon: RiHome5Line,
		ActiveIcon: RiHome5Fill,
		isActive: (p) => p === "/" || p.startsWith("/predictions"),
	},
	{
		to: "/positions",
		label: "Positions",
		Icon: RiPieChartLine,
		ActiveIcon: RiPieChartFill,
		isActive: (p) => p === "/positions",
	},
	{
		to: "/transfers",
		label: "Cash",
		Icon: RiWallet3Line,
		ActiveIcon: RiWallet3Fill,
		isActive: (p) => p === "/transfers",
	},
	{
		to: "/profile",
		label: "Profile",
		Icon: RiUser3Line,
		ActiveIcon: RiUser3Fill,
		isActive: (p) => p === "/profile",
	},
];

export function MobileTabBar() {
	const { pathname } = useLocation();
	const isPhone = useMedia("(max-width: 768px)");

	// Trading page owns the bottom edge (peek bar + curtain) — no tab bar there.
	const hiddenForRoute = pathname.startsWith("/predictions/umbrella/");
	const visible = isPhone && !hiddenForRoute;

	// Pages pad their bottom edge (via CSS) only while the bar is shown.
	useEffect(() => {
		if (!visible) return;
		document.body.classList.add("has-mobile-tabbar");
		return () => {
			document.body.classList.remove("has-mobile-tabbar");
		};
	}, [visible]);

	if (!visible) return null;

	return (
		<nav className="mobile-tabbar" data-qa="mobile-tabbar" aria-label="Primary">
			{TABS.map((tab) => {
				const active = tab.isActive(pathname);
				const Icon = active ? tab.ActiveIcon : tab.Icon;
				return (
					<NavLink
						key={tab.to}
						to={tab.to}
						className={`mobile-tabbar__item${active ? " active" : ""}`}
						aria-current={active ? "page" : undefined}
					>
						<Icon className="mobile-tabbar__icon" />
						<span className="mobile-tabbar__label">{tab.label}</span>
					</NavLink>
				);
			})}
		</nav>
	);
}
