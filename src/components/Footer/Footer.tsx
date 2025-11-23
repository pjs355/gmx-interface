import React, { useState } from "react";
import { NavLink } from "react-router-dom";
import { useMedia } from "react-use";

import { isHomeSite } from "config/ui";
import ExternalLink from "components/ExternalLink/ExternalLink";
import { TrackingLink } from "components/TrackingLink/TrackingLink";
import Modal from "components/Modal/Modal";

// Removed logo import - using text instead

import { SOCIAL_LINKS, getFooterLinks } from "./constants";
import "./Footer.scss";

type Props = {
	showRedirectModal?: (to: string) => void;
	redirectPopupTimestamp?: number;
	isMobileTradePage?: boolean;
};

const PRIVACY_POLICY_CONTENT = `Privacy Policy for LevelUp Markets

Last Updated: November 21, 2025

LevelUp Markets ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard information when you use our free esports prediction simulator and RPG-style progression system ("the App").

We prioritize transparency and minimal data collection. We do not sell user data, and we do not share personal information with third parties except where required for essential functionality.

1. Information We Collect

1.1. Information You Provide

Account information: Email and username (if you choose to create an account).

Profile info: Avatar choice, display name, and preferences.

Prediction activity: Your in-app choices, match predictions, "XP" earned, and simulated currency usage.

1.2. Automatically Collected Data

We collect minimal technical data necessary to operate the App:

Device type

Browser type and version

Approximate location (country-level only)

IP address (stored temporarily for security and rate-limiting)

Log data such as page views, errors, and session length.

We do not track cross-site behavior and do not use invasive advertising trackers.

1.3. No Sensitive Data

We do not collect:

real-world financial information

payment data

government IDs

biometric data

health data

precise location

2. How We Use Your Information

We use the collected data to:

Provide and improve the App

Track in-app progress (XP, level, accuracy rates)

Maintain fair gameplay

Prevent fraud and abuse

Analyze aggregate usage trends

Communicate important updates (if you opt in)

We do not use your information for advertising or resale.

3. How We Store and Protect Data

All data is stored securely using industry-standard encryption.

Access is limited to authorized team members.

We retain data only as long as necessary for the functionality of the App.

We periodically delete inactive accounts and old logs.

4. Children's Privacy (COPPA Compliance)

The App is not intended for users under 18.

We do not knowingly collect personal information from users under 18.

If we learn that such data was collected, we will delete it immediately.

5. User Rights (GDPR & CCPA)

Depending on your region, you may have the right to:

Access the data we store about you

Request deletion of your account and data

Request correction of inaccurate information

Request a copy of your stored data

Opt out of data processing related to analytics

Not be discriminated against for exercising privacy rights

To exercise these rights, contact us at:

support@levelupmarkets.com

6. Data Sharing

We only share data with:

Infrastructure providers (e.g., hosting, databases)

Error-logging services (to fix bugs)

We never sell your data or share it with advertisers, affiliates, or gambling operators.

7. Third-Party Services

If the App integrates any third-party API (e.g., for authentication or analytics), those services may collect their own technical data.

We do not allow them to use your information for marketing or profiling.

8. International Users

Data may be stored or processed in the United States or other countries with adequate security protections.

By using the App, you consent to this transfer.

9. Changes to This Policy

We may update this Privacy Policy periodically.

The "Last Updated" date will reflect any changes.

10. Contact Us

For questions or concerns, email:

support@levelupmarkets.com`;

export default function Footer({
	showRedirectModal,
	redirectPopupTimestamp,
	isMobileTradePage,
}: Props) {
	const isHome = isHomeSite();
	const isMobile = useMedia("(max-width: 1024px)");
	const isVerySmall = useMedia("(max-width: 580px)");
	const [isPrivacyModalVisible, setIsPrivacyModalVisible] = useState(false);

	const linkClassName = `Footer-link ${
		!isVerySmall ? "text-body-medium" : "text-body-small"
	}`;

	const formatPrivacyPolicy = (text: string) => {
		const paragraphs = text.split("\n\n");
		const formatted: React.ReactNode[] = [];

		paragraphs.forEach((para, paraIdx) => {
			const trimmed = para.trim();
			if (!trimmed) return;

			// Main section headers (numbered like "1. Information We Collect")
			if (/^\d+\.\s/.test(trimmed)) {
				formatted.push(
					<h2
						key={`h2-${paraIdx}`}
						style={{
							fontSize: "1.5rem",
							fontWeight: 700,
							marginTop: paraIdx > 0 ? "2rem" : "0",
							marginBottom: "1rem",
							color: "#ffffff",
						}}
					>
						{trimmed}
					</h2>
				);
			}
			// Subsection headers (like "1.1. Information You Provide")
			else if (/^\d+\.\d+\.\s/.test(trimmed)) {
				formatted.push(
					<h3
						key={`h3-${paraIdx}`}
						style={{
							fontSize: "1.25rem",
							fontWeight: 600,
							marginTop: "1.5rem",
							marginBottom: "0.75rem",
							color: "#ffffff",
						}}
					>
						{trimmed}
					</h3>
				);
			}
			// List items (lines separated by single newlines within a paragraph)
			else if (
				trimmed.includes("\n") &&
				trimmed
					.split("\n")
					.every(
						(line) =>
							line.trim().startsWith("-") ||
							line.trim().length < 100
					)
			) {
				const items = trimmed.split("\n").filter((line) => line.trim());
				formatted.push(
					<ul
						key={`ul-${paraIdx}`}
						style={{
							marginLeft: "2rem",
							marginBottom: "1.25rem",
							listStyleType: "disc",
						}}
					>
						{items.map((item, itemIdx) => (
							<li
								key={itemIdx}
								style={{
									marginBottom: "0.5rem",
									color: "#ffffff",
									lineHeight: "1.6",
								}}
							>
								{item.trim().replace(/^-/, "").trim()}
							</li>
						))}
					</ul>
				);
			}
			// Regular paragraphs
			else {
				const lines = trimmed.split("\n");
				lines.forEach((line, lineIdx) => {
					const cleanLine = line.trim();
					if (cleanLine) {
						formatted.push(
							<p
								key={`p-${paraIdx}-${lineIdx}`}
								style={{
									marginBottom: "0.75rem",
									color: "#ffffff",
									lineHeight: "1.7",
								}}
							>
								{cleanLine}
							</p>
						);
					}
				});
			}
		});

		return formatted;
	};

	return (
		<>
			<div
				className={`Footer ${
					isMobileTradePage ? "pb-large" : "pb-normal"
				}`}
			>
				<div className="Footer-content">
					<div className="Footer-left">
						<span className="Footer-logo-text">LevelUp</span>
					</div>
					<div className="Footer-center">
						{getFooterLinks(isHome).map(
							({
								external,
								label,
								link,
								isAppLink,
								opensModal,
							}) => {
								if (opensModal) {
									return (
										<button
											key={label}
											onClick={() =>
												setIsPrivacyModalVisible(true)
											}
											className={linkClassName}
											style={{
												background: "none",
												border: "none",
												cursor: "pointer",
												padding: 0,
											}}
										>
											{label}
										</button>
									);
								}
								if (external) {
									return (
										<ExternalLink
											key={label}
											href={link}
											className={linkClassName}
										>
											{label}
										</ExternalLink>
									);
								}
								if (isAppLink) {
									const baseUrl = "";
									return (
										<a
											key={label}
											href={baseUrl + link}
											className={linkClassName}
										>
											{label}
										</a>
									);
								}
								return (
									<NavLink
										key={link}
										to={link}
										className={({ isActive }) =>
											`${linkClassName} ${
												isActive ? "active" : ""
											}`
										}
									>
										{label}
									</NavLink>
								);
							}
						)}
					</div>
					<div className="Footer-right">
						{SOCIAL_LINKS.map((platform) => (
							<TrackingLink key={platform.name}>
								<ExternalLink
									href={platform.link}
									className="Footer-social"
								>
									<img
										src={platform.icon}
										alt={platform.name}
									/>
								</ExternalLink>
							</TrackingLink>
						))}
					</div>
				</div>
			</div>
			<Modal
				isVisible={isPrivacyModalVisible}
				setIsVisible={setIsPrivacyModalVisible}
				label={
					<span
						style={{
							fontSize: "2rem",
							fontWeight: 700,
							color: "#ffffff",
						}}
					>
						Privacy Policy
					</span>
				}
				contentClassName="PrivacyPolicy-modal"
			>
				<div
					style={{
						maxHeight: "70vh",
						overflowY: "auto",
						lineHeight: "1.6",
						backgroundColor: "#000000",
						color: "#ffffff",
					}}
				>
					{formatPrivacyPolicy(PRIVACY_POLICY_CONTENT)}
				</div>
			</Modal>
		</>
	);
}
