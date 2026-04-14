import React, {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { mixpanelIdentify, mixpanelPeopleSet } from "@/utils/mixpanel";
import { Contract, JsonRpcProvider, ethers, formatUnits } from "ethers";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useSignerContext } from "context/SignerContext";
import {
	fetchUserOrders,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import { getCTFAddress, getUSDCAddress, getExchangeAddress, getFeeWrapperAddress } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { usePredictionData } from "context/PredictionDataContext";
import {
	subgraphService,
	fromMicroUnits,
} from "@/services/subgraph/subgraphService";

type TokenBalance = {
	yesTokenId: string;
	noTokenId: string;
	yesBalance: string;
	noBalance: string;
};

type ApprovalState = {
	isApproved: boolean;
	isChecking: boolean;
	isApproving: boolean;
};

type UserDataContextValue = {
	orders: ProcessedOrder[];
	tokenBalances: Map<string, TokenBalance>; // marketId -> TokenBalance
	usdcBalance: string | null;
	usdcLoading: boolean; // Separate loading state for USDC balance
	approvalState: ApprovalState;
	loading: boolean;
	usingRpcFallback: boolean; // True when subgraph failed and using RPC
	refresh: () => Promise<void>;
	refreshViaRpc: () => Promise<void>; // Force RPC refresh (bypasses slow subgraph)
	loadOrders: () => Promise<void>; // Lazy: call when orders are needed (e.g. Positions page)
	getTokenBalance: (marketId: string) => TokenBalance | null;
	checkApproval: () => Promise<void>;
	approveToken: () => Promise<void>;
};

const UserDataContext = createContext<UserDataContextValue | null>(null);

export function UserDataProvider({ children }: { children: React.ReactNode }) {
	const { account } = useSignerContext();
	const { user } = usePrivy();
	const { wallets: privyWallets } = usePrivyWallets();
	const { getClientForChain } = useSmartWallets();
	const [loading, setLoading] = useState(false);
	const [orders, setOrders] = useState<ProcessedOrder[]>([]);
	const [tokenBalances, setTokenBalances] = useState<
		Map<string, TokenBalance>
	>(new Map());
	const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
	const [usdcLoading, setUsdcLoading] = useState(true); // Separate loading state for USDC
	const [approvalState, setApprovalState] = useState<ApprovalState>({
		isApproved: false,
		isChecking: false,
		isApproving: false,
	});
	const [usingRpcFallback, setUsingRpcFallback] = useState(false);

	// Cache a single provider instance to avoid repeated EIP-1193 calls (eth_accounts, eth_chainId)
	// Reserved for future signer-based flows
	// const providerRef = useRef<BrowserProvider | JsonRpcProvider | null>(null);
	const readProviderRef = useRef<JsonRpcProvider | null>(null);
	const mixpanelIdentifiedRef = useRef<string | null>(null);

	// Identify user in Mixpanel when authenticated
	useEffect(() => {
		if (!user || !user.id) {
			// Reset on logout
			mixpanelIdentifiedRef.current = null;
			return;
		}
		
		// Only identify if we haven't already identified this user
		if (mixpanelIdentifiedRef.current === user.id) return;
		
		try {
			mixpanelIdentify(user.id);
			
			const email = user.email?.address || user.google?.email || (user.twitter as any)?.email || null;
			const name = (user as any).name || user.google?.name || (user.twitter as any)?.name || null;
			
			mixpanelPeopleSet({
				$name: name || undefined,
				$email: email || undefined,
				// Add any other user properties here
			});
			
			mixpanelIdentifiedRef.current = user.id;
		} catch (error) {
			console.error("error", error);
		}
	}, [user]);

	// Removed unused resolveProvider to avoid warnings; transactions use smart wallet client directly

	const getReadProvider = useCallback((): JsonRpcProvider => {
		if (readProviderRef.current) return readProviderRef.current;
		readProviderRef.current = new JsonRpcProvider(DEFAULT_RPC_URL);
		return readProviderRef.current;
	}, []);

	const checkApproval = useCallback(async () => {
		if (!account) {
			setApprovalState({
				isApproved: false,
				isChecking: false,
				isApproving: false,
			});
			return;
		}

		setApprovalState((prev) => ({ ...prev, isChecking: true }));

		try {
			const provider = getReadProvider();

			const usdcContract = new Contract(
				getUSDCAddress(),
				[
					"function allowance(address owner, address spender) view returns (uint256)",
				],
				provider
			);
			const ctfContract = new Contract(
				getCTFAddress(),
				[
					"function isApprovedForAll(address owner, address operator) view returns (bool)",
				],
				provider
			);

			const [usdcAllowance, hasCtfApproval, feeWrapperAllowance] = await Promise.all([
				usdcContract.allowance(account, getExchangeAddress()),
				ctfContract.isApprovedForAll(account, getExchangeAddress()),
				usdcContract.allowance(account, getFeeWrapperAddress()),
			]);

			const hasUsdcApproval = usdcAllowance > 0n;
			const hasFeeWrapperApproval = feeWrapperAllowance > 0n;
			const isApproved = hasUsdcApproval && hasCtfApproval && hasFeeWrapperApproval;

			setApprovalState({
				isApproved,
				isChecking: false,
				isApproving: false,
			});
		} catch (error) {
			console.error("Error checking approval:", error);
			setApprovalState((prev) => ({ ...prev, isChecking: false }));
		}
	}, [account, getReadProvider]);

	const { umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella } =
		usePredictionData();

	// Store filtered market data map for balance mapping (declared early for use in load)
	const filteredMarketDataMapRef = useRef<Map<string, { yesTokenId: string; noTokenId: string }>>(new Map());

	// Store raw subgraph token balances (by tokenId) for later mapping
	const [rawTokenBalances, setRawTokenBalances] = useState<
		Array<{ tokenId: string; balance: string }>
	>([]);
	const rawTokenBalancesRef = useRef<Array<{ tokenId: string; balance: string }>>([]);
	const subgraphFetchedRef = useRef<string | null>(null);

	// Keep ref in sync with state
	useEffect(() => {
		rawTokenBalancesRef.current = rawTokenBalances;
	}, [rawTokenBalances]);

	// Track if we've already fetched USDC for this account
	const usdcFetchedRef = useRef<string | null>(null);

	/**
	 * Fetch USDC balance via RPC for real-time accuracy
	 */
	const fetchUsdcBalanceRpc = useCallback(async (walletAddress: string) => {
		// Skip if we've already fetched for this account (prevents StrictMode double-fetch)
		if (usdcFetchedRef.current === walletAddress) return;

		// Set loading AFTER the skip check to prevent flash on StrictMode remount
		setUsdcLoading(true);

		try {
			const provider = getReadProvider();
			const erc20 = new Contract(
				getUSDCAddress(),
				[
					"function balanceOf(address account) view returns (uint256)",
					"function decimals() view returns (uint8)",
				],
				provider
			);

			const [usdcRaw, usdcDecimals] = await Promise.all([
				erc20.balanceOf(walletAddress),
				erc20.decimals(),
			]);
			
			setUsdcBalance(formatUnits(usdcRaw, usdcDecimals));
			usdcFetchedRef.current = walletAddress;
		} catch (error) {
			console.error("Error fetching USDC balance via RPC:", error);
			setUsdcBalance("0");
		} finally {
			setUsdcLoading(false);
		}
	}, [getReadProvider]);

	/**
	 * Fetch token balances via RPC as fallback when subgraph fails
	 * This queries the ERC1155 contract directly for each token ID
	 */
	const fetchTokenBalancesFromRpc = useCallback(async (
		walletAddress: string,
		marketDataMap: Map<string, { yesTokenId: string; noTokenId: string }>
	): Promise<Array<{ tokenId: string; balance: string }>> => {
		const provider = getReadProvider();
		const ctfContract = new Contract(
			getCTFAddress(),
			["function balanceOf(address account, uint256 id) view returns (uint256)"],
			provider
		);

		const results: Array<{ tokenId: string; balance: string }> = [];
		
		// Collect all unique token IDs from markets
		const tokenIds = new Set<string>();
		for (const { yesTokenId, noTokenId } of marketDataMap.values()) {
			if (yesTokenId) tokenIds.add(yesTokenId);
			if (noTokenId) tokenIds.add(noTokenId);
		}

		// Batch fetch in groups of 20 to avoid overwhelming RPC
		const tokenIdArray = Array.from(tokenIds);
		const batchSize = 20;
		
		for (let i = 0; i < tokenIdArray.length; i += batchSize) {
			const batch = tokenIdArray.slice(i, i + batchSize);
			const balancePromises = batch.map(async (tokenId) => {
				try {
					const balance = await ctfContract.balanceOf(walletAddress, tokenId);
					// Only include non-zero balances
					if (balance > 0n) {
						return { tokenId, balance: balance.toString() };
					}
					return null;
				} catch (err) {
					console.error(`[RPC Fallback] Error fetching tokenId ${tokenId}:`, err);
					return null;
				}
			});

			const batchResults = await Promise.all(balancePromises);
			results.push(...batchResults.filter((r): r is { tokenId: string; balance: string } => r !== null));
		}

		return results;
	}, [getReadProvider]);

	/**
	 * Fetch token balances from subgraph (positions only, not USDC)
	 * Falls back to RPC if subgraph is rate limited or fails
	 */
	const fetchTokenBalancesFromSubgraph = useCallback(async (walletAddress: string, forceRefresh: boolean = false) => {
		// Skip if we've already fetched for this account (prevents StrictMode double-fetch)
		// Unless forceRefresh is true
		if (!forceRefresh && subgraphFetchedRef.current === walletAddress) return;

		try {
			const subgraphAccount = await subgraphService.getUserAccount(walletAddress);

			if (!subgraphAccount) {
				// User has never interacted with the contracts
				setRawTokenBalances([]);
				subgraphFetchedRef.current = walletAddress;
				setUsingRpcFallback(false);
				return;
			}

				// Store raw token balances for later mapping (NOT usdc - that comes from RPC)
			setRawTokenBalances(subgraphAccount.tokenBalances);
			subgraphFetchedRef.current = walletAddress;
			setUsingRpcFallback(false);
		} catch (error) {
			console.error("Error loading token balances from subgraph:", error);

			try {
				// Build market data map from current context
				const marketDataMap = new Map<string, { yesTokenId: string; noTokenId: string }>();
				// CRITICAL: Always use _id as the key for consistency with Positions.tsx lookups
				umbrellas.forEach(umbrella => {
					const questions = getAllQuestionsForUmbrella(umbrella._id) || [];
					questions.forEach((market: any) => {
						const marketId = market._id; // ALWAYS use _id only
						if (marketId && market.yesTokenId && market.noTokenId) {
							marketDataMap.set(marketId, {
								yesTokenId: market.yesTokenId,
								noTokenId: market.noTokenId,
							});
						}
					});
				});

				// Also include resolved markets
				Object.values(resolvedMarketsByUmbrella).forEach((markets: any[]) => {
					markets.forEach((market: any) => {
						const marketId = market._id; // ALWAYS use _id only
						if (marketId && market.yesTokenId && market.noTokenId) {
							marketDataMap.set(marketId, {
								yesTokenId: market.yesTokenId,
								noTokenId: market.noTokenId,
							});
						}
					});
				});

				if (marketDataMap.size === 0) {
					setRawTokenBalances([]);
					subgraphFetchedRef.current = null; // Allow retry
					return;
				}

				const rpcBalances = await fetchTokenBalancesFromRpc(walletAddress, marketDataMap);
				setRawTokenBalances(rpcBalances);
				subgraphFetchedRef.current = walletAddress;
				setUsingRpcFallback(true);
			} catch (rpcError) {
				console.error("[UserDataContext] RPC fallback also failed:", rpcError);
				setRawTokenBalances([]);
				subgraphFetchedRef.current = null; // Allow retry
			}
		}
	}, [umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella, fetchTokenBalancesFromRpc]);

	// Fetch balances IMMEDIATELY when account is available
	useEffect(() => {
		if (account) {
			// USDC via RPC, token positions via subgraph (in parallel)
			fetchUsdcBalanceRpc(account);
			fetchTokenBalancesFromSubgraph(account);
		} else {
			setUsdcBalance(null);
			setUsdcLoading(false);
			setRawTokenBalances([]);
			subgraphFetchedRef.current = null;
			usdcFetchedRef.current = null;
		}
	}, [account, fetchUsdcBalanceRpc, fetchTokenBalancesFromSubgraph]);

	// RETRY: If initial balance fetch failed (no market data yet), retry when umbrellas load
	// This handles the case where subgraph fails in production and RPC fallback needs market data
	useEffect(() => {
		if (!account) return;
		if (!Array.isArray(umbrellas) || umbrellas.length === 0) return;
		// Only retry if we haven't successfully fetched yet (ref is null from failed attempt)
		if (subgraphFetchedRef.current !== null) return;

		fetchTokenBalancesFromSubgraph(account, true);
	}, [account, umbrellas, fetchTokenBalancesFromSubgraph]);

	/**
	 * Map raw token balances to market IDs once market data is available.
	 * This runs separately from subgraph fetch.
	 */
	const mapTokenBalancesToMarkets = useCallback(
		(
			rawBalances: Array<{ tokenId: string; balance: string }>,
			marketDataMap: Map<string, { yesTokenId: string; noTokenId: string }>
		) => {
			// Create reverse lookup: tokenId -> { marketId, isYes }
			const tokenToMarket = new Map<string, { marketId: string; isYes: boolean }>();
			for (const [marketId, { yesTokenId, noTokenId }] of marketDataMap.entries()) {
				tokenToMarket.set(yesTokenId, { marketId, isYes: true });
				tokenToMarket.set(noTokenId, { marketId, isYes: false });
			}

			// Build result map
			const result = new Map<
				string,
				{ yesTokenId: string; noTokenId: string; yesBalance: string; noBalance: string }
			>();

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
			for (const tb of rawBalances) {
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

			return result;
		},
		[]
	);

	// Track if we've already loaded for this account to prevent StrictMode double-load
	const loadedForAccountRef = useRef<string | null>(null);

	// Build market data map from context (shared between load and loadOrders)
	const buildMarketDataMap = useCallback(() => {
		const marketDataMap = new Map<
			string,
			{ yesTokenId: string; noTokenId: string }
		>();
		umbrellas.forEach((u: any) => {
			const marketsForUmb = getAllQuestionsForUmbrella(u._id) as any[];
			marketsForUmb.forEach((market: any) => {
				const marketId = market?._id;
				if (marketId && market?.yesTokenId && market?.noTokenId) {
					marketDataMap.set(marketId, {
						yesTokenId: market.yesTokenId,
						noTokenId: market.noTokenId,
					});
				}
			});
		});
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
		return marketDataMap;
	}, [umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella]);

	const load = useCallback(async () => {
		if (!account) {
			setOrders([]);
			setTokenBalances(new Map());
			setUsdcBalance(null);
			loadedForAccountRef.current = null;
			return;
		}

		if (loadedForAccountRef.current === account) return;
		loadedForAccountRef.current = account;

		setLoading(true);
		try {
			const marketDataMap = buildMarketDataMap();
			filteredMarketDataMapRef.current = marketDataMap;

			// Map any already-available subgraph balances to market IDs
			const currentRawBalances = rawTokenBalancesRef.current;
			if (currentRawBalances.length > 0) {
				setTokenBalances(mapTokenBalancesToMarkets(currentRawBalances, marketDataMap));
			}
		} finally {
			setLoading(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		account,
		buildMarketDataMap,
		mapTokenBalancesToMarkets,
	]);

	// Lazy order loading -- called by Positions page or other consumers that need orders
	const ordersLoadedRef = useRef<string | null>(null);
	const loadOrders = useCallback(async () => {
		if (!account) return;
		if (ordersLoadedRef.current === account) return;
		ordersLoadedRef.current = account;

		const marketDataMap = buildMarketDataMap();
		try {
			const userOrders = await fetchUserOrders(account, marketDataMap);
			setOrders(userOrders);
		} catch (err) {
			console.error("Failed to load orders:", err);
		}
	}, [account, buildMarketDataMap]);

	// Effect to map subgraph balances when they arrive AFTER market data is ready
	// (handles the case where subgraph is slower than market data loading)
	useEffect(() => {
		if (rawTokenBalances.length === 0) {
			return; // Don't reset to empty - let initial state or load() handle it
		}

		const marketDataMap = filteredMarketDataMapRef.current;
		if (marketDataMap.size === 0) {
			// Market data not ready yet, will be mapped when load() completes
			return;
		}

		const mappedBalances = mapTokenBalancesToMarkets(rawTokenBalances, marketDataMap);
		setTokenBalances(mappedBalances);
	}, [rawTokenBalances, mapTokenBalancesToMarkets]);

	const getTokenBalance = useCallback(
		(marketId: string) => {
			return tokenBalances.get(marketId) || null;
		},
		[tokenBalances]
	);

	const approveToken = useCallback(async () => {
		if (!account) return;

		setApprovalState((prev) => ({ ...prev, isApproving: true }));

		try {
			// Detect wallet type
			const smartWalletAccount = (user?.linkedAccounts || []).find(
				(acct: any) => acct?.type === "smart_wallet"
			) as any;

			const embeddedWallet = (privyWallets || []).find(
				(w: any) =>
					w?.type === "embedded_wallet" ||
					w?.walletClientType === "privy" ||
					w?.connectorType === "privy"
			);

			const externalWallet = (privyWallets || []).find(
				(w: any) => w?.type === "wallet" || w?.connectorType !== "privy"
			);

			const useSmartWallet =
				Boolean(smartWalletAccount?.address) || Boolean(embeddedWallet);
			const useExternalWallet =
				Boolean(externalWallet) && !useSmartWallet;

			// ABIs for approval calls
			const usdcAbi = [
				"function approve(address spender, uint256 amount) returns (bool)",
			];
			const ctfAbi = [
				"function setApprovalForAll(address operator, bool approved)",
			];

			if (useSmartWallet) {
				// BATCHED APPROVAL: Single signature for all 3 approvals
				const smartWalletClient = await getClientForChain({ id: 8453 });
				if (!smartWalletClient)
					throw new Error("No smart wallet client available");

				const usdcInterface = new ethers.Interface(usdcAbi);
				const ctfInterface = new ethers.Interface(ctfAbi);

				// Encode all 3 approval calls
				const usdcExchangeApproval = usdcInterface.encodeFunctionData(
					"approve",
					[getExchangeAddress(), ethers.MaxUint256]
				);
				const ctfApproval = ctfInterface.encodeFunctionData(
					"setApprovalForAll",
					[getExchangeAddress(), true]
				);
				const usdcFeeWrapperApproval = usdcInterface.encodeFunctionData(
					"approve",
					[getFeeWrapperAddress(), ethers.MaxUint256]
				);

				// Send all 3 approvals as a batch - user only signs once!
				console.log("🔐 Sending batched approval transaction (3 approvals in 1 signature)...");
				await smartWalletClient.sendTransaction({
					calls: [
						{
							to: getUSDCAddress() as `0x${string}`,
							data: usdcExchangeApproval as `0x${string}`,
							value: 0n,
						},
						{
							to: getCTFAddress() as `0x${string}`,
							data: ctfApproval as `0x${string}`,
							value: 0n,
						},
						{
							to: getUSDCAddress() as `0x${string}`,
							data: usdcFeeWrapperApproval as `0x${string}`,
							value: 0n,
						},
					],
				});
				console.log("✅ Batched approval complete!");

			} else if (useExternalWallet && externalWallet) {
				// External wallets (MetaMask, etc.) don't support batching
				// Execute sequentially without delays for faster UX
				const eip1193 = await externalWallet.getEthereumProvider();
				const provider = new ethers.BrowserProvider(eip1193 as any);
				const signer = await provider.getSigner();

				console.log("🔐 Approving USDC for Exchange...");
				const usdcContract = new ethers.Contract(
					getUSDCAddress(),
					usdcAbi,
					signer
				);
				const tx1 = await usdcContract.approve(
					getExchangeAddress(),
					ethers.MaxUint256
				);
				await tx1.wait();

				console.log("🔐 Approving CTF for Exchange...");
				const ctfContract = new ethers.Contract(
					getCTFAddress(),
					ctfAbi,
					signer
				);
				const tx2 = await ctfContract.setApprovalForAll(
					getExchangeAddress(),
					true
				);
				await tx2.wait();

				console.log("🔐 Approving USDC for Fee Wrapper...");
				const tx3 = await usdcContract.approve(
					getFeeWrapperAddress(),
					ethers.MaxUint256
				);
				await tx3.wait();
				console.log("✅ All approvals complete!");

			} else {
				throw new Error("No compatible wallet found");
			}

			// Refresh approval status once at the end
			await checkApproval();
		} catch (error) {
			console.error("Error approving tokens:", error);
			setApprovalState((prev) => ({ ...prev, isApproving: false }));
		}
	}, [
		account,
		checkApproval,
		privyWallets,
		user?.linkedAccounts,
		getClientForChain,
	]);

	// Load user data when account and markets are available
	useEffect(() => {
		if (!account) return;
		// Ensure markets are available before attempting load
		if (!Array.isArray(umbrellas) || umbrellas.length === 0) return;
		load();
	}, [account, umbrellas]); // Removed 'load' from dependencies to prevent circular dependency

	// Refresh function that clears the skip-check refs to allow full reload
	const refresh = useCallback(async () => {
		if (!account) return;
		loadedForAccountRef.current = null;
		ordersLoadedRef.current = null;
		subgraphFetchedRef.current = null;
		usdcFetchedRef.current = null;
		subgraphService.clearSubgraphCache();
		await Promise.all([
			fetchUsdcBalanceRpc(account),
			fetchTokenBalancesFromSubgraph(account, true),
			load(),
		]);
	}, [account, fetchUsdcBalanceRpc, fetchTokenBalancesFromSubgraph, load]);

	// Force RPC refresh - bypasses subgraph entirely for immediate balance updates
	// Use this after trades when subgraph indexing delay would show stale data
	const refreshViaRpc = useCallback(async () => {
		if (!account) return;

		usdcFetchedRef.current = null;
		
		// Build market data map from current context
		const marketDataMap = new Map<string, { yesTokenId: string; noTokenId: string }>();
		// CRITICAL: Always use _id as the key for consistency with Positions.tsx lookups
		umbrellas.forEach(umbrella => {
			const questions = getAllQuestionsForUmbrella(umbrella._id) || [];
			questions.forEach((market: any) => {
				const marketId = market._id; // ALWAYS use _id only
				if (marketId && market.yesTokenId && market.noTokenId) {
					marketDataMap.set(marketId, {
						yesTokenId: market.yesTokenId,
						noTokenId: market.noTokenId,
					});
				}
			});
		});

		// Also include resolved markets
		Object.values(resolvedMarketsByUmbrella).forEach((markets: any[]) => {
			markets.forEach((market: any) => {
				const marketId = market._id; // ALWAYS use _id only
				if (marketId && market.yesTokenId && market.noTokenId) {
					marketDataMap.set(marketId, {
						yesTokenId: market.yesTokenId,
						noTokenId: market.noTokenId,
					});
				}
			});
		});

		try {
			// Fetch both USDC and token balances via RPC in parallel
			const [, rpcBalances] = await Promise.all([
				fetchUsdcBalanceRpc(account),
				fetchTokenBalancesFromRpc(account, marketDataMap),
			]);

			// Update state with RPC balances
			setRawTokenBalances(rpcBalances);
			setUsingRpcFallback(true);
		} catch (error) {
			console.error("[UserDataContext] Force RPC refresh failed:", error);
		}
	}, [account, umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella, fetchUsdcBalanceRpc, fetchTokenBalancesFromRpc]);

	const value = useMemo<UserDataContextValue>(
		() => ({
			orders,
			tokenBalances,
			usdcBalance,
			usdcLoading,
			approvalState,
			loading,
			usingRpcFallback,
			refresh,
			refreshViaRpc,
			loadOrders,
			getTokenBalance,
			checkApproval,
			approveToken,
		}),
		[
			orders,
			tokenBalances,
			usdcBalance,
			usdcLoading,
			approvalState,
			loading,
			usingRpcFallback,
			refresh,
			refreshViaRpc,
			loadOrders,
			getTokenBalance,
			checkApproval,
			approveToken,
		]
	);

	return (
		<UserDataContext.Provider value={value}>
			{children}
		</UserDataContext.Provider>
	);
}

export function useUserData(): UserDataContextValue {
	const ctx = useContext(UserDataContext);
	if (!ctx)
		throw new Error("useUserData must be used within a UserDataProvider");
	return ctx;
}
