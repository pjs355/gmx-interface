import { useEffect, useState, useMemo } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { usePredictionData } from "@/context/PredictionDataContext";
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
	const { getAccessToken, user } = usePrivy();
	const { account } = useSignerContext();
	const { orders, tokenBalances } = useUserData();
	const { allBooksPreview } = usePredictionData();
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
				const url = `${base}/leaderboard?limit=1000`;
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

				console.log(
					"[Leaderboard] Raw entries from API:",
					entries.length
				);

				// Map all entries
				const allEntries: LeaderboardEntry[] = entries.map(
					(e: any) => ({
						wallet: String(e.wallet || ""),
						username: e.username ?? null,
						totalReturnUSD: Number(e.totalReturnUSD || 0),
						effectiveCostUSD: Number(e.effectiveCostUSD || 0),
						totalReturnText: String(e.totalReturnText || ""),
						numTrades: Number(e.numTrades || 0),
						numMarkets: Number(e.numMarkets || 0),
						updatedAt: String(e.updatedAt || ""),
					})
				);

				console.log(
					"[Leaderboard] All mapped entries:",
					allEntries.length
				);
				const negativeCount = allEntries.filter(
					(e) => e.totalReturnUSD < 0
				).length;
				const positiveCount = allEntries.filter(
					(e) => e.totalReturnUSD >= 0
				).length;
				console.log(
					"[Leaderboard] Negative entries:",
					negativeCount,
					"Positive entries:",
					positiveCount,
					"Zero entries:",
					allEntries.filter((e) => e.totalReturnUSD === 0).length
				);
				console.log(
					"[Leaderboard] Entries with 0 trades:",
					allEntries.filter((e) => e.numTrades === 0).length
				);

				// Filter out entries with 0 trades
				const filteredEntries = allEntries.filter(
					(entry) => entry.numTrades > 0
				);

				console.log(
					"[Leaderboard] After filtering numTrades > 0:",
					filteredEntries.length
				);

				// Sort by totalReturnUSD (descending)
				const sorted = [...filteredEntries].sort(
					(a, b) => b.totalReturnUSD - a.totalReturnUSD
				);

				console.log("[Leaderboard] After sorting:", sorted.length);
				console.log(
					"[Leaderboard] First 10 totalReturnUSD values:",
					sorted.slice(0, 10).map((e) => ({
						totalReturnUSD: e.totalReturnUSD,
						numTrades: e.numTrades,
						wallet: e.wallet.slice(0, 8),
					}))
				);
				console.log(
					"[Leaderboard] Last 10 totalReturnUSD values:",
					sorted.slice(-10).map((e) => ({
						totalReturnUSD: e.totalReturnUSD,
						numTrades: e.numTrades,
						wallet: e.wallet.slice(0, 8),
					}))
				);

				// Limit to top 25 for frontend display
				const top25 = sorted.slice(0, 25);
				console.log(
					"[Leaderboard] Showing top 25 entries (from",
					sorted.length,
					"total entries with trades):",
					top25.length
				);

				if (mounted) setData(top25);
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

	// Calculate user's account stats
	const userStats = useMemo(() => {
		if (!account) return null;
		
		// Show stats even with no orders (will show zeros)
		if (!orders || orders.length === 0) {
			return {
				wallet: account,
				username:
					user?.email?.address ||
					user?.google?.email ||
					user?.twitter?.username ||
					null,
				totalReturnUSD: 0,
				effectiveCostUSD: 0,
				totalReturnText: "+$0.00 (+0%)",
				numTrades: 0,
				numMarkets: 0,
				updatedAt: new Date().toISOString(),
			};
		}

		// Calculate volume (total USDC spent on buys)
		const totalVolume = orders
			.filter((order) => order.filled && order.side === "buy")
			.reduce((sum, order) => sum + order.usdcValue, 0);

		// Calculate number of trades (filled orders)
		const numTrades = orders.filter((order) => order.filled).length;

		// Calculate number of unique markets
		const uniqueMarkets = new Set(orders.map((order) => order.questionId));
		const numMarkets = uniqueMarkets.size;

		// Calculate P&L (current market value + realized P&L - cost)
		let totalMarketValue = 0;
		let totalCost = 0;

		// Process all filled orders to calculate cost and realized P&L
		const filledOrders = orders.filter((order) => order.filled);
		
		// Calculate total cost (buys - sells)
		filledOrders.forEach((order) => {
			if (order.side === "buy") {
				totalCost += order.usdcValue;
			} else {
				// Subtract sell proceeds from cost (realized gains)
				totalCost -= order.usdcValue;
			}
		});

		// Calculate current market value of holdings
		tokenBalances.forEach((balance, marketId) => {
			const yesBalance = Number(balance.yesBalance);
			const noBalance = Number(balance.noBalance);
			
			if (yesBalance > 0 || noBalance > 0) {
				// Get prices from allBooksPreview
				const preview = allBooksPreview[marketId];
				const yesPrice = preview?.lowestAsk ?? null;
				const noPrice =
					preview?.highestBid !== null &&
					preview?.highestBid !== undefined
						? 1 - preview.highestBid
						: null;

				// Calculate market value
				if (yesPrice !== null && yesBalance > 0) {
					totalMarketValue += yesBalance * yesPrice;
				}
				if (noPrice !== null && noBalance > 0) {
					totalMarketValue += noBalance * noPrice;
				}
			}
		});

		// Total return = market value - net cost
		const totalReturn = totalMarketValue - totalCost;

		// Format return text like leaderboard
		const isPositive = totalReturn >= 0;
		const sign = isPositive ? "+" : "-";
		const absReturn = Math.abs(totalReturn);
		const returnPct =
			totalVolume > 0 ? (totalReturn / totalVolume) * 100 : 0;
		const pctSign = returnPct >= 0 ? "+" : "-";
		const totalReturnText = `${sign}$${absReturn.toLocaleString(
			undefined,
			{
				minimumFractionDigits: 2,
				maximumFractionDigits: 2,
			}
		)} (${pctSign}${Math.abs(returnPct).toFixed(0)}%)`;

		return {
			wallet: account,
			username:
				user?.email?.address ||
				user?.google?.email ||
				user?.twitter?.username ||
				null,
			totalReturnUSD: totalReturn,
			effectiveCostUSD: totalVolume,
			totalReturnText,
			numTrades,
			numMarkets,
			updatedAt: new Date().toISOString(),
		};
	}, [account, orders, tokenBalances, allBooksPreview, user]);

	// Debug logging
	console.log("[Leaderboard] User stats:", {
		account,
		hasOrders: orders?.length > 0,
		userStats,
		ordersCount: orders?.length,
	});

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
			<h1>Top 25 Leaderboard</h1>
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

			{/* User's Account Stats */}
			{!loading && !error && userStats && (() => {
				console.log("[Leaderboard] Rendering My Account section with stats:", userStats);
				return (
				<div className="Leaderboard-my-account">
					<h2 className="Leaderboard-my-account-title">My Account</h2>
					<div className="Leaderboard-my-account-divider"></div>
					<div className="Leaderboard-list">
						{/* Desktop Headers */}
						<div className="Leaderboard-header">
							<div className="Leaderboard-header-username">
								Username
							</div>
							<div className="Leaderboard-header-return">P&L</div>
							<div className="Leaderboard-header-cost">
								Volume
							</div>
							<div className="Leaderboard-header-trades">
								Trades
							</div>
							<div className="Leaderboard-header-markets">
								Markets
							</div>
						</div>
						<div className="Leaderboard-entry">
							<div className="Leaderboard-rank-username">
								<div className="Leaderboard-rank">—</div>
								<div className="Leaderboard-username">
									{userStats.username &&
									userStats.username.trim().length > 0
										? userStats.username
										: `${userStats.wallet.slice(
												0,
												6
										  )}...${userStats.wallet.slice(-4)}`}
								</div>
							</div>
							<div
								className={`Leaderboard-return ${
									userStats.totalReturnUSD >= 0
										? "positive"
										: "negative"
								}`}
							>
								<span>{userStats.totalReturnText}</span>
							</div>
							<div className="Leaderboard-cost">
								<span>
									$
									{Number(
										userStats.effectiveCostUSD
									).toLocaleString(undefined, {
										maximumFractionDigits: 2,
									})}
								</span>
							</div>
							<div className="Leaderboard-trades">
								<span>{userStats.numTrades}</span>
							</div>
							<div className="Leaderboard-markets">
								<span>{userStats.numMarkets}</span>
							</div>
						</div>
					</div>
				</div>
				);
			})()}
		</div>
	);
}
