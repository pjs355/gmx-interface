import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
	umbrellaDataService,
	type Umbrella,
} from "../../../../lib/umbrellaDataService";
import { uploadUmbrellaImage } from "../../../../lib/firebaseStorage";
import { getPredictionApiBaseUrl } from "../../../../lib/predictionApiBase";

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

type AddMarketForm = {
	oracle: string;
	seedAmount: string;
	selectedUmbrellaId?: string;
	umbrellaDisplayName: string;
	umbrellaRule: string;
	isEvent: boolean;
	eventDate?: string; // ISO date (yyyy-mm-dd) or datetime-local
	image1Url?: string;
	image2Url?: string;
};

type QuestionEntry = {
	displayName: string;
	tags: string[];
	yesColor: string;
	noColor: string;
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
	});
	const [submitting, setSubmitting] = useState(false);
	const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
	const [loadingUmbrellas, setLoadingUmbrellas] = useState<boolean>(false);
	const eventDateRef = useRef<HTMLInputElement | null>(null);
	const [questions, setQuestions] = useState<QuestionEntry[]>([
		{
			displayName: "",
			tags: ["POKEMON"],
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

	// Removed top-level tags; tags are configured per-question below

	function updateQuestion<K extends keyof QuestionEntry>(
		index: number,
		key: K,
		value: QuestionEntry[K]
	) {
		setQuestions((prev) =>
			prev.map((q, i) => (i === index ? { ...q, [key]: value } : q))
		);
	}

	function toggleTagForQuestion(index: number, tag: string) {
		setQuestions((prev) =>
			prev.map((q, i) => {
				if (i !== index) return q;
				const has = q.tags.includes(tag);
				return {
					...q,
					tags: has
						? q.tags.filter((t) => t !== tag)
						: [...q.tags, tag],
				};
			})
		);
	}

	function addQuestionEntry() {
		setQuestions((prev) => [
			...prev,
			{
				displayName: "",
				tags: ["POKEMON"],
				yesColor: "#22c55e",
				noColor: "#ef4444",
			},
		]);
	}

	function removeQuestionEntry(index: number) {
		setQuestions((prev) => prev.filter((_, i) => i !== index));
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
		<div style={{ padding: 24, color: "white" }}>
			<h2 style={{ marginBottom: 16 }}>Add Market</h2>
			<form
				onSubmit={handleSubmit}
				style={{ display: "grid", gap: 12, maxWidth: 720 }}
			>
				<label style={{ display: "grid", gap: 6 }}>
					<span>Umbrella (optional)</span>
					<select
						value={form.selectedUmbrellaId}
						onChange={(e) =>
							update("selectedUmbrellaId", e.target.value)
						}
						style={{
							padding: 8,
							color: "cyan",
							border: "1px solid white",
							borderRadius: "4px",
							background: "transparent",
						}}
					>
						<option value="" style={{ color: "black" }}>
							Create new umbrella (default)
						</option>
						{umbrellas.map((u) => (
							<option
								key={u._id}
								value={u._id}
								style={{ color: "black" }}
							>
								{u.displayName}
							</option>
						))}
					</select>
					{loadingUmbrellas && (
						<span style={{ fontSize: 12, opacity: 0.8 }}>
							Loading umbrellas...
						</span>
					)}
				</label>

				{!form.selectedUmbrellaId && (
					<label style={{ display: "grid", gap: 6 }}>
						<span>Umbrella Display Name</span>
						<input
							value={form.umbrellaDisplayName}
							onChange={(e) =>
								update("umbrellaDisplayName", e.target.value)
							}
							placeholder="If empty, defaults to Question text"
							style={{
								padding: 8,
								color: "cyan",
								border: "1px solid white",
								borderRadius: "4px",
								background: "transparent",
							}}
						/>
					</label>
				)}

				{!form.selectedUmbrellaId && (
					<label style={{ display: "grid", gap: 6 }}>
						<span>Umbrella Rules (optional)</span>
						<textarea
							value={form.umbrellaRule}
							onChange={(e) =>
								update("umbrellaRule", e.target.value)
							}
							placeholder="Add any adjudication/rules text for this umbrella"
							rows={4}
							style={{
								padding: 8,
								color: "cyan",
								border: "1px solid white",
								borderRadius: "4px",
								background: "transparent",
							}}
						/>
					</label>
				)}

				{form.selectedUmbrellaId &&
					(() => {
						const selected = umbrellas.find(
							(u) => u._id === form.selectedUmbrellaId
						);
						if (!selected) return null;
						const children = Array.isArray(selected.children)
							? selected.children
							: [];
						return (
							<div
								style={{
									border: "1px solid rgba(255,255,255,0.2)",
									borderRadius: 8,
									padding: 12,
									background: "rgba(255,255,255,0.03)",
								}}
							>
								<div
									style={{ marginBottom: 8, fontWeight: 600 }}
								>
									Existing questions in "
									{selected.displayName}" ({children.length})
								</div>
								{children.length === 0 && (
									<div style={{ opacity: 0.8 }}>
										No questions found under this umbrella.
									</div>
								)}
								{children.length > 0 && (
									<ul
										style={{
											listStyle: "disc",
											paddingLeft: 20,
											margin: 0,
											color: "white",
										}}
									>
										{children.map((c) => (
											<li
												key={c.questionId}
												style={{ marginBottom: 6 }}
											>
												<span
													style={{ color: "white" }}
												>
													{c.displayName}
												</span>
												<span
													style={{ color: "#9ca3af" }}
												>
													{" — "}
												</span>
												<span
													style={{
														color: "#9ca3af",
														fontSize: 12,
													}}
												>
													id: {c.questionId}
												</span>
											</li>
										))}
									</ul>
								)}
							</div>
						);
					})()}

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
							<span style={{ fontSize: 12, opacity: 0.8 }}>
								Stored as local time; we can convert to UTC ISO
								on submit if preferred.
							</span>
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
					<div style={{ marginBottom: 12, fontWeight: 600 }}>
						Images (Optional)
					</div>

					<div
						style={{
							display: "grid",
							gridTemplateColumns: "1fr 1fr",
							gap: 16,
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
												setImage1Preview(null);
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
										if (file)
											handleImageSelect(file, "image1");
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
												setImage2Preview(null);
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
										if (file)
											handleImageSelect(file, "image2");
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
						Supported formats: JPG, PNG, GIF. Max size: 5MB per
						image.
					</div>
				</div>

				{/* Multiple Questions Section */}
				<div
					style={{
						marginTop: 16,
						borderTop: "1px solid rgba(255,255,255,0.2)",
						paddingTop: 12,
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							marginBottom: 8,
						}}
					>
						<div style={{ fontWeight: 600 }}>
							Questions (add one or more entries)
						</div>
						<button
							type="button"
							onClick={addQuestionEntry}
							disabled={submitting}
							style={{ padding: "6px 10px" }}
						>
							+ Add Question
						</button>
					</div>
					<div style={{ display: "grid", gap: 12 }}>
						{questions.map((q, idx) => (
							<div
								key={idx}
								style={{
									border: "1px solid rgba(255,255,255,0.2)",
									borderRadius: 8,
									padding: 12,
									background: "rgba(255,255,255,0.03)",
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										alignItems: "center",
										marginBottom: 8,
									}}
								>
									<div style={{ fontWeight: 600 }}>
										Question #{idx + 1}
									</div>
									<button
										type="button"
										onClick={() => removeQuestionEntry(idx)}
										style={{ padding: "4px 8px" }}
									>
										Remove
									</button>
								</div>
								<label style={{ display: "grid", gap: 6 }}>
									<span>Display Name</span>
									<input
										value={q.displayName}
										onChange={(e) =>
											updateQuestion(
												idx,
												"displayName",
												e.target.value
											)
										}
										placeholder="Question display name"
										style={{
											padding: 8,
											color: "cyan",
											border: "1px solid white",
											borderRadius: "4px",
											background: "transparent",
										}}
									/>
								</label>
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "1fr 1fr",
										gap: 12,
										marginTop: 8,
									}}
								>
									<label style={{ display: "grid", gap: 6 }}>
										<span>Yes Color</span>
										<input
											type="color"
											value={q.yesColor}
											onChange={(e) =>
												updateQuestion(
													idx,
													"yesColor",
													e.target.value
												)
											}
											style={{
												height: 40,
												padding: 0,
												background: "transparent",
												border: "1px solid white",
												borderRadius: 4,
											}}
										/>
									</label>
									<label style={{ display: "grid", gap: 6 }}>
										<span>No Color</span>
										<input
											type="color"
											value={q.noColor}
											onChange={(e) =>
												updateQuestion(
													idx,
													"noColor",
													e.target.value
												)
											}
											style={{
												height: 40,
												padding: 0,
												background: "transparent",
												border: "1px solid white",
												borderRadius: 4,
											}}
										/>
									</label>
								</div>
								<div
									style={{
										display: "grid",
										gap: 6,
										marginTop: 8,
									}}
								>
									<span>Tags</span>
									<div
										style={{
											display: "flex",
											flexWrap: "wrap",
											gap: 8,
										}}
									>
										{AVAILABLE_TAGS.map((tag) => {
											const isSelected =
												q.tags.includes(tag);
											return (
												<button
													type="button"
													key={tag}
													onClick={() =>
														toggleTagForQuestion(
															idx,
															tag
														)
													}
													style={{
														padding: "6px 10px",
														border: "1px solid white",
														borderRadius: 999,
														background: isSelected
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
							</div>
						))}
					</div>
				</div>

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
