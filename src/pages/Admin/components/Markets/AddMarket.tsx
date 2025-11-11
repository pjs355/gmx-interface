import { useCallback, useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
	umbrellaDataService,
	type Umbrella,
} from "@/services/api/umbrellaDataService";
import { uploadUmbrellaImage } from "@/services/firebase/firebaseStorage";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import MarketImageUpload from "./MarketImageUpload";
import MarketTwitch from "./MarketTwitch";
import MarketQuestions, { type QuestionEntry } from "./MarketQuestions";
import UmbrellaFormFields from "./UmbrellaFormFields";
import TeamLinker from "../Teams/TeamLinker";
import type { TeamRecord } from "@/services/api/teamService";
import EventScheduleSection from "./components/EventScheduleSection";
import StatusToggle from "./components/StatusToggle";
import PandascoreFields from "./components/PandascoreFields";
import { buildCreateMarketPayload } from "./helpers/market-helpers";
import {
	TeamColors,
	AddMarketForm,
	AddMarketProps,
	TeamCandidate,
} from "@/types/market-types";
import {
	slugify,
	formatDateTimeLocal,
	cleanTeamName,
	extractTeamKey,
	normalizeTeamKey,
	buildLongMatchDisplayName,
	buildShortMatchDisplayName,
} from "./helpers/market-helpers";
import "./Markets.scss";

export default function AddMarket({
	series,
	match,
	onCreated,
}: AddMarketProps = {}) {
	const { getAccessToken } = usePrivy();

	// Track if component was used with props (for disabling certain fields)
	const isPrefilled = !!(series && match);

	// Prefill umbrella display name if series/match provided
	const initialUmbrellaDisplayName =
		series && match
			? `${buildLongMatchDisplayName(match)} - ${series.name}`
			: "";

	// Prefill event date if match provided
	const initialEventDate = match?.scheduledAt
		? formatDateTimeLocal(match.scheduledAt)
		: "";

	const [form, setForm] = useState<AddMarketForm>({
		oracle: "",
		seedAmount: "50",
		selectedUmbrellaId: "",
		umbrellaDisplayName: initialUmbrellaDisplayName,
		umbrellaRule: "",
		isEvent: !!match, // Set to true if match provided
		eventDate: initialEventDate,
		endDate: "",
		status: false, // Inactive for series matches
		twitchEnabled: false,
		twitchChannel: "",
		game: series?.game || "",
		pandascore_matchId: match?.id ? String(match.id) : "",
	});
	const [submitting, setSubmitting] = useState(false);
	const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
	const [loadingUmbrellas, setLoadingUmbrellas] = useState<boolean>(false);

	// Prefill question display name if match provided
	const initialQuestionDisplayName = match
		? buildShortMatchDisplayName(match)
		: "";

	const [questions, setQuestions] = useState<QuestionEntry[]>([
		{
			displayName: initialQuestionDisplayName,
			tagIds: [],
			yesColor: "#22c55e",
			noColor: "#ef4444",
		},
	]);

	useEffect(() => {
		console.log("AddMarket questions state:", questions);
	}, [questions]);

	// Image upload states
	const [image1, setImage1] = useState<File | null>(null);
	const [image2, setImage2] = useState<File | null>(null);
	const [image1Preview, setImage1Preview] = useState<string | null>(null);
	const [image2Preview, setImage2Preview] = useState<string | null>(null);
	const [uploadingImage, setUploadingImage] = useState<
		"image1" | "image2" | null
	>(null);
	const [linkedTeams, setLinkedTeams] = useState<Record<string, TeamRecord>>(
		{}
	);
	const teamCandidates = useMemo<TeamCandidate[]>(() => {
		if (!match) {
			return [];
		}
		const displayName1 = cleanTeamName(match.team1.name);
		const displayName2 = cleanTeamName(match.team2.name);
		const team1Short = extractTeamKey(
			match.team1.name,
			match.team1.acronym
		);
		const team2Short = extractTeamKey(
			match.team2.name,
			match.team2.acronym
		);
		return [
			{
				displayName: displayName1,
				slug: slugify(displayName1),
				shortCode: team1Short,
				pandaId: match.team1.id ?? null,
				logoUrl: null,
			},
			{
				displayName: displayName2,
				slug: slugify(displayName2),
				shortCode: team2Short,
				pandaId: match.team2.id ?? null,
				logoUrl: null,
			},
		];
	}, [match]);
	const teamColors = useMemo<TeamColors>(() => {
		if (teamCandidates.length === 0) {
			return {};
		}
		const yesCandidate = teamCandidates[0];
		const noCandidate = teamCandidates[1];
		const yesKey = normalizeTeamKey(yesCandidate?.shortCode);
		const noKey = normalizeTeamKey(noCandidate?.shortCode);
		const yesRecord = yesKey ? linkedTeams[yesKey] : undefined;
		const noRecord = noKey ? linkedTeams[noKey] : undefined;
		return {
			yesColor: yesRecord?.primaryColor ?? undefined,
			noColor: noRecord?.primaryColor ?? undefined,
		};
	}, [linkedTeams, teamCandidates]);

	const handleTeamLinked = useCallback(
		(shortCode: string, team: TeamRecord) => {
			setLinkedTeams((prev) => {
				const clone = { ...prev };
				const normalizedKey =
					normalizeTeamKey(shortCode) ??
					normalizeTeamKey(team.shortCode);
				if (!normalizedKey) {
					return prev;
				}
				clone[normalizedKey] = team;
				return clone;
			});
		},
		[]
	);

	useEffect(() => {
		let mounted = true;
		setLoadingUmbrellas(true);
		umbrellaDataService
			.fetchAllUmbrellas()
			.then((list) => {
				if (mounted) setUmbrellas(list || []);
			})
			.catch((err) => {
				console.error("error", err);
			})
			.finally(() => {
				if (mounted) setLoadingUmbrellas(false);
			});
		return () => {
			mounted = false;
		};
	}, []);

	function update<K extends keyof AddMarketForm>(
		key: K,
		value: AddMarketForm[K]
	) {
		setForm((prev) => ({ ...prev, [key]: value }));
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

			// For new umbrellas, we'll use a temporary ID
			const tempUmbrellaId = `new-${Date.now()}`;

			// Upload to Firebase Storage
			const result = await uploadUmbrellaImage(
				file,
				tempUmbrellaId,
				firebaseImageType
			);

			setUploadingImage(null);
			return result.url;
		} catch (error) {
			setUploadingImage(null);
			throw new Error(`Failed to upload ${imageType}: ${error}`);
		}
	};

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		// Implementation will be wired to on-chain + API later
		try {
			const payload = await buildCreateMarketPayload({
				form,
				questions,
				linkedTeams,
					image1,
					image2,
				uploadImage: uploadImageToFirebase,
			});

			const accessToken =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;

			const resp = await fetch(
				`${getPredictionApiBaseUrl()}/admin/markets`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(accessToken
							? { Authorization: `Bearer ${accessToken}` }
							: {}),
					},
					body: JSON.stringify(payload),
				}
			);
			const data = await resp.json().catch(() => ({} as any));
			if (!resp.ok || !data?.success) {
				throw new Error(
					data?.error || `Request failed: ${resp.status}`
				);
			}
			console.log("✅ Market created:", data?.data);

			if (typeof onCreated === "function") {
				await Promise.resolve(onCreated(data?.data));
			} else {
				umbrellaDataService.invalidateCache();
				setLoadingUmbrellas(true);
				try {
					const refreshedUmbrellas =
						await umbrellaDataService.fetchAllUmbrellas();
					setUmbrellas(
						Array.isArray(refreshedUmbrellas)
							? refreshedUmbrellas
							: []
					);
				} catch (refreshListError) {
					console.error("error", refreshListError);
				} finally {
					setLoadingUmbrellas(false);
				}
			}
		} catch (error) {
			console.error("error", error);
			alert((error as any)?.message || "Failed to create market(s)");
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="admin-market-container">
			<h2 className="admin-market-title">Add Market</h2>
			<form onSubmit={handleSubmit} className="admin-market-form">
				<label className="admin-form-label">
					<span>Umbrella (optional)</span>
					<select
						value={form.selectedUmbrellaId}
						onChange={(e) =>
							update("selectedUmbrellaId", e.target.value)
						}
						className="admin-form-select"
					>
						<option value="">Create new umbrella (default)</option>
						{umbrellas.map((u) => (
							<option key={u._id} value={u._id}>
								{u.displayName}
							</option>
						))}
					</select>
					{loadingUmbrellas && (
						<span className="admin-hint-text">
							Loading umbrellas...
						</span>
					)}
				</label>

				<UmbrellaFormFields
					selectedUmbrellaId={form.selectedUmbrellaId}
					umbrellas={umbrellas}
					umbrellaDisplayName={form.umbrellaDisplayName}
					umbrellaRule={form.umbrellaRule}
					onDisplayNameChange={(value) =>
						update("umbrellaDisplayName", value)
					}
					onRuleChange={(value) => update("umbrellaRule", value)}
				/>

				{/* Removed top-level Question and Display Name fields (server auto-generates question; per-entry displayName below) */}
				{/* Removed top-level color pickers; per-question colors are configured below */}
				<label style={{ display: "grid", gap: 6 }}>
					<span>Seed Amount (USDC)</span>
					<input
						value={form.seedAmount}
						onChange={(e) => update("seedAmount", e.target.value)}
						placeholder="50"
						style={{
							padding: 8,
							color: "cyan",
							border: "1px solid white",
							borderRadius: "4px",
							background: "transparent",
						}}
					/>
				</label>

				{form.pandascore_matchId &&
					form.pandascore_matchId.length > 0 && (
						<PandascoreFields
							game={form.game}
							matchId={form.pandascore_matchId}
							onGameChange={(value) => update("game", value)}
							onMatchIdChange={(value) =>
								update("pandascore_matchId", value)
							}
						disabled={isPrefilled}
					/>
					)}

				{/* Removed top-level tags; tags are configured per-question below */}

				<EventScheduleSection
					isEvent={form.isEvent}
					onToggle={(value) => update("isEvent", value)}
					eventDate={form.eventDate || ""}
					endDate={form.endDate || ""}
					onEventDateChange={(value) => update("eventDate", value)}
					onEndDateChange={(value) => update("endDate", value)}
				/>

				<StatusToggle
					value={form.status}
					onChange={(value) => update("status", value)}
				/>

				{/* Twitch Enabled */}
				<MarketTwitch
					twitchEnabled={form.twitchEnabled}
					twitchChannel={form.twitchChannel}
					onTwitchEnabledChange={(enabled) =>
						update("twitchEnabled", enabled)
					}
					onTwitchChannelChange={(channel) =>
						update("twitchChannel", channel)
					}
				/>

				{/* Image Upload Section */}
				<MarketImageUpload
					image1={image1}
					image2={image2}
					image1Preview={image1Preview}
					image2Preview={image2Preview}
					uploadingImage={uploadingImage}
					onImage1Select={(file) => handleImageSelect(file, "image1")}
					onImage2Select={(file) => handleImageSelect(file, "image2")}
					onImage1Remove={() => {
						setImage1(null);
						setImage1Preview(null);
					}}
					onImage2Remove={() => {
						setImage2(null);
						setImage2Preview(null);
					}}
				/>

				{teamCandidates.length > 0 && (
					<TeamLinker
						candidates={teamCandidates}
						onTeamLinked={handleTeamLinked}
					/>
				)}

				{/* Multiple Questions Section */}
				<MarketQuestions
					questions={questions}
					submitting={submitting}
					onQuestionsChange={setQuestions}
					gameName={series?.game}
					autoMatchTags={isPrefilled}
					defaultColors={teamColors}
					preferredTagLabels={isPrefilled ? ["ESPORTS"] : undefined}
				/>

				<div style={{ display: "flex", gap: 12, marginTop: 12 }}>
					<button
						type="submit"
						disabled={submitting}
						style={{ padding: "8px 16px" }}
					>
						{submitting ? "Creating..." : "Create Market"}
					</button>
				</div>
			</form>
		</div>
	);
}
