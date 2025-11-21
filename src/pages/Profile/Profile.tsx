import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useLocation } from "react-router-dom";
import { useMedia } from "react-use";
import { useSignerContext } from "context/SignerContext";
import Button from "components/Button/Button";
import Developers from "../Developers/Developers";
import GamingAccounts from "./GamingAccounts/GamingAccounts";
import Details from "./Details/Details";
import "./Profile.scss";

export default function Profile() {
	const location = useLocation();
	const { user } = usePrivy();
	const { wallets: privyWallets } = usePrivyWallets();
	const { account, signer } = useSignerContext() as any;
	const [signerAddress, setSignerAddress] = useState<string | null>(null);
	const [activeSection, setActiveSection] = useState<
		"profile" | "developers" | "gaming-accounts" | "details"
	>("details");
	const isMobile = useMedia("(max-width: 768px)");

	// Handle query parameters to auto-select sections
	useEffect(() => {
		const urlParams = new URLSearchParams(location.search);
		const section = urlParams.get("section");

		if (section === "gaming-accounts") {
			setActiveSection("gaming-accounts");
		} else if (section === "developers") {
			setActiveSection("developers");
		} else if (section === "details") {
			setActiveSection("details");
		}
	}, [location.search]);

	useEffect(() => {
		let cancelled = false;
		async function resolve() {
			try {
				if (
					signer &&
					typeof (signer as any).getAddress === "function"
				) {
					const addr = await (signer as any).getAddress();
					if (!cancelled) setSignerAddress(addr);
					return;
				}
				const smart = Array.isArray(privyWallets)
					? (privyWallets as any[]).find(
							(w) => w?.type === "smart_wallet"
					  ) || (privyWallets as any[])[0]
					: null;
				if (smart && typeof smart.getEthereumProvider === "function") {
					const eip1193 = await smart.getEthereumProvider();
					const provider = new ethers.BrowserProvider(eip1193 as any);
					const s = await provider.getSigner();
					const addr = await s.getAddress();
					if (!cancelled) setSignerAddress(addr);
				}
			} catch {
				if (!cancelled) setSignerAddress(null);
			}
		}
		resolve();
		return () => {
			cancelled = true;
		};
	}, [signer, privyWallets]);

	return (
		<div
			className="profile-page"
			style={{
				paddingLeft: isMobile ? 16 : 50,
				paddingRight: isMobile ? 16 : 24,
				paddingTop: isMobile ? 16 : 24,
				paddingBottom: isMobile ? 16 : 24,
				color: "white",
			}}
		>
			{/* Account Details Header */}
			<h1 className="profile-header">Account Details</h1>

			{/* Profile Tabs - Same styling as Positions page */}
			<div className="flex items-center justify-between">
				<div className="flex gap-8 profile-tabs" role="tablist">
					<Button
						variant="ghost"
						onClick={() => setActiveSection("details")}
						className={`side-btn ${
							activeSection === "details"
								? "selected primary"
								: ""
						}`}
					>
						Details
					</Button>
					<Button
						variant="ghost"
						onClick={() => setActiveSection("developers")}
						className={`side-btn ${
							activeSection === "developers"
								? "selected primary"
								: ""
						}`}
					>
						Developers
					</Button>
					<Button
						variant="ghost"
						onClick={() => setActiveSection("gaming-accounts")}
						className={`side-btn ${
							activeSection === "gaming-accounts"
								? "selected primary"
								: ""
						}`}
					>
						Gaming Accounts
					</Button>
				</div>
			</div>

			<main className="profile-content-wrapper">
				{activeSection === "details" ? (
					<Details />
				) : activeSection === "developers" ? (
					<div
						style={{
							border: "1px solid rgba(255,255,255,0.2)",
							borderRadius: 8,
							padding: 32,
							background: "rgba(255,255,255,0.03)",
							textAlign: "center",
						}}
					>
						<div
							style={{
								fontSize: 24,
								fontWeight: 600,
								marginBottom: 12,
							}}
						>
							🚧 Under Construction
						</div>
						<div
							style={{
								opacity: 0.8,
								maxWidth: 500,
								margin: "0 auto",
							}}
						>
							Developer tools and API documentation are coming
							soon. Stay tuned for updates!
						</div>
					</div>
				) : activeSection === "gaming-accounts" ? (
					<div
						style={{
							border: "1px solid rgba(255,255,255,0.2)",
							borderRadius: 8,
							padding: 32,
							background: "rgba(255,255,255,0.03)",
							textAlign: "center",
						}}
					>
						<div
							style={{
								fontSize: 24,
								fontWeight: 600,
								marginBottom: 12,
							}}
						>
							🚧 Under Construction
						</div>
						<div
							style={{
								opacity: 0.8,
								maxWidth: 500,
								margin: "0 auto",
							}}
						>
							Connect your gaming accounts to enhance your
							experience. This feature is coming soon!
						</div>
					</div>
				) : (
					<div>
						<h1>Profile</h1>
						<div style={{ opacity: 0.8 }}>
							Select a section from the sidebar.
						</div>
					</div>
				)}
			</main>
		</div>
	);
}
