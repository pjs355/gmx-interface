import { useState, useEffect } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { useMedia } from "react-use";
import { userService, type EmailPreferences, type UserProfile } from "@/services/api/userService";
import OddsDisplaySelect from "@/components/OddsDisplaySelect/OddsDisplaySelect";
import { useAccountData } from "@/context/AccountDataContext";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import DflowProofSection from "./DflowProofSection";
// Copy trading settings hidden in the app for now (2026-07-16) — restore by
// uncommenting this import + the <CopyTradingSettingsSection /> below.
// import CopyTradingSettingsSection from "./CopyTradingSettingsSection";
import "./Details.scss";

const isMobileBreakpoint = "(max-width: 768px)";

const DEFAULT_EMAIL_PREFERENCES: EmailPreferences = {
	generalNotifications: true,
	tradeConfirmations: true,
	winningsNotifications: true,
	levelUpAnnouncements: true,
};

export default function Details() {
	const { getAccessToken, user } = usePrivy();
	const { identityToken } = useIdentityToken();
	const isMobile = useMedia(isMobileBreakpoint);
	const queryClient = useQueryClient();
	const { profile: profileSlice } = useAccountData();
	const userDetails = profileSlice.data;
	const isLoading = profileSlice.status === "pending" && !profileSlice.isFetched;
	const [isEditingUsername, setIsEditingUsername] = useState(false);
	const [usernameValue, setUsernameValue] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [usernameError, setUsernameError] = useState<string | null>(null);
	// Email preferences are derived from the canonical profile; the local
	// state is only the *unsaved edit* the user is composing.
	const [emailPreferences, setEmailPreferences] =
		useState<EmailPreferences>(DEFAULT_EMAIL_PREFERENCES);
	const [isSavingPreferences, setIsSavingPreferences] = useState(false);
	const [preferencesSaved, setPreferencesSaved] = useState(false);
	const [emailPrefsExpanded, setEmailPrefsExpanded] = useState(false);

	// Sync the editor's email-preferences state whenever the canonical
	// profile changes (login, refetch after save, etc.).
	useEffect(() => {
		if (userDetails?.emailPreferences) {
			setEmailPreferences(userDetails.emailPreferences);
		}
	}, [userDetails?.emailPreferences]);

	// Extract email and phone from Privy user object
	const userEmail = user?.email?.address || null;
	const userPhone = user?.phone?.number || null;

	/**
	 * Optimistically write a freshly returned profile into the canonical
	 * `tradingQueryKeys.profileMe` cache so every consumer (header username,
	 * GamingAccounts, Comments, AccountDataContext) updates without a
	 * separate refetch round-trip.
	 */
	const writeProfileToCache = (next: UserProfile) => {
		queryClient.setQueryData(tradingQueryKeys.profileMe, next);
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
				identityToken,
			);

			writeProfileToCache(updatedProfile);
			setIsEditingUsername(false);
			setUsernameValue("");
			setUsernameError(null);
		} catch (error) {
			console.error("Failed to update username:", error);
			const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";
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
					<div>Unable to load user details. Please try refreshing the page.</div>
				</div>
			</div>
		);
	}

	const hasUsername = !!userDetails.username;
	const isSettingNewUsername = !hasUsername; // User doesn't have a username yet
	const inputValue =
		isEditingUsername || isSettingNewUsername ? usernameValue : userDetails.username || "";
	const canSave = !isSaving && usernameValue.trim().length > 0;
	const saveButtonText = isSaving ? "Saving..." : "Save";

	// Check if error is about the 7-day cooldown
	const is7DayError =
		usernameError?.toLowerCase().includes("7 day") ||
		usernameError?.toLowerCase().includes("once every") ||
		usernameError?.toLowerCase().includes("cooldown");

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && (isEditingUsername || isSettingNewUsername)) handleSaveUsername();
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
				identityToken,
			);
			writeProfileToCache(updatedProfile);
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
		// User is editing an existing username
		if (isEditingUsername && hasUsername) {
			return (
				<>
					<button className="Details-button" onClick={handleSaveUsername} disabled={!canSave}>
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
		// User doesn't have a username yet - show Save button
		if (isSettingNewUsername) {
			return (
				<button className="Details-button" onClick={handleSaveUsername} disabled={!canSave}>
					{saveButtonText}
				</button>
			);
		}
		// User has a username - show Edit button
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
								onChange={(e) => setUsernameValue(e.target.value)}
								disabled={!isEditingUsername && !isSettingNewUsername}
								placeholder="Enter username"
								onKeyDown={handleKeyDown}
							/>
							{renderButtons()}
						</div>

						{usernameError && (
							<div className={`Details-error ${is7DayError ? "Details-error-cooldown" : ""}`}>
								<span>⚠️ {usernameError}</span>
								{is7DayError && (
									<span className="Details-cooldown-warning">
										Username can only be changed once every 7 days.
									</span>
								)}
							</div>
						)}

						{!isSettingNewUsername && (
							<div className="Details-hint">Username will be displayed on comments.</div>
						)}
					</div>

					{/* Email Display */}
					{userEmail && (
						<div className="Details-info-section">
							<div className="Details-username-label">Email</div>
							<div className="Details-info-value Details-truncate" title={userEmail}>
								{userEmail}
							</div>
						</div>
					)}

					{/* Phone Display */}
					{userPhone && (
						<div className="Details-info-section">
							<div className="Details-info-label">Phone</div>
							<div className="Details-info-value">{userPhone}</div>
						</div>
					)}

					<DflowProofSection />

					{/* Copy trading settings hidden for now — see commented import above. */}
					{/* <CopyTradingSettingsSection /> */}
				</div>
			</div>

			<div className="Details-odds-display-section">
				<div className="Details-odds-display-block">
					<div className="Details-username-label">Odds display</div>
					<OddsDisplaySelect />
				</div>
			</div>

			{/* RPG Experience Pane - COMMENTED OUT FOR NOW */}
			{/* <RPGPane /> */}

			{/* Achievements - COMMENTED OUT FOR NOW */}
			{/* <AchievementPane userAchievements={userDetails?.achievements} /> */}

			{/* Email Preferences - Collapsible */}
			<div className="Details-email-preferences-collapsible">
				<button
					className="Details-email-prefs-header"
					onClick={() => setEmailPrefsExpanded(!emailPrefsExpanded)}
				>
					<span>Email Preferences</span>
					<span className={`Details-expand-icon ${emailPrefsExpanded ? "expanded" : ""}`}>▼</span>
				</button>

				{emailPrefsExpanded && (
					<div className="Details-email-prefs-content">
						<div className="Details-preferences-list">
							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={emailPreferences.generalNotifications}
									onChange={() => handlePreferenceChange("generalNotifications")}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">General Notifications</span>
									<span className="Details-preference-description">
										Important updates about your account and platform changes
									</span>
								</div>
							</label>

							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={emailPreferences.tradeConfirmations}
									onChange={() => handlePreferenceChange("tradeConfirmations")}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">Trade Confirmations</span>
									<span className="Details-preference-description">
										Receive confirmation emails when you place or complete trades
									</span>
								</div>
							</label>

							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={emailPreferences.winningsNotifications}
									onChange={() => handlePreferenceChange("winningsNotifications")}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">Winnings Notifications</span>
									<span className="Details-preference-description">
										Get notified when your predictions win and earnings are available
									</span>
								</div>
							</label>

							<label className="Details-preference-item">
								<input
									type="checkbox"
									checked={emailPreferences.levelUpAnnouncements}
									onChange={() => handlePreferenceChange("levelUpAnnouncements")}
									className="Details-checkbox"
								/>
								<div className="Details-preference-content">
									<span className="Details-preference-label">ClutchComment Announcements</span>
									<span className="Details-preference-description">
										Stay updated with new features, promotions, and platform news
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
				)}
			</div>

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
