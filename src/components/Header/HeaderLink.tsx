import cx from "classnames";
import { MouseEventHandler, ReactNode } from "react";
import { NavLink, NavLinkProps } from "react-router-dom";

// Removed GMX legacy imports - not needed for prediction markets
import { useRedirectPopupTimestamp } from "@/hooks/useRedirectPopupTimestamp";

import { TrackingLink } from "components/TrackingLink/TrackingLink";
import "./Header.scss";

type Props = {
	isHomeLink?: boolean;
	className?: string;
	exact?: boolean;
	to: string;
	showRedirectModal: (to: string) => void;
	onClick?: MouseEventHandler<HTMLDivElement | HTMLAnchorElement>;
	children?: ReactNode;
	isActive?: any;
	qa?: string;
};

export function HeaderLink({
	isHomeLink,
	className,
	exact,
	to,
	children,
	showRedirectModal,
	onClick,
	isActive,
	qa,
}: Props) {
	const isOnHomePage = window.location.pathname === "/";
	const isHome = false; // Prediction markets are always app, not home
	const { timestamp: redirectPopupTimestamp } = useRedirectPopupTimestamp();

	if (isHome && !(isHomeLink && !isOnHomePage)) {
		if (false) {
			// Disabled GMX redirect modal logic
			return (
				<div
					className={cx("a", className, { active: isHomeLink })}
					onClick={(e) => {
						if (onClick) {
							onClick(e);
						}
						showRedirectModal(to);
					}}
				>
					{children}
				</div>
			);
		} else {
			const baseUrl = ""; // No base URL needed for prediction markets

			const LinkComponent = (
				<a
					className={cx("a", className, { active: isHomeLink })}
					href={baseUrl + to}
				>
					{children}
				</a>
			);

			return onClick ? (
				<TrackingLink onClick={onClick}>{LinkComponent}</TrackingLink>
			) : (
				LinkComponent
			);
		}
	}

	if (isHomeLink) {
		return (
			<a href="/" className={cx(className)} onClick={onClick}>
				{children}
			</a>
		);
	}

	return (
		<NavLink
			className={({ isActive: navIsActive }) => {
				// Use custom isActive if provided, otherwise use NavLink's default
				const active = isActive ? isActive(null, window.location) : navIsActive;
				return cx(className, { active });
			}}
			end={exact}
			to={to}
			onClick={onClick}
			data-qa={qa}
		>
			{children}
		</NavLink>
	);
}
