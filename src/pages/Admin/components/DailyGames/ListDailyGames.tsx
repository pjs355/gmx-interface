import { useEffect, useState, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { tagService, type Tag } from "@/services/api/tagService";
import {
	adminErrorMessage,
	formatAdminErrorForUser,
	formatAdminHttpError,
	ADMIN_DAILY_GAMES_LIST_INVALID,
	ADMIN_DAILY_GAMES_LIST_NOT_AVAILABLE,
	ADMIN_MISSING_ACCESS_TOKEN,
} from "@/errors";

interface DailyGame {
	_id: string;
	gameId: string;
	gameName: string;
	gameSlug: string;
	dailyStart: string;
	initialOverNumber?: number;
	active?: boolean;
	tagIds?: string[];
	createdAt?: string;
	updatedAt?: string;
}

interface DailyGamesApiResponse {
	success: boolean;
	data: DailyGame[];
	error?: string;
}

interface ListDailyGamesProps {
	onAdd?: () => void;
}

export default function ListDailyGames({ onAdd }: ListDailyGamesProps) {
	const { getAccessToken } = usePrivy();
	const [games, setGames] = useState<DailyGame[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [availableTags, setAvailableTags] = useState<Tag[]>([]);
	const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());

	// Load tags for display
	useEffect(() => {
		let mounted = true;
		async function loadTags() {
			try {
				const tags = await tagService.fetchAllTags();
				if (mounted) {
					setAvailableTags(tags);
				}
			} catch (err) {
				console.error("error", err);
			}
		}
		loadTags();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	// Create a map of tagId to tag for quick lookup
	const tagMap = useMemo(() => {
		const map = new Map<string, Tag>();
		availableTags.forEach((tag) => {
			map.set(tag._id, tag);
		});
		return map;
	}, [availableTags]);

	useEffect(() => {
		let mounted = true;
		async function fetchDailyGames() {
			setLoading(true);
			setError(null);
			try {
				const token = typeof getAccessToken === "function" ? await getAccessToken() : undefined;
				if (!token) {
					throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
				}
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/admin/daily-games`, {
					headers: { Authorization: `Bearer ${token}` },
				});

				// Handle 404 - GET endpoint might not exist yet
				if (resp.status === 404) {
					if (mounted) {
						setGames([]);
						setError(adminErrorMessage(ADMIN_DAILY_GAMES_LIST_NOT_AVAILABLE));
					}
					return;
				}

				const json = (await resp.json().catch(() => ({}) as any)) as DailyGamesApiResponse;
				if (!resp.ok) {
					throw new Error(formatAdminHttpError(resp.status, json?.error));
				}
				if (typeof json.success === "undefined") {
					throw new Error(adminErrorMessage(ADMIN_DAILY_GAMES_LIST_INVALID));
				}
				if (mounted) {
					if (Array.isArray(json.data)) {
						setGames(json.data);
					} else if (json.data) {
						setGames([json.data]);
					} else {
						setGames([]);
					}
				}
			} catch (err: unknown) {
				console.error("error", err);
				if (mounted) setError(formatAdminErrorForUser(err));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		fetchDailyGames();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	const handleToggleActive = async (gameId: string, currentActive: boolean) => {
		// Show confirmation modal with appropriate message
		const newActiveState = !currentActive;
		const confirmMessage = newActiveState
			? "Are you sure? Enabling will start creating and generation of markets."
			: "Are you sure? Disabling will stop aggregation of data and collection of data and aggregation of markets.";

		if (!window.confirm(confirmMessage)) {
			return; // User cancelled
		}

		setUpdatingIds((prev) => new Set(prev).add(gameId));
		try {
			const token = typeof getAccessToken === "function" ? await getAccessToken() : undefined;
			if (!token) {
				throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
			}
			const base = getPredictionApiBaseUrl();
			const resp = await fetch(`${base}/admin/daily-games/${gameId}`, {
				method: "PUT",
				headers: {
					Authorization: `Bearer ${token}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					active: newActiveState,
				}),
			});

			const json = await resp.json().catch(() => ({}) as any);

			if (!resp.ok) {
				throw new Error(formatAdminHttpError(resp.status, json?.error));
			}

			// Update the local state
			setGames((prevGames) =>
				prevGames.map((game) => (game._id === gameId ? { ...game, active: newActiveState } : game)),
			);
		} catch (err: unknown) {
			console.error("error", err);
			setError(formatAdminErrorForUser(err));
		} finally {
			setUpdatingIds((prev) => {
				const next = new Set(prev);
				next.delete(gameId);
				return next;
			});
		}
	};

	if (loading) {
		return <div style={{ padding: 24, color: "white" }}>Loading daily games...</div>;
	}

	if (error) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				<div style={{ color: "#f87171", marginBottom: 16 }}>Error: {error}</div>
			</div>
		);
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					marginBottom: 24,
				}}
			>
				<h2 style={{ margin: 0 }}>Daily Games</h2>
				{onAdd && (
					<button
						type="button"
						onClick={onAdd}
						style={{
							padding: "8px 16px",
							border: "1px solid white",
							borderRadius: 6,
							background: "var(--brand-tint-20)",
							color: "white",
							cursor: "pointer",
						}}
					>
						Add Daily Game
					</button>
				)}
			</div>

			{games.length === 0 ? (
				<div
					style={{
						padding: 16,
						backgroundColor: "#1a1a1a",
						borderRadius: 8,
					}}
				>
					No daily games found.
				</div>
			) : (
				<table
					style={{
						width: "100%",
						borderCollapse: "collapse",
						backgroundColor: "#1a1a1a",
					}}
				>
					<thead>
						<tr style={{ borderBottom: "1px solid #333" }}>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Game ID
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Game Name
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Game Slug
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Daily Start (UTC)
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Initial Over Number
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Tags
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Active
							</th>
							<th
								style={{
									padding: "12px",
									textAlign: "left",
									borderBottom: "1px solid #333",
								}}
							>
								Created
							</th>
						</tr>
					</thead>
					<tbody>
						{games.map((game) => (
							<tr
								key={game._id}
								style={{
									borderBottom: "1px solid #333",
								}}
							>
								<td style={{ padding: "12px" }}>{game.gameId}</td>
								<td style={{ padding: "12px" }}>{game.gameName}</td>
								<td style={{ padding: "12px" }}>{game.gameSlug}</td>
								<td style={{ padding: "12px" }}>{game.dailyStart || "--"}</td>
								<td style={{ padding: "12px" }}>
									{game.initialOverNumber !== undefined ? game.initialOverNumber.toFixed(2) : "--"}
								</td>
								<td style={{ padding: "12px" }}>
									{game.tagIds && game.tagIds.length > 0 ? (
										<div
											style={{
												display: "flex",
												flexWrap: "wrap",
												gap: 4,
											}}
										>
											{game.tagIds.map((tagId) => {
												const tag = tagMap.get(tagId);
												return tag ? (
													<span
														key={tagId}
														style={{
															padding: "2px 8px",
															backgroundColor: "var(--brand-tint-20)",
															border: "1px solid var(--brand-primary)",
															borderRadius: 4,
															fontSize: "12px",
															color: "#a5b4fc",
														}}
													>
														{tag.label}
													</span>
												) : null;
											})}
										</div>
									) : (
										"--"
									)}
								</td>
								<td style={{ padding: "12px" }}>
									<button
										type="button"
										onClick={() => handleToggleActive(game._id, game.active ?? false)}
										disabled={updatingIds.has(game._id)}
										style={{
											padding: "4px 12px",
											border: `1px solid ${game.active ? "#22c55e" : "#6b7280"}`,
											borderRadius: 6,
											background: game.active
												? "rgba(34, 197, 94, 0.2)"
												: "rgba(107, 114, 128, 0.2)",
											color: game.active ? "#4ade80" : "#9ca3af",
											cursor: updatingIds.has(game._id) ? "not-allowed" : "pointer",
											fontSize: "12px",
											opacity: updatingIds.has(game._id) ? 0.6 : 1,
										}}
									>
										{updatingIds.has(game._id)
											? "Updating..."
											: game.active
												? "Active"
												: "Inactive"}
									</button>
								</td>
								<td style={{ padding: "12px" }}>
									{game.createdAt ? new Date(game.createdAt).toLocaleDateString() : "--"}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
