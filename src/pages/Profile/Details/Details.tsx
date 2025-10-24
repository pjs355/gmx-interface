import { useState, useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

interface UserDetails {
	id: string;
	username?: string;
	email?: string;
	createdAt?: string;
	lastLogin?: string;
	walletAddress?: string;
	// Add other user details as needed
}

export default function Details() {
	const { getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();
	const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isEditingUsername, setIsEditingUsername] = useState(false);
	const [usernameValue, setUsernameValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);

	useEffect(() => {
		fetchUserDetails();
	}, []);

	const fetchUserDetails = async () => {
		try {
			const serverUrl = getPredictionApiBaseUrl();
			const apiUrl = `${serverUrl}/profiles/me`;

			console.log("Fetching user details from:", apiUrl);

			const accessToken = await getAccessToken();
			if (!accessToken) {
				console.warn(
					"No access token available for fetching user details"
				);
				setIsLoading(false);
				return;
			}

			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
			};
			if (identityToken) {
				headers["privy-id-token"] = identityToken;
			}

			const response = await fetch(apiUrl, { method: "GET", headers });

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			console.log("User details response:", result);

			if (result.success && result.data) {
				setUserDetails(result.data);
			}
		} catch (error) {
			console.error("Failed to fetch user details:", error);
		} finally {
			setIsLoading(false);
		}
	};

	const handleEditUsername = () => {
		setUsernameValue(userDetails?.username || "");
		setIsEditingUsername(true);
		setUsernameError(null); // Clear any previous errors
	};

	const handleCancelEdit = () => {
		setIsEditingUsername(false);
		setUsernameValue("");
		setUsernameError(null); // Clear any previous errors
	};

	const handleSaveUsername = async () => {
		if (!usernameValue.trim()) {
			setUsernameError("Username cannot be empty");
			return;
		}

		setIsSaving(true);
		setUsernameError(null); // Clear any previous errors

		try {
			const serverUrl = getPredictionApiBaseUrl();
			const apiUrl = `${serverUrl}/profiles/me`;

			const accessToken = await getAccessToken();
			if (!accessToken) {
				throw new Error("No access token available");
			}

			const response = await fetch(apiUrl, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${accessToken}`,
				},
				body: JSON.stringify({
					username: usernameValue.trim(),
				}),
			});

			const result = await response.json();
			console.log("Username update response:", result);

			if (result.success && result.data) {
				setUserDetails(result.data);
				setIsEditingUsername(false);
				setUsernameValue("");
				setUsernameError(null);
			} else {
				// Handle specific error messages from the backend
				const errorMessage =
					result.error ||
					`Failed to update username (${response.status})`;
				setUsernameError(errorMessage);
			}
		} catch (error) {
			console.error("Failed to update username:", error);
			const errorMessage =
				error instanceof Error
					? error.message
					: "An unexpected error occurred";
			setUsernameError(errorMessage);
		} finally {
			setIsSaving(false);
		}
	};

	function toDisplayString(input: any): string {
		if (input == null) return "";
		if (typeof input === "string") return input;
		if (typeof input === "number" || typeof input === "boolean")
			return String(input);
		if (typeof input === "object") {
			if (typeof input.address === "string") return input.address;
			if (typeof input.email === "string") return input.email;
			if (typeof input.id === "string") return input.id;
			if (typeof input.subject === "string") return input.subject;
			try {
				return JSON.stringify(input);
			} catch {
				return String(input);
			}
		}
		return String(input);
	}

	if (isLoading) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 8,
					padding: 24,
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
				Loading user details...
			</div>
		);
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
			<h1 style={{ margin: "0 0 24px 0", fontSize: 28, fontWeight: 600 }}>
				Account Details
			</h1>

			<div style={{ marginBottom: 24, opacity: 0.9, lineHeight: 1.5 }}>
				View and manage your account information and settings.
			</div>

			{userDetails ? (
				<div
					style={{
						border: "1px solid rgba(255,255,255,0.2)",
						borderRadius: 12,
						padding: 24,
						background: "rgba(255,255,255,0.03)",
					}}
				>
					<div style={{ marginBottom: 20 }}>
						<h2
							style={{
								margin: "0 0 16px 0",
								fontSize: 20,
								fontWeight: 600,
							}}
						>
							Profile Information
						</h2>

						<div style={{ display: "grid", gap: 16 }}>
							<div
								style={{
									fontSize: 12,
									opacity: 0.7,
									fontStyle: "italic",
									padding: "4px 0",
									marginBottom: 4,
								}}
							>
								💡 The username will be used when sharing
								markets as well as for leaderboards.
								<br />⏰ Username can only be changed once every
								7 days.
							</div>

							<div
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									padding: "12px 0",
									borderBottom:
										"1px solid rgba(255,255,255,0.1)",
								}}
							>
								<span style={{ fontWeight: 500, opacity: 0.9 }}>
									Username
								</span>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: 8,
									}}
								>
									{isEditingUsername ? (
										<>
											<input
												type="text"
												value={usernameValue}
												onChange={(e) =>
													setUsernameValue(
														e.target.value
													)
												}
												placeholder="Enter username"
												style={{
													background:
														"rgba(255,255,255,0.1)",
													border: "1px solid rgba(255,255,255,0.3)",
													borderRadius: 6,
													padding: "6px 12px",
													color: "white",
													fontSize: 14,
													minWidth: 150,
												}}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														handleSaveUsername();
													} else if (
														e.key === "Escape"
													) {
														handleCancelEdit();
													}
												}}
											/>
											<button
												onClick={handleSaveUsername}
												disabled={
													isSaving ||
													!usernameValue.trim()
												}
												style={{
													padding: "6px 12px",
													border: "1px solid #8b5cf6",
													borderRadius: 6,
													background:
														isSaving ||
														!usernameValue.trim()
															? "rgba(139, 92, 246, 0.3)"
															: "rgba(139, 92, 246, 0.1)",
													color:
														isSaving ||
														!usernameValue.trim()
															? "rgba(255,255,255,0.5)"
															: "#8b5cf6",
													cursor:
														isSaving ||
														!usernameValue.trim()
															? "not-allowed"
															: "pointer",
													fontSize: 12,
													display: "flex",
													alignItems: "center",
													gap: 4,
												}}
											>
												{isSaving ? (
													<>
														<div
															className="spin-animation"
															style={{
																width: 10,
																height: 10,
																border: "2px solid transparent",
																borderTop:
																	"2px solid currentColor",
																borderRadius:
																	"50%",
															}}
														/>
														Saving...
													</>
												) : (
													"Save"
												)}
											</button>
											<button
												onClick={handleCancelEdit}
												disabled={isSaving}
												style={{
													padding: "6px 12px",
													border: "1px solid rgba(255,255,255,0.3)",
													borderRadius: 6,
													background:
														"rgba(255,255,255,0.1)",
													color: "rgba(255,255,255,0.8)",
													cursor: isSaving
														? "not-allowed"
														: "pointer",
													fontSize: 12,
												}}
											>
												Cancel
											</button>
										</>
									) : (
										<>
											<span style={{ opacity: 0.8 }}>
												{userDetails.username ||
													"Not set"}
											</span>
											<button
												onClick={handleEditUsername}
												style={{
													padding: "6px 12px",
													border: "1px solid #8b5cf6",
													borderRadius: 6,
													background:
														"rgba(139, 92, 246, 0.1)",
													color: "#8b5cf6",
													cursor: "pointer",
													fontSize: 12,
												}}
											>
												Edit
											</button>
										</>
									)}
								</div>
							</div>

							{usernameError && (
								<div
									style={{
										padding: "8px 12px",
										background: "rgba(239, 68, 68, 0.1)",
										border: "1px solid rgba(239, 68, 68, 0.3)",
										borderRadius: 6,
										marginBottom: 8,
									}}
								>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 6,
										}}
									>
										<span
											style={{
												color: "#ef4444",
												fontSize: 14,
											}}
										>
											⚠️
										</span>
										<span
											style={{
												color: "#ef4444",
												fontSize: 12,
											}}
										>
											{usernameError}
										</span>
									</div>
								</div>
							)}

							{userDetails.email && (
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										padding: "12px 0",
										borderBottom:
											"1px solid rgba(255,255,255,0.1)",
									}}
								>
									<span
										style={{
											fontWeight: 500,
											opacity: 0.9,
										}}
									>
										Email
									</span>
									<span style={{ opacity: 0.8 }}>
										{toDisplayString(userDetails.email)}
									</span>
								</div>
							)}

							{userDetails.walletAddress && (
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										padding: "12px 0",
										borderBottom:
											"1px solid rgba(255,255,255,0.1)",
									}}
								>
									<span
										style={{
											fontWeight: 500,
											opacity: 0.9,
										}}
									>
										Wallet Address
									</span>
									<span
										style={{
											fontFamily: "monospace",
											fontSize: 14,
											opacity: 0.8,
										}}
									>
										{userDetails.walletAddress.slice(0, 6)}
										...{userDetails.walletAddress.slice(-4)}
									</span>
								</div>
							)}

							{userDetails.createdAt && (
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										padding: "12px 0",
										borderBottom:
											"1px solid rgba(255,255,255,0.1)",
									}}
								>
									<span
										style={{
											fontWeight: 500,
											opacity: 0.9,
										}}
									>
										Account Created
									</span>
									<span style={{ opacity: 0.8 }}>
										{new Date(
											userDetails.createdAt
										).toLocaleDateString()}
									</span>
								</div>
							)}

							{userDetails.lastLogin && (
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										padding: "12px 0",
									}}
								>
									<span
										style={{
											fontWeight: 500,
											opacity: 0.9,
										}}
									>
										Last Login
									</span>
									<span style={{ opacity: 0.8 }}>
										{new Date(
											userDetails.lastLogin
										).toLocaleDateString()}
									</span>
								</div>
							)}
						</div>
					</div>
				</div>
			) : (
				<div
					style={{
						border: "1px solid rgba(255,255,255,0.2)",
						borderRadius: 12,
						padding: 24,
						background: "rgba(255,255,255,0.03)",
						textAlign: "center",
					}}
				>
					<div style={{ opacity: 0.8, fontSize: 16 }}>
						Unable to load user details. Please try refreshing the
						page.
					</div>
				</div>
			)}
		</div>
	);
}
