import { useEffect, useState, useMemo, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import {
	getUserAccount,
	getUserTransfers,
	fromMicroUnits,
	normalizeWalletAddress,
	type SubgraphAccount,
	type UserTransfers,
} from "@/services/subgraph/subgraphService";
import AccountHealthChecker, {
	HealthStatusIndicator,
	type AccountHealthResult,
} from "./AccountHealthChecker";

interface ListProfilesProps {
	onView?: (profileId: string) => void;
}

interface Profile {
	_id: string;
	userId: string;
	username?: string;
	email?: string;
	exp?: number;
	createdAt?: string;
	updatedAt?: string;
	linked_accounts?: any[];
	tradingVolume?: number;
	// Direct wallet properties (may exist alongside linked_accounts)
	smart_wallet?: string;
	wallet?: string;
}

interface ProfilesApiResponse {
	success: boolean;
	data: Profile[];
	error?: string;
}

interface LeaderboardEntry {
	wallet: string;
	username?: string | null;
	totalReturnUSD: number;
	effectiveCostUSD: number;
	totalReturnText: string;
	numTrades: number;
	numMarkets: number;
	updatedAt: string;
}

interface EnrichedProfile extends Profile {
	smartWalletAddress: string | null;
	portfolioValue: number;
	usdcBalance: number;
	tradingVolumeFromLeaderboard: number;
	pnl: number;
	pnlText: string;
	numTrades: number;
	lastTradeDate: Date | null;
}

type SortField = "lastTrade" | "portfolio" | "usdc" | "volume" | "pnl" | "trades";
type SortDirection = "asc" | "desc";

/**
 * Get smart wallet address from profile, checking multiple sources:
 * 1. linked_accounts with type "smart_wallet"
 * 2. Direct smart_wallet property on profile
 * 3. Direct wallet property on profile (fallback)
 */
function getSmartWalletAddress(profile: Profile): string | null {
	// First try linked_accounts
	const linkedSmartWallet = profile.linked_accounts?.find(
		(acc: any) => acc.type === "smart_wallet"
	);
	if (linkedSmartWallet?.address) {
		return linkedSmartWallet.address;
	}

	// Then try direct smart_wallet property
	if (profile.smart_wallet) {
		return profile.smart_wallet;
	}

	// Fallback to wallet property
	if (profile.wallet) {
		return profile.wallet;
	}

	return null;
}

export default function ListProfiles({ onView }: ListProfilesProps) {
	const { getAccessToken } = usePrivy();
	const [profiles, setProfiles] = useState<Profile[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [leaderboardData, setLeaderboardData] = useState<Map<string, LeaderboardEntry>>(new Map());
	const [subgraphData, setSubgraphData] = useState<Map<string, { account: SubgraphAccount | null; transfers: UserTransfers | null }>>(new Map());
	const [subgraphLoading, setSubgraphLoading] = useState<boolean>(false);
	const [sortField, setSortField] = useState<SortField>("lastTrade");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
	const [healthResults, setHealthResults] = useState<Map<string, AccountHealthResult>>(new Map());
	const [accessToken, setAccessToken] = useState<string | null>(null);

	// Fetch access token for health checker
	useEffect(() => {
		let mounted = true;
		async function fetchToken() {
			try {
				const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
				if (mounted && token) {
					setAccessToken(token);
				}
			} catch (err) {
				console.error("Failed to get access token:", err);
			}
		}
		fetchToken();
		return () => { mounted = false; };
	}, [getAccessToken]);

	// Callback for when health check completes
	const handleHealthResults = useCallback((results: Map<string, AccountHealthResult>) => {
		setHealthResults(results);
	}, []);

	// Fetch profiles from admin API
	useEffect(() => {
		let mounted = true;
		async function fetchProfiles() {
			setLoading(true);
			setError(null);
			try {
				const token =
					typeof getAccessToken === "function"
						? await getAccessToken()
						: undefined;
				if (!token) {
					throw new Error("Missing admin access token");
				}
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/admin/profiles`, {
					headers: { Authorization: `Bearer ${token}` },
				});
				const json = (await resp
					.json()
					.catch(() => ({} as any))) as ProfilesApiResponse;
				if (!resp.ok) {
					throw new Error(
						json?.error || `HTTP ${resp.status}`
					);
				}
				if (typeof json.success === "undefined") {
					throw new Error("Invalid response for profiles list");
				}
				if (mounted) {
					let profilesData: Profile[] = [];
					if (Array.isArray(json.data)) {
						profilesData = json.data;
					} else if (json.data) {
						profilesData = [json.data];
					}
					
					// Debug log to see what data we're getting
					console.log("[ListProfiles] Profiles fetched:", profilesData.length);
					if (profilesData.length > 0) {
						console.log("[ListProfiles] Sample profile structure:", {
							_id: profilesData[0]._id,
							username: profilesData[0].username,
							smart_wallet: profilesData[0].smart_wallet,
							wallet: profilesData[0].wallet,
							linked_accounts: profilesData[0].linked_accounts,
						});
					}
					
					setProfiles(profilesData);
				}
			} catch (err: any) {
				console.error("error", err);
				if (mounted) setError(err?.message || String(err));
			} finally {
				if (mounted) setLoading(false);
			}
		}
		fetchProfiles();
		return () => {
			mounted = false;
		};
	}, [getAccessToken]);

	// Fetch leaderboard data
	useEffect(() => {
		let mounted = true;
		async function fetchLeaderboard() {
			try {
				const base = getPredictionApiBaseUrl();
				const resp = await fetch(`${base}/leaderboard?limit=1000`);
				const json = await resp.json().catch(() => ({} as any));
				
				if (!resp.ok || json?.success === false) {
					console.warn("Failed to fetch leaderboard data");
					return;
				}

				let entries: any[] = [];
				if (json && json.data && Array.isArray(json.data.entries)) {
					entries = json.data.entries;
				} else if (json && Array.isArray(json.data)) {
					entries = json.data;
				} else if (Array.isArray(json)) {
					entries = json;
				}

				if (mounted) {
					const leaderboardMap = new Map<string, LeaderboardEntry>();
					entries.forEach((e: any) => {
						const wallet = normalizeWalletAddress(String(e.wallet || ""));
						leaderboardMap.set(wallet, {
							wallet,
							username: e.username ?? null,
							totalReturnUSD: Number(e.totalReturnUSD || 0),
							effectiveCostUSD: Number(e.effectiveCostUSD || 0),
							totalReturnText: String(e.totalReturnText || ""),
							numTrades: Number(e.numTrades || 0),
							numMarkets: Number(e.numMarkets || 0),
							updatedAt: String(e.updatedAt || ""),
						});
					});
					setLeaderboardData(leaderboardMap);
				}
			} catch (err) {
				console.error("Error fetching leaderboard:", err);
			}
		}
		fetchLeaderboard();
		return () => {
			mounted = false;
		};
	}, []);

	// Fetch subgraph data for each profile's smart wallet
	useEffect(() => {
		if (profiles.length === 0) return;

		let mounted = true;
		async function fetchSubgraphData() {
			setSubgraphLoading(true);
			const newSubgraphData = new Map<string, { account: SubgraphAccount | null; transfers: UserTransfers | null }>();

			// Get all smart wallet addresses using helper function
			const smartWallets: { profileId: string; address: string }[] = [];
			profiles.forEach((profile) => {
				const address = getSmartWalletAddress(profile);
				if (address) {
					smartWallets.push({
						profileId: profile._id,
						address,
					});
				}
			});
			
			console.log("[ListProfiles] Found smart wallets:", smartWallets.length, "out of", profiles.length, "profiles");

			// Fetch subgraph data in batches to avoid rate limiting
			const BATCH_SIZE = 5;
			for (let i = 0; i < smartWallets.length; i += BATCH_SIZE) {
				const batch = smartWallets.slice(i, i + BATCH_SIZE);
				
				await Promise.all(
					batch.map(async ({ profileId, address }) => {
						try {
							const [account, transfers] = await Promise.all([
								getUserAccount(address),
								getUserTransfers(address, 10), // Only need recent transfers for last trade date
							]);
							
							if (mounted) {
								newSubgraphData.set(profileId, { account, transfers });
							}
						} catch (err) {
							console.error(`Error fetching subgraph data for ${address}:`, err);
							if (mounted) {
								newSubgraphData.set(profileId, { account: null, transfers: null });
							}
						}
					})
				);

				// Small delay between batches to avoid rate limiting
				if (i + BATCH_SIZE < smartWallets.length) {
					await new Promise((resolve) => setTimeout(resolve, 300));
				}
			}

			if (mounted) {
				setSubgraphData(newSubgraphData);
				setSubgraphLoading(false);
			}
		}

		fetchSubgraphData();
		return () => {
			mounted = false;
		};
	}, [profiles]);

	// Calculate enriched profiles with all data
	const enrichedProfiles = useMemo((): EnrichedProfile[] => {
		return profiles.map((profile) => {
			// Get smart wallet address using helper function
			const smartWalletAddress = getSmartWalletAddress(profile);
			const normalizedWallet = smartWalletAddress ? normalizeWalletAddress(smartWalletAddress) : null;

			// Get leaderboard data for this wallet
			const leaderboardEntry = normalizedWallet ? leaderboardData.get(normalizedWallet) : null;

			// Get subgraph data
			const sgData = subgraphData.get(profile._id);
			const account = sgData?.account;
			const transfers = sgData?.transfers;

			// Calculate USDC balance from subgraph (micro-units to dollars)
			const usdcBalance = account?.usdcBalance
				? Number(fromMicroUnits(account.usdcBalance))
				: 0;

			// Calculate portfolio value from token balances
			// Sum all token balances (assuming ~$0.50 per share for estimation, since we don't have price data here)
			let portfolioValue = 0;
			if (account?.tokenBalances) {
				account.tokenBalances.forEach((tb) => {
					const balance = Number(fromMicroUnits(tb.balance));
					// Estimate at $0.50 per share (reasonable market average)
					portfolioValue += balance * 0.5;
				});
			}

			// Get trading volume and PnL from leaderboard
			const tradingVolumeFromLeaderboard = leaderboardEntry?.effectiveCostUSD || 0;
			const pnl = leaderboardEntry?.totalReturnUSD || 0;
			const pnlText = leaderboardEntry?.totalReturnText || (pnl >= 0 ? `+$${pnl.toFixed(2)}` : `-$${Math.abs(pnl).toFixed(2)}`);
			const numTrades = leaderboardEntry?.numTrades || 0;

			// Calculate last trade date from transfers
			let lastTradeDate: Date | null = null;
			if (transfers) {
				const allTransferTimestamps: number[] = [];
				
				// Get timestamps from all transfer types
				transfers.transfersIn?.forEach((t) => {
					if (t.blockTimestamp) {
						allTransferTimestamps.push(Number(t.blockTimestamp) * 1000);
					}
				});
				transfers.transfersOut?.forEach((t) => {
					if (t.blockTimestamp) {
						allTransferTimestamps.push(Number(t.blockTimestamp) * 1000);
					}
				});
				transfers.cashIn?.forEach((t) => {
					if (t.blockTimestamp) {
						allTransferTimestamps.push(Number(t.blockTimestamp) * 1000);
					}
				});
				transfers.cashOut?.forEach((t) => {
					if (t.blockTimestamp) {
						allTransferTimestamps.push(Number(t.blockTimestamp) * 1000);
					}
				});

				if (allTransferTimestamps.length > 0) {
					const latestTimestamp = Math.max(...allTransferTimestamps);
					lastTradeDate = new Date(latestTimestamp);
				}
			}

			// Fallback to createdAt if no trades
			if (!lastTradeDate && profile.createdAt) {
				lastTradeDate = new Date(profile.createdAt);
			}

			return {
				...profile,
				smartWalletAddress,
				portfolioValue,
				usdcBalance,
				tradingVolumeFromLeaderboard,
				pnl,
				pnlText,
				numTrades,
				lastTradeDate,
			};
		});
	}, [profiles, leaderboardData, subgraphData]);

	// Sort profiles
	const sortedProfiles = useMemo(() => {
		const sorted = [...enrichedProfiles].sort((a, b) => {
			let comparison = 0;
			
			switch (sortField) {
				case "lastTrade":
					const aTime = a.lastTradeDate?.getTime() || 0;
					const bTime = b.lastTradeDate?.getTime() || 0;
					comparison = aTime - bTime;
					break;
				case "portfolio":
					comparison = a.portfolioValue - b.portfolioValue;
					break;
				case "usdc":
					comparison = a.usdcBalance - b.usdcBalance;
					break;
				case "volume":
					comparison = a.tradingVolumeFromLeaderboard - b.tradingVolumeFromLeaderboard;
					break;
				case "pnl":
					comparison = a.pnl - b.pnl;
					break;
				case "trades":
					comparison = a.numTrades - b.numTrades;
					break;
			}
			
			return sortDirection === "desc" ? -comparison : comparison;
		});
		
		return sorted;
	}, [enrichedProfiles, sortField, sortDirection]);

	const handleSort = (field: SortField) => {
		if (sortField === field) {
			setSortDirection(sortDirection === "desc" ? "asc" : "desc");
		} else {
			setSortField(field);
			setSortDirection("desc");
		}
	};

	const getSortIndicator = (field: SortField) => {
		if (sortField !== field) return "";
		return sortDirection === "desc" ? " ↓" : " ↑";
	};

	if (loading) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				Loading profiles...
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ padding: 24, color: "red" }}>
				Error: {error}
			</div>
		);
	}

	return (
		<div style={{ padding: 24, color: "white" }}>
			<h2 style={{ marginBottom: 24 }}>Profiles</h2>

			{/* Account Health Checker */}
			{profiles.length > 0 && (
				<AccountHealthChecker
					profiles={profiles}
					accessToken={accessToken}
					onHealthResults={handleHealthResults}
				/>
			)}

			{subgraphLoading && (
				<div style={{ marginBottom: 16, color: "#888" }}>
					Loading blockchain data...
				</div>
			)}
			{profiles.length === 0 ? (
				<div>No profiles found.</div>
			) : (
				<div style={{ overflowX: "auto" }}>
					<table
						style={{
							width: "100%",
							borderCollapse: "collapse",
							backgroundColor: "#1a1a1a",
							minWidth: "1200px",
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
									Wallet Address
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
									}}
								>
									Username
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
										cursor: "pointer",
									}}
									onClick={() => handleSort("portfolio")}
								>
									Portfolio{getSortIndicator("portfolio")}
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
										cursor: "pointer",
									}}
									onClick={() => handleSort("usdc")}
								>
									USDC Balance{getSortIndicator("usdc")}
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
										cursor: "pointer",
									}}
									onClick={() => handleSort("volume")}
								>
									Trading Volume{getSortIndicator("volume")}
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
										cursor: "pointer",
									}}
									onClick={() => handleSort("pnl")}
								>
									P&L{getSortIndicator("pnl")}
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
										cursor: "pointer",
									}}
									onClick={() => handleSort("trades")}
								>
									Trades{getSortIndicator("trades")}
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
										cursor: "pointer",
									}}
									onClick={() => handleSort("lastTrade")}
								>
									Last Trade{getSortIndicator("lastTrade")}
								</th>
								<th
									style={{
										padding: "12px",
										textAlign: "left",
										borderBottom: "1px solid #333",
									}}
								>
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{sortedProfiles.map((profile) => {
								const pnlColor = profile.pnl >= 0 ? "#22c55e" : "#ef4444";
								
								return (
									<tr
										key={profile._id}
										style={{
											borderBottom: "1px solid #333",
										}}
									>
										<td 
											style={{ 
												padding: "12px", 
												fontFamily: "monospace", 
												fontSize: "12px",
												wordBreak: "break-all",
												maxWidth: "320px",
											}}
										>
											{profile.smartWalletAddress || "--"}
										</td>
										<td style={{ padding: "12px" }}>
											{profile.username || "--"}
										</td>
										<td style={{ padding: "12px" }}>
											{profile.portfolioValue > 0
												? `$${profile.portfolioValue.toFixed(2)}`
												: "--"}
										</td>
										<td style={{ padding: "12px" }}>
											{profile.usdcBalance > 0
												? `$${profile.usdcBalance.toFixed(2)}`
												: "--"}
										</td>
										<td style={{ padding: "12px" }}>
											{profile.tradingVolumeFromLeaderboard > 0
												? `$${profile.tradingVolumeFromLeaderboard.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
												: "--"}
										</td>
										<td style={{ padding: "12px", color: profile.pnl !== 0 ? pnlColor : "inherit" }}>
											{profile.numTrades > 0
												? profile.pnlText
												: "--"}
										</td>
										<td style={{ padding: "12px" }}>
											{profile.numTrades > 0 ? profile.numTrades : "--"}
										</td>
										<td style={{ padding: "12px" }}>
											{profile.lastTradeDate
												? profile.lastTradeDate.toLocaleDateString()
												: "--"}
										</td>
										<td style={{ padding: "12px", display: "flex", gap: "8px", alignItems: "center" }}>
											<button
												type="button"
												onClick={() => {
													if (onView) {
														onView(profile._id);
													}
												}}
												style={{
													padding: "6px 12px",
													border: "1px solid rgba(255, 255, 255, 0.3)",
													borderRadius: 4,
													background: "rgba(106, 111, 245, 0.2)",
													color: "white",
													cursor: "pointer",
													fontSize: "14px",
												}}
											>
												View
											</button>
											{profile.smartWalletAddress && (
												<>
													<button
														type="button"
														onClick={() => {
															// Use the global spoofAccount function (same as console command)
															(window as any).spoofAccount(profile.smartWalletAddress);
															// Navigate to positions page with full reload
															window.location.assign('/positions');
														}}
														style={{
															padding: "6px 12px",
															border: "1px solid #22c55e",
															borderRadius: 4,
															background: "rgba(34, 197, 94, 0.2)",
															color: "#22c55e",
															cursor: "pointer",
															fontSize: "14px",
														}}
													>
														👤 Spoof
													</button>
													<HealthStatusIndicator
														result={healthResults.get(profile._id) || null}
														size={20}
													/>
												</>
											)}
										</td>
									</tr>
								);
							})}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
