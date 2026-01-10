import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import {
	umbrellaDataService,
	type Umbrella,
} from "@/services/api/umbrellaDataService";
import { tagService, type Tag } from "@/services/api/tagService";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import CountdownTimer from "@/components/CountdownTimer/CountdownTimer";
import streamLogo from "@/assets/img/twitch-logo.png";

interface ListMarketProps {
	onEdit: (umbrella: Umbrella) => void;
	refreshKey?: number;
}

interface ResolveComment {
	submittedBy: string;
	resolveComment?: string;
	comment?: string;
	message?: string;
	text?: string;
	submittedAt?: string;
	createdAt?: string;
	username?: string;
}

interface NotificationData {
	count: number;
	comments: ResolveComment[];
}

export default function ListMarket({ onEdit, refreshKey }: ListMarketProps) {
	const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [query, setQuery] = useState<string>("");
	const [hideSettled, setHideSettled] = useState<boolean>(false);
	const [tagMap, setTagMap] = useState<Record<string, string>>({});
	const [notificationData, setNotificationData] = useState<
		Record<string, NotificationData>
	>({});
	const [expandedNotifications, setExpandedNotifications] = useState<
		Set<string>
	>(new Set());
	const { getAccessToken } = usePrivy();

	useEffect(() => {
		let mounted = true;
		setLoading(true);
		umbrellaDataService
			.fetchAllUmbrellas()
			.then((list) => {
				if (!mounted) return;
				setUmbrellas(Array.isArray(list) ? list : []);
			})
			.catch(() => {})
			.finally(() => mounted && setLoading(false));
		return () => {
			mounted = false;
		};
	}, [refreshKey]);

	useEffect(() => {
		let mounted = true;
		async function loadTags() {
			try {
				const token =
					typeof getAccessToken === "function"
						? await getAccessToken()
						: null;
				if (!token) {
					return;
				}
				const tags = await tagService.fetchAllTags();
				if (!mounted) {
					return;
				}
				console.log(
					"ListMarket loaded tags:",
					tags.map((tag) => ({ id: tag._id, label: tag.label }))
				);
				const mapped: Record<string, string> = {};
				tags.forEach((tag: Tag) => {
					mapped[tag._id] = tag.label;
				});
				setTagMap(mapped);
			} catch (error) {
				console.error("error", error);
			}
		}
		loadTags();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	const filtered = useMemo(() => {
		let base = query
			? umbrellas.filter((u) =>
					u.displayName.toLowerCase().includes(query.toLowerCase())
			  )
			: umbrellas;

		// If hideSettled is enabled, only show umbrellas with at least one unsettled child
		if (hideSettled) {
			base = base.filter((u) => {
				const children = Array.isArray(u.children) ? u.children : [];
				// Keep umbrella if it has at least one child that is NOT resolved
				return children.some(
					(child: any) => child.status !== "resolved"
				);
			});
		}

		console.log("ListMarket umbrellas:", base);
		return base;
	}, [umbrellas, query, hideSettled]);

	const zeroQuestionIds = useMemo(
		() =>
			filtered
				.filter(
					(u) => !Array.isArray(u.children) || u.children.length === 0
				)
				.map((u) => u._id),
		[filtered]
	);

	useEffect(() => {
		if (zeroQuestionIds.length > 0) {
			console.warn(
				`⚠️ The following umbrellas have no questions: ${zeroQuestionIds.join(
					", "
				)}`
			);
			console.error(
				"CTF Interrupted: One or more umbrellas returned zero questions. Investigate immediately."
			);
		}
	}, [zeroQuestionIds]);

	// Build notification data from umbrella's resolveComments field
	useEffect(() => {
		const data: Record<string, NotificationData> = {};

		filtered.forEach((umbrella) => {
			// Access resolveComments directly from umbrella object
			const umbrellaData = umbrella as any;
			const comments = umbrellaData.resolveComments || [];
			
			data[umbrella._id] = {
				count: comments.length,
				comments: comments,
			};
		});

		setNotificationData(data);
	}, [filtered]);

	const toggleNotifications = (umbrellaId: string) => {
		setExpandedNotifications((prev) => {
			const next = new Set(prev);
			if (next.has(umbrellaId)) {
				next.delete(umbrellaId);
			} else {
				next.add(umbrellaId);
			}
			return next;
		});
	};

	return (
		<div style={{ color: "white" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					marginBottom: 12,
					flexWrap: "wrap",
				}}
			>
				<input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					placeholder="Search umbrellas"
					style={{
						padding: 8,
						color: "cyan",
						border: "1px solid white",
						borderRadius: 6,
						background: "transparent",
						minWidth: 260,
					}}
				/>
				<label
					style={{
						display: "flex",
						alignItems: "center",
						gap: 6,
						cursor: "pointer",
						fontSize: 14,
						userSelect: "none",
					}}
				>
					<input
						type="checkbox"
						checked={hideSettled}
						onChange={(e) => setHideSettled(e.target.checked)}
						style={{
							width: 16,
							height: 16,
							cursor: "pointer",
							accentColor: "#22c55e",
						}}
					/>
					<span>Hide fully settled</span>
				</label>
				{loading && <span style={{ opacity: 0.8 }}>Loading…</span>}
			</div>

			<div style={{ display: "grid", gap: 12 }}>
				{filtered.map((u) => {
					const isActive = Boolean((u as any).active);
					const statusColor = isActive ? "#22c55e" : "#ef4444";
					const statusLabel = isActive ? "Active" : "Inactive";
					const children = Array.isArray(u.children)
						? u.children
						: [];
					const tagCounts = new Map<string, number>();
					children.forEach((child) => {
						const tagIds = Array.isArray((child as any).tagIds)
							? ((child as any).tagIds as string[])
							: [];
						tagIds.forEach((tagId) => {
							const existing = tagCounts.get(tagId) ?? 0;
							tagCounts.set(tagId, existing + 1);
						});
					});
					const tagBadges = Array.from(tagCounts.entries()).map(
						([tagId, count]) => ({
							label: tagMap[tagId] ?? tagId,
							count,
						})
					);
					const eventDateRaw = (u as any).eventDate as
						| string
						| null
						| undefined;
					const eventDate = eventDateRaw
						? new Date(eventDateRaw)
						: null;
					const rawStreamUrl =
						typeof (u as any).streamUrl === "string"
							? ((u as any).streamUrl as string)
							: "";
					const streamEnabled = Boolean((u as any).streamEnabled);
					const hasStream = streamEnabled && rawStreamUrl.length > 0;
					let streamPlatformLabel = "Stream";
					if (rawStreamUrl.includes("twitch.tv")) {
						streamPlatformLabel = "Twitch";
					} else if (rawStreamUrl.includes("kick.com")) {
						streamPlatformLabel = "Kick";
					}
					const streamIndicator = hasStream
						? { symbol: "✓", color: "#22c55e", label: "Connected" }
						: { symbol: "!", color: "#ef4444", label: "Missing" };
					const hasNotifications = (notificationData[u._id]?.count || 0) > 0;
					return (
						<div
							key={u._id}
							style={{
								border: hasNotifications
									? "2px solid #fbbf24"
									: "1px solid rgba(255,255,255,0.2)",
								borderRadius: 8,
								padding: 12,
								background: hasNotifications
									? "rgba(251, 191, 36, 0.08)"
									: "rgba(255,255,255,0.03)",
								boxShadow: hasNotifications
									? "0 0 12px rgba(251, 191, 36, 0.3)"
									: "none",
							}}
						>
							<div
								style={{
									display: "flex",
									flexDirection: "column",
									gap: 12,
								}}
							>
								<div
									style={{
										display: "flex",
										justifyContent: "space-between",
										gap: 12,
										flexWrap: "wrap",
										alignItems: "flex-start",
									}}
								>
									<div
										style={{
											minWidth: 220,
											flex: "1 1 240px",
										}}
									>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
												flexWrap: "wrap",
											}}
										>
											<span
												style={{
													display: "inline-flex",
													width: 10,
													height: 10,
													borderRadius: "50%",
													background: statusColor,
													boxShadow: `0 0 6px ${
														isActive
															? "rgba(34,197,94,0.6)"
															: "rgba(239,68,68,0.6)"
													}`,
												}}
												title={statusLabel}
											/>
											<div style={{ fontWeight: 600 }}>
												{u.displayName}
											</div>
										</div>
										<div
											style={{
												fontSize: 12,
												opacity: 0.8,
											}}
										>
											ID: {u._id}
										</div>
										{children.length ? (
											<div
												style={{
													fontSize: 12,
													opacity: 0.8,
												}}
											>
												Questions: {children.length}
											</div>
										) : (
											<div
												style={{
													fontSize: 12,
													opacity: 0.8,
													color: "#f87171",
												}}
											>
												Questions: 0
											</div>
										)}
										{notificationData[u._id] !==
											undefined && (
											<div
												onClick={() =>
													notificationData[u._id]
														?.count > 0 &&
													toggleNotifications(u._id)
												}
												style={{
													fontSize: 12,
													opacity: 0.8,
													color:
														notificationData[u._id]
															?.count > 0
															? "#fbbf24"
															: undefined,
													cursor:
														notificationData[u._id]
															?.count > 0
															? "pointer"
															: "default",
													display: "flex",
													alignItems: "center",
													gap: 4,
												}}
											>
												<span>
													📋 Notifications:{" "}
													{notificationData[u._id]
														?.count || 0}
												</span>
												{notificationData[u._id]
													?.count > 0 && (
													<span
														style={{
															fontSize: 10,
															transition:
																"transform 0.2s",
															transform:
																expandedNotifications.has(
																	u._id
																)
																	? "rotate(180deg)"
																	: "rotate(0deg)",
														}}
													>
														▼
													</span>
												)}
											</div>
										)}
									</div>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 16,
											flexWrap: "wrap",
										}}
									>
										<div
											style={{
												display: "flex",
												flexDirection: "column",
												gap: 4,
												fontSize: 12,
												minWidth: 180,
											}}
										>
											<div style={{ opacity: 0.7 }}>
												Event Date
											</div>
											{eventDate ? (
												<div>
													<div>
														{eventDate.toLocaleString(
															undefined,
															{
																year: "numeric",
																month: "short",
																day: "numeric",
																hour: "2-digit",
																minute: "2-digit",
															}
														)}
													</div>
													<CountdownTimer
														target={eventDate}
														className="admin-countdown"
														expiredLabel="Ended"
														showZeroDays={false}
													/>
												</div>
											) : (
												<div style={{ opacity: 0.7 }}>
													No event date
												</div>
											)}
										</div>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 8,
											}}
										>
											<div
												style={{
													position: "relative",
													width: 32,
													height: 32,
												}}
											>
												<img
													src={streamLogo}
													alt={streamPlatformLabel}
													style={{
														width: "100%",
														height: "100%",
														objectFit: "contain",
														borderRadius: 6,
														background: "#0f0f0f",
														padding: 2,
													}}
												/>
												<span
													style={{
														position: "absolute",
														right: -4,
														bottom: -4,
														width: 16,
														height: 16,
														borderRadius: "50%",
														background:
															streamIndicator.color,
														color: "#0f0f0f",
														display: "flex",
														alignItems: "center",
														justifyContent:
															"center",
														fontSize: 10,
														fontWeight: 700,
														border: "1px solid rgba(0,0,0,0.4)",
													}}
													title={`${streamPlatformLabel} ${streamIndicator.label}`}
												>
													{streamIndicator.symbol}
												</span>
											</div>
											<div
												style={{
													fontSize: 12,
													opacity: 0.75,
												}}
											>
												{streamPlatformLabel}{" "}
												{streamIndicator.label}
											</div>
										</div>
										<button
											type="button"
											onClick={() => onEdit(u)}
											style={{
												padding: "6px 10px",
												border: "1px solid white",
												borderRadius: 6,
												background:
													"rgba(255,255,255,0.15)",
												color: "white",
												cursor: "pointer",
												whiteSpace: "nowrap",
											}}
										>
											Edit
										</button>
									</div>
								</div>
								{/* Expanded Notifications Section */}
								{expandedNotifications.has(u._id) &&
									notificationData[u._id]?.comments?.length >
										0 && (
										<div
											style={{
												marginTop: 12,
												padding: 12,
												borderRadius: 8,
												background:
													"rgba(251, 191, 36, 0.1)",
												border: "1px solid rgba(251, 191, 36, 0.3)",
											}}
										>
											<div
												style={{
													fontWeight: 600,
													marginBottom: 8,
													color: "#fbbf24",
													fontSize: 13,
												}}
											>
												Resolution Requests
											</div>
											<div
												style={{
													display: "flex",
													flexDirection: "column",
													gap: 8,
												}}
											>
												{notificationData[
													u._id
												]?.comments.map(
													(
														comment: ResolveComment,
														idx: number
													) => (
														<div
															key={idx}
															style={{
																padding: 10,
																borderRadius: 6,
																background:
																	"rgba(0,0,0,0.3)",
																border: "1px solid rgba(255,255,255,0.1)",
															}}
														>
															<div
																style={{
																	fontSize: 11,
																	opacity: 0.7,
																	marginBottom: 4,
																	display:
																		"flex",
																	justifyContent:
																		"space-between",
																	flexWrap:
																		"wrap",
																	gap: 8,
																}}
															>
																<span>
																	👤{" "}
																	{comment.username ||
																		comment.submittedBy ||
																		"Unknown User"}
																</span>
																{(comment.submittedAt || comment.createdAt) && (
																	<span>
																		{new Date(
																			comment.submittedAt || comment.createdAt || ""
																		).toLocaleString()}
																	</span>
																)}
															</div>
															<div
																style={{
																	fontSize: 13,
																	color: "#fff",
																	whiteSpace:
																		"pre-wrap",
																	wordBreak:
																		"break-word",
																	marginTop: 4,
																}}
															>
																{comment.resolveComment ||
																	comment.comment ||
																	comment.message ||
																	comment.text ||
																	"(No comment text)"}
															</div>
															{/* Debug: Show raw data if no known field matches */}
															{!comment.resolveComment &&
																!comment.comment &&
																!comment.message &&
																!comment.text && (
																<div
																	style={{
																		fontSize: 10,
																		opacity: 0.5,
																		marginTop: 4,
																		fontFamily: "monospace",
																	}}
																>
																	Raw: {JSON.stringify(comment)}
																</div>
															)}
														</div>
													)
												)}
											</div>
										</div>
									)}
								{children.length === 0 && (
									<div
										style={{
											marginTop: 12,
											padding: "10px 14px",
											borderRadius: 8,
											background:
												"linear-gradient(90deg, rgba(248,113,113,0.2), rgba(185,28,28,0.3))",
											border: "1px solid rgba(248,113,113,0.6)",
											color: "#fff",
											fontWeight: 700,
											textTransform: "uppercase",
											letterSpacing: "0.05em",
											fontSize: 13,
											display: "inline-flex",
											alignItems: "center",
											gap: 10,
											animation:
												"shakeWarn 0.9s infinite",
										}}
									>
										<span
											style={{
												width: 18,
												height: 18,
												borderRadius: "50%",
												background: "#f87171",
												display: "inline-flex",
												alignItems: "center",
												justifyContent: "center",
												fontSize: 12,
												boxShadow:
													"0 0 8px rgba(248,113,113,0.7)",
											}}
										>
											!
										</span>
										<span>
											No Questions! CTF Interrupted. Try
											Again.
										</span>
									</div>
								)}
								<div
									style={{
										display: "flex",
										flexWrap: "wrap",
										gap: 8,
										alignItems: "center",
									}}
								>
									<span
										style={{ fontSize: 12, opacity: 0.7 }}
									>
										Tags:
									</span>
									{tagBadges.length > 0 ? (
										tagBadges.map(({ label, count }) => (
											<span
												key={`${u._id}-${label}`}
												style={{
													padding: "4px 8px",
													borderRadius: 999,
													border: "1px solid rgba(255,255,255,0.2)",
													background:
														"rgba(255,255,255,0.08)",
													fontSize: 12,
												}}
											>
												{label}
												{count > 1 ? (
													<span
														style={{ opacity: 0.7 }}
													>
														{" "}
														×{count}
													</span>
												) : null}
											</span>
										))
									) : (
										<span
											style={{
												fontSize: 12,
												opacity: 0.6,
											}}
										>
											No tags assigned
										</span>
									)}
								</div>
							</div>
						</div>
					);
				})}
				{!loading && filtered.length === 0 && (
					<div style={{ opacity: 0.8 }}>No umbrellas found.</div>
				)}
			</div>
			<style>
				{`
					@keyframes shakeWarn {
						0%, 100% { transform: translateX(0); }
						20% { transform: translateX(-2px); }
						40% { transform: translateX(2px); }
						60% { transform: translateX(-1px); }
						80% { transform: translateX(1px); }
					}
				`}
			</style>
		</div>
	);
}
