import { t } from "@lingui/macro";
import { FiX } from "react-icons/fi";
// Removed GMX legacy imports - not needed for prediction markets
// Removed GMX userAnalytics imports - not needed for prediction markets
import { useRedirectPopupTimestamp } from "@/hooks/useRedirectPopupTimestamp";
import { useSignerContext } from "context/SignerContext";

import ExternalLink from "components/ExternalLink/ExternalLink";

import { HeaderLink } from "./HeaderLink";

import "./Header.scss";

type Props = {
	small?: boolean;
	clickCloseIcon?: () => void;
	showRedirectModal: (to: string) => void;
};

type HomeLink = {
	label: string;
	link: string;
	isHomeLink?: boolean | false;
	onClick?: () => void;
};

export function HomeHeaderLinks({
	small,
	clickCloseIcon,
	showRedirectModal,
}: Props) {
	const { timestamp: redirectPopupTimestamp } = useRedirectPopupTimestamp();
	const { authenticated: active } = useSignerContext();

	// Note: This component is not currently used since isHomeSite() returns false
	// The app always uses AppHeaderLinks instead
	const HOME_MENUS: HomeLink[] = [
		{
			label: t`App`,
			isHomeLink: true,
			link: `/predictions`,
			onClick: () => {
				// No analytics tracking needed
			},
		},
		...(active
			? [
					{
						label: t`Referral`,
						link: "/get-test-usdc",
						isHomeLink: true,
					},
			  ]
			: []),
	];
	return (
		<div className="App-header-links">
			{small && (
				<div className="App-header-links-header">
					<div
						className="App-header-menu-icon-block mobile-cross-menu"
						onClick={() => clickCloseIcon && clickCloseIcon()}
					>
						<FiX className="App-header-menu-icon" />
					</div>
				</div>
			)}
			{HOME_MENUS.map(({ link, label, isHomeLink = false, onClick }) => {
				return (
					<div key={label} className="App-header-link-container">
						{isHomeLink ? (
							<HeaderLink
								onClick={onClick}
								to={link}
								showRedirectModal={showRedirectModal}
							>
								{label}
							</HeaderLink>
						) : (
							<ExternalLink href={link}>{label}</ExternalLink>
						)}
					</div>
				);
			})}
		</div>
	);
}
