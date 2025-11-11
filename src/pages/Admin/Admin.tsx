import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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
import {
	umbrellaDataService,
	type Umbrella,
} from "@/services/api/umbrellaDataService";
import { usePredictionData } from "@/context/PredictionDataContext";

type AdminView =
	| "markets-list"
	| "markets-add"
	| "markets-resolve"
	| "markets-edit"
	| "tags-list"
	| "tags-add"
	| "tags-edit"
	| "series-list"
	| "series-add";

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
	const { refresh: refreshPredictionData } = usePredictionData();
	const [checking, setChecking] = useState(true);
	const [selected, setSelected] = useState<Umbrella | null>(null);
	const [selectedTag, setSelectedTag] = useState<AdminTag | null>(null);
	const [umbrellasRevision, setUmbrellasRevision] = useState(0);
	const pendingRefreshRef = useRef(false);

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
				{ replace: false }
			);
		},
		[setSearchParams]
	);

	const runUmbrellaRefresh = useCallback(async () => {
		// Give backend processes (e.g., image propagation) a brief window
		await new Promise((resolve) => setTimeout(resolve, 1500));
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
				const fetched = await umbrellaDataService.fetchUmbrellaById(
					umbrellaId
				);
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
		let mounted = true;
		(async () => {
			try {
				const token =
					typeof getAccessToken === "function"
						? await getAccessToken()
						: undefined;
				const resp = await fetch(
					`${getPredictionApiBaseUrl()}/admin/session`,
					{
						method: "POST",
						headers: {
							"Content-Type": "application/json",
							...(token
								? { Authorization: `Bearer ${token}` }
								: {}),
						},
					}
				);
				if (!mounted) return;
				if (resp.ok) {
					setChecking(false);
					return;
				}
				// Not authorized → redirect
				navigate("/predictions", { replace: true });
			} catch (err) {
				console.error("error", err);
				navigate("/predictions", { replace: true });
			} finally {
				if (mounted) setChecking(false);
			}
		})();
		return () => {
			mounted = false;
		};
	}, [getAccessToken, navigate]);

	if (checking) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				Checking admin session…
			</div>
		);
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
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
					<div style={{ fontWeight: 700, marginBottom: 8 }}>
						Markets
					</div>
					<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								updateView("markets-list", { umbrellaId: null });
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background:
									view === "markets-list"
										? "rgba(255,255,255,0.2)"
										: "transparent",
								color: "white",
							}}
						>
							List
						</button>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								updateView("markets-add", { umbrellaId: null });
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background:
									view === "markets-add"
										? "rgba(255,255,255,0.2)"
										: "transparent",
								color: "white",
							}}
						>
							Add
						</button>
						<button
							type="button"
							onClick={() => {
								setSelected(null);
								updateView("markets-resolve", {
									umbrellaId: null,
								});
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background:
									view === "markets-resolve"
										? "rgba(255,255,255,0.2)"
										: "transparent",
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
								updateView("tags-list", { umbrellaId: null });
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background:
									view === "tags-list"
										? "rgba(255,255,255,0.2)"
										: "transparent",
								color: "white",
							}}
						>
							List
						</button>
						<button
							type="button"
							onClick={() => {
								setSelectedTag(null);
								updateView("tags-add", { umbrellaId: null });
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background:
									view === "tags-add"
										? "rgba(255,255,255,0.2)"
										: "transparent",
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
								updateView("series-list", { umbrellaId: null });
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background:
									view === "series-list"
										? "rgba(255,255,255,0.2)"
										: "transparent",
								color: "white",
							}}
						>
							List
						</button>
						<button
							type="button"
							onClick={() => {
								updateView("series-add", { umbrellaId: null });
							}}
							style={{
								padding: "6px 10px",
								border: "1px solid white",
								borderRadius: 6,
								background:
									view === "series-add"
										? "rgba(255,255,255,0.2)"
										: "transparent",
								color: "white",
							}}
						>
							Add
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

			{view === "markets-add" && (
				<AddMarket onCreated={handleMarketCreated} />
			)}

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
				<AddTag
					onCreated={() => updateView("tags-list", { umbrellaId: null })}
				/>
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

			{view === "series-list" && <ListSeries />}

			{view === "series-add" && <AddSeries />}
		</div>
	);
}
