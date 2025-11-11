import { Menu } from "@headlessui/react";
import { Trans, t } from "@lingui/macro";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { FaChevronDown, FaUser } from "react-icons/fa";
import { createBreakpoint, useCopyToClipboard } from "react-use";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";

import { helperToast } from "@/components/Toast/toast";
import { shortenAddress } from "@/services/wallets/shortenAddress";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

// Fallback avatar-less display; Avatar not present in LevelUp
import ExternalLink from "components/ExternalLink/ExternalLink";

import copy from "@/assets/img/ic_copy_20.svg";
import externalLink from "@/assets/img/ic_new_link_20.svg";
import disconnect from "@/assets/img/ic_sign_out_20.svg";

import "./AddressDropdown.scss";

type Props = {
	account: string;
	accountUrl: string;
	disconnectAccountAndCloseSettings: () => void;
	userEmail?: string | null;
	isSmartWallet?: boolean;
};

const useBreakpoint = createBreakpoint({ L: 600, M: 550, S: 400 });

export default function AddressDropdown({
	account,
	accountUrl,
	disconnectAccountAndCloseSettings,
	userEmail,
	isSmartWallet = false,
}: Props) {
	const breakpoint = useBreakpoint();
	const [, copyToClipboard] = useCopyToClipboard();
	const displayAddressLength = breakpoint === "S" ? 9 : 13;
	const { logout, getAccessToken, ready, authenticated } = usePrivy();
	const { identityToken } = useIdentityToken();
	const navigate = useNavigate();
	const [username, setUsername] = useState<string | null>(null);

	// Fetch username from profile API
	useEffect(() => {
		if (!ready || !authenticated || !identityToken) return;

		const fetchUsername = async () => {
			try {
				const serverUrl = getPredictionApiBaseUrl();
				const apiUrl = `${serverUrl}/profiles/me`;
				const accessToken = await getAccessToken();
				
				if (!accessToken) return;

				const headers: Record<string, string> = {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
					"privy-id-token": identityToken,
				};

				const response = await fetch(apiUrl, { method: "GET", headers });
				if (!response.ok) return;

				const result = await response.json();
				if (result.success && result.data?.username) {
					setUsername(result.data.username);
				}
			} catch (error) {
				console.error("Failed to fetch username for header:", error);
			}
		};

		fetchUsername();
	}, [ready, authenticated, identityToken, getAccessToken]);

	// Determine what to display: username (if available), email for smart wallet users, or address for external wallet users
	const displayText = username
		? `@${username}`
		: isSmartWallet && userEmail
		? userEmail
		: shortenAddress(account, displayAddressLength);

	return (
		<Menu>
			<Menu.Button as="div">
				<button className="App-cta small transparent address-btn">
					{/* avatar intentionally omitted */}
					<span className="user-address">{displayText}</span>
					<FaChevronDown />
				</button>
			</Menu.Button>
			<div>
				<Menu.Items as="div" className="menu-items">
					{/* Only show Copy Address and View in Explorer for external wallet users */}
					{!isSmartWallet && (
						<>
							<Menu.Item>
								<div
									className="menu-item"
									onClick={() => {
										copyToClipboard(account);
										helperToast.success(
											t`Address copied to your clipboard`
										);
									}}
								>
									<img
										width={20}
										className="size-20"
										src={copy}
										alt="Copy user address"
									/>
									<p>
										<Trans>Copy Address</Trans>
									</p>
								</div>
							</Menu.Item>
							<Menu.Item>
								<ExternalLink
									href={accountUrl}
									className="menu-item"
								>
									<img
										width={20}
										className="size-20"
										src={externalLink}
										alt="Open address in explorer"
									/>
									<p>
										<Trans>View in Explorer</Trans>
									</p>
								</ExternalLink>
							</Menu.Item>
						</>
					)}
					{/* Profile link for all users */}
					<Menu.Item>
						<div
							className="menu-item"
							onClick={() => {
								navigate("/profile");
							}}
						>
							<FaUser width={20} className="size-20" />
							<p>Profile</p>
						</div>
					</Menu.Item>
					{/* Always show Sign out for all users */}
					<Menu.Item>
						<div
							className="menu-item"
							onClick={() => {
								disconnectAccountAndCloseSettings();
								logout();
							}}
						>
							<img
								width={20}
								className="size-20"
								src={disconnect}
								alt="Sign out"
							/>
							<p>Sign out</p>
						</div>
					</Menu.Item>
				</Menu.Items>
			</div>
		</Menu>
	);
}
