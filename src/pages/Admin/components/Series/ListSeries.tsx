import { useEffect, useState, useMemo, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import AddMarket from "../Markets/AddMarket";
import {
	umbrellaDataService,
	type Umbrella,
} from "@/services/api/umbrellaDataService";

interface ProcessedMatch {
	id: number;
	name: string;
	status: string;
	scheduledAt: string | null;
	team1: {
		id: number | null;
		name: string;
		acronym: string | null;
	};
	team2: {
		id: number | null;
		name: string;
		acronym: string | null;
	};
	isTBD: boolean;
}

interface ProcessedTournament {
	id: number;
	name: string;
	beginAt: string | null;
	endAt: string | null;
	totalMatches: number;
	knownMatches?: ProcessedMatch[];
	tbdMatches?: ProcessedMatch[];
}

interface ProcessedSerie {
	id: number;
	name: string;
	fullName: string;
	beginAt: string | null;
	endAt: string | null;
	game: string;
	league: string;
	tournaments?: ProcessedTournament[];
}

interface SeriesApiResponse {
	success: boolean;
	data: ProcessedSerie[] | ProcessedSerie | null;
	message?: string;
}

export default function ListSeries() {
	const { getAccessToken } = usePrivy();
	const [series, setSeries] = useState<ProcessedSerie[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
	const [loadingUmbrellas, setLoadingUmbrellas] = useState<boolean>(false);
	const [selectedMatch, setSelectedMatch] = useState<{
		match: ProcessedMatch;
		serie: ProcessedSerie;
	} | null>(null);

	useEffect(() => {
		let mounted = true;
		async function run() {
			setLoading(true);
			setError(null);
			try {
				const token = await getAccessToken?.();
				if (typeof token === "undefined" || !token) {
					throw new Error("Missing admin access token");
				}
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/admin/series`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const json = (await resp
					.json()
					.catch(() => ({} as any))) as SeriesApiResponse;
				if (!resp.ok) {
					throw new Error(
						(json as any)?.error || `HTTP ${resp.status}`
					);
				}
				if (typeof json.success === "undefined") {
					throw new Error("Invalid response for series list");
				}
				if (mounted) {
					if (Array.isArray(json.data)) {
						setSeries(json.data);
					} else if (json.data) {
						setSeries([json.data]);
					} else {
						setSeries([]);
					}
				}
			} catch (err: any) {
				console.error("error", err);
				if (mounted) setError(err?.message || String(err));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		run();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	const refreshUmbrellas = useCallback(async () => {
		setLoadingUmbrellas(true);
		try {
			const list = await umbrellaDataService.fetchAllUmbrellas();
			setUmbrellas(list || []);
		} catch (err) {
			console.error("error", err);
		} finally {
			setLoadingUmbrellas(false);
		}
	}, []);

	// Fetch all umbrellas to check for existing matches
	useEffect(() => {
		refreshUmbrellas();
	}, [refreshUmbrellas]);

	// Create a Set of existing pandascore match IDs for quick lookup
	const existingMatchIds = useMemo(() => {
		const ids = new Set<string>();
		console.log("All umbrellas:", umbrellas);
		umbrellas.forEach((umbrella) => {
			if (umbrella.pandascore_matchId) {
				ids.add(String(umbrella.pandascore_matchId));
			}
		});
		console.log("Existing PandaScore Match IDs:", Array.from(ids));
		console.log(
			"Total umbrellas:",
			umbrellas.length,
			"- With pandascore_matchId:",
			ids.size
		);
		return ids;
	}, [umbrellas]);

	// Get all known matches and filter out ones that already exist
	const allKnownMatches = useMemo(() => {
		const matches = series.flatMap((serie) =>
			(serie.tournaments ?? []).flatMap((tournament) =>
				(tournament.knownMatches ?? []).map((match) => ({
					match,
					tournament,
					serie,
				}))
			)
		);

		console.log(
			"Sample matches with teams:",
			matches.slice(0, 5).map((m) => ({
				id: m.match.id,
				name: m.match.name,
				team1: `${m.match.team1.name} (${
					m.match.team1.acronym ?? "-"
				})`,
				team2: `${m.match.team2.name} (${
					m.match.team2.acronym ?? "-"
				})`,
			}))
		);

		// Filter out matches that already have an umbrella
		const filtered = matches.filter(
			({ match }) => !existingMatchIds.has(String(match.id))
		);

		console.log(
			`Filtered: ${matches.length} total matches → ${
				filtered.length
			} new matches (${matches.length - filtered.length} already exist)`
		);

		return filtered;
	}, [series, existingMatchIds]);

	// If a match is selected, show AddMarket form
	if (selectedMatch) {
		return (
			<div style={{ color: "white" }}>
				<button
					type="button"
					onClick={() => setSelectedMatch(null)}
					style={{
						padding: "6px 10px",
						border: "1px solid white",
						borderRadius: 6,
						background: "rgba(255,255,255,0.2)",
						color: "white",
						cursor: "pointer",
						marginBottom: 16,
					}}
				>
					← Back to Series List
				</button>
				<AddMarket
					series={{
						name: `${selectedMatch.serie.league} ${selectedMatch.serie.fullName}`,
						game: selectedMatch.serie.game,
					}}
					match={{
						id: selectedMatch.match.id,
						name: selectedMatch.match.name,
						scheduledAt: selectedMatch.match.scheduledAt,
						team1: {
							id: selectedMatch.match.team1.id ?? null,
							name: selectedMatch.match.team1.name,
							acronym: selectedMatch.match.team1.acronym ?? null,
						},
						team2: {
							id: selectedMatch.match.team2.id ?? null,
							name: selectedMatch.match.team2.name,
							acronym: selectedMatch.match.team2.acronym ?? null,
						},
					}}
					onCreated={async () => {
						await new Promise((resolve) =>
							setTimeout(resolve, 1500)
						);
						umbrellaDataService.invalidateCache();
						await refreshUmbrellas();
						setSelectedMatch(null);
					}}
				/>
			</div>
		);
	}

	return (
		<div style={{ color: "white" }}>
			<div
				style={{
					display: "flex",
					alignItems: "center",
					gap: 12,
					marginBottom: 12,
				}}
			>
				{loading && (
					<span style={{ opacity: 0.8 }}>Loading series…</span>
				)}
				{loadingUmbrellas && (
					<span style={{ opacity: 0.8 }}>
						Loading existing markets…
					</span>
				)}
				{error && <span style={{ color: "#ff6b6b" }}>{error}</span>}
			</div>

			{!loading && allKnownMatches.length > 0 && (
				<div style={{ overflowX: "auto" }}>
					<table
						style={{
							width: "100%",
							borderCollapse: "collapse",
							border: "1px solid rgba(255,255,255,0.2)",
						}}
					>
						<thead>
							<tr
								style={{
									background: "rgba(255,255,255,0.1)",
									borderBottom:
										"1px solid rgba(255,255,255,0.2)",
								}}
							>
								<th
									style={{
										padding: 12,
										textAlign: "left",
										fontWeight: 600,
									}}
								>
									Match ID
								</th>
								<th
									style={{
										padding: 12,
										textAlign: "left",
										fontWeight: 600,
									}}
								>
									Game
								</th>
								<th
									style={{
										padding: 12,
										textAlign: "left",
										fontWeight: 600,
									}}
								>
									Match Name
								</th>
								<th
									style={{
										padding: 12,
										textAlign: "left",
										fontWeight: 600,
									}}
								>
									Teams
								</th>
								<th
									style={{
										padding: 12,
										textAlign: "left",
										fontWeight: 600,
									}}
								>
									Scheduled At
								</th>
								<th
									style={{
										padding: 12,
										textAlign: "left",
										fontWeight: 600,
									}}
								>
									Status
								</th>
								<th
									style={{
										padding: 12,
										textAlign: "left",
										fontWeight: 600,
									}}
								>
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{allKnownMatches.map(
								({ match, tournament, serie }) => (
									<tr
										key={match.id}
										style={{
											borderBottom:
												"1px solid rgba(255,255,255,0.1)",
										}}
									>
										<td style={{ padding: 12 }}>
											{match.id}
										</td>
										<td style={{ padding: 12 }}>
											{serie.game}
										</td>
										<td style={{ padding: 12 }}>
											<div style={{ fontWeight: 500 }}>
												{match.name}
											</div>
											<div
												style={{
													fontSize: 12,
													opacity: 0.7,
													marginTop: 4,
												}}
											>
												{tournament.name}
											</div>
										</td>
										<td style={{ padding: 12 }}>
											<div>
												{match.team1.name}{" "}
												{match.team1.acronym &&
													`(${match.team1.acronym})`}
											</div>
											<div style={{ opacity: 0.7 }}>
												vs
											</div>
											<div>
												{match.team2.name}{" "}
												{match.team2.acronym &&
													`(${match.team2.acronym})`}
											</div>
										</td>
										<td style={{ padding: 12 }}>
											{match.scheduledAt
												? new Date(
														match.scheduledAt
												  ).toLocaleString()
												: "N/A"}
										</td>
										<td style={{ padding: 12 }}>
											<span
												style={{
													padding: "4px 8px",
													borderRadius: 4,
													background:
														match.status ===
														"not_started"
															? "rgba(59, 130, 246, 0.2)"
															: match.status ===
															  "running"
															? "rgba(34, 197, 94, 0.2)"
															: "rgba(156, 163, 175, 0.2)",
													fontSize: 12,
													fontWeight: 500,
												}}
											>
												{match.status}
											</span>
										</td>
										<td style={{ padding: 12 }}>
											<button
												type="button"
												onClick={() =>
													setSelectedMatch({
														match,
														serie,
													})
												}
												style={{
													padding: "6px 10px",
													border: "1px solid white",
													borderRadius: 6,
													background:
														"rgba(255,255,255,0.2)",
													color: "white",
													cursor: "pointer",
													whiteSpace: "nowrap",
												}}
											>
												Add
											</button>
										</td>
									</tr>
								)
							)}
						</tbody>
					</table>
				</div>
			)}

			{!loading && !loadingUmbrellas && allKnownMatches.length === 0 && (
				<div style={{ opacity: 0.8 }}>
					No new matches found. All matches already have markets
					created.
				</div>
			)}
		</div>
	);
}
