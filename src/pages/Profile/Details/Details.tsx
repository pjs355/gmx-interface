import { useState, useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useMedia } from "react-use";
import { userService, type EmailPreferences } from "@/services/api/userService";
// import RPGPane from "../RPGPane/RPGPane";
// import AchievementPane from "../AchievementPane/AchievementPane";
import "./Details.scss";

const isMobileBreakpoint = "(max-width: 768px)";

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
	const isMobile = useMedia(isMobileBreakpoint);
	const [userDetails, setUserDetails] = useState<UserDetails | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [isEditingUsername, setIsEditingUsername] = useState(false);
	const [usernameValue, setUsernameValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);
	const [copySuccess, setCopySuccess] = useState(false);

	// Email preferences state
	const [emailPreferences, setEmailPreferences] = useState<EmailPreferences>({
		generalNotifications: true,
		tradeConfirmations: true,
		winningsNotifications: true,
		levelUpAnnouncements: true,
	});
	const [isSavingPreferences, setIsSavingPreferences] = useState(false);
	const [preferencesSaved, setPreferencesSaved] = useState(false);

	// Account deletion modal state - COMMENTED OUT FOR NOW
	// const [showDeleteModal, setShowDeleteModal] = useState(false);
	// const [acceptInput, setAcceptInput] = useState("");

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

			// Initialize email preferences from profile or use defaults
			if (profile.emailPreferences) {
				setEmailPreferences(profile.emailPreferences);
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

	// Email preference handlers
	const handlePreferenceChange = (key: keyof EmailPreferences) => {
		setEmailPreferences((prev) => ({
			...prev,
			[key]: !prev[key],
		}));
		setPreferencesSaved(false);
	};

	const handleSavePreferences = async () => {
		setIsSavingPreferences(true);
		try {
			const accessToken = await getAccessToken();
			if (!accessToken) {
				throw new Error("No access token available");
			}
			if (!identityToken) {
				throw new Error("No identity token available");
			}

			const updatedProfile = await userService.updateUserProfile(
				{ emailPreferences },
				accessToken,
				identityToken
			);
			setUserDetails(updatedProfile);
			setPreferencesSaved(true);
			setTimeout(() => setPreferencesSaved(false), 3000);
		} catch (error) {
			console.error("Failed to save email preferences:", error);
		} finally {
			setIsSavingPreferences(false);
		}
	};

	// Account deletion handlers - COMMENTED OUT FOR NOW
	// const handleOpenDeleteModal = () => {
	// 	setAcceptInput("");
	// 	setShowDeleteModal(true);
	// };

	// const handleCloseDeleteModal = () => {
	// 	setAcceptInput("");
	// 	setShowDeleteModal(false);
	// };

	// const handleAcceptDeletion = () => {
	// 	// TODO: Hook this up to Privy account deletion later
	// 	console.log("Account deletion requested");
	// 	handleCloseDeleteModal();
	// };

	// const isAcceptEnabled = acceptInput.toLowerCase() === "accept";

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
			<div
				className="Details-two-pane"
				style={{
					display: "flex",
					flexDirection: isMobile ? "column" : "row",
					gap: "32px",
				}}
			>
				{/* Left Pane - Account Details */}
				<div className="Details-left-pane" style={{ flex: 1 }}>
					<div className="Details-username-section">
						<div className="Details-username-label">Username</div>
						<div className="Details-username-controls">
							<input
								type="text"
								className="Details-username-input"
								value={inputValue}
								onChange={(e) =>
									setUsernameValue(e.target.value)
								}
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
							Username will be displayed on leaderboard and
							comments.
							<br />
							Username can only be changed once every 7 days.
						</div>
					</div>

					{/* Email Display */}
					{userEmail && (
						<div className="Details-info-section">
							<div className="Details-info-label">Email</div>
							<div className="Details-info-value">
								{userEmail}
							</div>
						</div>
					)}

					{/* Phone Display */}
					{userPhone && (
						<div className="Details-info-section">
							<div className="Details-info-label">Phone</div>
							<div className="Details-info-value">
								{userPhone}
							</div>
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

				{/* Right Pane - Email Preferences */}
				<div className="Details-right-pane" style={{ flex: 1 }}>
					<div className="Details-email-preferences">
						<div className="Details-section-title">
							Email Preferences
						</div>
						<div className="Details-section-description">
							Choose which email notifications you'd like to
							receive.
						</div>

						<div className="Details-preferences-list">
							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={
										emailPreferences.generalNotifications
									}
									onChange={() =>
										handlePreferenceChange(
											"generalNotifications"
										)
									}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">
										General Notifications
									</span>
									<span className="Details-preference-description">
										Important updates about your account and
										platform changes
									</span>
								</div>
							</label>

							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={
										emailPreferences.tradeConfirmations
									}
									onChange={() =>
										handlePreferenceChange(
											"tradeConfirmations"
										)
									}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">
										Trade Confirmations
									</span>
									<span className="Details-preference-description">
										Receive confirmation emails when you
										place or complete trades
									</span>
								</div>
							</label>

							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={
										emailPreferences.winningsNotifications
									}
									onChange={() =>
										handlePreferenceChange(
											"winningsNotifications"
										)
									}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">
										Winnings Notifications
									</span>
									<span className="Details-preference-description">
										Get notified when your predictions win
										and earnings are available
									</span>
								</div>
							</label>

							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={
										emailPreferences.levelUpAnnouncements
									}
									onChange={() =>
										handlePreferenceChange(
											"levelUpAnnouncements"
										)
									}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">
										LevelUp Announcements
									</span>
									<span className="Details-preference-description">
										Stay updated with new features,
										promotions, and platform news
									</span>
								</div>
							</label>
						</div>

						<div className="Details-preferences-actions">
							<button
								className="Details-button"
								onClick={handleSavePreferences}
								disabled={isSavingPreferences}
							>
								{isSavingPreferences
									? "Saving..."
									: preferencesSaved
									? "✓ Saved"
									: "Save Preferences"}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* RPG Experience Pane - COMMENTED OUT FOR NOW */}
			{/* <RPGPane /> */}

			{/* Achievements - COMMENTED OUT FOR NOW */}
			{/* <AchievementPane userAchievements={userDetails?.achievements} /> */}

			{/* Account Deletion Section - COMMENTED OUT FOR NOW */}
			{/* <div className="Details-account-deletion">
				<button
					className="Details-delete-button"
					onClick={handleOpenDeleteModal}
				>
					Request Account Deletion
				</button>
			</div> */}

			{/* Account Deletion Confirmation Modal - COMMENTED OUT FOR NOW */}
			{/* <Modal
				isVisible={showDeleteModal}
				setIsVisible={setShowDeleteModal}
				label="⚠️ Account Deletion Warning"
				className="delete-account-modal"
			>
				<div className="Details-delete-modal-content">
					<div className="Details-delete-warning-text">
						<p className="Details-delete-warning-title">
							This action is permanent and irreversible.
						</p>
						<p className="Details-delete-warning-body">
							If you have <strong>ANY</strong> outstanding
							positions, cash, or holdings in your account and
							your account is deleted, you will{" "}
							<strong>NEVER</strong> under any circumstances be
							able to recover them after your account is deleted.
						</p>
						<p className="Details-delete-warning-body">
							Please ensure you have withdrawn all funds and
							closed all positions before proceeding.
						</p>
					</div>

					<div className="Details-delete-confirm-section">
						<label className="Details-delete-confirm-label">
							Type "Accept" to confirm you understand:
						</label>
						<input
							type="text"
							className="Details-delete-confirm-input"
							value={acceptInput}
							onChange={(e) => setAcceptInput(e.target.value)}
							placeholder="Type Accept"
						/>
					</div>

					<div className="Details-delete-modal-buttons">
						<button
							className="Details-delete-accept-button"
							onClick={handleAcceptDeletion}
							disabled={!isAcceptEnabled}
						>
							Accept
						</button>
						<button
							className="Details-delete-nevermind-button"
							onClick={handleCloseDeleteModal}
						>
							Nevermind
						</button>
					</div>
				</div>
			</Modal> */}
		</div>
	);
}
