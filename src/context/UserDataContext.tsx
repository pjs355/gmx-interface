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
import { CTF_ADDRESS, USDC_ADDRESS, EXCHANGE_ADDRESS } from "config/addresses";
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
	refresh: () => Promise<void>;
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
			
			const email = user.email?.address || user.google?.email || user.twitter?.email || null;
			const name = user.name || user.google?.name || user.twitter?.name || null;
			
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
				USDC_ADDRESS,
				[
					"function allowance(address owner, address spender) view returns (uint256)",
				],
				provider
			);
			const ctfContract = new Contract(
				CTF_ADDRESS,
				[
					"function isApprovedForAll(address owner, address operator) view returns (bool)",
				],
				provider
			);

			const [usdcAllowance, hasCtfApproval] = await Promise.all([
				usdcContract.allowance(account, EXCHANGE_ADDRESS),
				ctfContract.isApprovedForAll(account, EXCHANGE_ADDRESS),
			]);

			const hasUsdcApproval = usdcAllowance > 0n;
			const isApproved = hasUsdcApproval && hasCtfApproval;

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
				USDC_ADDRESS,
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
	 * Fetch token balances from subgraph (positions only, not USDC)
	 */
	const fetchTokenBalancesFromSubgraph = useCallback(async (walletAddress: string) => {
		// Skip if we've already fetched for this account (prevents StrictMode double-fetch)
		if (subgraphFetchedRef.current === walletAddress) return;

		try {
			const subgraphAccount = await subgraphService.getUserAccount(walletAddress);

			if (!subgraphAccount) {
				// User has never interacted with the contracts
				setRawTokenBalances([]);
				subgraphFetchedRef.current = walletAddress;
				return;
			}

			// Store raw token balances for later mapping (NOT usdc - that comes from RPC)
			setRawTokenBalances(subgraphAccount.tokenBalances);
			subgraphFetchedRef.current = walletAddress;
		} catch (error) {
			console.error("Error loading token balances from subgraph:", error);
			setRawTokenBalances([]);
		}
	}, []);

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

	const load = useCallback(async () => {
		if (!account) {
			setOrders([]);
			setTokenBalances(new Map());
			setUsdcBalance(null);
			loadedForAccountRef.current = null;
			return;
		}

		// Skip if we've already loaded for this account (prevents StrictMode double-load)
		if (loadedForAccountRef.current === account) return;
		loadedForAccountRef.current = account;

		setLoading(true);
		try {
			// Build market data map from already-loaded context data
			// No additional API calls needed - subgraph already has the balances
			const marketDataMap = new Map<
				string,
				{ yesTokenId: string; noTokenId: string }
			>();

			// Process active markets from context (already loaded)
			umbrellas.forEach((u: any) => {
				const marketsForUmb = getAllQuestionsForUmbrella(u._id) as any[];
				marketsForUmb.forEach((market: any) => {
					const marketId =
						market?._id || market?.questionId || market?.marketId;
					if (marketId && market?.yesTokenId && market?.noTokenId) {
						marketDataMap.set(marketId, {
							yesTokenId: market.yesTokenId,
							noTokenId: market.noTokenId,
						});
					}
				});
			});

			// Process resolved markets from context (already loaded)
			Object.values(resolvedMarketsByUmbrella).forEach((resolvedMarkets) => {
				resolvedMarkets.forEach((market: any) => {
					const marketId =
						market?._id || market?.questionId || market?.marketId;
					if (marketId && market?.yesTokenId && market?.noTokenId) {
						marketDataMap.set(marketId, {
							yesTokenId: market.yesTokenId,
							noTokenId: market.noTokenId,
						});
					}
				});
			});

			// Fetch user orders FIRST to determine which markets to check balances for
			const userOrders = await fetchUserOrders(account, marketDataMap);
			setOrders(userOrders);

			// Extract unique market IDs from user's order history
			const tradedMarketIds = new Set(
				userOrders.map((order) => order.questionId)
			);

			// Filter marketDataMap to only include markets the user has traded
			const filteredMarketDataMap = new Map<
				string,
				{ yesTokenId: string; noTokenId: string }
			>();
			tradedMarketIds.forEach((marketId) => {
				const marketData = marketDataMap.get(marketId as string);
				if (marketData) {
					filteredMarketDataMap.set(marketId, marketData);
				}
			});

			// Store the filtered map and immediately map any existing subgraph balances
			filteredMarketDataMapRef.current = filteredMarketDataMap;
			const currentRawBalances = rawTokenBalancesRef.current;
			if (currentRawBalances.length > 0) {
				// Create reverse lookup: tokenId -> { marketId, isYes }
				const tokenToMarket = new Map<string, { marketId: string; isYes: boolean }>();
				for (const [marketId, { yesTokenId, noTokenId }] of filteredMarketDataMap.entries()) {
					tokenToMarket.set(yesTokenId, { marketId, isYes: true });
					tokenToMarket.set(noTokenId, { marketId, isYes: false });
				}

				// Build result map
				const result = new Map<
					string,
					{ yesTokenId: string; noTokenId: string; yesBalance: string; noBalance: string }
				>();

				// Initialize markets with zero balances
				for (const [marketId, { yesTokenId, noTokenId }] of filteredMarketDataMap.entries()) {
					result.set(marketId, {
						yesTokenId,
						noTokenId,
						yesBalance: "0.000000",
						noBalance: "0.000000",
					});
				}

				// Fill in actual balances
				for (const tb of currentRawBalances) {
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
			}

			// Check approval (this still uses RPC for now)
			await checkApproval();
		} finally {
			setLoading(false);
		}
		// Note: rawTokenBalances is intentionally NOT in deps to prevent re-triggering load
		// when subgraph data arrives. The mapping is handled by the separate effect below.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [
		account,
		checkApproval,
		umbrellas,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
	]);

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

			// Approve USDC
			const usdcAbi = [
				"function approve(address spender, uint256 amount) returns (bool)",
			];

			if (useSmartWallet) {
				const smartWalletClient = await getClientForChain({ id: 8453 });
				if (!smartWalletClient)
					throw new Error("No smart wallet client available");

				const usdcInterface = new ethers.Interface(usdcAbi);
				const approvalData = usdcInterface.encodeFunctionData(
					"approve",
					[EXCHANGE_ADDRESS, ethers.MaxUint256]
				);

				await smartWalletClient.sendTransaction({
					to: USDC_ADDRESS as `0x${string}`,
					data: approvalData as `0x${string}`,
					value: 0n,
				});
			} else if (useExternalWallet && externalWallet) {
				const eip1193 = await externalWallet.getEthereumProvider();
				const provider = new ethers.BrowserProvider(eip1193 as any);
				const signer = await provider.getSigner();

				const usdcContract = new ethers.Contract(
					USDC_ADDRESS,
					usdcAbi,
					signer
				);
				const tx = await usdcContract.approve(
					EXCHANGE_ADDRESS,
					ethers.MaxUint256
				);
				await tx.wait();
			} else {
				throw new Error("No compatible wallet found");
			}

			// Brief delay between transactions
			await new Promise((r) => setTimeout(r, 1500));

			// Approve CTF (ERC1155) operator
			const ctfAbi = [
				"function setApprovalForAll(address operator, bool approved)",
			];

			if (useSmartWallet) {
				const smartWalletClient = await getClientForChain({ id: 8453 });
				if (!smartWalletClient)
					throw new Error("No smart wallet client available");

				const ctfInterface = new ethers.Interface(ctfAbi);
				const ctfData = ctfInterface.encodeFunctionData(
					"setApprovalForAll",
					[EXCHANGE_ADDRESS, true]
				);

				await smartWalletClient.sendTransaction({
					to: CTF_ADDRESS as `0x${string}`,
					data: ctfData as `0x${string}`,
					value: 0n,
				});
			} else if (useExternalWallet && externalWallet) {
				const eip1193 = await externalWallet.getEthereumProvider();
				const provider = new ethers.BrowserProvider(eip1193 as any);
				const signer = await provider.getSigner();

				const ctfContract = new ethers.Contract(
					CTF_ADDRESS,
					ctfAbi,
					signer
				);
				const tx = await ctfContract.setApprovalForAll(
					EXCHANGE_ADDRESS,
					true
				);
				await tx.wait();
			} else {
				throw new Error("No compatible wallet found");
			}

			// Brief delay between transactions
			await new Promise((r) => setTimeout(r, 1500));

			// Approve USDC for fee collection address
			const FEE_COLLECTION_ADDRESS = "0xf4cb13220544e1f151bCb5367Fb0A87e185f78Df";

			if (useSmartWallet) {
				const smartWalletClient = await getClientForChain({ id: 8453 });
				if (!smartWalletClient)
					throw new Error("No smart wallet client available");

				const usdcInterface = new ethers.Interface(usdcAbi);
				const feeApprovalData = usdcInterface.encodeFunctionData(
					"approve",
					[FEE_COLLECTION_ADDRESS, ethers.MaxUint256]
				);

				await smartWalletClient.sendTransaction({
					to: USDC_ADDRESS as `0x${string}`,
					data: feeApprovalData as `0x${string}`,
					value: 0n,
				});
			} else if (useExternalWallet && externalWallet) {
				const eip1193 = await externalWallet.getEthereumProvider();
				const provider = new ethers.BrowserProvider(eip1193 as any);
				const signer = await provider.getSigner();

				const usdcContract = new ethers.Contract(
					USDC_ADDRESS,
					usdcAbi,
					signer
				);
				const tx = await usdcContract.approve(
					FEE_COLLECTION_ADDRESS,
					ethers.MaxUint256
				);
				await tx.wait();
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
	// Refresh function that clears the skip-check refs to allow full reload
	const refresh = useCallback(async () => {
		if (!account) return;
		loadedForAccountRef.current = null;
		subgraphFetchedRef.current = null;
		usdcFetchedRef.current = null;
		// Refetch USDC via RPC, token positions via subgraph, and reload orders/approvals
		await Promise.all([
			fetchUsdcBalanceRpc(account),
			fetchTokenBalancesFromSubgraph(account),
			load(),
		]);
	}, [account, fetchUsdcBalanceRpc, fetchTokenBalancesFromSubgraph, load]);

	const value = useMemo<UserDataContextValue>(
		() => ({
			orders,
			tokenBalances,
			usdcBalance,
			usdcLoading,
			approvalState,
			loading,
			refresh,
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
			refresh,
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
