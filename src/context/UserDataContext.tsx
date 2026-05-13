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
import { Contract, JsonRpcProvider, ethers } from "ethers";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useSignerContext } from "context/SignerContext";
import {
	fetchUserOrders,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import { getCTFAddress, getUSDCAddress, getExchangeAddress, getFeeWrapperAddress } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { usePredictionData } from "context/PredictionDataContext";
import { findEvmPrivyEmbeddedWallet, type PrivyWalletListEntry } from "@/trading/polymarket/privyEmbeddedWallet";
import {
	parsePrivyEvmTxHash,
	waitForBaseTransactionSuccess,
} from "@/trading/base/waitPrivyBaseTxReceipt";
import { fromMicroUnits } from "@/helpers/ctfMicroUnits";
import { fetchNonZeroCtfBalancesRpc } from "@/helpers/fetchNonZeroCtfBalancesRpc";

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

/**
 * Where LevelUp share-position rows came from on the most recent fetch.
 * Token balances are read via Base RPC (`balanceOf` on the CTF contract).
 */
export type LevelUpPositionsSource = "rpc" | "none";

type UserDataContextValue = {
	orders: ProcessedOrder[];
	tokenBalances: Map<string, TokenBalance>; // marketId -> TokenBalance
	approvalState: ApprovalState;
	loading: boolean;
	/**
	 * @deprecated Always false (positions are RPC-only). Kept for legacy consumers.
	 */
	usingRpcFallback: boolean;
	/** Explicit replacement for `usingRpcFallback` — what produced the rows. */
	levelUpPositionsSource: LevelUpPositionsSource;
	/**
	 * Set when the last on-chain positions fetch failed. `null` on success.
	 */
	levelUpPositionsError: string | null;
	refresh: () => Promise<void>;
	/**
	 * Force refresh of outcome-token balances (`balanceOf` on CTF).
	 */
	refreshTokenPositions: () => Promise<void>;
	loadOrders: () => Promise<void>; // Lazy: call when orders are needed (e.g. Positions page)
	getTokenBalance: (marketId: string) => TokenBalance | null;
	/** Refreshes on-chain approval flags; returns whether LevelUp trading is fully approved. */
	checkApproval: () => Promise<boolean>;
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
	const [approvalState, setApprovalState] = useState<ApprovalState>({
		isApproved: false,
		isChecking: false,
		isApproving: false,
	});
	const [usingRpcFallback, setUsingRpcFallback] = useState(false);
	const [levelUpPositionsSource, setLevelUpPositionsSource] =
		useState<LevelUpPositionsSource>("none");
	const [levelUpPositionsError, setLevelUpPositionsError] = useState<
		string | null
	>(null);

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

	const checkApproval = useCallback(async (): Promise<boolean> => {
		if (!account) {
			setApprovalState({
				isApproved: false,
				isChecking: false,
				isApproving: false,
			});
			return false;
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
			return isApproved;
		} catch (error) {
			console.error("Error checking approval:", error);
			setApprovalState((prev) => ({ ...prev, isChecking: false }));
			return false;
		}
	}, [account, getReadProvider]);

	const { umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella } =
		usePredictionData();

	// Store filtered market data map for balance mapping (declared early for use in load)
	const filteredMarketDataMapRef = useRef<Map<string, { yesTokenId: string; noTokenId: string }>>(new Map());

	// Raw CTF balances by token id (micro-units as decimal string); mapped via `PredictionData`.
	const [rawTokenBalances, setRawTokenBalances] = useState<
		Array<{ tokenId: string; balance: string }>
	>([]);
	const rawTokenBalancesRef = useRef<Array<{ tokenId: string; balance: string }>>([]);
	const positionsFetchedRef = useRef<string | null>(null);

	// Keep ref in sync with state
	useEffect(() => {
		rawTokenBalancesRef.current = rawTokenBalances;
	}, [rawTokenBalances]);

	/**
	 * Fetch on-chain CTF outcome token balances for known markets (`balanceOf`).
	 * This queries the ERC1155 contract directly for each token ID
	 */
	const fetchTokenBalancesFromRpc = useCallback(
		async (
			walletAddress: string,
			marketDataMap: Map<string, { yesTokenId: string; noTokenId: string }>,
		): Promise<Array<{ tokenId: string; balance: string }>> => {
			const provider = getReadProvider();
			const tokenIds = new Set<string>();
			for (const { yesTokenId, noTokenId } of marketDataMap.values()) {
				if (yesTokenId) tokenIds.add(yesTokenId);
				if (noTokenId) tokenIds.add(noTokenId);
			}
			return fetchNonZeroCtfBalancesRpc(provider, walletAddress, tokenIds);
		},
		[getReadProvider],
	);

	/**
	 * Map raw token balances to market IDs once market data is available.
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

	const fetchLevelUpPositions = useCallback(
		async (walletAddress: string, force: boolean) => {
			if (!force && positionsFetchedRef.current === walletAddress) return;
			const marketDataMap = buildMarketDataMap();
			if (marketDataMap.size === 0) {
				setRawTokenBalances([]);
				if (!Array.isArray(umbrellas) || umbrellas.length === 0) {
					positionsFetchedRef.current = null;
					setLevelUpPositionsSource("none");
				} else {
					positionsFetchedRef.current = walletAddress;
					setLevelUpPositionsSource("rpc");
				}
				setUsingRpcFallback(false);
				setLevelUpPositionsError(null);
				return;
			}
			try {
				const rpcBalances = await fetchTokenBalancesFromRpc(
					walletAddress,
					marketDataMap,
				);
				setRawTokenBalances(rpcBalances);
				positionsFetchedRef.current = walletAddress;
				setUsingRpcFallback(false);
				setLevelUpPositionsSource("rpc");
				setLevelUpPositionsError(null);
			} catch (err) {
				console.error("Error loading token balances from RPC:", err);
				setRawTokenBalances([]);
				positionsFetchedRef.current = null;
				setLevelUpPositionsSource("none");
				const msg = err instanceof Error ? err.message : String(err);
				setLevelUpPositionsError(msg);
			}
		},
		[buildMarketDataMap, fetchTokenBalancesFromRpc, umbrellas],
	);

	useEffect(() => {
		if (!account) {
			setRawTokenBalances([]);
			positionsFetchedRef.current = null;
			setLevelUpPositionsSource("none");
			setLevelUpPositionsError(null);
			return;
		}
		if (!Array.isArray(umbrellas) || umbrellas.length === 0) {
			setRawTokenBalances([]);
			positionsFetchedRef.current = null;
			return;
		}
		void fetchLevelUpPositions(account, false);
	}, [account, umbrellas, fetchLevelUpPositions]);

	const load = useCallback(async () => {
		if (!account) {
			setOrders([]);
			setTokenBalances(new Map());
			loadedForAccountRef.current = null;
			return;
		}

		if (loadedForAccountRef.current === account) return;
		loadedForAccountRef.current = account;

		setLoading(true);
		try {
			const marketDataMap = buildMarketDataMap();
			filteredMarketDataMapRef.current = marketDataMap;

			// Map any already-available raw token balances to market IDs
			const currentRawBalances = rawTokenBalancesRef.current;
			if (currentRawBalances.length > 0) {
				setTokenBalances(
					mapTokenBalancesToMarkets(currentRawBalances, marketDataMap),
				);
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

	// When raw balances update, remap into `tokenBalances` if market data is ready
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

			const embeddedWallet = findEvmPrivyEmbeddedWallet(
				(privyWallets || []) as readonly PrivyWalletListEntry[]
			) as { address?: string } | undefined;

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
				const batched = await smartWalletClient.sendTransaction({
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
				await waitForBaseTransactionSuccess(
					parsePrivyEvmTxHash(batched),
					"LevelUp batched USDC/CTF approvals",
				);
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
		positionsFetchedRef.current = null;
		await Promise.all([fetchLevelUpPositions(account, true), load()]);
	}, [account, fetchLevelUpPositions, load]);

	/**
	 * Force refresh of CTF outcome balances from RPC.
	 * Collateral balances: use `useCollateralTokens().refetch()` separately.
	 */
	const refreshTokenPositions = useCallback(async () => {
		if (!account) return;

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
			const rpcBalances = await fetchTokenBalancesFromRpc(account, marketDataMap);
			setRawTokenBalances(rpcBalances);
			setUsingRpcFallback(false);
			setLevelUpPositionsSource("rpc");
			setLevelUpPositionsError(null);
		} catch (err) {
			console.error("[UserDataContext] refreshTokenPositions RPC failed:", err);
			const msg = err instanceof Error ? err.message : String(err);
			setLevelUpPositionsError(msg);
		}
	}, [account, umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella, fetchTokenBalancesFromRpc]);

	const value = useMemo<UserDataContextValue>(
		() => ({
			orders,
			tokenBalances,
			approvalState,
			loading,
			usingRpcFallback,
			levelUpPositionsSource,
			levelUpPositionsError,
			refresh,
			refreshTokenPositions,
			loadOrders,
			getTokenBalance,
			checkApproval,
			approveToken,
		}),
		[
			orders,
			tokenBalances,
			approvalState,
			loading,
			usingRpcFallback,
			levelUpPositionsSource,
			levelUpPositionsError,
			refresh,
			refreshTokenPositions,
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
