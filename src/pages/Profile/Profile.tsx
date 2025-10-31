import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useLocation } from "react-router-dom";
import { useMedia } from "react-use";
import { useSignerContext } from "context/SignerContext";
import Developers from "../Developers/Developers";
import GamingAccounts from "./GamingAccounts/GamingAccounts";
import Details from "./Details/Details";

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

	const linked = Array.isArray(user?.linkedAccounts)
		? user!.linkedAccounts
		: [];

	function toDisplayString(input: any): string {
		if (input == null) return "";
		if (typeof input === "string") return input;
		if (typeof input === "number" || typeof input === "boolean")
			return String(input);
		if (typeof input === "object") {
			// Try common nested shapes
			if (typeof input.address === "string") return input.address;
			if (typeof input.email === "string") return input.email;
			if (typeof input.id === "string") return input.id;
			if (typeof input.subject === "string") return input.subject;
			if (typeof input.issuer === "string") return input.issuer;
			try {
				return JSON.stringify(input);
			} catch {
				return String(input);
			}
		}
		return String(input);
	}

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
			style={{
				gap: 16,
				padding: isMobile ? 16 : 24,
				color: "white",
				background: "#000000",
			}}
		>
			{/* Mobile: Tabs at top */}
			{isMobile && (
				<div
					style={{
						display: "flex",
						gap: 12,
						marginBottom: 16,
					}}
				>
					<button
						onClick={() => setActiveSection("details")}
						style={{
							color:
								activeSection === "details" ? "cyan" : "white",
							background: "transparent",
							border: "none",
							borderRadius: 0,
							cursor: "pointer",
							padding: "8px 12px",
							fontSize: "inherit",
							fontWeight: activeSection === "details" ? 600 : 400,
							textDecoration: "none",
							outline: "none",
						}}
					>
						Details
					</button>
					<button
						onClick={() => setActiveSection("developers")}
						style={{
							color:
								activeSection === "developers"
									? "cyan"
									: "white",
							background: "transparent",
							border: "none",
							borderRadius: 0,
							cursor: "pointer",
							padding: "8px 12px",
							fontSize: "inherit",
							fontWeight:
								activeSection === "developers" ? 600 : 400,
							textDecoration: "none",
							outline: "none",
						}}
					>
						Developers
					</button>
					<button
						onClick={() => setActiveSection("gaming-accounts")}
						style={{
							color:
								activeSection === "gaming-accounts"
									? "cyan"
									: "white",
							background: "transparent",
							border: "none",
							borderRadius: 0,
							cursor: "pointer",
							padding: "8px 12px",
							fontSize: "inherit",
							fontWeight:
								activeSection === "gaming-accounts" ? 600 : 400,
							textDecoration: "none",
							outline: "none",
						}}
					>
						Gaming Accounts
					</button>
				</div>
			)}

			{/* Desktop: Sidebar */}
			{!isMobile && (
				<aside
					style={{
						border: "1px solid rgba(255,255,255,0.2)",
						borderRadius: 8,
						padding: 16,
						background: "rgba(255,255,255,0.03)",
					}}
				>
					{/* <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
					Profile
				</div>
				<div style={{ marginBottom: 16, opacity: 0.9 }}>
					{toDisplayString((user as any)?.username) ||
						toDisplayString((user as any)?.email) ||
						toDisplayString(user?.id) ||
						"Unknown user"}
				</div>
				<div style={{ marginBottom: 8 }}>
					<div style={{ fontWeight: 600, marginBottom: 4 }}>
						Active Wallet
					</div>
					<div style={{ wordBreak: "break-all" }}>
						{account || "Not connected"}
					</div>
				</div>
				<div style={{ marginBottom: 12 }}>
					<div style={{ fontWeight: 600, marginBottom: 4 }}>
						Resolved Signer
					</div>
					<div style={{ wordBreak: "break-all" }}>
						{signerAddress || "Unavailable"}
					</div>
					{account &&
						signerAddress &&
						account.toLowerCase() !==
							signerAddress.toLowerCase() && (
							<div
								style={{
									fontSize: 12,
									color: "#eab308",
									marginTop: 4,
								}}
							>
								Warning: connected wallet differs from signer
								used for API key creation
							</div>
						)}
				</div>

				<div style={{ marginBottom: 12, fontWeight: 600 }}>
					Linked Accounts
				</div>
				{linked.length === 0 && (
					<div style={{ opacity: 0.8 }}>No linked accounts.</div>
				)}
				{linked.length > 0 && (
					<div style={{ display: "grid", gap: 8 }}>
						{linked.map((acc: any, idx: number) => (
							<div
								key={idx}
								style={{
									border: "1px solid rgba(255,255,255,0.2)",
									borderRadius: 6,
									padding: 8,
								}}
							>
								<div style={{ fontSize: 12, opacity: 0.8 }}>
									{acc.type}
								</div>
								<div style={{ wordBreak: "break-all" }}>
									{toDisplayString(acc.address) ||
										toDisplayString(acc.email) ||
										toDisplayString(acc.issuer) ||
										toDisplayString(acc.subject) ||
										toDisplayString(acc.id)}
								</div>
							</div>
						))}
					</div>
				)}

				<div
					style={{
						marginTop: 16,
						borderTop: "1px solid rgba(255,255,255,0.2)",
						paddingTop: 12,
					}}
				>
				*/}
					<div style={{ fontWeight: 600, marginBottom: 8 }}>
						Sections
					</div>
					<div style={{ display: "grid", gap: 6 }}>
						<button
							onClick={() => setActiveSection("details")}
							style={{
								color:
									activeSection === "details"
										? "cyan"
										: "white",
								background: "transparent",
								border: "none",
								textAlign: "left",
								cursor: "pointer",
								padding: 0,
								fontSize: "inherit",
							}}
						>
							Details
						</button>
						<button
							onClick={() => setActiveSection("developers")}
							style={{
								color:
									activeSection === "developers"
										? "cyan"
										: "white",
								background: "transparent",
								border: "none",
								textAlign: "left",
								cursor: "pointer",
								padding: 0,
								fontSize: "inherit",
							}}
						>
							Developers
						</button>
						<button
							onClick={() => setActiveSection("gaming-accounts")}
							style={{
								color:
									activeSection === "gaming-accounts"
										? "cyan"
										: "white",
								background: "transparent",
								border: "none",
								textAlign: "left",
								cursor: "pointer",
								padding: 0,
								fontSize: "inherit",
							}}
						>
							Gaming Accounts
						</button>
					</div>
					{/* </div> */}
				</aside>
			)}

			<main>
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
