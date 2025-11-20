import { useEffect, useState } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { usePrivy } from "@privy-io/react-auth";
import rank1Icon from "@/assets/img/rank1.svg";
import rank2Icon from "@/assets/img/rank2.svg";
import rank3Icon from "@/assets/img/rank3.svg";
import "./Leaderboard.scss";

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

	const getRankIcon = (position: number) => {
		// Position 1: Gold
		if (position === 1) {
				return rank1Icon;
		}
		// Positions 2, 3, 4: Silver
		if (position >= 2 && position <= 4) {
				return rank2Icon;
		}
		// Positions 5, 6, 7, 8, 9: Bronze
		if (position >= 5 && position <= 9) {
				return rank3Icon;
		}
		// Everything else: no icon
		return null;
	};

	return (
		<div className="Leaderboard">
			<h1>Leaderboard</h1>
			{loading && <div className="Leaderboard-loading">Loading…</div>}
			{error && <div className="Leaderboard-error">{error}</div>}
			{!loading && !error && (
				<div className="Leaderboard-list">
					{/* Desktop Headers */}
					<div className="Leaderboard-header">
						<div className="Leaderboard-header-username">
							Username
						</div>
						<div className="Leaderboard-header-return">P&L</div>
						<div className="Leaderboard-header-cost">Volume</div>
						<div className="Leaderboard-header-trades">Trades</div>
						<div className="Leaderboard-header-markets">
							Markets
						</div>
					</div>
					{data.map((row, idx) => {
						const position = idx + 1;
						const rankIcon = getRankIcon(position);
						const isPositive = row.totalReturnUSD >= 0;

						return (
							<div
								key={`${row.wallet}-${idx}`}
								className="Leaderboard-entry"
							>
								<div className="Leaderboard-rank-username">
									<div className="Leaderboard-rank">
										{rankIcon ? (
											<img
												src={rankIcon}
												alt={`Rank ${position}`}
												className="Leaderboard-rank-icon"
											/>
										) : (
											`#${position}`
										)}
									</div>
									<div className="Leaderboard-username">
										{row.username &&
										row.username.trim().length > 0
											? row.username
											: `${row.wallet.slice(
													0,
													6
											  )}...${row.wallet.slice(-4)}`}
									</div>
								</div>
								<div
									className={`Leaderboard-return ${
										isPositive ? "positive" : "negative"
									}`}
								>
									<span>{row.totalReturnText}</span>
								</div>
								<div className="Leaderboard-cost">
									<span>
										$
										{Number(
											row.effectiveCostUSD
										).toLocaleString(undefined, {
											maximumFractionDigits: 2,
										})}
									</span>
								</div>
								<div className="Leaderboard-trades">
									<span>{row.numTrades}</span>
								</div>
								<div className="Leaderboard-markets">
									<span>{row.numMarkets}</span>
								</div>
							</div>
						);
					})}
					{data.length === 0 && (
						<div className="Leaderboard-empty">No entries yet.</div>
					)}
				</div>
			)}
		</div>
	);
}
