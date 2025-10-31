import { useState, useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useMedia } from "react-use";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import "./Details.scss";

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
	const { getAccessToken, ready, authenticated } = usePrivy();
	const { identityToken } = useIdentityToken();
	const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isEditingUsername, setIsEditingUsername] = useState(false);
	const [usernameValue, setUsernameValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);
	const isMobile = useMedia("(max-width: 768px)");

	useEffect(() => {
		// Wait for Privy to be ready and user to be authenticated
		if (!ready || !authenticated) {
			console.log(
				"Privy not ready yet - ready:",
				ready,
				"authenticated:",
				authenticated
			);
			return;
		}

		// Also wait for identity token to be available
		if (!identityToken) {
			console.log("Waiting for identity token...");
			return;
		}

		console.log(
			"Privy ready, authenticated, and identity token available - fetching details"
		);
		fetchUserDetails();
	}, [ready, authenticated, identityToken]);

	const fetchUserDetails = async () => {
		try {
			const serverUrl = getPredictionApiBaseUrl();
			const apiUrl = `${serverUrl}/profiles/me`;

			const accessToken = await getAccessToken();
			if (!accessToken) {
				console.warn(
					"No access token available for fetching user details"
				);
				setIsLoading(false);
				return;
			}

			if (!identityToken) {
				throw new Error("No identity token available");
			}

			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
				"privy-id-token": identityToken,
			};

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

			if (!identityToken) {
				throw new Error("No identity token available");
			}

			const headers: Record<string, string> = {
				"Content-Type": "application/json",
				Authorization: `Bearer ${accessToken}`,
				"privy-id-token": identityToken,
			};

			const response = await fetch(apiUrl, {
				method: "PUT",
				headers,
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

	if (isLoading) {
		return (
			<div className="Details-loading">
				<div className="Details-spinner spin-animation" />
				Loading user details...
			</div>
		);
	}

	if (!userDetails) {
		return (
			<div className="Details">
				<div className="Details-error-container">
					<div>
						Unable to load user details. Please try refreshing the
						page.
					</div>
				</div>
			</div>
		);
	}

	const inputValue = isEditingUsername
		? usernameValue
		: userDetails.username || "";
	const canSave = !isSaving && usernameValue.trim().length > 0;
	const saveButtonText = isSaving ? "Saving..." : "Save";

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && isEditingUsername) handleSaveUsername();
		if (e.key === "Escape" && isEditingUsername) handleCancelEdit();
	};

	const renderButtons = () => {
		if (isEditingUsername) {
			return (
				<>
					<button
						className="Details-button"
						onClick={handleSaveUsername}
						disabled={!canSave}
					>
						{saveButtonText}
					</button>
					<button
						className="Details-button secondary"
						onClick={handleCancelEdit}
						disabled={isSaving}
					>
						Cancel
					</button>
				</>
			);
		}
		return (
			<button className="Details-button" onClick={handleEditUsername}>
				Edit
			</button>
		);
	};

	return (
		<div className="Details">
			<h4 className="Details-title">Account Details</h4>
			<div className="Details-description">
				View and manage your account information and settings.
			</div>

			<div className="Details-username-section">
				<div className="Details-username-label">Username</div>
				<div className="Details-username-controls">
					<input
						type="text"
						className="Details-username-input"
						value={inputValue}
						onChange={(e) => setUsernameValue(e.target.value)}
						disabled={!isEditingUsername}
						placeholder="Enter username"
						onKeyDown={handleKeyDown}
					/>
					{renderButtons()}
				</div>

				{usernameError && (
					<div className="Details-error">
						<span>⚠️ {usernameError}</span>
					</div>
				)}

				<div className="Details-hint">
					💡 The username will be used when sharing markets as well as
					for leaderboards.
					<br />⏰ Username can only be changed once every 7 days.
				</div>
			</div>
		</div>
	);
}
