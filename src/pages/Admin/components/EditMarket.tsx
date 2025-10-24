import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useMemo, useRef, useState } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { uploadUmbrellaImage } from "@/services/firebase/firebaseStorage";
import type {
	Umbrella,
	UmbrellaQuestion,
} from "@/services/api/umbrellaDataService";
import SeedMarket from "./SeedMarket";

const AVAILABLE_TAGS = [
	"APEX LEGENDS",
	"BATTLEFIELD 6",
	"CALL OF DUTY",
	"CS2",
	"DOTA2",
	"FORTNITE",
	"GTA VI",
	"LEAGUE OF LEGENDS",
	"POKEMON",
	"STAR WARS",
	"VALORANT",
	"WOW",
	"ESPORTS",
] as const;

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
	const [settleOutcome, setSettleOutcome] = useState<"yes" | "no" | null>(
		null
	);
	const [settling, setSettling] = useState<boolean>(false);
	const [settleMsg, setSettleMsg] = useState<string | null>(null);
	const [settleErr, setSettleErr] = useState<string | null>(null);
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
	const umbEventRef = useRef<HTMLInputElement | null>(null);
	const [umbSaving, setUmbSaving] = useState<boolean>(false);
	const [umbSaveMsg, setUmbSaveMsg] = useState<string | null>(null);
	const [umbSaveErr, setUmbSaveErr] = useState<string | null>(null);

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

	const children = useMemo(() => umbrella.children || [], [umbrella]);

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
		setSettleOutcome(null);
		setSettling(false);
		setSettleMsg(null);
		setSettleErr(null);

		// Initialize image URLs
		setImage1Url((umbrella as any).image1Url || "");
		setImage2Url((umbrella as any).image2Url || "");
		setImage1Preview((umbrella as any).image1Url || null);
		setImage2Preview((umbrella as any).image2Url || null);
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

	function toggleTag(tag: string) {
		if (!details) return;
		const current = Array.isArray(details.tags) ? details.tags : [];
		const exists = current.includes(tag);
		const next = exists
			? current.filter((t) => t !== tag)
			: [...current, tag];
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
			};

			if (umbIsEvent) {
				body.eventDate = umbEventDate
					? new Date(umbEventDate).toISOString()
					: null;
			} else {
				body.eventDate = null;
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

	async function settleQuestion() {
		if (!details && !selectedChild) return;
		const questionId = (
			details?.questionId ||
			selectedChild?.questionId ||
			""
		).toString();
		if (!questionId) {
			setSettleErr("Missing questionId");
			return;
		}
		if (!settleOutcome) {
			setSettleErr("Select an outcome (Yes/No)");
			return;
		}
		setSettling(true);
		setSettleMsg(null);
		setSettleErr(null);
		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			const base = getPredictionApiBaseUrl();
			const resp = await fetch(
				`${base}/admin/markets/settle/${questionId}`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
					body: JSON.stringify({ outcome: settleOutcome }),
				}
			);
			const json = await resp.json().catch(() => ({} as any));
			if (!resp.ok || !json?.success) {
				throw new Error(json?.error || `HTTP ${resp.status}`);
			}
			setSettleMsg("Settlement submitted");
		} catch (e: any) {
			setSettleErr(e?.message || String(e));
		} finally {
			setSettling(false);
		}
	}

	return (
		<div style={{ color: "white" }}>
			<button
				type="button"
				onClick={onBack}
				style={{
					marginBottom: 12,
					padding: "6px 10px",
					border: "1px solid white",
					borderRadius: 6,
					background: "transparent",
					color: "white",
				}}
			>
				Back
			</button>
			<h2 style={{ marginBottom: 8 }}>Edit Umbrella</h2>
			<div style={{ opacity: 0.9 }}>ID: {umbrella._id}</div>
			<label
				style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 720 }}
			>
				<span>Umbrella Display Name</span>
				<input
					value={umbDisplayName}
					onChange={(e) => setUmbDisplayName(e.target.value)}
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
					}}
				/>
			</label>
			<label
				style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 720 }}
			>
				<span>Umbrella Rules</span>
				<textarea
					value={umbRule}
					onChange={(e) => setUmbRule(e.target.value)}
					rows={4}
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
					}}
				/>
			</label>

			<div
				style={{ display: "grid", gap: 6, marginTop: 8, maxWidth: 720 }}
			>
				<span>Status</span>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						type="button"
						onClick={() => setUmbActive(true)}
						style={{
							padding: "6px 10px",
							border: "1px solid white",
							borderRadius: 6,
							background: umbActive
								? "rgba(255,255,255,0.2)"
								: "transparent",
							color: "white",
							cursor: "pointer",
						}}
					>
						Active
					</button>
					<button
						type="button"
						onClick={() => setUmbActive(false)}
						style={{
							padding: "6px 10px",
							border: "1px solid white",
							borderRadius: 6,
							background: !umbActive
								? "rgba(255,255,255,0.2)"
								: "transparent",
							color: "white",
							cursor: "pointer",
						}}
					>
						Inactive
					</button>
				</div>

				<span>Is this part of an event?</span>
				<div style={{ display: "flex", gap: 8 }}>
					<button
						type="button"
						onClick={() => setUmbIsEvent(false)}
						style={{
							padding: "6px 10px",
							border: "1px solid white",
							borderRadius: 6,
							background: umbIsEvent
								? "transparent"
								: "rgba(255,255,255,0.2)",
							color: "white",
							cursor: "pointer",
						}}
					>
						No
					</button>
					<button
						type="button"
						onClick={() => setUmbIsEvent(true)}
						style={{
							padding: "6px 10px",
							border: "1px solid white",
							borderRadius: 6,
							background: umbIsEvent
								? "rgba(255,255,255,0.2)"
								: "transparent",
							color: "white",
							cursor: "pointer",
						}}
					>
						Yes
					</button>
				</div>
				{umbIsEvent && (
					<label style={{ display: "grid", gap: 6 }}>
						<span>Event Date & Time</span>
						<div
							style={{
								display: "flex",
								gap: 8,
								alignItems: "center",
							}}
						>
							<input
								ref={umbEventRef}
								type="datetime-local"
								value={umbEventDate}
								onChange={(e) =>
									setUmbEventDate(e.target.value)
								}
								style={{
									padding: 8,
									color: "cyan",
									border: "1px solid white",
									borderRadius: 6,
									background: "transparent",
								}}
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
								style={{
									padding: "6px 10px",
									border: "1px solid white",
									borderRadius: 6,
									background: "rgba(255,255,255,0.2)",
									color: "white",
									cursor: "pointer",
									whiteSpace: "nowrap",
								}}
							>
								Pick
							</button>
							<button
								type="button"
								onClick={() => setUmbEventDate("")}
								style={{
									padding: "6px 10px",
									border: "1px solid white",
									borderRadius: 6,
									background: "transparent",
									color: "white",
								}}
							>
								Clear
							</button>
						</div>
					</label>
				)}
			</div>

			{/* Image Upload Section */}
			<div
				style={{
					marginTop: 16,
					borderTop: "1px solid rgba(255,255,255,0.2)",
					paddingTop: 12,
				}}
			>
				<div style={{ marginBottom: 12, fontWeight: 600 }}>Images</div>

				<div
					style={{
						display: "grid",
						gridTemplateColumns: "1fr 1fr",
						gap: 16,
						maxWidth: 720,
					}}
				>
					{/* Image 1 */}
					<div style={{ display: "grid", gap: 8 }}>
						<label style={{ fontSize: 14, fontWeight: 500 }}>
							Banner Image
						</label>
						<div style={{ display: "grid", gap: 8 }}>
							{image1Preview && (
								<div
									style={{
										position: "relative",
										display: "inline-block",
									}}
								>
									<img
										src={image1Preview}
										alt="Preview"
										style={{
											width: "100%",
											height: 120,
											objectFit: "cover",
											borderRadius: 8,
											border: "1px solid rgba(255,255,255,0.2)",
										}}
									/>
									<button
										type="button"
										onClick={() => {
											setImage1(null);
											setImage1Preview(image1Url || null);
										}}
										style={{
											position: "absolute",
											top: 4,
											right: 4,
											padding: "4px 8px",
											border: "1px solid #ef4444",
											borderRadius: 4,
											background:
												"rgba(239, 68, 68, 0.9)",
											color: "white",
											fontSize: 12,
											cursor: "pointer",
										}}
									>
										Remove
									</button>
								</div>
							)}
							<input
								type="file"
								accept="image/*"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) handleImageSelect(file, "image1");
								}}
								style={{
									padding: 8,
									color: "white",
									border: "1px solid white",
									borderRadius: 6,
									background: "transparent",
								}}
							/>
							{uploadingImage === "image1" && (
								<div
									style={{
										fontSize: 12,
										opacity: 0.8,
										color: "#8b5cf6",
									}}
								>
									Uploading...
								</div>
							)}
						</div>
					</div>

					{/* Image 2 */}
					<div style={{ display: "grid", gap: 8 }}>
						<label style={{ fontSize: 14, fontWeight: 500 }}>
							Square Image
						</label>
						<div style={{ display: "grid", gap: 8 }}>
							{image2Preview && (
								<div
									style={{
										position: "relative",
										display: "inline-block",
									}}
								>
									<img
										src={image2Preview}
										alt="Preview"
										style={{
											width: 100,
											height: 100,
											objectFit: "cover",
											borderRadius: 8,
											border: "1px solid rgba(255,255,255,0.2)",
										}}
									/>
									<button
										type="button"
										onClick={() => {
											setImage2(null);
											setImage2Preview(image2Url || null);
										}}
										style={{
											position: "absolute",
											top: 4,
											right: 4,
											padding: "4px 8px",
											border: "1px solid #ef4444",
											borderRadius: 4,
											background:
												"rgba(239, 68, 68, 0.9)",
											color: "white",
											fontSize: 12,
											cursor: "pointer",
										}}
									>
										Remove
									</button>
								</div>
							)}
							<input
								type="file"
								accept="image/*"
								onChange={(e) => {
									const file = e.target.files?.[0];
									if (file) handleImageSelect(file, "image2");
								}}
								style={{
									padding: 8,
									color: "white",
									border: "1px solid white",
									borderRadius: 6,
									background: "transparent",
								}}
							/>
							{uploadingImage === "image2" && (
								<div
									style={{
										fontSize: 12,
										opacity: 0.8,
										color: "#8b5cf6",
									}}
								>
									Uploading...
								</div>
							)}
						</div>
					</div>
				</div>

				<div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
					Supported formats: JPG, PNG, GIF. Max size: 5MB per image.
				</div>
			</div>

			<div style={{ display: "flex", gap: 8, marginTop: 12 }}>
				<button
					type="button"
					onClick={saveUmbrella}
					disabled={umbSaving}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						color: "white",
					}}
				>
					{umbSaving ? "Saving..." : "Save Umbrella"}
				</button>
				{umbSaveMsg && (
					<span style={{ color: "#22c55e" }}>{umbSaveMsg}</span>
				)}
				{umbSaveErr && (
					<span style={{ color: "#ff6b6b" }}>{umbSaveErr}</span>
				)}
			</div>

			<div
				style={{
					marginTop: 16,
					borderTop: "1px solid rgba(255,255,255,0.2)",
					paddingTop: 12,
				}}
			>
				<div style={{ marginBottom: 8, fontWeight: 600 }}>
					Questions
				</div>
				{children.length === 0 && (
					<div style={{ opacity: 0.8 }}>
						No questions in this umbrella.
					</div>
				)}
				{children.length > 0 && (
					<div style={{ display: "grid", gap: 8 }}>
						{children.map((c) => (
							<div
								key={c.questionId}
								style={{
									display: "flex",
									justifyContent: "space-between",
									alignItems: "center",
									border: "1px solid rgba(255,255,255,0.2)",
									borderRadius: 8,
									padding: 10,
									background: "rgba(255,255,255,0.03)",
								}}
							>
								<div>
									<div style={{ fontWeight: 600 }}>
										{c.displayName}
									</div>
									<div style={{ fontSize: 12, opacity: 0.8 }}>
										id: {c.questionId}
									</div>
								</div>
								<button
									type="button"
									onClick={() => {
										setSelectedChild(c);
										loadQuestion(c.questionId);
									}}
									style={{
										padding: "6px 10px",
										border: "1px solid white",
										borderRadius: 6,
										background: "rgba(255,255,255,0.2)",
										color: "white",
										cursor: "pointer",
									}}
								>
									Load
								</button>
							</div>
						))}
					</div>
				)}
			</div>

			{selectedChild && (
				<div
					style={{
						marginTop: 16,
						borderTop: "1px solid rgba(255,255,255,0.2)",
						paddingTop: 12,
					}}
				>
					<div style={{ marginBottom: 8, fontWeight: 600 }}>
						Editing Question
					</div>
					{loading && <div style={{ opacity: 0.8 }}>Loading…</div>}
					{error && <div style={{ color: "#ff6b6b" }}>{error}</div>}
					{details && (
						<div
							style={{ display: "grid", gap: 12, maxWidth: 720 }}
						>
							<label style={{ display: "grid", gap: 6 }}>
								<span>Question</span>
								<input
									value={details.question || ""}
									readOnly
									style={{
										padding: 8,
										color: "cyan",
										border: "1px solid white",
										borderRadius: 6,
										background: "transparent",
									}}
								/>
							</label>
							<label style={{ display: "grid", gap: 6 }}>
								<span>Display Name</span>
								<input
									value={details.displayName || ""}
									onChange={(e) =>
										setDetails({
											...details,
											displayName: e.target.value,
										})
									}
									style={{
										padding: 8,
										color: "cyan",
										border: "1px solid white",
										borderRadius: 6,
										background: "transparent",
									}}
								/>
							</label>
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1fr 1fr",
									gap: 12,
								}}
							>
								<label style={{ display: "grid", gap: 6 }}>
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
										style={{
											height: 40,
											padding: 0,
											background: "transparent",
											border: "1px solid white",
											borderRadius: 6,
										}}
									/>
								</label>
								<label style={{ display: "grid", gap: 6 }}>
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
										style={{
											height: 40,
											padding: 0,
											background: "transparent",
											border: "1px solid white",
											borderRadius: 6,
										}}
									/>
								</label>
							</div>
							<div style={{ display: "grid", gap: 6 }}>
								<span>Tags</span>
								<div
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: 8,
									}}
								>
									{AVAILABLE_TAGS.map((tag) => {
										const selected =
											Array.isArray(details.tags) &&
											details.tags.includes(tag);
										return (
											<button
												type="button"
												key={tag}
												onClick={() => toggleTag(tag)}
												style={{
													padding: "6px 10px",
													border: "1px solid white",
													borderRadius: 999,
													background: selected
														? "rgba(255,255,255,0.2)"
														: "transparent",
													color: "white",
													cursor: "pointer",
												}}
											>
												{tag}
											</button>
										);
									})}
								</div>
							</div>

							<div
								style={{
									display: "grid",
									gap: 6,
									marginTop: 8,
									borderTop:
										"1px solid rgba(255,255,255,0.2)",
									paddingTop: 12,
									order: 2,
								}}
							>
								<span>Settle Market</span>
								<div style={{ display: "flex", gap: 8 }}>
									<button
										type="button"
										onClick={() => setSettleOutcome("yes")}
										style={{
											padding: "6px 10px",
											border: "1px solid white",
											borderRadius: 6,
											background:
												settleOutcome === "yes"
													? "rgba(255,255,255,0.2)"
													: "transparent",
											color: "white",
											cursor: "pointer",
										}}
									>
										Yes
									</button>
									<button
										type="button"
										onClick={() => setSettleOutcome("no")}
										style={{
											padding: "6px 10px",
											border: "1px solid white",
											borderRadius: 6,
											background:
												settleOutcome === "no"
													? "rgba(255,255,255,0.2)"
													: "transparent",
											color: "white",
											cursor: "pointer",
										}}
									>
										No
									</button>
								</div>
								<div style={{ display: "flex", gap: 8 }}>
									<button
										type="button"
										onClick={settleQuestion}
										disabled={settling || !settleOutcome}
										style={{
											padding: "6px 10px",
											border: "1px solid white",
											borderRadius: 6,
											background: "transparent",
											color: "white",
										}}
									>
										{settling ? "Settling..." : "Settle"}
									</button>
									{settleMsg && (
										<span style={{ color: "#22c55e" }}>
											{settleMsg}
										</span>
									)}
									{settleErr && (
										<span style={{ color: "#ff6b6b" }}>
											{settleErr}
										</span>
									)}
								</div>
							</div>
							<div
								style={{
									display: "flex",
									gap: 8,
									marginTop: 8,
									order: 1,
								}}
							>
								<button
									type="button"
									onClick={saveQuestion}
									disabled={qSaving}
									style={{
										padding: "6px 10px",
										border: "1px solid white",
										borderRadius: 6,
										background: "transparent",
										color: "white",
									}}
								>
									{qSaving ? "Saving..." : "Save Question"}
								</button>
								{qSaveMsg && (
									<span style={{ color: "#22c55e" }}>
										{qSaveMsg}
									</span>
								)}
								{qSaveErr && (
									<span style={{ color: "#ff6b6b" }}>
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
