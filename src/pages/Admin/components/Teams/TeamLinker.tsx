import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

import {
	teamService,
	type TeamRecord,
	type CreateTeamPayload,
} from "@/services/api/teamService";
import { uploadTeamLogo } from "@/services/firebase/firebaseStorage";

interface TeamCandidate {
	displayName: string;
	slug: string;
	shortCode: string | null;
	pandaId: number | null;
}

interface TeamLinkerProps {
	candidates: TeamCandidate[];
	onTeamLinked?: (shortCode: string, team: TeamRecord) => void;
}

type TeamStatus = "idle" | "loading" | "linked" | "error";

interface CandidateState {
	candidate: TeamCandidate;
	status: TeamStatus;
	existingTeam: TeamRecord | null;
	displayName: string;
	slug: string;
	shortCode: string;
	pandaId: number | null;
	primaryColor: string;
	secondaryColor: string;
	logoUrl: string | null;
	logoFile: File | null;
	logoPreview: string | null;
	backgroundUrl: string;
	errorMessage: string | null;
	saving: boolean;
	isEditing: boolean;
}

const slugify = (value: string): string => {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
};

const buildInitialState = (candidate: TeamCandidate): CandidateState => {
	return {
		candidate,
		status: "idle",
		existingTeam: null,
		displayName: candidate.displayName,
		slug: candidate.slug,
		shortCode: candidate.shortCode ?? "",
		pandaId: candidate.pandaId,
		primaryColor: "",
		secondaryColor: "",
		logoUrl: null,
		logoFile: null,
		logoPreview: null,
		backgroundUrl: "",
		errorMessage: null,
		saving: false,
		isEditing: false,
	};
};

function normalizeShortCode(shortCode: string): string {
	return shortCode.replace(/\./g, "").trim().toUpperCase();
}

export default function TeamLinker({
	candidates,
	onTeamLinked,
}: TeamLinkerProps) {
	const { getAccessToken } = usePrivy();
	const [states, setStates] = useState<CandidateState[]>(
		candidates.map(buildInitialState)
	);

	useEffect(() => {
		setStates(candidates.map(buildInitialState));
	}, [candidates]);

	const enrichedStates = useMemo(() => states, [states]);

	useEffect(() => {
		let cancelled = false;
		async function fetchExistingTeams() {
			for (let index = 0; index < candidates.length; index += 1) {
				const candidate = candidates[index];
				const pandaId = candidate.pandaId;
				if (typeof pandaId !== "number" || Number.isNaN(pandaId)) {
					continue;
				}
				setStates((prev) => {
					const clone = [...prev];
					const current = { ...clone[index] };
					current.status = "loading";
					current.errorMessage = null;
					clone[index] = current;
					return clone;
				});
				try {
					const accessToken = await getAccessToken();
					if (
						typeof accessToken !== "string" ||
						accessToken.length === 0
					) {
						throw new Error("Missing admin access token");
					}
					let team: TeamRecord | null =
						await teamService.lookupByPandaId(pandaId, accessToken);
					if (!team && candidate.shortCode) {
						try {
							team = await teamService.lookupByShortCode(
								candidate.shortCode,
								accessToken
							);
						} catch (fallbackError) {
							// swallow; we'll surface below
						}
					}
					if (cancelled) {
						return;
					}
					setStates((prev) => {
						const clone = [...prev];
						const current = { ...clone[index] };
						current.status = team ? "linked" : "idle";
						current.existingTeam = team;
						if (team) {
							current.displayName = team.displayName;
							current.slug = team.slug;
							current.shortCode = team.shortCode;
							current.pandaId = team.pandaId ?? candidate.pandaId;
							current.primaryColor = team.primaryColor ?? "";
							current.secondaryColor = team.secondaryColor ?? "";
							current.logoUrl = team.logoUrl ?? null;
							current.backgroundUrl = team.backgroundUrl ?? "";
						}
						clone[index] = current;
						return clone;
					});
					if (team && typeof onTeamLinked === "function") {
						onTeamLinked(team.shortCode, team);
					}
				} catch (error) {
					console.error("error", error);
					if (cancelled) {
						return;
					}
					setStates((prev) => {
						const clone = [...prev];
						const current = { ...clone[index] };
						current.status = "error";
						current.errorMessage =
							error instanceof Error
								? error.message
								: "Failed to look up team";
						clone[index] = current;
						return clone;
					});
				}
			}
		}
		fetchExistingTeams();
		return () => {
			cancelled = true;
		};
	}, [candidates, getAccessToken, onTeamLinked]);

	const updateState = useCallback(
		(index: number, updater: (prev: CandidateState) => CandidateState) => {
			setStates((prev) => {
				const clone = [...prev];
				clone[index] = updater(clone[index]);
				return clone;
			});
		},
		[]
	);

	const handleInputChange = useCallback(
		(index: number, key: keyof CandidateState, value: string) => {
			updateState(index, (prev) => ({
				...prev,
				[key]: key === "slug" ? slugify(value) : value,
				errorMessage: null,
			}));
		},
		[updateState]
	);

	const disabledInputStyle: React.CSSProperties = {
		opacity: 0.5,
		cursor: "not-allowed",
		color: "#9ca3af",
	};

	const handleDisplayNameChange = useCallback(
		(index: number, value: string) => {
			updateState(index, (prev) => {
				const nextSlug =
					prev.slug === slugify(prev.displayName)
						? slugify(value)
						: prev.slug;
				return {
					...prev,
					displayName: value,
					slug: nextSlug,
					errorMessage: null,
				};
			});
		},
		[updateState]
	);

	const handleToggleEditing = useCallback(
		(index: number, editing: boolean) => {
			updateState(index, (prev) => {
				if (!prev.existingTeam) {
					return { ...prev, isEditing: editing };
				}
				if (!editing) {
					const team = prev.existingTeam;
					return {
						...prev,
						isEditing: false,
						displayName: team.displayName,
						slug: team.slug,
						shortCode: team.shortCode,
						pandaId: team.pandaId ?? prev.pandaId,
						primaryColor: team.primaryColor ?? "",
						secondaryColor: team.secondaryColor ?? "",
						backgroundUrl: team.backgroundUrl ?? "",
						logoUrl: team.logoUrl ?? prev.logoUrl,
						logoFile: null,
						logoPreview: null,
						errorMessage: null,
					};
				}
				return { ...prev, isEditing: true };
			});
		},
		[updateState]
	);

	const handleFileSelect = useCallback(
		(index: number, fileList: FileList | null) => {
			const state = states[index];
			const fieldsDisabled =
				state.status === "linked" && !state.isEditing;
			if (fieldsDisabled) {
				return;
			}
			if (fileList === null || fileList.length === 0) {
				updateState(index, (prev) => ({
					...prev,
					logoFile: null,
					logoPreview: null,
					errorMessage: null,
				}));
				return;
			}
			const file = fileList[0];
			const reader = new FileReader();
			reader.onload = () => {
				const preview =
					typeof reader.result === "string" ? reader.result : null;
				updateState(index, (prev) => ({
					...prev,
					logoFile: file,
					logoPreview: preview,
					errorMessage: null,
				}));
			};
			reader.readAsDataURL(file);
		},
		[updateState, states]
	);

	const handleCreateTeam = useCallback(
		async (index: number) => {
			const state = states[index];
			if (state.status === "linked" && !state.isEditing) {
				return;
			}
			const shortCode = state.shortCode.trim();
			const pandaId = state.pandaId;
			if (shortCode.length === 0) {
				updateState(index, (prev) => ({
					...prev,
					errorMessage: "Team short code is required.",
				}));
				return;
			}
			if (typeof pandaId !== "number" || Number.isNaN(pandaId)) {
				updateState(index, (prev) => ({
					...prev,
					errorMessage: "PandaScore ID is required.",
				}));
				return;
			}
			if (state.slug.trim().length === 0) {
				updateState(index, (prev) => ({
					...prev,
					errorMessage: "Slug is required.",
				}));
				return;
			}
			if (state.displayName.trim().length === 0) {
				updateState(index, (prev) => ({
					...prev,
					errorMessage: "Display name is required.",
				}));
				return;
			}
			const normalizedShortCode = normalizeShortCode(shortCode);
			updateState(index, (prev) => ({
				...prev,
				saving: true,
				errorMessage: null,
			}));
			let accessToken: string | null = null;
			try {
				const retrievedToken = await getAccessToken();
				if (
					typeof retrievedToken !== "string" ||
					retrievedToken.length === 0
				) {
					throw new Error(
						"Missing admin access token for team creation"
					);
				}
				accessToken = retrievedToken;
			} catch (error) {
				console.error("error", error);
				updateState(index, (prev) => ({
					...prev,
					errorMessage:
						error instanceof Error
							? error.message
							: "Failed to get authentication token.",
					saving: false,
				}));
				return;
			}
			try {
				let logoUrlToUse: string | null = state.logoUrl;
				if (state.logoFile) {
					const uploadResult = await uploadTeamLogo(
						state.logoFile,
						normalizedShortCode
					);
					logoUrlToUse = uploadResult.url;
				}
				const payload: CreateTeamPayload = {
					displayName: state.displayName.trim(),
					slug: slugify(state.slug),
					shortCode: normalizedShortCode,
					pandaId,
					logoUrl: logoUrlToUse,
				};
				if (state.backgroundUrl.trim().length > 0) {
					payload.backgroundUrl = state.backgroundUrl.trim();
				}
				if (state.primaryColor.trim().length > 0) {
					payload.primaryColor = state.primaryColor.trim();
				}
				if (state.secondaryColor.trim().length > 0) {
					payload.secondaryColor = state.secondaryColor.trim();
				}
				const createdTeam = await teamService.createTeam(
					payload,
					accessToken
				);
				updateState(index, (prev) => ({
					...prev,
					status: "linked",
					existingTeam: createdTeam,
					slug: createdTeam.slug,
					displayName: createdTeam.displayName,
					shortCode: createdTeam.shortCode,
					logoUrl: createdTeam.logoUrl ?? prev.logoUrl,
					backgroundUrl:
						createdTeam.backgroundUrl ?? prev.backgroundUrl,
					saving: false,
				}));
				if (typeof onTeamLinked === "function") {
					onTeamLinked(createdTeam.shortCode, createdTeam);
				}
			} catch (error) {
				console.error("error", error);
				updateState(index, (prev) => ({
					...prev,
					errorMessage:
						error instanceof Error
							? error.message
							: "Failed to create team record.",
					saving: false,
				}));
			}
		},
		[getAccessToken, onTeamLinked, states, updateState]
	);

	if (enrichedStates.length === 0) {
		return null;
	}

	return (
		<div
			style={{
				marginTop: 24,
				padding: 16,
				border: "1px solid rgba(255,255,255,0.2)",
				borderRadius: 12,
				display: "grid",
				gap: 16,
			}}
		>
			<h3 style={{ margin: 0 }}>Team Links</h3>
			{enrichedStates.map((state, index) => (
				<div
					key={`${state.shortCode}-${index}`}
					style={{
						border: "1px solid rgba(255,255,255,0.1)",
						borderRadius: 10,
						padding: 12,
						display: "grid",
						gap: 12,
						background: "rgba(10, 12, 28, 0.4)",
					}}
				>
					<div
						style={{
							display: "flex",
							justifyContent: "space-between",
							alignItems: "center",
							gap: 8,
							flexWrap: "wrap",
						}}
					>
						<strong>{state.candidate.displayName}</strong>
						{state.status === "linked" && state.existingTeam && (
							<span
								style={{
									padding: "4px 8px",
									borderRadius: 6,
									background: "rgba(34,197,94,0.2)",
									color: "#22c55e",
								}}
							>
								Linked
							</span>
						)}
						{state.status === "linked" && state.existingTeam && (
							<div style={{ display: "flex", gap: 8 }}>
								{state.isEditing ? (
									<button
										type="button"
										onClick={() =>
											handleToggleEditing(index, false)
										}
										style={{
											padding: "4px 10px",
											borderRadius: 6,
											border: "1px solid rgba(255,255,255,0.2)",
											background: "rgba(255,255,255,0.1)",
											color: "white",
											cursor: "pointer",
										}}
									>
										Cancel
									</button>
								) : (
									<button
										type="button"
										onClick={() =>
											handleToggleEditing(index, true)
										}
										style={{
											padding: "4px 10px",
											borderRadius: 6,
											border: "1px solid rgba(255,255,255,0.2)",
											background: "rgba(79,70,229,0.35)",
											color: "white",
											cursor: "pointer",
										}}
									>
										Edit
									</button>
								)}
							</div>
						)}
					</div>
					<div
						style={{
							display: "grid",
							gap: 8,
							gridTemplateColumns:
								"repeat(auto-fit, minmax(200px, 1fr))",
						}}
					>
						<label style={{ display: "grid", gap: 4 }}>
							<span>Display Name</span>
							<input
								name={`team-display-name-${index}`}
								value={state.displayName}
								onChange={(event) =>
									handleDisplayNameChange(
										index,
										event.target.value
									)
								}
								disabled={
									state.status === "linked" &&
									!state.isEditing
								}
								style={{
									padding: 8,
									borderRadius: 6,
									border: "1px solid rgba(255,255,255,0.2)",
									background: "rgba(255,255,255,0.05)",
									color: "#ffffff",
									...(state.status === "linked" &&
									!state.isEditing
										? disabledInputStyle
										: {}),
								}}
							/>
						</label>
						<label style={{ display: "grid", gap: 4 }}>
							<span>Slug</span>
							<input
								name={`team-slug-${index}`}
								value={state.slug}
								onChange={(event) =>
									handleInputChange(
										index,
										"slug",
										event.target.value
									)
								}
								disabled={
									state.status === "linked" &&
									!state.isEditing
								}
								style={{
									padding: 8,
									borderRadius: 6,
									border: "1px solid rgba(255,255,255,0.2)",
									background: "rgba(255,255,255,0.05)",
									color: "#ffffff",
									...(state.status === "linked" &&
									!state.isEditing
										? disabledInputStyle
										: {}),
								}}
							/>
						</label>
						<label style={{ display: "grid", gap: 4 }}>
							<span>Short Code</span>
							<input
								name={`team-shortcode-${index}`}
								value={state.shortCode}
								onChange={(event) =>
									handleInputChange(
										index,
										"shortCode",
										event.target.value
									)
								}
								disabled={
									state.status === "linked" &&
									!state.isEditing
								}
								style={{
									padding: 8,
									borderRadius: 6,
									border: "1px solid rgba(255,255,255,0.2)",
									background: "rgba(255,255,255,0.05)",
									color: "#ffffff",
									...(state.status === "linked" &&
									!state.isEditing
										? disabledInputStyle
										: {}),
								}}
							/>
						</label>
						<label style={{ display: "grid", gap: 4 }}>
							<span>PandaScore ID</span>
							<input
								name={`team-panda-${index}`}
								value={
									state.pandaId !== null
										? String(state.pandaId)
										: ""
								}
								onChange={(event) => {
									const value = event.target.value.trim();
									updateState(index, (prev) => ({
										...prev,
										pandaId:
											value.length === 0
												? null
												: Number.parseInt(value, 10),
										errorMessage: null,
									}));
								}}
								disabled
								style={{
									padding: 8,
									borderRadius: 6,
									border: "1px solid rgba(255,255,255,0.2)",
									background: "rgba(255,255,255,0.05)",
									color: "#ffffff",
									...disabledInputStyle,
								}}
							/>
						</label>
					</div>
					<div
						style={{
							display: "grid",
							gap: 8,
							gridTemplateColumns:
								"repeat(auto-fit, minmax(200px, 1fr))",
						}}
					>
						<label style={{ display: "grid", gap: 4 }}>
							<span>Primary Color (hex)</span>
							<input
								name={`team-primary-${index}`}
								value={state.primaryColor}
								onChange={(event) =>
									handleInputChange(
										index,
										"primaryColor",
										event.target.value
									)
								}
								placeholder="#000000"
								disabled={
									state.status === "linked" &&
									!state.isEditing
								}
								style={{
									padding: 8,
									borderRadius: 6,
									border: "1px solid rgba(255,255,255,0.2)",
									background: "rgba(255,255,255,0.05)",
									color: "#ffffff",
									...(state.status === "linked" &&
									!state.isEditing
										? disabledInputStyle
										: {}),
								}}
							/>
						</label>
						<label style={{ display: "grid", gap: 4 }}>
							<span>Secondary Color (hex)</span>
							<input
								name={`team-secondary-${index}`}
								value={state.secondaryColor}
								onChange={(event) =>
									handleInputChange(
										index,
										"secondaryColor",
										event.target.value
									)
								}
								placeholder="#ffffff"
								disabled={
									state.status === "linked" &&
									!state.isEditing
								}
								style={{
									padding: 8,
									borderRadius: 6,
									border: "1px solid rgba(255,255,255,0.2)",
									background: "rgba(255,255,255,0.05)",
									color: "#ffffff",
									...(state.status === "linked" &&
									!state.isEditing
										? disabledInputStyle
										: {}),
								}}
							/>
						</label>
					</div>
					<label style={{ display: "grid", gap: 4 }}>
						<span>Background URL</span>
						<input
							name={`team-background-${index}`}
							value={state.backgroundUrl}
							onChange={(event) =>
								handleInputChange(
									index,
									"backgroundUrl",
									event.target.value
								)
							}
							placeholder="https://..."
							disabled={
								state.status === "linked" && !state.isEditing
							}
							style={{
								padding: 8,
								borderRadius: 6,
								border: "1px solid rgba(255,255,255,0.2)",
								background: "rgba(255,255,255,0.05)",
								color: "#ffffff",
								...(state.status === "linked" &&
								!state.isEditing
									? disabledInputStyle
									: {}),
							}}
						/>
					</label>
					<div style={{ display: "grid", gap: 8 }}>
						<span>Team Logo</span>
						<div
							style={{
								display: "flex",
								gap: 12,
								alignItems: "center",
								flexWrap: "wrap",
							}}
						>
							<label
								style={{
									padding: "6px 12px",
									borderRadius: 6,
									border: "1px solid rgba(255,255,255,0.2)",
									background:
										state.status === "linked" &&
										!state.isEditing
											? "rgba(255,255,255,0.05)"
											: "rgba(255,255,255,0.1)",
									cursor:
										state.status === "linked" &&
										!state.isEditing
											? "not-allowed"
											: "pointer",
								}}
							>
								<input
									type="file"
									name={`team-logo-${index}`}
									accept="image/*"
									style={{ display: "none" }}
									onChange={(event) =>
										handleFileSelect(
											index,
											event.target.files
										)
									}
									disabled={
										state.status === "linked" &&
										!state.isEditing
									}
								/>
								Select logo
							</label>
							{state.logoPreview && (
								<img
									src={state.logoPreview}
									alt={`${state.displayName} preview`}
									style={{
										width: 48,
										height: 48,
										objectFit: "contain",
										borderRadius: 8,
										border: "1px solid rgba(255,255,255,0.2)",
									}}
								/>
							)}
							{state.logoUrl && !state.logoPreview && (
								<img
									src={state.logoUrl}
									alt={`${state.displayName} current logo`}
									style={{
										width: 48,
										height: 48,
										objectFit: "contain",
										borderRadius: 8,
										border: "1px solid rgba(255,255,255,0.2)",
									}}
								/>
							)}
						</div>
					</div>
					{state.errorMessage && (
						<div style={{ color: "#f87171" }}>
							{state.errorMessage}
						</div>
					)}
					<div>
						<button
							type="button"
							onClick={() => handleCreateTeam(index)}
							disabled={
								state.saving ||
								(state.status === "linked" && !state.isEditing)
							}
							style={{
								padding: "8px 14px",
								borderRadius: 6,
								border: "1px solid rgba(255,255,255,0.2)",
								background:
									state.status === "linked"
										? "rgba(255,255,255,0.1)"
										: "rgba(79,70,229,0.35)",
								color: "white",
								cursor:
									state.saving ||
									(state.status === "linked" &&
										!state.isEditing)
										? "not-allowed"
										: "pointer",
							}}
						>
							{state.status === "linked"
								? state.isEditing
									? "Update team"
									: "Team Linked"
								: state.saving
								? "Saving..."
								: "Save team"}
						</button>
					</div>
				</div>
			))}
		</div>
	);
}
