import React, { useState, useEffect, useCallback, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import { getCTFAddress, getUSDCAddress } from "@/config/addresses";
import { DEFAULT_RPC_URL } from "@/config/rpc";
import { usePredictionData } from "@/context/PredictionDataContext";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { getListingYesNoPricesForUmbrella } from "@/helpers/predictionUtils";
import { subgraphService, fromMicroUnits } from "@/services/subgraph/subgraphService";
import { fetchUserOrders, type ProcessedOrder, getFinalAmount } from "@/services/api/simplifiedOrderService";
import ScrollableTable from "@/components/ScrollableTable/ScrollableTable";
import gtaIcon from "@/assets/img/ic_gtaVI_24.jpg";
import {
	bundledCounterStrikeLogoFromTagLabels,
	resolveLogoByTags,
	resolveUmbrellaIconById,
	getTagImageFromUmbrella,
	getTagLabelsFromUmbrella,
} from "@/helpers/gameLogoResolver";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";

interface TokenBalance {
	yesTokenId: string;
	noTokenId: string;
	yesBalance: string;
	noBalance: string;
}

interface WalletInfo {
	address: string;
	name: string;
}

interface MarketPosition {
	market: PredictionMarket;
	yesBalance: number;
	noBalance: number;
	yesPrice: number | null;
	noPrice: number | null;
	totalValue: number;
}

interface UmbrellaPositions {
	umbrella: Umbrella;
	markets: MarketPosition[];
}

// Component to handle image with proper fallback
function UmbrellaImage({ umbrella }: { umbrella: any }) {
	const { tags } = usePredictionData();
	const [imageError, setImageError] = useState(false);
	const [currentSrc, setCurrentSrc] = useState<string | null>(null);

	const serverImage =
		umbrella && umbrella._id ? resolveUmbrellaIconById(umbrella._id) : null;
	const tagImage = getTagImageFromUmbrella(umbrella, tags);
	const tagLabels = getTagLabelsFromUmbrella(umbrella, tags);
	const gameLogo = resolveLogoByTags(tagLabels);
	const fallbackLogo = gameLogo || gtaIcon;
	const cs2Bundled = bundledCounterStrikeLogoFromTagLabels(tagLabels);
	const initialSrc =
		cs2Bundled ?? (serverImage || tagImage || fallbackLogo);

	const handleError = () => {
		if (!imageError) {
			setImageError(true);
			if (currentSrc !== tagImage && tagImage) {
				setCurrentSrc(tagImage);
			} else if (currentSrc !== gameLogo && gameLogo) {
				setCurrentSrc(gameLogo);
			} else {
				setCurrentSrc(gtaIcon);
			}
		}
	};

	return (
		<img
			src={currentSrc || initialSrc}
			alt="umbrella"
			width={40}
			height={40}
			style={{
				display: "block",
				background: "#000",
				borderRadius: 6,
				objectFit: "contain",
			}}
			onError={handleError}
		/>
	);
}

export default function AdminWallet() {
	const { getAccessToken } = usePrivy();
	const {
		umbrellas,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
	} = usePredictionData();
	const { appState } = useOddsMonitor();

	// Wallet info state
	const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
	const [loadingWallet, setLoadingWallet] = useState(true);
	const [walletError, setWalletError] = useState<string | null>(null);

	// Balance state
	const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
	const [tokenBalances, setTokenBalances] = useState<Map<string, TokenBalance>>(new Map());
	const [loadingBalances, setLoadingBalances] = useState(false);

	// Orders/history state
	const [orders, setOrders] = useState<ProcessedOrder[]>([]);
	const [loadingOrders, setLoadingOrders] = useState(false);

	// Claim state
	const [claimingMarkets, setClaimingMarkets] = useState<Set<string>>(new Set());
	const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(new Set());
	const [claimErrors, setClaimErrors] = useState<Map<string, string>>(new Map());

	// Active tab
	const [activeTab, setActiveTab] = useState<"positions" | "history">("positions");

	// Get read-only provider
	const getProvider = useCallback((): JsonRpcProvider => {
		return new JsonRpcProvider(DEFAULT_RPC_URL);
	}, []);

	// Fetch seeder wallet address from backend
	const fetchWalletInfo = useCallback(async () => {
		setLoadingWallet(true);
		setWalletError(null);
		try {
			const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
			const base = getPredictionApiBaseUrl();

			const response = await fetch(`${base}/admin/seeder-wallet`, {
				method: "GET",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			});

			if (!response.ok) {
				const errorData = await response.json().catch(() => ({}));
				throw new Error(errorData?.error || `HTTP ${response.status}`);
			}

			const data = await response.json();
			if (data.success && data.wallet) {
				setWalletInfo(data.wallet);
			} else {
				throw new Error(data.error || "Failed to get wallet info");
			}
		} catch (err) {
			console.error("Error fetching wallet info:", err);
			setWalletError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoadingWallet(false);
		}
	}, [getAccessToken]);

	// Fetch USDC balance via RPC
	const fetchUsdcBalance = useCallback(async (address: string) => {
		try {
			const provider = getProvider();
			const erc20 = new Contract(
				getUSDCAddress(),
				[
					"function balanceOf(address account) view returns (uint256)",
					"function decimals() view returns (uint8)",
				],
				provider
			);

			const [usdcRaw, usdcDecimals] = await Promise.all([
				erc20.balanceOf(address),
				erc20.decimals(),
			]);

			setUsdcBalance(formatUnits(usdcRaw, usdcDecimals));
		} catch (error) {
			console.error("Error fetching USDC balance:", error);
			setUsdcBalance("0");
		}
	}, [getProvider]);

	// Fetch token balances from subgraph
	const fetchTokenBalances = useCallback(async (address: string) => {
		try {
			const subgraphAccount = await subgraphService.getUserAccount(address.toLowerCase());

			if (!subgraphAccount) {
				console.log("No subgraph account found for seeder wallet");
				return;
			}

			// Build market data map for mapping
			const marketDataMap = new Map<string, { yesTokenId: string; noTokenId: string }>();
			umbrellas.forEach((u) => {
				const marketsForUmb = getAllQuestionsForUmbrella(u._id) as any[];
				marketsForUmb.forEach((market) => {
					const marketId = market?._id;
					if (marketId && market?.yesTokenId && market?.noTokenId) {
						marketDataMap.set(marketId, {
							yesTokenId: market.yesTokenId,
							noTokenId: market.noTokenId,
						});
					}
				});
			});

			// Include resolved markets
			Object.values(resolvedMarketsByUmbrella).forEach((resolvedMarkets) => {
				resolvedMarkets.forEach((market: any) => {
					const marketId = market?._id;
					if (marketId && market?.yesTokenId && market?.noTokenId) {
						marketDataMap.set(marketId, {
							yesTokenId: market.yesTokenId,
							noTokenId: market.noTokenId,
						});
					}
				});
			});

			// Create reverse lookup: tokenId -> { marketId, isYes }
			const tokenToMarket = new Map<string, { marketId: string; isYes: boolean }>();
			for (const [marketId, { yesTokenId, noTokenId }] of marketDataMap.entries()) {
				tokenToMarket.set(yesTokenId, { marketId, isYes: true });
				tokenToMarket.set(noTokenId, { marketId, isYes: false });
			}

			// Build result map
			const result = new Map<string, TokenBalance>();

			// Initialize markets with zero balances
			for (const [marketId, { yesTokenId, noTokenId }] of marketDataMap.entries()) {
				result.set(marketId, {
					yesTokenId,
					noTokenId,
					yesBalance: "0.000000",
					noBalance: "0.000000",
				});
			}

			// Fill in actual balances
			for (const tb of subgraphAccount.tokenBalances) {
				const mapping = tokenToMarket.get(tb.tokenId);
				if (!mapping) continue;

				const existing = result.get(mapping.marketId);
				if (!existing) continue;

				const balanceFormatted = fromMicroUnits(tb.balance);
				if (mapping.isYes) {
					existing.yesBalance = balanceFormatted;
				} else {
					existing.noBalance = balanceFormatted;
				}
			}

			setTokenBalances(result);
		} catch (error) {
			console.error("Error fetching token balances:", error);
		}
	}, [umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella]);

	// Fetch user orders
	const fetchOrders = useCallback(async (address: string) => {
		try {
			// Build market data map
			const marketDataMap = new Map<string, { yesTokenId: string; noTokenId: string }>();
			umbrellas.forEach((u) => {
				const marketsForUmb = getAllQuestionsForUmbrella(u._id) as any[];
				marketsForUmb.forEach((market) => {
					const marketId = market?._id;
					if (marketId && market?.yesTokenId && market?.noTokenId) {
						marketDataMap.set(marketId, {
							yesTokenId: market.yesTokenId,
							noTokenId: market.noTokenId,
						});
					}
				});
			});

			// Include resolved markets
			Object.values(resolvedMarketsByUmbrella).forEach((resolvedMarkets) => {
				resolvedMarkets.forEach((market: any) => {
					const marketId = market?._id;
					if (marketId && market?.yesTokenId && market?.noTokenId) {
						marketDataMap.set(marketId, {
							yesTokenId: market.yesTokenId,
							noTokenId: market.noTokenId,
						});
					}
				});
			});

			const userOrders = await fetchUserOrders(address, marketDataMap);
			setOrders(userOrders);
		} catch (error) {
			console.error("Error fetching orders:", error);
		}
	}, [umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella]);

	// Load all data when wallet info is available
	const loadAllData = useCallback(async () => {
		if (!walletInfo?.address) return;

		setLoadingBalances(true);
		setLoadingOrders(true);

		try {
			await Promise.all([
				fetchUsdcBalance(walletInfo.address),
				fetchTokenBalances(walletInfo.address),
				fetchOrders(walletInfo.address),
			]);
		} finally {
			setLoadingBalances(false);
			setLoadingOrders(false);
		}
	}, [walletInfo?.address, fetchUsdcBalance, fetchTokenBalances, fetchOrders]);

	// Claim winnings via backend API
	const handleClaim = useCallback(async (market: PredictionMarket, resolvedOutcome: "yes" | "no") => {
		const marketId = market._id || market.questionId || market.marketId;
		if (!marketId) return;

		setClaimingMarkets((prev) => new Set([...prev, marketId]));
		setClaimErrors((prev) => {
			const next = new Map(prev);
			next.delete(marketId);
			return next;
		});

		try {
			const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
			const base = getPredictionApiBaseUrl();

			const response = await fetch(`${base}/admin/seeder-wallet/claim`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
				body: JSON.stringify({
					conditionId: market.conditionId,
					outcome: resolvedOutcome,
				}),
			});

			const data = await response.json().catch(() => ({}));

			if (!response.ok || !data?.success) {
				throw new Error(data?.error || `HTTP ${response.status}`);
			}

			// Mark as claimed
			setClaimedMarkets((prev) => new Set([...prev, marketId]));

			// Refresh balances
			if (walletInfo?.address) {
				await Promise.all([
					fetchUsdcBalance(walletInfo.address),
					fetchTokenBalances(walletInfo.address),
				]);
			}
		} catch (err) {
			console.error("Claim error:", err);
			setClaimErrors((prev) => {
				const next = new Map(prev);
				next.set(marketId, err instanceof Error ? err.message : "Unknown error");
				return next;
			});
		} finally {
			setClaimingMarkets((prev) => {
				const next = new Set(prev);
				next.delete(marketId);
				return next;
			});
		}
	}, [getAccessToken, walletInfo?.address, fetchUsdcBalance, fetchTokenBalances]);

	// Claim ALL winnings
	const handleClaimAll = useCallback(async () => {
		try {
			const token = typeof getAccessToken === "function" ? await getAccessToken() : null;
			const base = getPredictionApiBaseUrl();

			const response = await fetch(`${base}/admin/seeder-wallet/claim-all`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {}),
				},
			});

			const data = await response.json().catch(() => ({}));

			if (!response.ok || !data?.success) {
				throw new Error(data?.error || `HTTP ${response.status}`);
			}

			// Refresh all data
			await loadAllData();
		} catch (err) {
			console.error("Claim all error:", err);
			alert(`Failed to claim all: ${err instanceof Error ? err.message : "Unknown error"}`);
		}
	}, [getAccessToken, loadAllData]);

	// Derive active positions
	const umbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!walletInfo?.address) return [];

		return umbrellas
			.map((umbrella) => {
				const markets = (getAllQuestionsForUmbrella(umbrella._id) as PredictionMarket[]) || [];
				const { yes: umbrellaYes, no: umbrellaNo } = getListingYesNoPricesForUmbrella(
					umbrella,
					appState?.markets,
				);
				const processedMarkets: MarketPosition[] = markets
					.map((market) => {
						const balanceId = market._id;
						const tb = balanceId ? tokenBalances.get(balanceId) : undefined;
						const yesBalance = tb ? Number(tb.yesBalance) : 0;
						const noBalance = tb ? Number(tb.noBalance) : 0;

						const yesPrice = umbrellaYes;
						const noPrice = umbrellaNo;

						const yesValue = yesPrice ? yesBalance * yesPrice : 0;
						const noValue = noPrice ? noBalance * noPrice : 0;
						const totalValue = yesValue + noValue;

						return {
							market,
							yesBalance,
							noBalance,
							yesPrice,
							noPrice,
							totalValue,
						};
					})
					.filter((market) => market.yesBalance > 0 || market.noBalance > 0)
					.filter((mp) => (mp.market as any).status !== "resolved");

				return { umbrella, markets: processedMarkets };
			})
			.filter((umbrella) => umbrella.markets.length > 0);
	}, [walletInfo?.address, umbrellas, getAllQuestionsForUmbrella, tokenBalances, appState?.markets]);

	// Derive resolved winnings
	const resolvedUmbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!walletInfo?.address) return [];

		const resolved: UmbrellaPositions[] = [];

		Object.entries(resolvedMarketsByUmbrella).forEach(([umbrellaId, resolvedMarkets]) => {
			if (resolvedMarkets.length > 0) {
				let umbrella = umbrellas.find((u) => u._id === umbrellaId);

				if (!umbrella) {
					const firstMarket = resolvedMarkets[0];
					umbrella = {
						_id: umbrellaId,
						displayName: firstMarket?.umbrellaName || `Umbrella ${umbrellaId.slice(0, 8)}...`,
						children: resolvedMarkets,
						originalChildren: resolvedMarkets,
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
						__v: 0,
					} as Umbrella;
				}

				const res = resolvedMarkets
					.map((m: any) => {
						const balanceId = m._id;
						const tb = balanceId ? tokenBalances.get(balanceId) : undefined;
						const yesBalance = tb ? Number(tb.yesBalance) : 0;
						const noBalance = tb ? Number(tb.noBalance) : 0;
						return { market: m, yesBalance, noBalance } as any;
					})
					.filter((mp: any) => {
						const balanceId = mp.market._id;
						const isClaimed = claimedMarkets.has(balanceId);
						if (isClaimed) return false;

						const outcome = String(mp.market.resolvedOutcome || "").toLowerCase();
						const hasWinningYes = outcome === "yes" && mp.yesBalance > 0;
						const hasWinningNo = outcome === "no" && mp.noBalance > 0;
						return hasWinningYes || hasWinningNo;
					})
					.map((mp: any) => ({
						market: mp.market,
						yesBalance: mp.yesBalance,
						noBalance: mp.noBalance,
						yesPrice: null,
						noPrice: null,
						totalValue: 0,
					}));

				if (res.length > 0) {
					resolved.push({ umbrella, markets: res });
				}
			}
		});

		return resolved;
	}, [walletInfo?.address, resolvedMarketsByUmbrella, umbrellas, tokenBalances, claimedMarkets]);

	// Calculate totals
	const positionsTotalValue = useMemo(() => {
		return umbrellaPositions.reduce((total, umbrella) => {
			return total + umbrella.markets.reduce((t, m) => t + m.totalValue, 0);
		}, 0);
	}, [umbrellaPositions]);

	const totalWinnings = useMemo(() => {
		return resolvedUmbrellaPositions.reduce((total, umbrella) => {
			return (
				total +
				umbrella.markets.reduce((t, mp) => {
					const outcome = String((mp.market as any).resolvedOutcome || "").toLowerCase();
					return t + (outcome === "yes" ? mp.yesBalance : mp.noBalance);
				}, 0)
			);
		}, 0);
	}, [resolvedUmbrellaPositions]);

	const portfolioTotal = useMemo(() => {
		return (usdcBalance ? parseFloat(usdcBalance) : 0) + positionsTotalValue;
	}, [usdcBalance, positionsTotalValue]);

	// Initial load
	useEffect(() => {
		fetchWalletInfo();
	}, [fetchWalletInfo]);

	// Load data when wallet info is available
	useEffect(() => {
		if (walletInfo?.address) {
			loadAllData();
		}
	}, [walletInfo?.address, loadAllData]);

	// Format currency
	const formatCurrency = (value?: number | null): string => {
		if (value === null || value === undefined || !isFinite(value)) return "—";
		const isInt = Math.abs(value % 1) < 1e-9;
		const formatted = isInt
			? value.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
			: value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
		return `$${formatted}`;
	};

	const toCentsString = (value?: number | null): string => {
		if (value === undefined || value === null || !isFinite(value)) return "--";
		return `${Math.round(value * 100)}¢`;
	};

	if (loadingWallet) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				<div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>
					Loading Seeder Wallet...
				</div>
			</div>
		);
	}

	if (walletError) {
		return (
			<div style={{ padding: 24, color: "white" }}>
				<div style={{ fontSize: 18, fontWeight: 600, marginBottom: 16, color: "#ef4444" }}>
					Error Loading Wallet
				</div>
				<div style={{ color: "#f87171" }}>{walletError}</div>
				<button
					onClick={fetchWalletInfo}
					style={{
						marginTop: 16,
						padding: "8px 16px",
						background: "#3b82f6",
						color: "white",
						border: "none",
						borderRadius: 6,
						cursor: "pointer",
					}}
				>
					Retry
				</button>
			</div>
		);
	}

	return (
		<div style={{ color: "white" }}>
			{/* Wallet Header */}
			<div
				style={{
					background: "linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%)",
					borderRadius: 12,
					padding: 24,
					marginBottom: 24,
					border: "1px solid #334155",
				}}
			>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16 }}>
					<div>
						<div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 4 }}>Seeder Wallet</div>
						<div style={{ fontSize: 16, fontFamily: "monospace", color: "#e2e8f0" }}>
							{walletInfo?.name || "Admin Seeder"}
						</div>
						<div
							style={{
								fontSize: 12,
								fontFamily: "monospace",
								color: "#64748b",
								marginTop: 4,
								wordBreak: "break-all",
							}}
						>
							{walletInfo?.address}
						</div>
					</div>
					<button
						onClick={loadAllData}
						disabled={loadingBalances || loadingOrders}
						style={{
							padding: "8px 16px",
							background: loadingBalances || loadingOrders ? "#475569" : "#3b82f6",
							color: "white",
							border: "none",
							borderRadius: 6,
							cursor: loadingBalances || loadingOrders ? "not-allowed" : "pointer",
							fontSize: 14,
						}}
					>
						{loadingBalances || loadingOrders ? "Refreshing..." : "🔄 Refresh"}
					</button>
				</div>

				{/* Balance Cards */}
				<div
					style={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
						gap: 16,
						marginTop: 20,
					}}
				>
					<div style={{ background: "#0f172a", borderRadius: 8, padding: 16 }}>
						<div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>USDC Balance</div>
						<div style={{ fontSize: 24, fontWeight: 700, color: "#22c55e" }}>
							{loadingBalances ? "..." : formatCurrency(usdcBalance ? parseFloat(usdcBalance) : 0)}
						</div>
					</div>
					<div style={{ background: "#0f172a", borderRadius: 8, padding: 16 }}>
						<div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Positions Value</div>
						<div style={{ fontSize: 24, fontWeight: 700, color: "#3b82f6" }}>
							{loadingBalances ? "..." : formatCurrency(positionsTotalValue)}
						</div>
					</div>
					<div style={{ background: "#0f172a", borderRadius: 8, padding: 16 }}>
						<div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Portfolio Total</div>
						<div style={{ fontSize: 24, fontWeight: 700, color: "#e2e8f0" }}>
							{loadingBalances ? "..." : formatCurrency(portfolioTotal)}
						</div>
					</div>
					<div style={{ background: "#0f172a", borderRadius: 8, padding: 16 }}>
						<div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>Unclaimed Winnings</div>
						<div style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
							{loadingBalances ? "..." : formatCurrency(totalWinnings)}
						</div>
					</div>
				</div>
			</div>

			{/* Tabs */}
			<div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
				<button
					onClick={() => setActiveTab("positions")}
					style={{
						padding: "8px 16px",
						background: activeTab === "positions" ? "rgba(255,255,255,0.2)" : "transparent",
						color: "white",
						border: "1px solid white",
						borderRadius: 6,
						cursor: "pointer",
					}}
				>
					Positions & Winnings
				</button>
				<button
					onClick={() => setActiveTab("history")}
					style={{
						padding: "8px 16px",
						background: activeTab === "history" ? "rgba(255,255,255,0.2)" : "transparent",
						color: "white",
						border: "1px solid white",
						borderRadius: 6,
						cursor: "pointer",
					}}
				>
					Trade History ({orders.length})
				</button>
			</div>

			{/* Positions & Winnings Tab */}
			{activeTab === "positions" && (
				<div>
					{/* Winnings Section */}
					{resolvedUmbrellaPositions.length > 0 && (
						<div style={{ marginBottom: 32 }}>
							<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
								<h3 style={{ fontSize: 20, fontWeight: 700, color: "#f59e0b", margin: 0 }}>
									🏆 Unclaimed Winnings
								</h3>
								<button
									onClick={handleClaimAll}
									style={{
										padding: "8px 16px",
										background: "#7c3aed",
										color: "white",
										border: "none",
										borderRadius: 6,
										cursor: "pointer",
										fontWeight: 600,
									}}
								>
									Claim All Winnings
								</button>
							</div>

							<ScrollableTable minWidth="500px">
								<div
									style={{
										display: "grid",
										gridTemplateColumns: "2fr 1fr 1fr 1fr",
										padding: "10px 12px",
										borderBottom: "1px solid #333",
										color: "#888",
										fontSize: 12,
										textTransform: "uppercase",
									}}
								>
									<div>Market</div>
									<div style={{ textAlign: "center" }}>Winning Shares</div>
									<div style={{ textAlign: "center" }}>Payout</div>
									<div style={{ textAlign: "center" }}>Action</div>
								</div>

								{resolvedUmbrellaPositions.map(({ umbrella, markets }) => (
									<div key={umbrella._id}>
										<div
											style={{
												display: "flex",
												alignItems: "center",
												gap: 12,
												padding: "12px",
												background: "#111",
												borderBottom: "1px solid #222",
											}}
										>
											<UmbrellaImage umbrella={umbrella} />
											<span style={{ fontWeight: 600, color: "#dedede" }}>
												{umbrella.displayName}
											</span>
										</div>

										{markets.map(({ market, yesBalance, noBalance }) => {
											const marketId = market._id || market.questionId || market.marketId;
											const outcome = String((market as any).resolvedOutcome || "").toLowerCase();
											const winningShares = outcome === "yes" ? yesBalance : noBalance;
											const isClaiming = claimingMarkets.has(marketId as string);
											const error = claimErrors.get(marketId as string);

											return (
												<div
													key={marketId}
													style={{
														display: "grid",
														gridTemplateColumns: "2fr 1fr 1fr 1fr",
														padding: "12px",
														borderBottom: "1px solid #1f1f1f",
														alignItems: "center",
													}}
												>
													<div style={{ color: "#fff" }}>
														{market.displayName || (market as any).question}
														<span
															style={{
																marginLeft: 8,
																color: outcome === "yes" ? "#16a34a" : "#ef4444",
																fontWeight: 600,
															}}
														>
															{outcome.toUpperCase()}
														</span>
													</div>
													<div style={{ textAlign: "center", color: "#fff" }}>{winningShares.toFixed(2)}</div>
													<div style={{ textAlign: "center", color: "#22c55e", fontWeight: 700 }}>
														{formatCurrency(winningShares)}
													</div>
													<div style={{ textAlign: "center" }}>
														<button
															onClick={() => handleClaim(market, outcome as "yes" | "no")}
															disabled={isClaiming}
															style={{
																padding: "6px 12px",
																background: isClaiming ? "#6d28d9" : "#7c3aed",
																color: "white",
																border: "none",
																borderRadius: 4,
																cursor: isClaiming ? "not-allowed" : "pointer",
																fontSize: 12,
																fontWeight: 600,
															}}
														>
															{isClaiming ? "Claiming..." : "Claim"}
														</button>
														{error && (
															<div style={{ color: "#ef4444", fontSize: 10, marginTop: 4 }}>
																{error}
															</div>
														)}
													</div>
												</div>
											);
										})}
									</div>
								))}
							</ScrollableTable>
						</div>
					)}

					{/* Active Positions Section */}
					<h3 style={{ fontSize: 20, fontWeight: 700, color: "#3b82f6", marginBottom: 16 }}>
						📊 Active Positions
					</h3>

					{umbrellaPositions.length === 0 ? (
						<div style={{ color: "#888", padding: 16 }}>No active positions.</div>
					) : (
						<ScrollableTable minWidth="600px">
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
									padding: "10px 12px",
									borderBottom: "1px solid #333",
									color: "#888",
									fontSize: 12,
									textTransform: "uppercase",
								}}
							>
								<div>Market</div>
								<div style={{ textAlign: "center" }}>Yes Shares</div>
								<div style={{ textAlign: "center" }}>No Shares</div>
								<div style={{ textAlign: "center" }}>Yes Price</div>
								<div style={{ textAlign: "center" }}>Total Value</div>
							</div>

							{umbrellaPositions.map(({ umbrella, markets }) => (
								<div key={umbrella._id}>
									<div
										style={{
											display: "flex",
											alignItems: "center",
											gap: 12,
											padding: "12px",
											background: "#111",
											borderBottom: "1px solid #222",
										}}
									>
										<UmbrellaImage umbrella={umbrella} />
										<span style={{ fontWeight: 600, color: "#dedede" }}>
											{umbrella.displayName}
										</span>
									</div>

									{markets.map(({ market, yesBalance, noBalance, yesPrice, totalValue }) => {
										const marketId = market._id || market.questionId || market.marketId;

										return (
											<div
												key={marketId}
												style={{
													display: "grid",
													gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr",
													padding: "12px",
													borderBottom: "1px solid #1f1f1f",
													alignItems: "center",
												}}
											>
												<div style={{ color: "#fff" }}>
													{market.displayName || (market as any).question}
												</div>
												<div style={{ textAlign: "center", color: yesBalance > 0 ? "#16a34a" : "#666" }}>
													{yesBalance > 0 ? yesBalance.toFixed(2) : "—"}
												</div>
												<div style={{ textAlign: "center", color: noBalance > 0 ? "#ef4444" : "#666" }}>
													{noBalance > 0 ? noBalance.toFixed(2) : "—"}
												</div>
												<div style={{ textAlign: "center", color: "#fff" }}>
													{toCentsString(yesPrice)}
												</div>
												<div style={{ textAlign: "center", color: "#3b82f6", fontWeight: 700 }}>
													{formatCurrency(totalValue)}
												</div>
											</div>
										);
									})}
								</div>
							))}
						</ScrollableTable>
					)}
				</div>
			)}

			{/* History Tab */}
			{activeTab === "history" && (
				<div>
					<h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>
						📜 Trade History ({orders.length} trades)
					</h3>

					{loadingOrders ? (
						<div style={{ color: "#888", padding: 16 }}>Loading trade history...</div>
					) : orders.length === 0 ? (
						<div style={{ color: "#888", padding: 16 }}>No trade history found.</div>
					) : (
						<ScrollableTable minWidth="700px">
							<div
								style={{
									display: "grid",
									gridTemplateColumns: "1.5fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr",
									padding: "10px 12px",
									borderBottom: "1px solid #333",
									color: "#888",
									fontSize: 12,
									textTransform: "uppercase",
								}}
							>
								<div>Market</div>
								<div style={{ textAlign: "center" }}>Side</div>
								<div style={{ textAlign: "center" }}>Position</div>
								<div style={{ textAlign: "center" }}>Price</div>
								<div style={{ textAlign: "center" }}>Size</div>
								<div style={{ textAlign: "center" }}>Date</div>
							</div>

							{orders.slice(0, 100).map((order) => (
								<div
									key={order.orderId}
									style={{
										display: "grid",
										gridTemplateColumns: "1.5fr 0.8fr 0.8fr 0.8fr 0.8fr 1fr",
										padding: "10px 12px",
										borderBottom: "1px solid #1f1f1f",
										alignItems: "center",
									}}
								>
									<div
										style={{
											color: "#fff",
											fontSize: 13,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
										}}
									>
										{order.questionId?.slice(0, 16)}...
									</div>
									<div
										style={{
											textAlign: "center",
											color: order.side === "buy" ? "#16a34a" : "#ef4444",
											fontWeight: 600,
										}}
									>
										{order.side.toUpperCase()}
									</div>
									<div
										style={{
											textAlign: "center",
											color: order.position === "Yes" ? "#16a34a" : "#ef4444",
										}}
									>
										{order.position}
									</div>
									<div style={{ textAlign: "center", color: "#fff" }}>
										{toCentsString(order.price)}
									</div>
									<div style={{ textAlign: "center", color: "#fff" }}>{order.size.toFixed(2)}</div>
									<div style={{ textAlign: "center", color: "#888", fontSize: 11 }}>
										{order.filledAt
											? new Date(order.filledAt).toLocaleDateString("en-US", {
													month: "short",
													day: "numeric",
													hour: "2-digit",
													minute: "2-digit",
											  })
											: "—"}
									</div>
								</div>
							))}
							{orders.length > 100 && (
								<div style={{ padding: 12, color: "#888", textAlign: "center" }}>
									Showing first 100 of {orders.length} trades
								</div>
							)}
						</ScrollableTable>
					)}
				</div>
			)}
		</div>
	);
}

