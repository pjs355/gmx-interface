import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import AddMarket from "./components/Markets/AddMarket";
import ListMarket from "./components/Markets/ListMarket";
import EditMarket from "./components/Markets/EditMarket";
import ResolveMarkets from "./components/Markets/ResolveMarkets";
import ListTag, { type AdminTag } from "./components/Tags/ListTag";
import AddTag from "./components/Tags/AddTag";
import EditTag from "./components/Tags/EditTag";
import type { Umbrella } from "services/api/umbrellaDataService";

export default function Admin() {
	const navigate = useNavigate();
	const { getAccessToken } = usePrivy();
	const [checking, setChecking] = useState(true);
	const [view, setView] = useState<
		| "markets-list"
		| "markets-add"
		| "markets-resolve"
		| "markets-edit"
		| "tags-list"
		| "tags-add"
		| "tags-edit"
	>("markets-list");
	const [selected, setSelected] = useState<Umbrella | null>(null);
	const [selectedTag, setSelectedTag] = useState<AdminTag | null>(null);

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
							onClick={() => setView("markets-list")}
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
							onClick={() => setView("markets-add")}
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
							onClick={() => setView("markets-resolve")}
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
							onClick={() => setView("tags-list")}
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
							onClick={() => setView("tags-add")}
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
			</div>

			{view === "markets-list" && (
				<ListMarket
					onEdit={(u) => {
						setSelected(u);
						setView("markets-edit");
					}}
				/>
			)}

			{view === "markets-add" && <AddMarket />}

			{view === "markets-resolve" && <ResolveMarkets />}

			{view === "markets-edit" && selected && (
				<EditMarket
					umbrella={selected}
					onBack={() => {
						setView("markets-list");
						setSelected(null);
					}}
				/>
			)}

			{view === "tags-list" && (
				<ListTag
					onEdit={(t) => {
						setSelectedTag(t);
						setView("tags-edit");
					}}
				/>
			)}

			{view === "tags-add" && (
				<AddTag onCreated={() => setView("tags-list")} />
			)}

			{view === "tags-edit" && selectedTag && (
				<EditTag
					tag={selectedTag}
					onBack={() => {
						setView("tags-list");
						setSelectedTag(null);
					}}
					onSaved={(next) => {
						setSelectedTag(next);
					}}
				/>
			)}
		</div>
	);
}
