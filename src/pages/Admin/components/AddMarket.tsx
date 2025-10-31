import { useEffect, useRef, useState } from "react";
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
import "./Markets.scss";

type AddMarketForm = {
	oracle: string;
	seedAmount: string;
	selectedUmbrellaId?: string;
	umbrellaDisplayName: string;
	umbrellaRule: string;
	isEvent: boolean;
	eventDate?: string; // ISO date (yyyy-mm-dd) or datetime-local
	endDate?: string; // ISO date (yyyy-mm-dd) or datetime-local
	image1Url?: string;
	image2Url?: string;
	status: boolean; // true = Active, false = Inactive
	twitchEnabled: boolean;
	twitchChannel: string;
};

export default function AddMarket() {
	const { getAccessToken } = usePrivy();
	const [form, setForm] = useState<AddMarketForm>({
		oracle: "",
		seedAmount: "50",
		selectedUmbrellaId: "",
		umbrellaDisplayName: "",
		umbrellaRule: "",
		isEvent: false,
		eventDate: "",
		endDate: "",
		status: true, // Default to Active
		twitchEnabled: false,
		twitchChannel: "",
	});
	const [submitting, setSubmitting] = useState(false);
	const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
	const [loadingUmbrellas, setLoadingUmbrellas] = useState<boolean>(false);
	const eventDateRef = useRef<HTMLInputElement | null>(null);
	const endDateRef = useRef<HTMLInputElement | null>(null);
	const [questions, setQuestions] = useState<QuestionEntry[]>([
		{
			displayName: "",
			tags: [],
			yesColor: "#22c55e",
			noColor: "#ef4444",
		},
	]);

	// Image upload states
	const [image1, setImage1] = useState<File | null>(null);
	const [image2, setImage2] = useState<File | null>(null);
	const [image1Preview, setImage1Preview] = useState<string | null>(null);
	const [image2Preview, setImage2Preview] = useState<string | null>(null);
	const [uploadingImage, setUploadingImage] = useState<
		"image1" | "image2" | null
	>(null);

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
			const payload: any = {
				oracle: form.oracle,
				seedAmount: form.seedAmount || "0",
				umbrellaId: form.selectedUmbrellaId || undefined,
				umbrellaDisplayName: !form.selectedUmbrellaId
					? form.umbrellaDisplayName || undefined
					: undefined,
				umbrellaRule: !form.selectedUmbrellaId
					? form.umbrellaRule || undefined
					: undefined,
				rule: !form.selectedUmbrellaId
					? form.umbrellaRule || undefined
					: undefined,
				isEvent: !!form.isEvent,
				eventDate:
					form.isEvent && form.eventDate
						? new Date(form.eventDate).toISOString()
						: undefined,
				endDate:
					form.isEvent && form.endDate
						? new Date(form.endDate).toISOString()
						: undefined,
				status: form.status, // Include status in payload
				twitchEnabled: form.twitchEnabled,
				twitchChannel: form.twitchChannel || undefined,
			};

			// Upload images if selected
			if (image1) {
				payload.image1Url = await uploadImageToFirebase(
					image1,
					"image1"
				);
			}

			if (image2) {
				payload.image2Url = await uploadImageToFirebase(
					image2,
					"image2"
				);
			}

			const accessToken =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			// Include per-question entries if provided
			if (Array.isArray(questions) && questions.length > 0) {
				payload.questions = questions.map((q) => ({
					displayName: q.displayName,
					tags: q.tags,
					yesColor: q.yesColor,
					noColor: q.noColor,
				}));
			}

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

				{/* Removed top-level tags; tags are configured per-question below */}

				<div style={{ display: "grid", gap: 6 }}>
					<span>Is this part of an event?</span>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							type="button"
							onClick={() => update("isEvent", false)}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: form.isEvent
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
							onClick={() => update("isEvent", true)}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: form.isEvent
									? "rgba(255,255,255,0.2)"
									: "transparent",
								color: "white",
								cursor: "pointer",
							}}
						>
							Yes
						</button>
					</div>
					{form.isEvent && (
						<>
							<label style={{ display: "grid", gap: 6 }}>
								<span>Event Start Date & Time</span>
								<div
									style={{
										display: "flex",
										gap: 8,
										alignItems: "center",
									}}
								>
									<input
										ref={eventDateRef}
										type="datetime-local"
										value={form.eventDate || ""}
										onChange={(e) =>
											update("eventDate", e.target.value)
										}
										style={{
											padding: 8,
											color: "cyan",
											border: "1px solid white",
											borderRadius: "4px",
											background: "transparent",
										}}
									/>
									<button
										type="button"
										onClick={() => {
											try {
												// @ts-ignore showPicker is supported in modern Chrome
												eventDateRef.current?.showPicker?.();
											} catch {
												eventDateRef.current?.focus();
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
								</div>
							</label>
							<label style={{ display: "grid", gap: 6 }}>
								<span>Event End Date & Time</span>
								<div
									style={{
										display: "flex",
										gap: 8,
										alignItems: "center",
									}}
								>
									<input
										ref={endDateRef}
										type="datetime-local"
										value={form.endDate || ""}
										onChange={(e) =>
											update("endDate", e.target.value)
										}
										style={{
											padding: 8,
											color: "cyan",
											border: "1px solid white",
											borderRadius: "4px",
											background: "transparent",
										}}
									/>
									<button
										type="button"
										onClick={() => {
											try {
												// @ts-ignore showPicker is supported in modern Chrome
												endDateRef.current?.showPicker?.();
											} catch {
												endDateRef.current?.focus();
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
								</div>
							</label>
						</>
					)}
				</div>

				{/* Status Selection */}
				<div style={{ display: "grid", gap: 6 }}>
					<span>Status</span>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							type="button"
							onClick={() => update("status", true)}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: form.status
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
							onClick={() => update("status", false)}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: !form.status
									? "rgba(255,255,255,0.2)"
									: "transparent",
								color: "white",
								cursor: "pointer",
							}}
						>
							Inactive
						</button>
					</div>
				</div>

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

				{/* Multiple Questions Section */}
				<MarketQuestions
					questions={questions}
					submitting={submitting}
					onQuestionsChange={setQuestions}
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
