import cx from "classnames";
import { FocusEventHandler, MouseEventHandler, ReactNode } from "react";
import { NavLink } from "react-router-dom";

// Removed GMX legacy imports - not needed for prediction markets
import { useRedirectPopupTimestamp } from "@/shared/hooks/useRedirectPopupTimestamp";

import "./Header.scss";

type Props = {
	isHomeLink?: boolean;
	className?: string;
	exact?: boolean;
	to: string;
	showRedirectModal: (to: string) => void;
	onClick?: MouseEventHandler<HTMLDivElement | HTMLAnchorElement>;
	onMouseEnter?: MouseEventHandler<HTMLAnchorElement>;
	onFocus?: FocusEventHandler<HTMLAnchorElement>;
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
	showRedirectModal: _showRedirectModal,
	onClick,
	onMouseEnter,
	onFocus,
	isActive,
	qa,
}: Props) {
	useRedirectPopupTimestamp();

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
			onMouseEnter={onMouseEnter}
			onFocus={onFocus}
			data-qa={qa}
		>
			{children}
		</NavLink>
	);
}
