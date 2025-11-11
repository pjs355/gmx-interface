import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { uploadUmbrellaImage } from "@/services/firebase/firebaseStorage";
import type {
	Umbrella,
	UmbrellaQuestion,
	UmbrellaTeamMapping,
} from "@/services/api/umbrellaDataService";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import { tagService, type Tag } from "@/services/api/tagService";
import SeedMarket from "./SeedMarket";
import MarketImageUpload from "./MarketImageUpload";
import MarketTwitch from "./MarketTwitch";
import SettleMarket from "./SettleMarket";
import TeamLinker from "../Teams/TeamLinker";
import { teamService, type TeamRecord } from "@/services/api/teamService";
import "./Markets.scss";

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

type QuestionDetails = {
	_id?: string;
	questionId?: string;
	question?: string;
	displayName?: string;
	oracle?: string;
	conditionId?: string;
	yesTokenId?: string;
	noTokenId?: string;
	seedAmount?: string;
	registered?: boolean;
	registrationTxHash?: string;
	creationTxHash?: string;
	yesColor?: string;
	noColor?: string;
	tagIds?: string[]; // Array of tag ObjectIds
};

type TeamCandidate = {
	displayName: string;
	slug: string;
	shortCode: string | null;
	pandaId: number | null;
	logoUrl?: string | null;
};

const slugify = (value: string): string =>
	value
		.toLowerCase()
		.trim()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

const splitDisplayName = (displayName: string | undefined) => {
	if (!displayName) {
		return [] as string[];
	}
	const [matchPart] = displayName.split(" - ");
	if (!matchPart) {
		return [] as string[];
	}
	const pieces = matchPart.split(/\s+vs\s+/i);
	if (pieces.length === 2) {
		return pieces;
	}
	return [] as string[];
};

export default function EditMarket({
	umbrella,
	onBack,
}: {
	umbrella: Umbrella;
	onBack: () => void;
}) {
	const { getAccessToken } = usePrivy();
	const [selectedChild, setSelectedChild] = useState<UmbrellaQuestion | null>(
		null
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
	const [umbEventDate, setUmbEventDate] = useState<string>(() => {
		const d = (umbrella as any).eventDate as string | undefined;
		if (!d) return "";
		const dt = new Date(d);
		const pad = (n: number) => String(n).padStart(2, "0");
		const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
			dt.getDate()
		)}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
		return local;
	});
	const [umbEndDate, setUmbEndDate] = useState<string>(() => {
		const d = (umbrella as any).endDate as string | undefined;
		if (!d) return "";
		const dt = new Date(d);
		const pad = (n: number) => String(n).padStart(2, "0");
		const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
			dt.getDate()
		)}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
		return local;
	});
	const umbEventRef = useRef<HTMLInputElement | null>(null);
	const umbEndRef = useRef<HTMLInputElement | null>(null);
	const [umbSaving, setUmbSaving] = useState<boolean>(false);
	const [umbSaveMsg, setUmbSaveMsg] = useState<string | null>(null);
	const [umbSaveErr, setUmbSaveErr] = useState<string | null>(null);

	// Twitch integration states
	const [twitchEnabled, setTwitchEnabled] = useState<boolean>(
		Boolean((umbrella as any).twitchEnabled)
	);
	const [twitchChannel, setTwitchChannel] = useState<string>(
		(umbrella as any).twitchChannel || ""
	);

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
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [loadingTags, setLoadingTags] = useState(true);
	const [hasAttemptedPandascorePrefill, setHasAttemptedPandascorePrefill] =
		useState(false);

	const children = useMemo(() => umbrella.children || [], [umbrella]);

	const teamCandidates = useMemo(() => {
		if (prefilledTeamCandidates.length > 0) {
			return prefilledTeamCandidates;
		}
		if (teamMappingsState && teamMappingsState.length > 0) {
			return teamMappingsState.map((mapping) => {
				const displayName =
					mapping.displayName ||
					mapping.shortCode ||
					mapping.slug ||
					"";
				const slug = mapping.slug || slugify(displayName);
				return {
					displayName,
					slug,
					shortCode: mapping.shortCode || null,
					pandaId:
						typeof mapping.pandaId === "number"
							? mapping.pandaId
							: null,
					logoUrl: mapping.logoUrl ?? null,
				};
			});
		}
		return [
			{
				displayName: "",
				slug: slugify(""),
				shortCode: null,
				pandaId: null,
				logoUrl: null,
			},
			{
				displayName: "",
				slug: slugify(""),
				shortCode: null,
				pandaId: null,
				logoUrl: null,
			},
		];
	}, [prefilledTeamCandidates, teamMappingsState]);

	const teamCandidatesKey = useMemo(
		() => JSON.stringify(teamCandidates),
		[teamCandidates]
	);

	const shouldRenderTeamLinker = Boolean(
		umbrella.pandascore_matchId && teamCandidates.length > 0
	);

	useEffect(() => {
		console.log("EditMarket teamCandidates", teamCandidates);
	}, [teamCandidatesKey]);

	// Fetch tags
	useEffect(() => {
		let mounted = true;

		async function loadTags() {
			try {
				const token = await getAccessToken();
				if (!token) {
					throw new Error("No access token available");
				}
				const tags = await tagService.fetchAllTags(token);
				if (mounted) setAvailableTags(tags);
			} catch (err) {
				console.error("error", err);
			} finally {
				if (mounted) setLoadingTags(false);
			}
		}

		loadTags();

		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

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
		if ((umbrella as any).eventDate) {
			const dt = new Date((umbrella as any).eventDate);
			const pad = (n: number) => String(n).padStart(2, "0");
			const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
				dt.getDate()
			)}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
			setUmbEventDate(local);
		} else {
			setUmbEventDate("");
		}

		if ((umbrella as any).endDate) {
			const dt = new Date((umbrella as any).endDate);
			const pad = (n: number) => String(n).padStart(2, "0");
			const local = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
				dt.getDate()
			)}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
			setUmbEndDate(local);
		} else {
			setUmbEndDate("");
		}

		// Initialize image URLs
		setImage1Url((umbrella as any).image1Url || "");
		setImage2Url((umbrella as any).image2Url || "");
		setImage1Preview((umbrella as any).image1Url || null);
		setImage2Preview((umbrella as any).image2Url || null);

		// Initialize Twitch settings
		setTwitchEnabled(Boolean((umbrella as any).twitchEnabled));
		setTwitchChannel((umbrella as any).twitchChannel || "");
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

	function toggleTag(tagId: string) {
		if (!details) return;
		const current = Array.isArray(details.tagIds) ? details.tagIds : [];
		const exists = current.includes(tagId);
		const next = exists
			? current.filter((t) => t !== tagId)
			: [...current, tagId];
		setDetails({ ...details, tagIds: next });
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
			const body: any = {
				displayName: umbDisplayName || undefined,
				rule: umbRule || undefined,
				active: umbActive,
				twitchEnabled: twitchEnabled,
				twitchChannel: twitchChannel || undefined,
			};

			if (umbIsEvent) {
				body.eventDate = umbEventDate
					? new Date(umbEventDate).toISOString()
					: null;
				body.endDate = umbEndDate
					? new Date(umbEndDate).toISOString()
					: null;
			} else {
				body.eventDate = null;
				body.endDate = null;
			}

			// Upload images if new ones are selected
			if (image1) {
				body.image1Url = await uploadImageToFirebase(image1, "image1");
			} else if (image1Url) {
				body.image1Url = image1Url;
			}

			if (image2) {
				body.image2Url = await uploadImageToFirebase(image2, "image2");
			} else if (image2Url) {
				body.image2Url = image2Url;
			}

			if (teamMappingsPayload.length > 0) {
				body.teamMappings = teamMappingsPayload;
			} else if (Array.isArray(umbrella.teamMappings)) {
				// Explicitly clear if user removed all mappings
				body.teamMappings = [];
			}

			const base = getPredictionApiBaseUrl();
			const resp = await fetch(`${base}/umbrellas/${umbrella._id}`, {
				method: "PUT",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify(body),
			});
			const json = await resp.json().catch(() => ({} as any));
			if (!resp.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setUmbSaveMsg("Saved");

			// Clear uploaded images after successful save
			if (image1) {
				setImage1(null);
				setImage1Preview(image1Url || null);
			}
			if (image2) {
				setImage2(null);
				setImage2Preview(image2Url || null);
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

			<div className="edit-status-section">
				<span>Status</span>
				<div className="edit-toggle-group">
					<button
						type="button"
						onClick={() => setUmbActive(true)}
						className={`edit-toggle-button ${
							umbActive ? "active" : ""
						}`}
					>
						Active
					</button>
					<button
						type="button"
						onClick={() => setUmbActive(false)}
						className={`edit-toggle-button ${
							!umbActive ? "active" : ""
						}`}
					>
						Inactive
					</button>
				</div>

				<span>Is this part of an event?</span>
				<div className="edit-toggle-group">
					<button
						type="button"
						onClick={() => setUmbIsEvent(false)}
						className={`edit-toggle-button ${
							!umbIsEvent ? "active" : ""
						}`}
					>
						No
					</button>
					<button
						type="button"
						onClick={() => setUmbIsEvent(true)}
						className={`edit-toggle-button ${
							umbIsEvent ? "active" : ""
						}`}
					>
						Yes
					</button>
				</div>
				{umbIsEvent && (
					<>
						<label className="admin-form-label">
							<span>Event Start Date & Time</span>
							<div className="edit-event-date-group">
								<input
									ref={umbEventRef}
									type="datetime-local"
									value={umbEventDate}
									onChange={(e) =>
										setUmbEventDate(e.target.value)
									}
									className="edit-event-date-input"
								/>
								<button
									type="button"
									onClick={() => {
										try {
											// @ts-ignore
											umbEventRef.current?.showPicker?.();
										} catch {
											umbEventRef.current?.focus();
										}
									}}
									className="edit-event-button"
								>
									Pick
								</button>
								<button
									type="button"
									onClick={() => setUmbEventDate("")}
									className="edit-clear-button"
								>
									Clear
								</button>
							</div>
						</label>
						<label className="admin-form-label">
							<span>Event End Date & Time</span>
							<div className="edit-event-date-group">
								<input
									ref={umbEndRef}
									type="datetime-local"
									value={umbEndDate}
									min={umbEventDate || undefined}
									onChange={(e) =>
										setUmbEndDate(e.target.value)
									}
									className="edit-event-date-input"
								/>
								<button
									type="button"
									onClick={() => {
										try {
											// @ts-ignore
											umbEndRef.current?.showPicker?.();
										} catch {
											umbEndRef.current?.focus();
										}
									}}
									className="edit-event-button"
								>
									Pick
								</button>
								<button
									type="button"
									onClick={() => setUmbEndDate("")}
									className="edit-clear-button"
								>
									Clear
								</button>
							</div>
						</label>
					</>
				)}
			</div>

			{/* Twitch Enabled */}
			<div className="edit-twitch-wrapper">
				<MarketTwitch
					twitchEnabled={twitchEnabled}
					twitchChannel={twitchChannel}
					onTwitchEnabledChange={setTwitchEnabled}
					onTwitchChannelChange={setTwitchChannel}
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

			<div className="edit-questions-list-section">
				<div className="edit-questions-title">Questions</div>
				{children.length === 0 && (
					<div className="edit-no-questions">
						No questions in this umbrella.
					</div>
				)}
				{children.length > 0 && (
					<div className="edit-questions-grid">
						{children.map((c) => (
							<div
								key={c.questionId}
								className="edit-question-item"
							>
								<div>
									<div className="edit-question-info-name">
										{c.displayName}
									</div>
									<div className="edit-question-info-id">
										id: {c.questionId}
									</div>
								</div>
								<button
									type="button"
									onClick={() => {
										setSelectedChild(c);
										loadQuestion(c.questionId);
									}}
									className="edit-load-button"
								>
									Load
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{selectedChild && (
				<div className="edit-editing-section">
					<div className="edit-editing-title">Editing Question</div>
					{loading && (
						<div className="admin-loading-text">Loading…</div>
					)}
					{error && <div className="edit-error-message">{error}</div>}
					{details && (
						<div className="edit-question-details">
							<label className="admin-form-label">
								<span>Question</span>
								<input
									value={details.question || ""}
									readOnly
									className="edit-question-readonly"
									name="questionIdReadonly"
								/>
							</label>
							<label className="admin-form-label">
								<span>Display Name</span>
								<input
									value={details.displayName || ""}
									onChange={(e) =>
										setDetails({
											...details,
											displayName: e.target.value,
										})
									}
									className="edit-form-input"
									name="questionDisplayName"
								/>
							</label>
							<div className="edit-color-grid">
								<label className="admin-form-label">
									<span>Yes Color</span>
									<input
										type="color"
										value={details.yesColor || "#22c55e"}
										onChange={(e) =>
											setDetails({
												...details,
												yesColor: e.target.value,
											})
										}
										className="edit-color-input"
										name="questionYesColor"
									/>
								</label>
								<label className="admin-form-label">
									<span>No Color</span>
									<input
										type="color"
										value={details.noColor || "#ef4444"}
										onChange={(e) =>
											setDetails({
												...details,
												noColor: e.target.value,
											})
										}
										className="edit-color-input"
										name="questionNoColor"
									/>
								</label>
							</div>
							<div className="edit-tags-section">
								<span>Tags</span>
								<div className="edit-tags-container">
									{loadingTags ? (
										<div
											style={{
												fontSize: 12,
												opacity: 0.8,
											}}
										>
											Loading tags...
										</div>
									) : (
										availableTags.map((tag) => {
											const selected =
												Array.isArray(details.tagIds) &&
												details.tagIds.includes(
													tag._id
												);
											return (
												<button
													type="button"
													key={tag._id}
													onClick={() =>
														toggleTag(tag._id)
													}
													className={`edit-tag-button ${
														selected
															? "selected"
															: ""
													}`}
												>
													{tag.label}
												</button>
											);
										})
									)}
								</div>
							</div>

							<SettleMarket
								questionId={
									details.questionId || details._id || ""
								}
							/>
							<div className="edit-save-question-section">
								<button
									type="button"
									onClick={saveQuestion}
									disabled={qSaving}
									className="edit-save-question-button"
								>
									{qSaving ? "Saving..." : "Save Question"}
								</button>
								{qSaveMsg && (
									<span className="edit-success-message">
										{qSaveMsg}
									</span>
								)}
								{qSaveErr && (
									<span className="edit-error-message">
										{qSaveErr}
									</span>
								)}
							</div>
							{/* Seed Market Component */}
							<SeedMarket
								questionId={
									details.questionId || details._id || ""
								}
								questionDisplayName={details.displayName}
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
