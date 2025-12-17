import { useEffect, useState, useMemo } from "react";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "@/context/SignerContext";
import { useUserData } from "@/context/UserDataContext";
import { usePredictionData } from "@/context/PredictionDataContext";
import { getTradingReturns, getFinalAmount } from "@/services/api/simplifiedOrderService";
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
	const { orders } = useUserData();
	const { resolvedMarketsByUmbrella } = usePredictionData();
	const [data, setData] = useState<LeaderboardEntry[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		console.log("[Leaderboard] ===== useEffect triggered, starting API fetch =====");
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
				console.log("[Leaderboard] Fetching:", { base, url, hasToken: !!token });
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
				const json = await resp.json().catch((e) => {
					console.error("[Leaderboard] JSON parse error:", e);
					return {} as any;
				});
				console.log("[Leaderboard] Response JSON keys:", Object.keys(json || {}));
				console.log("[Leaderboard] Response JSON:", json);
				if (!resp.ok || json?.success === false) {
					throw new Error(json?.error || `HTTP ${resp.status}`);
				}
				let entries: any[] = [];
				if (json && json.data && Array.isArray(json.data.entries)) {
					console.log("[Leaderboard] Found entries at json.data.entries");
					entries = json.data.entries as any[];
				} else if (json && Array.isArray(json.data)) {
					console.log("[Leaderboard] Found entries at json.data");
					entries = json.data as any[];
				} else if (Array.isArray(json)) {
					console.log("[Leaderboard] Found entries at json root");
					entries = json as any[];
				} else if (json && json.entries && Array.isArray(json.entries)) {
					console.log("[Leaderboard] Found entries at json.entries");
					entries = json.entries as any[];
				} else {
					console.warn("[Leaderboard] Could not find entries array in response structure:", {
						hasData: !!json?.data,
						dataIsArray: Array.isArray(json?.data),
						hasDataEntries: !!json?.data?.entries,
						hasEntries: !!json?.entries,
						jsonType: typeof json
					});
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

	// Calculate user's account stats - REALIZED P&L ONLY
	// This includes: (1) Trading P&L from buy-sell pairs, (2) Settlement P&L from resolved markets
	// It does NOT include unrealized gains from open positions in live markets
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

		// Calculate number of trades (filled orders)
		const numTrades = orders.filter((order) => order.filled).length;

		// Calculate number of unique markets
		const uniqueMarkets = new Set(orders.map((order) => order.questionId));
		const numMarkets = uniqueMarkets.size;

		// Calculate total buy cost for volume display
		const totalBuyCost = orders
			.filter((order) => order.filled && order.side === "buy")
			.reduce((sum, order) => sum + order.usdcValue, 0);

		// ============================================================
		// REALIZED P&L CALCULATION (only closed positions)
		// ============================================================
		let totalRealizedPnL = 0;
		const debugPnlInfo: Array<{
			marketId: string;
			tradingPnL: number;
			settlementPnL: number;
			isResolved: boolean;
			resolvedOutcome: string | null;
		}> = [];

		// Get all unique market IDs the user has traded
		const tradedMarketIds = new Set(
			orders.filter((o) => o.filled).map((o) => o.questionId)
		);

		// Build a map of resolved markets for quick lookup
		const resolvedMarketsMap = new Map<string, { outcome: string; market: any }>();
		Object.values(resolvedMarketsByUmbrella).forEach((markets: any[]) => {
			markets.forEach((market: any) => {
				const marketId = market._id || market.questionId || market.marketId;
				const outcome = String(market.resolvedOutcome || "").toLowerCase();
				if (marketId && outcome) {
					resolvedMarketsMap.set(marketId, { outcome, market });
				}
			});
		});

		// Calculate P&L for each traded market
		tradedMarketIds.forEach((marketId) => {
			// 1. Calculate TRADING P&L (from buy-sell pairs using FIFO)
			const tradingReturns = getTradingReturns(orders, marketId);
			const tradingPnL = tradingReturns.yesPnL + tradingReturns.noPnL;

			// 2. Calculate SETTLEMENT P&L (from resolved markets)
			let settlementPnL = 0;
			const resolved = resolvedMarketsMap.get(marketId);
			const isResolved = !!resolved;

			if (isResolved) {
				// Get final position and cost for this market
				const finalAmounts = getFinalAmount(orders, marketId);
				
				// Calculate settlement payout based on resolved outcome
				// Winning side gets $1 per share, losing side gets $0
				if (resolved.outcome === "yes") {
					// YES won: YES shares get $1 each, NO shares get $0
					const yesPayout = finalAmounts.yesShares * 1;
					const noPayout = 0;
					// Settlement P&L = Payout - Cost of remaining shares
					settlementPnL = (yesPayout - finalAmounts.yesCost) + (noPayout - finalAmounts.noCost);
				} else if (resolved.outcome === "no") {
					// NO won: NO shares get $1 each, YES shares get $0
					const yesPayout = 0;
					const noPayout = finalAmounts.noShares * 1;
					// Settlement P&L = Payout - Cost of remaining shares
					settlementPnL = (yesPayout - finalAmounts.yesCost) + (noPayout - finalAmounts.noCost);
				}
			}

			// Total P&L for this market = trading + settlement
			const marketPnL = tradingPnL + settlementPnL;
			totalRealizedPnL += marketPnL;

			debugPnlInfo.push({
				marketId: marketId.slice(0, 8) + '...',
				tradingPnL,
				settlementPnL,
				isResolved,
				resolvedOutcome: resolved?.outcome || null,
			});
		});

		// Debug logging
		console.log("[Leaderboard Realized PnL Debug]", {
			totalRealizedPnL,
			totalBuyCost,
			numTrades,
			numMarkets: tradedMarketIds.size,
			resolvedMarketsCount: resolvedMarketsMap.size,
			debugPnlInfo
		});

		// Format return text like leaderboard
		const isPositive = totalRealizedPnL >= 0;
		const sign = isPositive ? "+" : "-";
		const absReturn = Math.abs(totalRealizedPnL);
		const returnPct =
			totalBuyCost > 0 ? (totalRealizedPnL / totalBuyCost) * 100 : 0;
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
			totalReturnUSD: totalRealizedPnL,
			effectiveCostUSD: totalBuyCost,
			totalReturnText,
			numTrades,
			numMarkets,
			updatedAt: new Date().toISOString(),
		};
	}, [account, orders, user, resolvedMarketsByUmbrella]);

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
						<div className="Leaderboard-header-return">Realized P&L</div>
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
							<div className="Leaderboard-header-return">Realized P&L</div>
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
