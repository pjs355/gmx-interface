import { useEffect, useState, useMemo, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { getUSDCAddress } from "@/config/addresses";
import { DEFAULT_RPC_URL } from "@/config/rpc";
import { usePredictionData } from "@/context/PredictionDataContext";
import { fetchNonZeroCtfBalancesRpc } from "@/helpers/fetchNonZeroCtfBalancesRpc";
import { fromMicroUnits } from "@/helpers/ctfMicroUnits";
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

interface EnrichedProfile extends Profile {
	smartWalletAddress: string | null;
	portfolioValue: number;
	usdcBalance: number;
	profileActivityDate: Date | null;
}

type SortField = "profileActivity" | "portfolio" | "usdc";
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
	const {
		umbrellas,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
	} = usePredictionData();
	const [profiles, setProfiles] = useState<Profile[]>([]);
	const [loading, setLoading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);
	const [onChainEnrichment, setOnChainEnrichment] = useState<
		Map<string, { usdcBalance: number; portfolioEstimate: number }>
	>(new Map());
	const [onChainLoading, setOnChainLoading] = useState<boolean>(false);
	const [sortField, setSortField] = useState<SortField>("portfolio");
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

	const knownCtfTokenIds = useMemo(() => {
		const ids: string[] = [];
		umbrellas.forEach(u => {
			const qs = getAllQuestionsForUmbrella(u._id) || [];
			qs.forEach((market: any) => {
				if (market?.yesTokenId) ids.push(String(market.yesTokenId));
				if (market?.noTokenId) ids.push(String(market.noTokenId));
			});
		});
		Object.values(resolvedMarketsByUmbrella).forEach((markets: any[]) => {
			markets.forEach((market: any) => {
				if (market?.yesTokenId) ids.push(String(market.yesTokenId));
				if (market?.noTokenId) ids.push(String(market.noTokenId));
			});
		});
		return ids;
	}, [umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella]);

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

	useEffect(() => {
		if (profiles.length === 0) return;

		let mounted = true;

		async function loadRpcEnrichment(): Promise<void> {
			const smartWallets: { profileId: string; address: string }[] = [];
			profiles.forEach((profile) => {
				const address = getSmartWalletAddress(profile);
				if (address) {
					smartWallets.push({ profileId: profile._id, address });
				}
			});

			console.log("[ListProfiles] Found smart wallets:", smartWallets.length, "out of", profiles.length, "profiles");

			if (smartWallets.length === 0) {
				if (mounted) {
					setOnChainEnrichment(new Map());
					setOnChainLoading(false);
				}
				return;
			}

			setOnChainLoading(true);

			try {
				const provider = new JsonRpcProvider(DEFAULT_RPC_URL);
				const usdcContract = new Contract(
					getUSDCAddress(),
					[
						"function balanceOf(address account) view returns (uint256)",
						"function decimals() view returns (uint8)",
					],
					provider,
				);
				let usdcDecimals: number;
				try {
					usdcDecimals = Number(await usdcContract.decimals());
				} catch (err) {
					console.error("error", err);
					throw err;
				}

				const merged = new Map<string, { usdcBalance: number; portfolioEstimate: number }>();
				const BATCH_SIZE = 5;

				for (let i = 0; i < smartWallets.length; i += BATCH_SIZE) {
					const batch = smartWallets.slice(i, i + BATCH_SIZE);

					await Promise.all(
						batch.map(async ({ profileId, address }) => {
							try {
								const rawUsdc = await usdcContract.balanceOf(address);
								const usdcBalanceNum = Number.parseFloat(formatUnits(rawUsdc, usdcDecimals));
								let portfolioEstimate = 0;
								if (knownCtfTokenIds.length > 0) {
									const nonzero = await fetchNonZeroCtfBalancesRpc(provider, address, knownCtfTokenIds);
									portfolioEstimate = nonzero.reduce((acc, row) => {
										return acc + Number(fromMicroUnits(row.balance)) * 0.5;
									}, 0);
								}
								if (mounted) {
									merged.set(profileId, { usdcBalance: usdcBalanceNum, portfolioEstimate });
								}
							} catch (err) {
								console.error("error", err);
								if (mounted) {
									merged.set(profileId, { usdcBalance: 0, portfolioEstimate: 0 });
								}
							}
						}),
					);

					if (i + BATCH_SIZE < smartWallets.length) {
						await new Promise((resolve) => setTimeout(resolve, 300));
					}
				}

				if (mounted) {
					setOnChainEnrichment(merged);
				}
			} catch (err) {
				console.error("error", err);
				if (mounted) {
					setOnChainEnrichment(new Map());
				}
			} finally {
				if (mounted) {
					setOnChainLoading(false);
				}
			}
		}

		void loadRpcEnrichment();

		return () => {
			mounted = false;
		};
	}, [profiles, knownCtfTokenIds]);

	// Calculate enriched profiles with all data
	const enrichedProfiles = useMemo((): EnrichedProfile[] => {
		return profiles.map((profile) => {
			const smartWalletAddress = getSmartWalletAddress(profile);
			const row = onChainEnrichment.get(profile._id);
			const portfolioValue = row?.portfolioEstimate ?? 0;
			const usdcBalance = row?.usdcBalance ?? 0;

			const profileActivityDate = profile.updatedAt
				? new Date(profile.updatedAt)
				: profile.createdAt
					? new Date(profile.createdAt)
					: null;

			return {
				...profile,
				smartWalletAddress,
				portfolioValue,
				usdcBalance,
				profileActivityDate,
			};
		});
	}, [profiles, onChainEnrichment]);

	// Sort profiles
	const sortedProfiles = useMemo(() => {
		const sorted = [...enrichedProfiles].sort((a, b) => {
			let comparison = 0;
			
			switch (sortField) {
				case "profileActivity":
					const aTime = a.profileActivityDate?.getTime() || 0;
					const bTime = b.profileActivityDate?.getTime() || 0;
					comparison = aTime - bTime;
					break;
				case "portfolio":
					comparison = a.portfolioValue - b.portfolioValue;
					break;
				case "usdc":
					comparison = a.usdcBalance - b.usdcBalance;
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

			{onChainLoading && (
				<div style={{ marginBottom: 16, color: "#888" }}>
					Loading on-chain balances...
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
							minWidth: "760px",
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
									onClick={() => handleSort("profileActivity")}
								>
									Profile updated{getSortIndicator("profileActivity")}
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
											{profile.profileActivityDate
												? profile.profileActivityDate.toLocaleDateString()
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
