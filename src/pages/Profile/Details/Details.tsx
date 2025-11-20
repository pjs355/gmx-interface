import { useState, useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useMedia } from "react-use";
import { userService } from "@/services/api/userService";
import "./Details.scss";

interface UserDetails {
	id?: string;
	userId?: string;
	username?: string;
	email?: string;
	createdAt?: string;
	lastLogin?: string;
	walletAddress?: string;
	exp?: number;
	[key: string]: any;
}

export default function Details() {
	const { getAccessToken, ready, authenticated, user } = usePrivy();
	const { identityToken } = useIdentityToken();
	const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isEditingUsername, setIsEditingUsername] = useState(false);
	const [usernameValue, setUsernameValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);
	const [copySuccess, setCopySuccess] = useState(false);

	// Extract email, phone, and smart wallet from Privy user object
	const userEmail = user?.email?.address || null;
	const userPhone = user?.phone?.number || null;
	const smartWallet = user?.linkedAccounts?.find(
		(account: any) => account.type === "smart_wallet"
	);
	const smartWalletAddress = (smartWallet as any)?.address || null;

	const handleCopyAddress = async () => {
		if (smartWalletAddress) {
			try {
				await navigator.clipboard.writeText(smartWalletAddress);
				setCopySuccess(true);
				setTimeout(() => setCopySuccess(false), 2000);
			} catch (err) {
				console.error("Failed to copy address:", err);
			}
		}
	};

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

			const profile = await userService.getUserProfile(
				accessToken,
				identityToken
			);
			setUserDetails(profile);
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
			const accessToken = await getAccessToken();
			if (!accessToken) {
				throw new Error("No access token available");
			}

			if (!identityToken) {
				throw new Error("No identity token available");
			}

			const updatedProfile = await userService.updateUsername(
				usernameValue.trim(),
				accessToken,
				identityToken
			);

			setUserDetails(updatedProfile);
			setIsEditingUsername(false);
			setUsernameValue("");
			setUsernameError(null);
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
					The username will be used when sharing markets as well as
					for leaderboards.
					<br />
					Username can only be changed once every 7 days.
				</div>
			</div>

			{/* Email Display */}
			{userEmail && (
				<div className="Details-info-section">
					<div className="Details-info-label">Email</div>
					<div className="Details-info-value">{userEmail}</div>
				</div>
			)}

			{/* Phone Display */}
			{userPhone && (
				<div className="Details-info-section">
					<div className="Details-info-label">Phone</div>
					<div className="Details-info-value">{userPhone}</div>
				</div>
			)}

			{/* Smart Wallet Address Display */}
			{smartWalletAddress && (
				<div className="Details-info-section">
					<div className="Details-info-label">
						Smart Wallet Address (Base)
					</div>
					<div className="Details-wallet-display">
						<div className="Details-info-value Details-wallet-address">
							{smartWalletAddress}
						</div>
						<button
							className="Details-copy-button"
							onClick={handleCopyAddress}
							title="Copy address"
						>
							{copySuccess ? "✓" : "Copy"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
