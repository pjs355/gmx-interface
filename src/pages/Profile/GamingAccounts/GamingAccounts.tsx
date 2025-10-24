import { useState, useEffect } from "react";
import { Trans } from "@lingui/react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import "./GamingAccounts.css";

interface LinkedAccount {
	platform: "steam" | "lol";
	username: string;
	userId: string;
	linkedAt: string;
	verified: boolean;
}

interface UserProfile {
	id: string;
	steamId?: string;
	steamUsername?: string;
	lolId?: string;
	lolUsername?: string;
	cs?: {
		steamId64?: string;
		handle?: string;
	};
	// Add other profile fields as needed
}

export default function GamingAccounts() {
	const { getAccessToken } = usePrivy();
	const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
	const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
	const [isLinkingSteam, setIsLinkingSteam] = useState(false);
	const [isLinkingLoL, setIsLinkingLoL] = useState(false);
	const [steamLinkStatus, setSteamLinkStatus] = useState<
		"idle" | "success" | "error"
	>("idle");
	const [isLoadingProfile, setIsLoadingProfile] = useState(true);
	const [isUnlinking, setIsUnlinking] = useState<"steam" | "lol" | null>(
		null
	);

	// Handle redirect back from Steam OAuth
	useEffect(() => {
		const urlParams = new URLSearchParams(window.location.search);
		const linked = urlParams.get("linked");
		const error = urlParams.get("error");

		if (linked === "steam") {
			setSteamLinkStatus("success");
			console.log("Steam account linked successfully!");

			// Refresh user profile and linked accounts to show the newly linked Steam account
			fetchUserProfile();
			fetchLinkedAccounts();

			// Clean up URL parameters
			const newUrl = window.location.pathname;
			window.history.replaceState({}, document.title, newUrl);
		} else if (error) {
			setSteamLinkStatus("error");
			console.error("Steam linking failed:", error);

			// Clean up URL parameters
			const newUrl = window.location.pathname;
			window.history.replaceState({}, document.title, newUrl);
		}
	}, []);

	// Fetch user profile and linked accounts on component mount
	useEffect(() => {
		fetchUserProfile();
		fetchLinkedAccounts();
	}, []);

	// Function to fetch user profile from backend
	const fetchUserProfile = async () => {
		try {
			const serverUrl = getPredictionApiBaseUrl();
			const apiUrl = `${serverUrl}/profiles/me`;

			console.log("Fetching user profile from:", apiUrl);

			const accessToken = await getAccessToken();
			if (!accessToken) {
				console.warn(
					"No access token available for fetching user profile"
				);
				setIsLoadingProfile(false);
				return;
			}

			const response = await fetch(apiUrl, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			console.log("User profile response:", result);

			if (result.success && result.data) {
				setUserProfile(result.data);
				console.log("Steam ID check:", {
					steamId: result.data.steamId,
					csSteamId64: result.data.cs?.steamId64,
					csHandle: result.data.cs?.handle,
					hasSteam: !!(
						result.data.steamId || result.data.cs?.steamId64
					),
				});
			}
		} catch (error) {
			console.error("Failed to fetch user profile:", error);
		} finally {
			setIsLoadingProfile(false);
		}
	};

	const handleSteamLink = async () => {
		setIsLinkingSteam(true);
		try {
			console.log("Initiating Steam OAuth...");

			// Get the Privy access token
			const accessToken = await getAccessToken();
			if (!accessToken) {
				throw new Error(
					"No access token available. Please ensure you're logged in."
				);
			}

			// Get the redirect URL from the server
			const serverUrl = getPredictionApiBaseUrl();
			const steamAuthUrl = `${serverUrl}/auth/steam/start?json=1`;

			console.log(
				"Requesting Steam OAuth redirect URL from:",
				steamAuthUrl
			);

			const response = await fetch(steamAuthUrl, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			console.log("Steam OAuth response:", result);

			// Navigate to the Steam OAuth URL
			if (result.url) {
				console.log("Redirecting to Steam OAuth:", result.url);
				window.location.href = result.url;
			} else {
				throw new Error("No redirect URL received from server");
			}
		} catch (error) {
			console.error("Failed to initiate Steam OAuth:", error);
			setSteamLinkStatus("error");
			setIsLinkingSteam(false);
		}
	};

	// Function to fetch linked accounts from your backend
	const fetchLinkedAccounts = async () => {
		try {
			const serverUrl = getPredictionApiBaseUrl();
			const apiUrl = `${serverUrl}/api/user/gaming-accounts`;

			console.log("Fetching linked accounts from:", apiUrl);

			// Get the Privy access token
			const accessToken = await getAccessToken();
			if (!accessToken) {
				console.warn(
					"No access token available for fetching linked accounts"
				);
				return;
			}

			// TODO: Uncomment when your backend is ready
			// const response = await fetch(apiUrl, {
			//   method: 'GET',
			//   headers: {
			//     'Content-Type': 'application/json',
			//     'Authorization': `Bearer ${accessToken}`,
			//   },
			// });
			//
			// if (!response.ok) {
			//   throw new Error(`HTTP error! status: ${response.status}`);
			// }
			//
			// const accounts = await response.json();
			// setLinkedAccounts(accounts);
		} catch (error) {
			console.error("Failed to fetch linked accounts:", error);
		}
	};

	const handleLoLLink = async () => {
		setIsLinkingLoL(true);
		try {
			// TODO: Implement LoL API integration
			console.log("Linking League of Legends account...");
			// Simulate API call
			await new Promise((resolve) => setTimeout(resolve, 2000));

			// Mock successful link
			const newAccount: LinkedAccount = {
				platform: "lol",
				username: "SummonerName",
				userId: "summoner123",
				linkedAt: new Date().toISOString(),
				verified: true,
			};

			setLinkedAccounts((prev) => [...prev, newAccount]);
		} catch (error) {
			console.error("Failed to link LoL account:", error);
		} finally {
			setIsLinkingLoL(false);
		}
	};

	const handleUnlink = async (platform: "steam" | "lol") => {
		setIsUnlinking(platform);
		try {
			const serverUrl = getPredictionApiBaseUrl();
			let apiUrl: string;

			// Use different endpoints based on platform
			if (platform === "steam") {
				apiUrl = `${serverUrl}/auth/steam/unlink`;
			} else {
				apiUrl = `${serverUrl}/api/user/gaming-accounts/${platform}`;
			}

			console.log(`Unlinking ${platform} account via:`, apiUrl);

			// Get the Privy access token
			const accessToken = await getAccessToken();
			if (!accessToken) {
				throw new Error(
					"No access token available. Please ensure you're logged in."
				);
			}

			const response = await fetch(apiUrl, {
				method: platform === "steam" ? "POST" : "DELETE",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			console.log(`Unlink ${platform} response:`, result);

			if (result.success) {
				// Refresh user profile to reflect the unlink
				await fetchUserProfile();

				// Remove from local state
				setLinkedAccounts((prev) =>
					prev.filter((acc) => acc.platform !== platform)
				);

				console.log(`${platform} account unlinked successfully!`);
			} else {
				throw new Error(
					result.error || `Failed to unlink ${platform} account`
				);
			}
		} catch (error) {
			console.error(`Failed to unlink ${platform} account:`, error);
			// You could add a toast notification here to show the error to the user
		} finally {
			setIsUnlinking(null);
		}
	};

	const getPlatformIcon = (platform: string) => {
		switch (platform) {
			case "steam":
				return "🎮";
			case "lol":
				return "⚔️";
			default:
				return "🎯";
		}
	};

	const getPlatformName = (platform: string) => {
		switch (platform) {
			case "steam":
				return "Steam";
			case "lol":
				return "League of Legends";
			default:
				return platform;
		}
	};

	const getPlatformDescription = (platform: string) => {
		switch (platform) {
			case "steam":
				return "Link your Steam account to verify CS:GO/CS2 matches and participate in gaming predictions.";
			case "lol":
				return "Link your League of Legends account to verify LoL matches and participate in esports predictions.";
			default:
				return "";
		}
	};

	return (
		<div style={{ padding: 24, color: "white" }}>
			<h1>Gaming Accounts</h1>
			<div style={{ marginBottom: 24, opacity: 0.9, lineHeight: 1.5 }}>
				Link your gaming accounts to verify matches and participate in
				gaming predictions. Your accounts are used solely for match
				verification and prediction participation.
			</div>

			{/* Steam Account Section */}
			<div style={{ marginBottom: 32 }}>
				<div
					style={{
						border: "1px solid rgba(255,255,255,0.2)",
						borderRadius: 12,
						padding: 20,
						background: "rgba(255,255,255,0.03)",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							marginBottom: 12,
						}}
					>
						<span style={{ fontSize: 24, marginRight: 12 }}>
							🎮
						</span>
						<h2
							style={{ margin: 0, fontSize: 20, fontWeight: 600 }}
						>
							Steam Account
						</h2>
					</div>

					<div
						style={{ marginBottom: 16, opacity: 0.8, fontSize: 14 }}
					>
						{getPlatformDescription("steam")}
					</div>

					{steamLinkStatus === "success" && (
						<div
							style={{
								padding: 16,
								background: "rgba(59, 130, 246, 0.1)",
								border: "1px solid rgba(59, 130, 246, 0.3)",
								borderRadius: 8,
								marginBottom: 16,
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									marginBottom: 4,
								}}
							>
								<span
									style={{ color: "#3b82f6", marginRight: 8 }}
								>
									✓
								</span>
								<span style={{ fontWeight: 600 }}>
									Steam account linked successfully!
								</span>
							</div>
							<div style={{ fontSize: 14, opacity: 0.8 }}>
								Your Steam account has been connected. You can
								now participate in CS:GO/CS2 predictions.
							</div>
						</div>
					)}

					{steamLinkStatus === "error" && (
						<div
							style={{
								padding: 16,
								background: "rgba(239, 68, 68, 0.1)",
								border: "1px solid rgba(239, 68, 68, 0.3)",
								borderRadius: 8,
								marginBottom: 16,
							}}
						>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									marginBottom: 4,
								}}
							>
								<span
									style={{ color: "#ef4444", marginRight: 8 }}
								>
									✗
								</span>
								<span style={{ fontWeight: 600 }}>
									Failed to link Steam account
								</span>
							</div>
							<div style={{ fontSize: 14, opacity: 0.8 }}>
								There was an error linking your Steam account.
								Please try again.
							</div>
						</div>
					)}

					{isLoadingProfile ? (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								gap: 8,
								padding: 16,
							}}
						>
							<div
								className="spin-animation"
								style={{
									width: 16,
									height: 16,
									border: "2px solid transparent",
									borderTop: "2px solid #8b5cf6",
									borderRadius: "50%",
								}}
							/>
							Loading profile...
						</div>
					) : linkedAccounts.find(
							(acc) => acc.platform === "steam"
					  ) ||
					  userProfile?.steamId ||
					  userProfile?.cs?.steamId64 ? (
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								padding: 16,
								background: "rgba(59, 130, 246, 0.1)",
								border: "1px solid rgba(59, 130, 246, 0.3)",
								borderRadius: 8,
							}}
						>
							<div>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										marginBottom: 4,
									}}
								>
									<span
										style={{
											color: "#3b82f6",
											marginRight: 8,
										}}
									>
										✓
									</span>
									<span style={{ fontWeight: 600 }}>
										Linked
									</span>
								</div>
								<div style={{ fontSize: 14, opacity: 0.8 }}>
									Username:{" "}
									{linkedAccounts.find(
										(acc) => acc.platform === "steam"
									)?.username ||
										userProfile?.steamUsername ||
										userProfile?.cs?.handle ||
										"Steam User"}
								</div>
								<div style={{ fontSize: 12, opacity: 0.6 }}>
									{linkedAccounts.find(
										(acc) => acc.platform === "steam"
									)?.linkedAt
										? `Linked on ${new Date(
												linkedAccounts.find(
													(acc) =>
														acc.platform === "steam"
												)?.linkedAt || ""
										  ).toLocaleDateString()}`
										: "Connected via Steam"}
								</div>
							</div>
							<button
								onClick={() => handleUnlink("steam")}
								disabled={isUnlinking === "steam"}
								style={{
									padding: "8px 16px",
									border: "1px solid #8b5cf6",
									borderRadius: 6,
									background: "rgba(139, 92, 246, 0.1)",
									color: "#8b5cf6",
									cursor:
										isUnlinking === "steam"
											? "not-allowed"
											: "pointer",
									fontSize: 14,
									opacity: isUnlinking === "steam" ? 0.7 : 1,
									display: "flex",
									alignItems: "center",
									gap: 6,
								}}
								onMouseEnter={(e) => {
									if (isUnlinking !== "steam") {
										e.currentTarget.style.backgroundColor =
											"rgba(139, 92, 246, 0.2)";
									}
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor =
										"rgba(139, 92, 246, 0.1)";
								}}
							>
								{isUnlinking === "steam" ? (
									<>
										<div
											className="spin-animation"
											style={{
												width: 12,
												height: 12,
												border: "2px solid transparent",
												borderTop: "2px solid #8b5cf6",
												borderRadius: "50%",
											}}
										/>
										Unlinking...
									</>
								) : (
									"Unlink"
								)}
							</button>
						</div>
					) : (
						<button
							onClick={handleSteamLink}
							disabled={isLinkingSteam}
							style={{
								padding: "12px 24px",
								border: "1px solid #8b5cf6",
								borderRadius: 8,
								background: isLinkingSteam
									? "rgba(139, 92, 246, 0.5)"
									: "#8b5cf6",
								color: "white",
								cursor: isLinkingSteam
									? "not-allowed"
									: "pointer",
								fontSize: 16,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								gap: 8,
								opacity: isLinkingSteam ? 0.7 : 1,
								transition: "all 0.2s ease",
							}}
						>
							{isLinkingSteam ? (
								<>
									<div
										className="spin-animation"
										style={{
											width: 16,
											height: 16,
											border: "2px solid transparent",
											borderTop: "2px solid white",
											borderRadius: "50%",
										}}
									/>
									Linking...
								</>
							) : (
								<>🎮 Link Steam Account</>
							)}
						</button>
					)}
				</div>
			</div>

			{/* League of Legends Account Section */}
			<div style={{ marginBottom: 32 }}>
				<div
					style={{
						border: "1px solid rgba(255,255,255,0.2)",
						borderRadius: 12,
						padding: 20,
						background: "rgba(255,255,255,0.03)",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							marginBottom: 12,
						}}
					>
						<span style={{ fontSize: 24, marginRight: 12 }}>
							⚔️
						</span>
						<h2
							style={{ margin: 0, fontSize: 20, fontWeight: 600 }}
						>
							League of Legends
						</h2>
					</div>

					<div
						style={{ marginBottom: 16, opacity: 0.8, fontSize: 14 }}
					>
						League of Legends account linking is coming soon! Stay
						tuned for esports predictions.
					</div>

					{linkedAccounts.find((acc) => acc.platform === "lol") ? (
						<div
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								padding: 16,
								background: "rgba(59, 130, 246, 0.1)",
								border: "1px solid rgba(59, 130, 246, 0.3)",
								borderRadius: 8,
							}}
						>
							<div>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										marginBottom: 4,
									}}
								>
									<span
										style={{
											color: "#3b82f6",
											marginRight: 8,
										}}
									>
										✓
									</span>
									<span style={{ fontWeight: 600 }}>
										Linked
									</span>
								</div>
								<div style={{ fontSize: 14, opacity: 0.8 }}>
									Username:{" "}
									{
										linkedAccounts.find(
											(acc) => acc.platform === "lol"
										)?.username
									}
								</div>
								<div style={{ fontSize: 12, opacity: 0.6 }}>
									Linked on{" "}
									{new Date(
										linkedAccounts.find(
											(acc) => acc.platform === "lol"
										)?.linkedAt || ""
									).toLocaleDateString()}
								</div>
							</div>
							<button
								onClick={() => handleUnlink("lol")}
								style={{
									padding: "8px 16px",
									border: "1px solid #8b5cf6",
									borderRadius: 6,
									background: "rgba(139, 92, 246, 0.1)",
									color: "#8b5cf6",
									cursor: "pointer",
									fontSize: 14,
								}}
								onMouseEnter={(e) => {
									e.currentTarget.style.backgroundColor =
										"rgba(139, 92, 246, 0.2)";
								}}
								onMouseLeave={(e) => {
									e.currentTarget.style.backgroundColor =
										"rgba(139, 92, 246, 0.1)";
								}}
							>
								Unlink
							</button>
						</div>
					) : (
						<button
							disabled={true}
							style={{
								padding: "12px 24px",
								border: "1px solid rgba(255,255,255,0.3)",
								borderRadius: 8,
								background: "rgba(255,255,255,0.1)",
								color: "rgba(255,255,255,0.6)",
								cursor: "not-allowed",
								fontSize: 16,
								fontWeight: 600,
								display: "flex",
								alignItems: "center",
								gap: 8,
								opacity: 0.7,
								transition: "all 0.2s ease",
							}}
						>
							⚔️ Coming Soon
						</button>
					)}
				</div>
			</div>

			{/* Linked Accounts Summary */}
			{linkedAccounts.length > 0 && (
				<div style={{ marginTop: 32 }}>
					<h3
						style={{
							marginBottom: 16,
							fontSize: 18,
							fontWeight: 600,
						}}
					>
						Linked Accounts Summary
					</h3>
					<div style={{ display: "grid", gap: 12 }}>
						{linkedAccounts.map((account, index) => (
							<div
								key={index}
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									padding: 16,
									background: "rgba(255,255,255,0.05)",
									border: "1px solid rgba(255,255,255,0.1)",
									borderRadius: 8,
								}}
							>
								<div
									style={{
										display: "flex",
										alignItems: "center",
									}}
								>
									<span
										style={{
											fontSize: 20,
											marginRight: 12,
										}}
									>
										{getPlatformIcon(account.platform)}
									</span>
									<div>
										<div style={{ fontWeight: 600 }}>
											{getPlatformName(account.platform)}
										</div>
										<div
											style={{
												fontSize: 14,
												opacity: 0.8,
											}}
										>
											{account.username}
										</div>
									</div>
								</div>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
									}}
								>
									{account.verified && (
										<span
											style={{
												fontSize: 12,
												color: "#3b82f6",
												background:
													"rgba(59, 130, 246, 0.1)",
												padding: "4px 8px",
												borderRadius: 4,
											}}
										>
											Verified
										</span>
									)}
									<button
										onClick={() =>
											handleUnlink(account.platform)
										}
										style={{
											padding: "6px 12px",
											border: "1px solid #ef4444",
											borderRadius: 4,
											background: "transparent",
											color: "#ef4444",
											cursor: "pointer",
											fontSize: 12,
										}}
									>
										Unlink
									</button>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
