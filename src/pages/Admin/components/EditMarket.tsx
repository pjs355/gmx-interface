import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { uploadUmbrellaImage } from "@/services/firebase/firebaseStorage";
import type {
	Umbrella,
	UmbrellaQuestion,
} from "@/services/api/umbrellaDataService";
import { tagService, type Tag } from "@/services/api/tagService";
import SeedMarket from "./SeedMarket";
import MarketImageUpload from "./MarketImageUpload";
import MarketTwitch from "./MarketTwitch";
import SettleMarket from "./SettleMarket";
import "./Markets.scss";

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
	tags?: string[];
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

	// Tags state
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [loadingTags, setLoadingTags] = useState(true);

	const children = useMemo(() => umbrella.children || [], [umbrella]);

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
		setSelectedChild(null);
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
	}, [umbrella._id]);

	async function loadQuestion(qid: string) {
		setLoading(true);
		setError(null);
		setDetails(null);
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
			if (!resp.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setDetails(json.data as QuestionDetails);
		} catch (e: any) {
			setError(e?.message || String(e));
		} finally {
			setLoading(false);
		}
	}

	function toggleTag(tagId: string) {
		if (!details) return;
		const current = Array.isArray(details.tags) ? details.tags : [];
		const exists = current.includes(tagId);
		const next = exists
			? current.filter((t) => t !== tagId)
			: [...current, tagId];
		setDetails({ ...details, tags: next });
	}

	async function saveQuestion() {
		if (!details) return;
		const id = details._id || details.questionId;
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
				tags: Array.isArray(details.tags) ? details.tags : undefined,
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
			if (!resp.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setQSaveMsg("Saved");
		} catch (e: any) {
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
				/>
			</label>
			<label className="edit-form-label">
				<span>Umbrella Rules</span>
				<textarea
					value={umbRule}
					onChange={(e) => setUmbRule(e.target.value)}
					rows={4}
					className="edit-form-textarea"
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
												Array.isArray(details.tags) &&
												details.tags.includes(tag._id);
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
