import { useEffect, useState } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { usePrivy } from "@privy-io/react-auth";

type LeaderboardEntry = {
	wallet: string;
	username?: string | null;
	totalReturnUSD: number;
	effectiveCostUSD: number;
	totalReturnText: string;
	numTrades: number;
	numMarkets: number;
	updatedAt: string;
};

export default function Leaderboard() {
	const { getAccessToken } = usePrivy();
	const [data, setData] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		async function load() {
			setLoading(true);
			setError(null);
			try {
				const base = getPredictionApiBaseUrl();
				const token =
					typeof getAccessToken === "function"
						? await getAccessToken()
						: undefined;
				const url = `${base}/leaderboard`;
				console.log("[Leaderboard] Fetching:", { base, url });
				const resp = await fetch(url, {
					headers: {
						...(token ? { Authorization: `Bearer ${token}` } : {}),
					},
				});
				console.log(
					"[Leaderboard] HTTP status:",
					resp.status,
					resp.statusText
				);
				const json = await resp.json().catch(() => ({} as any));
				console.log("[Leaderboard] Response JSON:", json);
				if (!resp.ok || json?.success === false) {
					throw new Error(json?.error || `HTTP ${resp.status}`);
				}
				let entries: any[] = [];
				if (json && json.data && Array.isArray(json.data.entries)) {
					entries = json.data.entries as any[];
				} else if (json && Array.isArray(json.data)) {
					entries = json.data as any[];
				} else if (Array.isArray(json)) {
					entries = json as any[];
				}

				const arr: LeaderboardEntry[] = entries.map((e: any) => ({
					wallet: String(e.wallet || ""),
					username: e.username ?? null,
					totalReturnUSD: Number(e.totalReturnUSD || 0),
					effectiveCostUSD: Number(e.effectiveCostUSD || 0),
					totalReturnText: String(e.totalReturnText || ""),
					numTrades: Number(e.numTrades || 0),
					numMarkets: Number(e.numMarkets || 0),
					updatedAt: String(e.updatedAt || ""),
				}));
				const sorted = [...arr].sort(
					(a, b) => b.totalReturnUSD - a.totalReturnUSD
				);
				if (mounted) setData(sorted);
			} catch (e: any) {
				if (mounted) setError(e?.message || String(e));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		load();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	return (
		<div style={{ padding: 24, color: "white" }}>
			<h1>Leaderboard</h1>
			{loading && <div style={{ opacity: 0.8 }}>Loading…</div>}
			{error && <div style={{ color: "#ff6b6b" }}>{error}</div>}
			{!loading && !error && (
				<div style={{ marginTop: 12, display: "grid", gap: 8 }}>
					{data.map((row, idx) => (
						<div
							key={`${row.wallet}-${idx}`}
							style={{
								display: "grid",
								gridTemplateColumns:
									"48px 2.5fr 1.2fr 1.2fr 1fr 1fr",
								gap: 12,
								alignItems: "center",
								border: "1px solid rgba(255,255,255,0.2)",
								borderRadius: 8,
								padding: 12,
								background: "rgba(255,255,255,0.03)",
							}}
						>
							<div style={{ opacity: 0.8 }}>#{idx + 1}</div>
							<div
								style={{
									overflow: "hidden",
									textOverflow: "ellipsis",
								}}
							>
								{row.username && row.username.trim().length > 0
									? row.username
									: `${row.wallet.slice(
											0,
											6
									  )}...${row.wallet.slice(-4)}`}
							</div>
							<div style={{ textAlign: "right" }}>
								{row.totalReturnText}
							</div>
							<div style={{ textAlign: "right" }}>
								$
								{Number(row.effectiveCostUSD).toLocaleString(
									undefined,
									{ maximumFractionDigits: 2 }
								)}
							</div>
							<div style={{ textAlign: "right", opacity: 0.9 }}>
								{row.numTrades} trades
							</div>
							<div style={{ textAlign: "right", opacity: 0.8 }}>
								{row.numMarkets} markets
							</div>
						</div>
					))}
					{data.length === 0 && (
						<div style={{ opacity: 0.8 }}>No entries yet.</div>
					)}
				</div>
			)}
		</div>
	);
}
