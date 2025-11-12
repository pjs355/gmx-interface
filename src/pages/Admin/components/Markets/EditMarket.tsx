import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { uploadUmbrellaImage } from "@/services/firebase/firebaseStorage";
import {
	umbrellaDataService,
	type Umbrella,
	type UmbrellaQuestion,
	type UmbrellaTeamMapping,
} from "@/services/api/umbrellaDataService";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import MarketImageUpload from "./MarketImageUpload";
import MarketTwitch from "./MarketTwitch";
import TeamLinker from "../Teams/TeamLinker";
import { teamService, type TeamRecord } from "@/services/api/teamService";
import EventScheduleSection from "./components/EventScheduleSection";
import StatusToggle from "./components/StatusToggle";
import QuestionEditor from "./components/QuestionEditor";
import QuestionSelector from "./components/QuestionSelector";
import { usePredictionData } from "@/context/PredictionDataContext";
import {
	QuestionDetails,
	TeamCandidate,
	type UmbrellaUpdatePayload,
} from "@/types/market-types";
import { slugify, formatDateTimeLocal } from "./helpers/market-helpers";
import "./Markets.scss";

function reorderList<T>(items: T[], fromIndex: number, toIndex: number): T[] {
	if (!Array.isArray(items)) {
		return items;
	}
	if (fromIndex === toIndex) {
		return items;
	}
	if (fromIndex < 0 || toIndex < 0) {
		return items;
	}
	if (fromIndex >= items.length || toIndex >= items.length) {
		return items;
	}
	const clone = [...items];
	const [removed] = clone.splice(fromIndex, 1);
	if (typeof removed === "undefined") {
		return items;
	}
	clone.splice(toIndex, 0, removed);
	return clone;
}

function cloneDeepMappings(
	mappings: UmbrellaTeamMapping[]
): UmbrellaTeamMapping[] {
	return mappings.map((mapping) => ({
		teamId: mapping.teamId,
		displayName: mapping.displayName,
		slug: mapping.slug,
		shortCode: mapping.shortCode,
		pandaId: mapping.pandaId,
		logoUrl: mapping.logoUrl,
		backgroundUrl: mapping.backgroundUrl,
		primaryColor: mapping.primaryColor,
		secondaryColor: mapping.secondaryColor,
	}));
}

function teamRecordToMapping(team: TeamRecord): UmbrellaTeamMapping {
	return {
		teamId: team._id,
		displayName: team.displayName,
		slug: team.slug,
		shortCode: team.shortCode,
		pandaId: team.pandaId ?? undefined,
		logoUrl: team.logoUrl ?? undefined,
		backgroundUrl: team.backgroundUrl ?? undefined,
		primaryColor: team.primaryColor ?? undefined,
		secondaryColor: team.secondaryColor ?? undefined,
	};
}

function areMappingsEqual(
	current: UmbrellaTeamMapping | undefined,
	next: UmbrellaTeamMapping
): boolean {
	if (!current) {
		return false;
	}
	return (
		current.teamId === next.teamId &&
		current.displayName === next.displayName &&
		current.slug === next.slug &&
		current.shortCode === next.shortCode &&
		current.pandaId === next.pandaId &&
		current.logoUrl === next.logoUrl &&
		current.backgroundUrl === next.backgroundUrl &&
		current.primaryColor === next.primaryColor &&
		current.secondaryColor === next.secondaryColor
	);
}

const createEmptyCandidate = (): TeamCandidate => ({
	displayName: "",
	slug: slugify(""),
	shortCode: null,
	pandaId: null,
	logoUrl: null,
});

export default function EditMarket({
	umbrella,
	onBack,
}: {
	umbrella: Umbrella;
	onBack: () => void;
}) {
	const { getAccessToken } = usePrivy();
	const [selectedChild, setSelectedChild] = useState<UmbrellaQuestion | null>(
		umbrella.children && umbrella.children.length > 0
			? umbrella.children[0]
			: null
	);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [details, setDetails] = useState<QuestionDetails | null>(null);
	const [qSaving, setQSaving] = useState<boolean>(false);
	const [qSaveMsg, setQSaveMsg] = useState<string | null>(null);
	const [qSaveErr, setQSaveErr] = useState<string | null>(null);
	const [umbDisplayName, setUmbDisplayName] = useState<string>(
		umbrella.displayName || ""
	);
	const [umbRule, setUmbRule] = useState<string>(
		(umbrella as any).rule || ""
	);
	const [umbActive, setUmbActive] = useState<boolean>(() => {
		const v = (umbrella as any).active;
		if (typeof v === "boolean") return v;
		return false;
	});
	const [umbIsEvent, setUmbIsEvent] = useState<boolean>(
		Boolean((umbrella as any).eventDate)
	);
	const [umbEventDate, setUmbEventDate] = useState<string>(() =>
		formatDateTimeLocal((umbrella as any).eventDate)
	);
	const [umbEndDate, setUmbEndDate] = useState<string>(() =>
		formatDateTimeLocal((umbrella as any).endDate)
	);
	const [umbSaving, setUmbSaving] = useState<boolean>(false);
	const [umbSaveMsg, setUmbSaveMsg] = useState<string | null>(null);
	const [umbSaveErr, setUmbSaveErr] = useState<string | null>(null);

	// Twitch integration states
	const initialStreamEnabled = Boolean((umbrella as any).streamEnabled);
	const initialStreamUrl =
		typeof (umbrella as any).streamUrl === "string"
			? (umbrella as any).streamUrl
			: "";
	const [streamEnabled, setStreamEnabled] =
		useState<boolean>(initialStreamEnabled);
	const [streamUrl, setStreamUrl] = useState<string>(initialStreamUrl);

	// Image upload states
	const [image1, setImage1] = useState<File | null>(null);
	const [image2, setImage2] = useState<File | null>(null);
	const [image1Preview, setImage1Preview] = useState<string | null>(null);
	const [image2Preview, setImage2Preview] = useState<string | null>(null);
	const [image1Url, setImage1Url] = useState<string>(
		(umbrella as any).image1Url || ""
	);
	const [image2Url, setImage2Url] = useState<string>(
		(umbrella as any).image2Url || ""
	);
	const [uploadingImage, setUploadingImage] = useState<
		"image1" | "image2" | null
	>(null);
	const [teamMappingsState, setTeamMappingsState] = useState<
		UmbrellaTeamMapping[]
	>(() => cloneDeepMappings(umbrella.teamMappings ?? []));
	const [linkedTeams, setLinkedTeams] = useState<Record<string, TeamRecord>>(
		{}
	);
	const [prefilledTeamCandidates, setPrefilledTeamCandidates] = useState<
		TeamCandidate[]
	>([]);

	// Tags state
	const { tags: availableTags, tagsLoading: loadingTags } =
		usePredictionData();
	const [hasAttemptedPandascorePrefill, setHasAttemptedPandascorePrefill] =
		useState(false);

	const children = useMemo(() => umbrella.children || [], [umbrella]);

	const teamCandidates = useMemo(() => {
		if (prefilledTeamCandidates.length > 0) {
			return prefilledTeamCandidates;
		}
		if (teamMappingsState && teamMappingsState.length > 0) {
			return teamMappingsState.map((mapping) => {
				const displayNameValue = mapping.displayName;
				if (
					typeof displayNameValue !== "string" ||
					displayNameValue.length === 0
				) {
					throw new Error("Team mapping is missing displayName");
				}
				const slugValue = mapping.slug;
				if (typeof slugValue !== "string" || slugValue.length === 0) {
					throw new Error("Team mapping is missing slug");
				}
				const shortCodeValue = mapping.shortCode;
				const shortCode =
					typeof shortCodeValue === "string" &&
					shortCodeValue.length > 0
						? shortCodeValue
						: null;
				const logoUrlValue = mapping.logoUrl;
				const logoUrl =
					typeof logoUrlValue === "string" && logoUrlValue.length > 0
						? logoUrlValue
						: null;
				return {
					displayName: displayNameValue,
					slug: slugValue,
					shortCode,
					pandaId: mapping.pandaId,
					logoUrl,
				};
			});
		}
		return [createEmptyCandidate(), createEmptyCandidate()];
	}, [prefilledTeamCandidates, teamMappingsState]);

	const shouldRenderTeamLinker = Boolean(
		umbrella.pandascore_matchId && teamCandidates.length > 0
	);

	useEffect(() => {
		console.log("EditMarket umbrella changed, resetting state", umbrella);
		setDetails(null);
		setError(null);
		setUmbDisplayName(umbrella.displayName || "");
		setUmbRule(((umbrella as any).rule as string) || "");
		const v = (umbrella as any).active;
		setUmbActive(typeof v === "boolean" ? v : false);
		const hasDate = Boolean((umbrella as any).eventDate);
		setUmbIsEvent(hasDate);
		setUmbEventDate(formatDateTimeLocal((umbrella as any).eventDate));
		setUmbEndDate(formatDateTimeLocal((umbrella as any).endDate));

		// Initialize image URLs
		setImage1Url((umbrella as any).image1Url || "");
		setImage2Url((umbrella as any).image2Url || "");
		setImage1Preview((umbrella as any).image1Url || null);
		setImage2Preview((umbrella as any).image2Url || null);

		// Initialize Twitch settings
		setStreamEnabled(Boolean((umbrella as any).streamEnabled));
		const resetStreamUrl =
			typeof (umbrella as any).streamUrl === "string"
				? ((umbrella as any).streamUrl as string)
				: "";
		setStreamUrl(resetStreamUrl);
		setTeamMappingsState(cloneDeepMappings(umbrella.teamMappings ?? []));
		setLinkedTeams({});
		setPrefilledTeamCandidates([]);
		setHasAttemptedPandascorePrefill(false);
	}, [umbrella._id]);

	const umbrellaTeamMappingsKey = useMemo(
		() => JSON.stringify(umbrella.teamMappings ?? []),
		[umbrella.teamMappings]
	);

	const prevLoadedTeamsSnapshot = useRef<string>("");

	useEffect(() => {
		let cancelled = false;
		async function loadTeamRecords() {
			if (!umbrella.teamMappings || umbrella.teamMappings.length === 0) {
				const emptySnapshot = "{}";
				if (prevLoadedTeamsSnapshot.current !== emptySnapshot) {
					prevLoadedTeamsSnapshot.current = emptySnapshot;
					setLinkedTeams({});
				}
				return;
			}
			try {
				const token = await getAccessToken();
				if (!token) {
					return;
				}
				const entries: Record<string, TeamRecord> = {};
				for (const mapping of umbrella.teamMappings) {
					let record: TeamRecord | null = null;
					try {
						if (typeof mapping.pandaId === "number") {
							record = await teamService.lookupByPandaId(
								mapping.pandaId,
								token
							);
						}
						if (!record && mapping.shortCode) {
							record = await teamService.lookupByShortCode(
								mapping.shortCode,
								token
							);
						}
					} catch (error) {
						console.error("error", error);
					}
					if (!record && mapping.teamId) {
						record = {
							_id: mapping.teamId,
							displayName:
								mapping.displayName ||
								mapping.shortCode ||
								mapping.slug,
							slug:
								mapping.slug ||
								slugify(mapping.displayName ?? ""),
							shortCode: mapping.shortCode || mapping.slug || "",
							pandaId:
								typeof mapping.pandaId === "number"
									? mapping.pandaId
									: 0,
							logoUrl: mapping.logoUrl,
							backgroundUrl: mapping.backgroundUrl,
							primaryColor: mapping.primaryColor,
							secondaryColor: mapping.secondaryColor,
						};
					}
					if (record && record.shortCode) {
						entries[record.shortCode] = record;
					}
				}
				if (!cancelled) {
					const snapshot = JSON.stringify(entries);
					if (snapshot !== prevLoadedTeamsSnapshot.current) {
						prevLoadedTeamsSnapshot.current = snapshot;
						setLinkedTeams(entries);
					}
				}
			} catch (error) {
				console.error("error", error);
			}
		}
		loadTeamRecords();
		return () => {
			cancelled = true;
		};
	}, [getAccessToken, umbrellaTeamMappingsKey]);

	useEffect(() => {
		let cancelled = false;
		async function populateCandidatesFromPandascore() {
			if (
				prefilledTeamCandidates.length > 0 ||
				teamMappingsState.length > 0 ||
				!umbrella.pandascore_matchId
			) {
				return;
			}
			try {
				const token = await getAccessToken();
				if (!token) {
					return;
				}
				const match =
					await predictionMarketDataService.fetchMatchFromPandascore(
						umbrella.pandascore_matchId,
						token
					);
				if (!match) {
					return;
				}
				const rawTeams = Array.isArray((match as any).opponents)
					? (match as any).opponents
					: Array.isArray((match as any).teams)
					? (match as any).teams
					: [];
				const mapped = rawTeams
					.slice(0, 2)
					.map((entry: any) => {
						const opponent = entry?.opponent || entry;
						if (!opponent) {
							return null;
						}
						const name =
							opponent.displayName || opponent.name || "";
						const cleanedName = name.trim();
						if (!cleanedName) {
							return null;
						}
						const shortCode = opponent.acronym
							? opponent.acronym.replace(/\./g, "").toUpperCase()
							: null;
						const pandaId =
							typeof entry?.id === "number"
								? entry.id
								: typeof opponent.id === "number"
								? opponent.id
								: null;
						const logoUrl =
							opponent.imageUrl || opponent.image_url || null;
						return {
							displayName: cleanedName,
							slug: opponent.slug || slugify(cleanedName),
							shortCode,
							pandaId,
							logoUrl,
						};
					})
					.filter(Boolean) as TeamCandidate[];
				if (!cancelled && mapped.length > 0) {
					setPrefilledTeamCandidates(mapped);
				}
			} catch (error) {
				console.error("error", error);
			} finally {
				if (!cancelled) {
					setHasAttemptedPandascorePrefill(true);
				}
			}
		}
		if (!hasAttemptedPandascorePrefill) {
			populateCandidatesFromPandascore();
		}
		return () => {
			cancelled = true;
		};
	}, [
		hasAttemptedPandascorePrefill,
		prefilledTeamCandidates.length,
		teamMappingsState.length,
		umbrella.pandascore_matchId,
		getAccessToken,
	]);

	const handleTeamLinked = useCallback(
		(shortCode: string, team: TeamRecord) => {
			setLinkedTeams((prev) => ({ ...prev, [shortCode]: team }));
			setTeamMappingsState((prev) => {
				const nextMapping = teamRecordToMapping(team);
				const existingIndex = prev.findIndex((mapping) => {
					if (mapping.shortCode && nextMapping.shortCode) {
						return mapping.shortCode === nextMapping.shortCode;
					}
					if (mapping.teamId && nextMapping.teamId) {
						return mapping.teamId === nextMapping.teamId;
					}
					return false;
				});
				if (existingIndex >= 0) {
					const current = prev[existingIndex];
					if (areMappingsEqual(current, nextMapping)) {
						return prev;
					}
					const clone = [...prev];
					clone[existingIndex] = nextMapping;
					return clone;
				}
				return [...prev, nextMapping];
			});
		},
		[]
	);

	const handleTeamReorder = useCallback(
		(fromIndex: number, toIndex: number) => {
			setTeamMappingsState((prev) =>
				reorderList(prev, fromIndex, toIndex)
			);
			setPrefilledTeamCandidates((prev) => {
				if (!Array.isArray(prev) || prev.length === 0) {
					return prev;
				}
				return reorderList(prev, fromIndex, toIndex);
			});
		},
		[]
	);

	const teamMappingsPayload = useMemo(() => {
		if (teamMappingsState.length > 0) {
			return teamMappingsState;
		}
		// fallback: derive from linkedTeams if no state entries
		return Object.values(linkedTeams).map((team) => ({
			teamId: team._id,
			displayName: team.displayName,
			slug: team.slug,
			shortCode: team.shortCode,
			pandaId: team.pandaId,
			logoUrl: team.logoUrl ?? undefined,
			backgroundUrl: team.backgroundUrl ?? undefined,
			primaryColor: team.primaryColor ?? undefined,
			secondaryColor: team.secondaryColor ?? undefined,
		}));
	}, [teamMappingsState, linkedTeams]);

	async function loadQuestion(qid: string) {
		console.log("EditMarket.loadQuestion -> begin", qid);
		setError(null);

		const child = children.find((c) => c.questionId === qid);
		if (!child) {
			setError("Unable to locate question on umbrella");
			setDetails(null);
			return;
		}

		const baseDetails: QuestionDetails = {
			...(child as any),
			question: (child as any).question ?? child.displayName,
			displayName: child.displayName,
			yesColor: (child as any).yesColor,
			noColor: (child as any).noColor,
			tagIds: Array.isArray((child as any).tagIds)
				? [...((child as any).tagIds as string[])]
				: [],
		} as QuestionDetails;

		setDetails(baseDetails);

		if (!umbrella.pandascore_matchId) {
			console.log(
				"EditMarket.loadQuestion using umbrella child only",
				baseDetails
			);
			return;
		}

		setLoading(true);
		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			const base = getPredictionApiBaseUrl();
			const resp = await fetch(`${base}/questions/${qid}`, {
				headers: {
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			});
			const json = await resp.json().catch(() => ({} as any));
			console.log("EditMarket.loadQuestion response", json);
			const payload = json?.data ?? json;
			let normalized: any = Array.isArray(payload)
				? payload[0]
				: payload?.question ?? payload;

			if (!resp.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}

			if (!normalized || typeof normalized !== "object") {
				console.warn(
					"EditMarket.loadQuestion unexpected payload",
					payload
				);
				return;
			}

			if (!normalized.questionId) {
				normalized.questionId = qid;
			}

			if (
				!normalized.displayName &&
				typeof normalized.display_name === "string"
			) {
				normalized.displayName = normalized.display_name;
			}

			if (
				Array.isArray(baseDetails.tagIds) &&
				!Array.isArray(normalized.tagIds)
			) {
				normalized.tagIds = baseDetails.tagIds;
			}

			const merged: QuestionDetails = {
				...baseDetails,
				...normalized,
			} as QuestionDetails;

			console.log("EditMarket.loadQuestion merged", merged);
			setDetails(merged);
		} catch (e: any) {
			console.error("EditMarket.loadQuestion error", e);
			setError(e?.message || String(e));
		} finally {
			setLoading(false);
		}
	}

	const toggleTag = useCallback((tagId: string) => {
		setDetails((prev) => {
			if (!prev) return prev;
			const current = Array.isArray(prev.tagIds) ? prev.tagIds : [];
			const exists = current.includes(tagId);
			const next = exists
				? current.filter((t) => t !== tagId)
				: [...current, tagId];
			return { ...prev, tagIds: next };
		});
	}, []);

	const handleDetailsChange = useCallback(
		(patch: Partial<QuestionDetails>) => {
			setDetails((prev) => (prev ? { ...prev, ...patch } : prev));
		},
		[]
	);

	function handleSelectQuestion(question: UmbrellaQuestion) {
		setSelectedChild(question);
		loadQuestion(question.questionId);
	}

	async function saveQuestion() {
		if (!details) return;
		const id = details._id || details.questionId;
		console.log("EditMarket.saveQuestion attempt", id, details);
		if (!id) return;
		setQSaving(true);
		setQSaveMsg(null);
		setQSaveErr(null);
		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			const body: any = {
				displayName: details.displayName || undefined,
				yesColor: details.yesColor || undefined,
				noColor: details.noColor || undefined,
				tagIds: Array.isArray(details.tagIds) ? details.tagIds : [],
			};
			const base = getPredictionApiBaseUrl();
			const resp = await fetch(`${base}/questions/${id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify(body),
			});
			const json = await resp.json().catch(() => ({} as any));
			console.log("EditMarket.saveQuestion response", json);
			if (!resp.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setQSaveMsg("Saved");
		} catch (e: any) {
			console.error("EditMarket.saveQuestion error", e);
			setQSaveErr(e?.message || String(e));
		} finally {
			setQSaving(false);
		}
	}

	// Image upload functions
	const handleImageSelect = (file: File, imageType: "image1" | "image2") => {
		if (!file.type.startsWith("image/")) {
			alert("Please select an image file");
			return;
		}

		if (file.size > 5 * 1024 * 1024) {
			// 5MB limit
			alert("Image size must be less than 5MB");
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const previewUrl = e.target?.result as string;
			if (imageType === "image1") {
				setImage1(file);
				setImage1Preview(previewUrl);
			} else {
				setImage2(file);
				setImage2Preview(previewUrl);
			}
		};
		reader.readAsDataURL(file);
	};

	const uploadImageToFirebase = async (
		file: File,
		imageType: "image1" | "image2"
	): Promise<string> => {
		setUploadingImage(imageType);

		try {
			// Map image1/image2 to banner/square
			const firebaseImageType =
				imageType === "image1" ? "banner" : "square";

			// Upload to Firebase Storage
			const result = await uploadUmbrellaImage(
				file,
				umbrella._id,
				firebaseImageType
			);

			setUploadingImage(null);
			return result.url;
		} catch (error) {
			setUploadingImage(null);
			throw new Error(`Failed to upload ${imageType}: ${error}`);
		}
	};

	async function saveUmbrella() {
		setUmbSaving(true);
		setUmbSaveMsg(null);
		setUmbSaveErr(null);
		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			const payload: UmbrellaUpdatePayload = {
				displayName: umbDisplayName || undefined,
				rule: umbRule || undefined,
				active: umbActive,
				streamEnabled,
				streamUrl: streamUrl.length > 0 ? streamUrl : undefined,
				eventDate: null,
				endDate: null,
			};

			if (umbIsEvent) {
				payload.eventDate = umbEventDate
					? new Date(umbEventDate).toISOString()
					: null;
				payload.endDate = umbEndDate
					? new Date(umbEndDate).toISOString()
					: null;
			}

			let nextImage1Url: string | null | undefined = image1Url;
			if (image1) {
				nextImage1Url = await uploadImageToFirebase(image1, "image1");
			}
			if (typeof nextImage1Url === "string" || nextImage1Url === null) {
				payload.image1Url = nextImage1Url;
			}

			let nextImage2Url: string | null | undefined = image2Url;
			if (image2) {
				nextImage2Url = await uploadImageToFirebase(image2, "image2");
			}
			if (typeof nextImage2Url === "string" || nextImage2Url === null) {
				payload.image2Url = nextImage2Url;
			}

			if (teamMappingsPayload.length > 0) {
				payload.teamMappings = teamMappingsPayload;
			} else if (Array.isArray(umbrella.teamMappings)) {
				payload.teamMappings = [];
			}

			const response = await umbrellaDataService.updateUmbrella(
				umbrella._id,
				payload,
				token ?? undefined
			);

			if (!response?.success) {
				throw new Error(response?.error || "Failed to save umbrella");
			}
			setUmbSaveMsg("Saved");

			// Clear uploaded images after successful save
			if (image1) {
				setImage1(null);
				setImage1Preview(
					typeof nextImage1Url === "string"
						? nextImage1Url
						: nextImage1Url === null
						? null
						: image1Preview
				);
				setImage1Url(
					typeof nextImage1Url === "string" ? nextImage1Url : ""
				);
			}
			if (image2) {
				setImage2(null);
				setImage2Preview(
					typeof nextImage2Url === "string"
						? nextImage2Url
						: nextImage2Url === null
						? null
						: image2Preview
				);
				setImage2Url(
					typeof nextImage2Url === "string" ? nextImage2Url : ""
				);
			}
		} catch (e: any) {
			setUmbSaveErr(e?.message || String(e));
		} finally {
			setUmbSaving(false);
		}
	}
	return (
		<div className="admin-market-container">
			<button type="button" onClick={onBack} className="edit-back-button">
				Back
			</button>
			<h2 className="edit-title">Edit Umbrella</h2>
			<div className="edit-umbrella-id">ID: {umbrella._id}</div>
			<label className="edit-form-label">
				<span>Umbrella Display Name</span>
				<input
					value={umbDisplayName}
					onChange={(e) => setUmbDisplayName(e.target.value)}
					className="edit-form-input"
					name="umbrellaDisplayName"
				/>
			</label>
			<label className="edit-form-label">
				<span>Umbrella Rules</span>
				<textarea
					value={umbRule}
					onChange={(e) => setUmbRule(e.target.value)}
					rows={4}
					className="edit-form-textarea"
					name="umbrellaRule"
				/>
			</label>

			<StatusToggle
				value={umbActive}
				onChange={setUmbActive}
				buttonClassName="edit-toggle-button"
				activeButtonClassName="active"
			/>

			<EventScheduleSection
				isEvent={umbIsEvent}
				onToggle={setUmbIsEvent}
				eventDate={umbEventDate}
				endDate={umbEndDate}
				onEventDateChange={setUmbEventDate}
				onEndDateChange={setUmbEndDate}
				buttonClassName="edit-toggle-button"
				activeButtonClassName="active"
				showClearButtons
				onClearEventDate={() => setUmbEventDate("")}
				onClearEndDate={() => setUmbEndDate("")}
			/>

			{/* Twitch Enabled */}
			<div className="edit-stream-wrapper">
				<MarketTwitch
					streamEnabled={streamEnabled}
					streamUrl={streamUrl}
					onStreamEnabledChange={setStreamEnabled}
					onStreamUrlChange={setStreamUrl}
				/>
			</div>

			{/* Image Upload Section */}
			<MarketImageUpload
				image1={image1}
				image2={image2}
				image1Preview={image1Preview}
				image2Preview={image2Preview}
				image1Url={image1Url}
				image2Url={image2Url}
				uploadingImage={uploadingImage}
				onImage1Select={(file) => handleImageSelect(file, "image1")}
				onImage2Select={(file) => handleImageSelect(file, "image2")}
				onImage1Remove={() => {
					setImage1(null);
					setImage1Preview(image1Url || null);
				}}
				onImage2Remove={() => {
					setImage2(null);
					setImage2Preview(image2Url || null);
				}}
			/>

			{shouldRenderTeamLinker && (
				<TeamLinker
					candidates={teamCandidates}
					onTeamLinked={handleTeamLinked}
					readOnly
					onReorder={handleTeamReorder}
				/>
			)}

			<div className="edit-save-umbrella-group">
				<button
					type="button"
					onClick={saveUmbrella}
					disabled={umbSaving}
					className="edit-save-umbrella-button"
				>
					{umbSaving ? "Saving..." : "Save Umbrella"}
				</button>
				{umbSaveMsg && (
					<span className="edit-success-message">{umbSaveMsg}</span>
				)}
				{umbSaveErr && (
					<span className="edit-error-message">{umbSaveErr}</span>
				)}
			</div>

			<QuestionSelector
				questions={children}
				onSelect={handleSelectQuestion}
				selectedQuestionId={selectedChild?.questionId ?? null}
			/>

			{selectedChild && (
				<QuestionEditor
					loading={loading}
					error={error}
					details={details}
					availableTags={availableTags}
					loadingTags={loadingTags}
					onTagToggle={toggleTag}
					onDetailsChange={handleDetailsChange}
					onSave={saveQuestion}
					saving={qSaving}
					saveMessage={qSaveMsg}
					saveError={qSaveErr}
				/>
			)}
		</div>
	);
}
