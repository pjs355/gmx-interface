import { useState, useEffect, useRef } from "react";
import { usePrivy, useIdentityToken } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { tagService, type Tag } from "@/services/api/tagService";

interface AddDailyGameProps {
	onCreated?: () => void;
	onBack?: () => void;
}

export default function AddDailyGame({
	onCreated,
	onBack,
}: AddDailyGameProps) {
	const { getAccessToken } = usePrivy();
	const { identityToken } = useIdentityToken();
	const [gameId, setGameId] = useState<string>("");
	const [gameName, setGameName] = useState<string>("");
	const [gameSlug, setGameSlug] = useState<string>("");
	const [dailyStart, setDailyStart] = useState<string>("");
	const [initialOverNumber, setInitialOverNumber] = useState<string>("");
	const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [loadingTags, setLoadingTags] = useState<boolean>(true);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<boolean>(false);
	const dailyStartInputRef = useRef<HTMLInputElement | null>(null);

	// Load tags and auto-select "daily" tag
	useEffect(() => {
		let mounted = true;
		async function loadTags() {
			try {
				const token =
					typeof getAccessToken === "function"
						? await getAccessToken()
						: undefined;
				const tags = await tagService.fetchAllTags();
				if (mounted) {
					setAvailableTags(tags);
					// Find and auto-select the "daily" tag by slug
					const dailyTag = tags.find((tag) => tag.slug === "daily");
					if (dailyTag) {
						setSelectedTagIds([dailyTag._id]);
					}
				}
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

	const openTimePicker = () => {
		try {
			// @ts-ignore showPicker is not yet in the TS lib
			dailyStartInputRef.current?.showPicker?.();
		} catch {
			dailyStartInputRef.current?.focus();
		}
	};

	const validateDailyStart = (value: string): boolean => {
		if (!value) return false;
		// HTML5 time input already validates HH:MM format
		return true;
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setLoading(true);
		setError(null);
		setSuccess(false);

		try {
			const token =
				typeof getAccessToken === "function"
					? await getAccessToken()
					: undefined;
			if (!token) {
				throw new Error("Missing admin access token");
			}

			if (!identityToken) {
				throw new Error("Missing identity token");
			}

			// Validate all fields
			if (!gameId.trim()) {
				throw new Error("Game ID is required");
			}
			if (!gameName.trim()) {
				throw new Error("Game Name is required");
			}
			if (!gameSlug.trim()) {
				throw new Error("Game Slug is required");
			}
			if (!dailyStart.trim()) {
				throw new Error("Daily Start time is required");
			}
			if (!initialOverNumber.trim()) {
				throw new Error("Initial Over Number is required");
			}
			// Validate initialOverNumber is a valid number
			const overNumber = parseFloat(initialOverNumber.trim());
			if (isNaN(overNumber) || overNumber <= 0) {
				throw new Error("Initial Over Number must be a positive number");
			}

			// Validate dailyStart format
			if (!validateDailyStart(dailyStart)) {
				throw new Error("Daily Start time is required");
			}

			// Warn if gameId is not purely numeric (but don't block)
			if (!/^\d+$/.test(gameId.trim())) {
				console.warn("Game ID is not purely numeric:", gameId);
			}

			// Ensure "daily" tag is always included
			const dailyTag = availableTags.find((tag) => tag.slug === "daily");
			const finalTagIds = dailyTag
				? Array.from(new Set([dailyTag._id, ...selectedTagIds]))
				: selectedTagIds;

			// Format dailyStart as HH:MM (time input already provides this format)
			const formattedDailyStart = dailyStart.trim();

			const base = getPredictionApiBaseUrl();
			const resp = await fetch(`${base}/admin/daily-games`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${token}`,
					"privy-id-token": identityToken,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					gameId: gameId.trim(),
					gameName: gameName.trim(),
					gameSlug: gameSlug.trim(),
					dailyStart: formattedDailyStart,
					initialOverNumber: parseFloat(initialOverNumber.trim()),
					tagIds: finalTagIds,
				}),
			});

			const json = await resp.json().catch(() => ({} as any));

			if (!resp.ok) {
				const errorText = await resp.text().catch(() => "");
				throw new Error(
					json?.error ||
						`Failed to save daily game (${resp.status}): ${errorText || "Unknown error"}`
				);
			}

			if (json?.success !== true) {
				throw new Error(json?.error || "Unknown server response");
			}

			setSuccess(true);
			
			// Reset form
			setGameId("");
			setGameName("");
			setGameSlug("");
			setDailyStart("");
			setInitialOverNumber("");
			// Reset tags but keep "daily" tag selected
			const resetDailyTag = availableTags.find((tag) => tag.slug === "daily");
			setSelectedTagIds(resetDailyTag ? [resetDailyTag._id] : []);

			// Call onCreated after a short delay to show success message
			setTimeout(() => {
				if (onCreated) {
					onCreated();
				}
			}, 1500);
		} catch (err: any) {
			console.error("error", err);
			setError(err?.message || String(err));
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ padding: 24, color: "white" }}>
			<div
				style={{
					marginBottom: 24,
					display: "flex",
					alignItems: "center",
					gap: 16,
				}}
			>
				{onBack && (
					<button
						type="button"
						onClick={onBack}
						style={{
							padding: "8px 16px",
							border: "1px solid white",
							borderRadius: 6,
							background: "transparent",
							color: "white",
							cursor: "pointer",
						}}
					>
						← Back
					</button>
				)}
				<h2 style={{ margin: 0 }}>Add Daily Game</h2>
			</div>

			<div
				style={{
					padding: 12,
					marginBottom: 16,
					backgroundColor: "#1a1a1a",
					borderRadius: 6,
					fontSize: "14px",
					color: "#aaa",
				}}
			>
				<strong>Note:</strong> These games drive the Steam cron: counts every
				~14 minutes, markets auto-create when the daily window starts.
			</div>

			{error && (
				<div
					style={{
						padding: 12,
						marginBottom: 16,
						backgroundColor: "rgba(239, 68, 68, 0.2)",
						border: "1px solid #ef4444",
						borderRadius: 6,
						color: "#f87171",
					}}
				>
					Error: {error}
				</div>
			)}

			{success && (
				<div
					style={{
						padding: 12,
						marginBottom: 16,
						backgroundColor: "rgba(34, 197, 94, 0.2)",
						border: "1px solid #22c55e",
						borderRadius: 6,
						color: "#22c55e",
					}}
				>
					Success! Daily game created.
				</div>
			)}

			<form onSubmit={handleSubmit}>
				<div
					style={{
						display: "flex",
						flexDirection: "column",
						gap: 16,
						maxWidth: "600px",
					}}
				>
					<div>
						<label
							style={{
								display: "block",
								marginBottom: 8,
								fontWeight: 600,
							}}
						>
							Game ID *
						</label>
						<input
							type="text"
							value={gameId}
							onChange={(e) => setGameId(e.target.value)}
							required
							style={{
								width: "100%",
								padding: "8px 12px",
								backgroundColor: "#1a1a1a",
								border: "1px solid #333",
								borderRadius: 6,
								color: "white",
								fontSize: "14px",
							}}
						/>
						{gameId && !/^\d+$/.test(gameId.trim()) && (
							<div
								style={{
									marginTop: 4,
									fontSize: "12px",
									color: "#fbbf24",
								}}
							>
								Warning: Game ID is not purely numeric
							</div>
						)}
					</div>

					<div>
						<label
							style={{
								display: "block",
								marginBottom: 8,
								fontWeight: 600,
							}}
						>
							Game Name *
						</label>
						<input
							type="text"
							value={gameName}
							onChange={(e) => setGameName(e.target.value)}
							required
							style={{
								width: "100%",
								padding: "8px 12px",
								backgroundColor: "#1a1a1a",
								border: "1px solid #333",
								borderRadius: 6,
								color: "white",
								fontSize: "14px",
							}}
						/>
					</div>

					<div>
						<label
							style={{
								display: "block",
								marginBottom: 8,
								fontWeight: 600,
							}}
						>
							Game Slug *
						</label>
						<input
							type="text"
							value={gameSlug}
							onChange={(e) => setGameSlug(e.target.value)}
							required
							style={{
								width: "100%",
								padding: "8px 12px",
								backgroundColor: "#1a1a1a",
								border: "1px solid #333",
								borderRadius: 6,
								color: "white",
								fontSize: "14px",
							}}
						/>
					</div>

					<div>
						<label
							style={{
								display: "block",
								marginBottom: 8,
								fontWeight: 600,
							}}
						>
							Daily Start (UTC) *
						</label>
						<div
							style={{
								display: "flex",
								gap: 8,
								alignItems: "center",
							}}
						>
							<input
								type="time"
								ref={dailyStartInputRef}
								value={dailyStart}
								onChange={(e) => setDailyStart(e.target.value)}
								required
								style={{
									padding: "8px 12px",
									backgroundColor: "#1a1a1a",
									border: "1px solid #333",
									borderRadius: 6,
									color: "white",
									fontSize: "14px",
									flex: 1,
								}}
							/>
							<button
								type="button"
								onClick={openTimePicker}
								style={{
									padding: "8px 16px",
									border: "1px solid white",
									borderRadius: 6,
									background: "transparent",
									color: "white",
									cursor: "pointer",
									fontSize: "14px",
									whiteSpace: "nowrap",
								}}
							>
								Pick
							</button>
						</div>
						<div
							style={{
								marginTop: 4,
								fontSize: "12px",
								color: "#aaa",
							}}
						>
							Time is in UTC. Use the time picker or enter time in HH:MM format
							(e.g., 04:00).
						</div>
					</div>

					<div>
						<label
							style={{
								display: "block",
								marginBottom: 8,
								fontWeight: 600,
							}}
						>
							Initial Over Number *
						</label>
						<input
							type="number"
							value={initialOverNumber}
							onChange={(e) => setInitialOverNumber(e.target.value)}
							required
							min="0"
							step="0.01"
							placeholder="e.g., 2.5"
							style={{
								width: "100%",
								padding: "8px 12px",
								backgroundColor: "#1a1a1a",
								border: "1px solid #333",
								borderRadius: 6,
								color: "white",
								fontSize: "14px",
							}}
						/>
						<div
							style={{
								marginTop: 4,
								fontSize: "12px",
								color: "#aaa",
							}}
						>
							Manual number used when there's not enough data. An algorithm will
							take over later.
						</div>
					</div>

					<div>
						<label
							style={{
								display: "block",
								marginBottom: 8,
								fontWeight: 600,
							}}
						>
							Tags
						</label>
						{loadingTags ? (
							<div style={{ color: "#aaa", fontSize: "14px" }}>
								Loading tags...
							</div>
						) : (
							<div
								style={{
									display: "flex",
									flexWrap: "wrap",
									gap: 8,
									padding: "12px",
									backgroundColor: "#1a1a1a",
									border: "1px solid #333",
									borderRadius: 6,
									minHeight: "60px",
								}}
							>
								{availableTags.map((tag) => {
									const isSelected = selectedTagIds.includes(tag._id);
									const isDailyTag = tag.slug === "daily";
									return (
										<button
											key={tag._id}
											type="button"
											onClick={() => {
												// Prevent deselecting the "daily" tag
												if (isDailyTag && isSelected) {
													return;
												}
												if (isSelected) {
													setSelectedTagIds(
														selectedTagIds.filter((id) => id !== tag._id)
													);
												} else {
													setSelectedTagIds([...selectedTagIds, tag._id]);
												}
											}}
											style={{
												padding: "6px 12px",
												border: `1px solid ${isSelected ? "#6a6ff5" : "#333"}`,
												borderRadius: 6,
												backgroundColor: isSelected
													? "rgba(106, 111, 245, 0.2)"
													: "transparent",
												color: "white",
												cursor: isDailyTag && isSelected ? "not-allowed" : "pointer",
												fontSize: "14px",
												opacity: isDailyTag && isSelected ? 0.7 : 1,
											}}
											title={
												isDailyTag && isSelected
													? "The 'daily' tag is required and cannot be removed"
													: undefined
											}
										>
											{tag.label}
										</button>
									);
								})}
							</div>
						)}
						<div
							style={{
								marginTop: 4,
								fontSize: "12px",
								color: "#aaa",
							}}
						>
							The "daily" tag is automatically selected.
						</div>
					</div>

					<div
						style={{
							display: "flex",
							gap: 12,
							marginTop: 8,
						}}
					>
						<button
							type="submit"
							disabled={loading}
							style={{
								padding: "10px 20px",
								border: "1px solid white",
								borderRadius: 6,
								background: loading
									? "rgba(255,255,255,0.1)"
									: "rgba(106, 111, 245, 0.2)",
								color: "white",
								cursor: loading ? "not-allowed" : "pointer",
								fontSize: "14px",
								fontWeight: 600,
							}}
						>
							{loading ? "Creating..." : "Create Daily Game"}
						</button>
						{onBack && (
							<button
								type="button"
								onClick={onBack}
								disabled={loading}
								style={{
									padding: "10px 20px",
									border: "1px solid white",
									borderRadius: 6,
									background: "transparent",
									color: "white",
									cursor: loading ? "not-allowed" : "pointer",
									fontSize: "14px",
								}}
							>
								Cancel
							</button>
						)}
					</div>
				</div>
			</form>
		</div>
	);
}

