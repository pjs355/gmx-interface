import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import AddMarket from "./components/Markets/AddMarket";
import ListMarket from "./components/Markets/ListMarket";
import EditMarket from "./components/Markets/EditMarket";
import ResolveMarkets from "./components/Markets/ResolveMarkets";
import ListTag, { type AdminTag } from "./components/Tags/ListTag";
import AddTag from "./components/Tags/AddTag";
import EditTag from "./components/Tags/EditTag";
import ListSeries from "./components/Series/ListSeries";
import AddSeries from "./components/Series/AddSeries";
import ListTeams from "./components/Teams/ListTeams";
import EditTeam from "./components/Teams/EditTeam";
import ListProfiles from "./components/Profiles/ListProfiles";
import ViewProfile from "./components/Profiles/ViewProfile";
import Stats from "./components/Stats/Stats";
import ListDailyGames from "./components/DailyGames/ListDailyGames";
import AddDailyGame from "./components/DailyGames/AddDailyGame";
import TradeTesting from "./components/TradeTesting/TradeTesting";
import AdminWallet from "./components/Wallet/AdminWallet";
import AdminVenues from "./components/Venues/AdminVenues";
import { adminErrorMessage, ADMIN_MISSING_ACCESS_TOKEN } from "@/errors";
import { umbrellaDataService, type Umbrella } from "@/services/api/umbrellaDataService";
import { usePredictionData } from "@/context/PredictionDataContext";
import { teamService, type TeamRecord } from "@/services/api/teamService";

const AdminExportKeys = lazy(() => import("./components/Keys/AdminExportKeys"));

type AdminView =
	| "markets-list"
	| "markets-add"
	| "markets-resolve"
	| "markets-edit"
	| "tags-list"
	| "tags-add"
	| "tags-edit"
	| "series-list"
	| "series-add"
	| "teams-list"
	| "teams-edit"
	| "profiles-list"
	| "profiles-view"
	| "stats"
	| "daily-games-list"
	| "daily-games-add"
	| "trade-testing"
	| "wallet"
	| "keys"
	| "venues";

const DEFAULT_ADMIN_VIEW: AdminView = "markets-list";

const VALID_ADMIN_VIEWS: AdminView[] = [
	"markets-list",
	"markets-add",
	"markets-resolve",
	"markets-edit",
	"tags-list",
	"tags-add",
	"tags-edit",
	"series-list",
	"series-add",
	"teams-list",
	"teams-edit",
	"profiles-list",
	"profiles-view",
	"stats",
	"daily-games-list",
	"daily-games-add",
	"trade-testing",
	"wallet",
	"keys",
	"venues",
] as const;

function isValidAdminView(value: string | null): value is AdminView {
	if (value === null) {
		return false;
	}
	return (VALID_ADMIN_VIEWS as readonly string[]).includes(value);
}

export default function Admin() {
	const navigate = useNavigate();
	const [searchParams, setSearchParams] = useSearchParams();
	const { getAccessToken } = usePrivy();
	const getAccessTokenRef = useRef(getAccessToken);
	getAccessTokenRef.current = getAccessToken;
	const { refresh: refreshPredictionData } = usePredictionData();
	const [checking, setChecking] = useState(true);
	const [selected, setSelected] = useState<Umbrella | null>(null);
	const [selectedTag, setSelectedTag] = useState<AdminTag | null>(null);
	const [selectedTeam, setSelectedTeam] = useState<TeamRecord | null>(null);
	const [umbrellasRevision, setUmbrellasRevision] = useState(0);
	const [teamsRevision, setTeamsRevision] = useState(0);
	const pendingRefreshRef = useRef(false);
	const [teamLoading, setTeamLoading] = useState(false);
	const [teamError, setTeamError] = useState<string | null>(null);

	const view: AdminView = useMemo(() => {
		const param = searchParams.get("view");
		return isValidAdminView(param) ? param : DEFAULT_ADMIN_VIEW;
	}, [searchParams]);

	const updateView = useCallback(
		(nextView: AdminView, extra?: Record<string, string | null>) => {
			setSearchParams(
				(prev) => {
					const prevString = prev.toString();
					const next = new URLSearchParams(prev);
					if (next.get("view") !== nextView) {
						next.set("view", nextView);
					}
					if (extra) {
						for (const [key, value] of Object.entries(extra)) {
							if (value === null) {
								next.delete(key);
							} else {
								next.set(key, value);
							}
						}
					}
					if (next.toString() === prevString) {
						return prev;
					}
					return next;
				},
				{ replace: false },
			);
		},
		[setSearchParams],
	);

	const runUmbrellaRefresh = useCallback(async () => {
		umbrellaDataService.invalidateCache();
		try {
			await refreshPredictionData();
		} catch (error) {
			console.error("error", error);
		}
		setUmbrellasRevision((prev) => prev + 1);
	}, [refreshPredictionData]);

	const handleMarketCreated = useCallback(() => {
		pendingRefreshRef.current = true;
		if (view !== "markets-add") {
			pendingRefreshRef.current = false;
			void runUmbrellaRefresh();
		}
	}, [runUmbrellaRefresh, view]);

	useEffect(() => {
		if (pendingRefreshRef.current && view !== "markets-add") {
			pendingRefreshRef.current = false;
			void runUmbrellaRefresh();
		}
	}, [runUmbrellaRefresh, view]);

	useEffect(() => {
		if (view !== "markets-edit") {
			return;
		}
		const umbrellaId = searchParams.get("umbrellaId");
		if (!umbrellaId || selected) {
			return;
		}
		let cancelled = false;
		(async () => {
			try {
				const fetched = await umbrellaDataService.fetchUmbrellaById(umbrellaId);
				if (!cancelled && fetched) {
					setSelected(fetched);
				}
			} catch (error) {
				console.error("error", error);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [searchParams, selected, view]);

	useEffect(() => {
		if (view !== "teams-edit") {
			setTeamLoading(false);
			setTeamError(null);
			return;
		}
		const teamId = searchParams.get("teamId");
		if (!teamId) {
			setSelectedTeam(null);
			return;
		}
		if (selectedTeam && selectedTeam._id === teamId) {
			return;
		}
		let cancelled = false;
		setTeamLoading(true);
		setTeamError(null);
		(async () => {
			try {
				const getTok = getAccessTokenRef.current;
				const token = typeof getTok === "function" ? await getTok() : null;
				if (typeof token !== "string" || token.length === 0) {
					throw new Error(adminErrorMessage(ADMIN_MISSING_ACCESS_TOKEN));
				}
				const fetched = await teamService.fetchTeamById(teamId, token);
				if (!cancelled) {
					if (fetched) {
						setSelectedTeam(fetched);
					} else {
						setSelectedTeam(null);
						setTeamError("Team not found");
					}
				}
			} catch (error) {
				console.error("error", error);
				if (!cancelled) {
					setTeamError(error instanceof Error ? error.message : "Failed to load team");
				}
			} finally {
				if (!cancelled) {
					setTeamLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [searchParams, selectedTeam, view]);

	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const getTok = getAccessTokenRef.current;
				const token = typeof getTok === "function" ? await getTok() : undefined;
				const resp = await fetch(`${getPredictionApiBaseUrl()}/admin/session`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
				});
				if (!mounted) return;
				if (resp.ok) {
					setChecking(false);
					return;
				}
				// Not authorized → redirect
				navigate("/", { replace: true });
			} catch (err) {
				console.error("error", err);
				navigate("/", { replace: true });
			} finally {
				if (mounted) setChecking(false);
			}
		})();
		return () => {
			mounted = false;
		};
		// Intentionally omit getAccessToken: Privy may return a new function
		// reference often; re-running this effect causes session races / loops.
	}, [navigate]);

	if (checking) {
		return <div style={{ padding: 24, color: "white" }}>Checking admin session…</div>;
	}

	return (
		<div
			style={{
				padding: 24,
				color: "white",
				backgroundColor: "#000000",
				minHeight: "100vh",
				position: "relative",
				zIndex: 1,
			}}
		>
			<div
				style={{
					display: "flex",
					gap: 16,
					marginBottom: 16,
					flexWrap: "wrap",
					alignItems: "center",
				}}
			>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Markets</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTeam(null);
								updateView("markets-list", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "markets-list" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							List
						</button>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTeam(null);
								updateView("markets-add", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "markets-add" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							Add
						</button>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTeam(null);
								updateView("markets-resolve", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "markets-resolve" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							Resolve
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Tags</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("tags-list", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "tags-list" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							List
						</button>
						<button
							type="button"
							onClick={() => {
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("tags-add", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "tags-add" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							Add
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Series</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelectedTeam(null);
								updateView("series-list", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "series-list" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							List
						</button>
						<button
							type="button"
							onClick={() => {
								setSelectedTeam(null);
								updateView("series-add", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "series-add" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							Add
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Teams</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelectedTeam(null);
								updateView("teams-list", { teamId: null });
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "teams-list" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							List
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Profiles</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("profiles-list", {
									umbrellaId: null,
									teamId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "profiles-list" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							List
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Stats</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("stats", {
									umbrellaId: null,
									teamId: null,
									profileId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "stats" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							View
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Daily Games</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("daily-games-list", {
									umbrellaId: null,
									teamId: null,
									profileId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "daily-games-list" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							List
						</button>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("daily-games-add", {
									umbrellaId: null,
									teamId: null,
									profileId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background: view === "daily-games-add" ? "rgba(255,255,255,0.2)" : "transparent",
								color: "white",
							}}
						>
							Add
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Trade Testing</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("trade-testing", {
									umbrellaId: null,
									teamId: null,
									profileId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid #f59e0b",
								borderRadius: 6,
								background: view === "trade-testing" ? "rgba(245,158,11,0.2)" : "transparent",
								color: "#f59e0b",
							}}
						>
							🧪 Run Tests
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Wallet</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("wallet", {
									umbrellaId: null,
									teamId: null,
									profileId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid #8b5cf6",
								borderRadius: 6,
								background: view === "wallet" ? "rgba(139,92,246,0.2)" : "transparent",
								color: "#8b5cf6",
							}}
						>
							💰 Seeder Wallet
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Keys</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("keys", {
									umbrellaId: null,
									teamId: null,
									profileId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid #22c55e",
								borderRadius: 6,
								background: view === "keys" ? "rgba(34,197,94,0.2)" : "transparent",
								color: "#86efac",
							}}
						>
							keys
						</button>
					</div>
				</div>
				<div>
					<div style={{ fontWeight: 700, marginBottom: 8 }}>Venues</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								setSelectedTag(null);
								setSelectedTeam(null);
								updateView("venues", {
									umbrellaId: null,
									teamId: null,
									profileId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid #38bdf8",
								borderRadius: 6,
								background: view === "venues" ? "rgba(56,189,248,0.2)" : "transparent",
								color: "#7dd3fc",
							}}
						>
							Toggle
						</button>
					</div>
				</div>
			</div>

			{view === "markets-list" && (
				<ListMarket
					onEdit={(u) => {
						setSelected(u);
						updateView("markets-edit", { umbrellaId: u._id });
					}}
					refreshKey={umbrellasRevision}
				/>
			)}

			{view === "markets-add" && <AddMarket onCreated={handleMarketCreated} />}

			{view === "markets-resolve" && <ResolveMarkets />}

			{view === "markets-edit" && selected && (
				<EditMarket
					umbrella={selected}
					onBack={() => {
						setSelected(null);
						updateView("markets-list", { umbrellaId: null });
					}}
				/>
			)}

			{view === "tags-list" && (
				<ListTag
					onEdit={(t) => {
						setSelectedTag(t);
						updateView("tags-edit", { umbrellaId: null });
					}}
				/>
			)}

			{view === "tags-add" && (
				<AddTag onCreated={() => updateView("tags-list", { umbrellaId: null })} />
			)}

			{view === "tags-edit" && selectedTag && (
				<EditTag
					tag={selectedTag}
					onBack={() => {
						setSelectedTag(null);
						updateView("tags-list", { umbrellaId: null });
					}}
					onSaved={(next) => {
						setSelectedTag(next);
					}}
				/>
			)}

			{view === "series-list" && <ListSeries onMarketCreated={handleMarketCreated} />}

			{view === "series-add" && <AddSeries />}

			{view === "teams-list" && (
				<ListTeams
					onEdit={(teamRecord) => {
						setSelectedTeam(teamRecord);
						updateView("teams-edit", { teamId: teamRecord._id });
					}}
					refreshKey={teamsRevision}
				/>
			)}

			{view === "teams-edit" &&
				(teamLoading ? (
					<div style={{ padding: 12 }}>Loading team…</div>
				) : teamError ? (
					<div style={{ padding: 12, color: "#f87171" }}>{teamError}</div>
				) : selectedTeam ? (
					<EditTeam
						team={selectedTeam}
						onBack={() => {
							setSelectedTeam(null);
							updateView("teams-list", { teamId: null });
						}}
						onSaved={(updated) => {
							setSelectedTeam(updated);
							setTeamsRevision((prev) => prev + 1);
						}}
					/>
				) : (
					<div style={{ padding: 12 }}>Select a team from the list to edit.</div>
				))}

			{view === "profiles-list" && (
				<ListProfiles
					onView={(profileId) => {
						updateView("profiles-view", { profileId });
					}}
				/>
			)}

			{view === "profiles-view" && (
				<ViewProfile
					profileId={searchParams.get("profileId") || ""}
					onBack={() => {
						updateView("profiles-list", { profileId: null });
					}}
				/>
			)}

			{view === "stats" && <Stats />}

			{view === "daily-games-list" && (
				<ListDailyGames
					onAdd={() => {
						updateView("daily-games-add", {
							umbrellaId: null,
							teamId: null,
							profileId: null,
						});
					}}
				/>
			)}

			{view === "daily-games-add" && (
				<AddDailyGame
					onCreated={() => {
						updateView("daily-games-list", {
							umbrellaId: null,
							teamId: null,
							profileId: null,
						});
					}}
					onBack={() => {
						updateView("daily-games-list", {
							umbrellaId: null,
							teamId: null,
							profileId: null,
						});
					}}
				/>
			)}

			{view === "trade-testing" && <TradeTesting />}

			{view === "wallet" && <AdminWallet />}

			{view === "keys" && (
				<Suspense fallback={<div style={{ padding: 12, color: "#aaa" }}>Loading keys…</div>}>
					<AdminExportKeys />
				</Suspense>
			)}

			{view === "venues" && <AdminVenues />}
		</div>
	);
}
