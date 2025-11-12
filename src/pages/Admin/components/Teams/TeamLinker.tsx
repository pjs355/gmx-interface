import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import "./TeamLinker.scss";

import {
	teamService,
	type TeamRecord,
	type CreateTeamPayload,
} from "@/services/api/teamService";
import { uploadTeamLogo } from "@/services/firebase/firebaseStorage";
import type { TeamCandidate } from "@/types/market-types";

interface TeamLinkerProps {
	candidates: TeamCandidate[];
	onTeamLinked?: (shortCode: string, team: TeamRecord) => void;
	readOnly?: boolean;
	onReorder?: (fromIndex: number, toIndex: number) => void;
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
	isExpanded: boolean;
}

const slugify = (value: string): string => {
	return value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
};

const buildInitialState = (candidate: TeamCandidate): CandidateState => {
	const shortCodeValue = candidate.shortCode;
	const shortCode = typeof shortCodeValue === "string" ? shortCodeValue : "";
	const candidatePandaId = candidate.pandaId;
	let pandaId: number | null;
	if (typeof candidatePandaId === "number") {
		pandaId = candidatePandaId;
	} else {
		pandaId = null;
	}
	return {
		candidate,
		status: "idle",
		existingTeam: null,
		displayName: candidate.displayName,
		slug: candidate.slug,
		shortCode,
		pandaId,
		primaryColor: "",
		secondaryColor: "",
		logoUrl: null,
		logoFile: null,
		logoPreview: null,
		backgroundUrl: "",
		errorMessage: null,
		saving: false,
		isExpanded: true,
	};
};

function normalizeShortCode(shortCode: string): string {
	return shortCode.replace(/\./g, "").trim().toUpperCase();
}

export default function TeamLinker({
	candidates,
	onTeamLinked,
	readOnly,
	onReorder,
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
							current.isExpanded = false;
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

	const reorderCandidates = useCallback(
		(fromIndex: number, toIndex: number) => {
			if (fromIndex === toIndex) {
				return;
			}
			if (fromIndex < 0 || toIndex < 0) {
				return;
			}
			if (fromIndex >= states.length || toIndex >= states.length) {
				return;
			}
			setStates((prev) => {
				const clone = [...prev];
				const [removed] = clone.splice(fromIndex, 1);
				if (!removed) {
					return prev;
				}
				clone.splice(toIndex, 0, removed);
				return clone;
			});
			if (typeof onReorder === "function") {
				onReorder(fromIndex, toIndex);
			}
		},
		[onReorder, states]
	);

	const toggleExpanded = useCallback(
		(index: number) => {
			updateState(index, (prev) => ({
				...prev,
				isExpanded: !prev.isExpanded,
			}));
		},
		[updateState]
	);

	const handleFileSelect = useCallback(
		(index: number, fileList: FileList | null) => {
			const state = states[index];
			const fieldsDisabled =
				state.status === "linked" || readOnly === true;
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
		[updateState, states, readOnly]
	);

	const handleCreateTeam = useCallback(
		async (index: number) => {
			if (readOnly === true) {
				return;
			}
			const state = states[index];
			if (state.status === "linked") {
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
					isExpanded: false,
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
		[getAccessToken, onTeamLinked, readOnly, states, updateState]
	);

	const canReorder = typeof onReorder === "function";

	return (
		<div className="team-linker">
			<h3 className="team-linker__header">Team Links</h3>
			{enrichedStates.map((state, index) => {
				const isLocked = state.status === "linked" || readOnly === true;
				const inputClass = `team-linker__input${
					isLocked ? " team-linker__input--disabled" : ""
				}`;
				const logoPickerClass = `team-linker__logo-picker${
					isLocked ? " team-linker__logo-picker--disabled" : ""
				}`;
				const saveButtonClass = [
					"team-linker__save-button",
					state.saving || isLocked
						? "team-linker__save-button--disabled"
						: "team-linker__save-button--primary",
				].join(" ");

				return (
					<div
						key={`${state.shortCode}-${index}`}
						className="team-linker__card"
					>
						<div className="team-linker__card-top">
							<div className="team-linker__card-top-left">
								<button
									type="button"
									onClick={() => toggleExpanded(index)}
									className="team-linker__toggle-button"
								>
									<span>
										{state.isExpanded
											? "Collapse"
											: "Expand"}
									</span>
								</button>
								<div className="team-linker__summary">
									<strong>
										{state.candidate.displayName}
									</strong>
									<span className="team-linker__shortcode-label">
										Short code:{" "}
										{state.shortCode.length > 0
											? state.shortCode
											: "—"}
									</span>
								</div>
							</div>
							<div className="team-linker__card-top-right">
								{state.status === "linked" &&
									state.existingTeam && (
										<span className="team-linker__status-badge">
											Linked
										</span>
									)}
								{canReorder && (
									<div className="team-linker__reorder-controls">
										<button
											type="button"
											onClick={() =>
												reorderCandidates(index, index - 1)
											}
											disabled={index === 0}
											className="team-linker__reorder-button"
										>
											↑
										</button>
										<button
											type="button"
											onClick={() =>
												reorderCandidates(index, index + 1)
											}
											disabled={
												index === enrichedStates.length - 1
											}
											className="team-linker__reorder-button"
										>
											↓
										</button>
									</div>
								)}
							</div>
						</div>

						{state.isExpanded && (
							<>
								<div className="team-linker__fields">
									<label className="team-linker__field-label">
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
											disabled={isLocked}
											className={inputClass}
										/>
									</label>
									<label className="team-linker__field-label">
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
											disabled={isLocked}
											className={inputClass}
										/>
									</label>
									<label className="team-linker__field-label">
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
											disabled={isLocked}
											className={inputClass}
										/>
									</label>
									<label className="team-linker__field-label">
										<span>PandaScore ID</span>
										<input
											name={`team-panda-${index}`}
											value={
												state.pandaId !== null
													? String(state.pandaId)
													: ""
											}
											onChange={(event) => {
												const value =
													event.target.value.trim();
												updateState(index, (prev) => ({
													...prev,
													pandaId:
														value.length === 0
															? null
															: Number.parseInt(
																	value,
																	10
															  ),
													errorMessage: null,
												}));
											}}
											disabled
											className="team-linker__input team-linker__input--disabled"
										/>
									</label>
								</div>

								<div className="team-linker__colors">
									<label className="team-linker__field-label">
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
											disabled={isLocked}
											className={inputClass}
										/>
									</label>
									<label className="team-linker__field-label">
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
											disabled={isLocked}
											className={inputClass}
										/>
									</label>
								</div>

								<label className="team-linker__field-label">
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
										disabled={isLocked}
										className={inputClass}
									/>
								</label>

								<div className="team-linker__logo-section">
									<span>Team Logo</span>
									<div className="team-linker__logo-controls">
										<label className={logoPickerClass}>
											<input
												type="file"
												name={`team-logo-${index}`}
												accept="image/*"
												onChange={(event) =>
													handleFileSelect(
														index,
														event.target.files
													)
												}
												disabled={isLocked}
												className="team-linker__file-input"
											/>
											Select logo
										</label>
										{state.logoPreview && (
											<img
												src={state.logoPreview}
												alt={`${state.displayName} preview`}
												className="team-linker__logo-preview"
											/>
										)}
										{state.logoUrl &&
											!state.logoPreview && (
												<img
													src={state.logoUrl}
													alt={`${state.displayName} current logo`}
													className="team-linker__logo-preview"
												/>
											)}
									</div>
								</div>

								{state.errorMessage && (
									<div className="team-linker__error">
										{state.errorMessage}
									</div>
								)}

								{!readOnly && (
									<div>
										<button
											type="button"
											onClick={() =>
												handleCreateTeam(index)
											}
											disabled={state.saving || isLocked}
											className={saveButtonClass}
										>
											{state.status === "linked"
												? "Team Linked"
												: state.saving
												? "Saving..."
												: "Save team"}
										</button>
									</div>
								)}
								{readOnly && state.status === "linked" && (
									<div className="team-linker__read-only-note">
										Manage updates in the Teams admin
										section.
									</div>
								)}
							</>
						)}
					</div>
				);
			})}
		</div>
	);
}
