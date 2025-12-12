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
import { Contract, JsonRpcProvider, formatUnits, ethers } from "ethers";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { useSignerContext } from "context/SignerContext";
import {
	fetchUserOrders,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import { CTF_ADDRESS, USDC_ADDRESS, EXCHANGE_ADDRESS } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { umbrellaDataService } from "@/services/api/umbrellaDataService";
import { usePredictionData } from "context/PredictionDataContext";

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

	const loadTokenBalances = useCallback(
		async (
			account: string,
			marketDataMap: Map<
				string,
				{ yesTokenId: string; noTokenId: string }
			>
		) => {
			try {
				const provider = getReadProvider();

				const ctf = new Contract(
					CTF_ADDRESS,
					[
						"function balanceOf(address account, uint256 id) view returns (uint256)",
					],
					provider
				);

				const erc20 = new Contract(
					USDC_ADDRESS,
					[
						"function balanceOf(address account) view returns (uint256)",
						"function decimals() view returns (uint8)",
					],
					provider
				);

				// Fetch USDC balance
				const [usdcRaw, usdcDecimals] = await Promise.all([
					erc20.balanceOf(account),
					erc20.decimals(),
				]);
				setUsdcBalance(formatUnits(usdcRaw, usdcDecimals));

				// Fetch CTF token balances with throttling
				const entries = Array.from(marketDataMap.entries());
				const newTokenBalances = new Map<string, TokenBalance>();

				for (let i = 0; i < entries.length; i++) {
					const [marketId, { yesTokenId, noTokenId }] = entries[i];
					try {
						const [yesRaw, noRaw] = await Promise.all([
							ctf.balanceOf(account, yesTokenId),
							ctf.balanceOf(account, noTokenId),
						]);
						newTokenBalances.set(marketId, {
							yesTokenId,
							noTokenId,
							yesBalance: formatUnits(yesRaw, 6),
							noBalance: formatUnits(noRaw, 6),
						});
					} catch (error) {
						console.error(
							`Error fetching balances for market ${marketId}:`,
							error
						);
						newTokenBalances.set(marketId, {
							yesTokenId,
							noTokenId,
							yesBalance: "0",
							noBalance: "0",
						});
					}

					// Brief pause every 20 markets to avoid RPC rate limits
					if ((i + 1) % 20 === 0) {
						await new Promise((r) => setTimeout(r, 50));
					}
				}

				setTokenBalances(newTokenBalances);
			} catch (error) {
				console.error("Error loading token balances:", error);
				setUsdcBalance("0");
				setTokenBalances(new Map());
			}
		},
		[getReadProvider]
	);

	const load = useCallback(async () => {
		if (!account) {
			setOrders([]);
			setTokenBalances(new Map());
			setUsdcBalance(null);
			return;
		}

		setLoading(true);
		try {
			// Build market data map from umbrellas and resolved markets
			const marketDataMap = new Map<
				string,
				{ yesTokenId: string; noTokenId: string }
			>();

			try {
				// Process active markets
				umbrellas.forEach((u: any) => {
					const marketsForUmb = getAllQuestionsForUmbrella(
						u._id
					) as any[];
					marketsForUmb.forEach((market: any) => {
						const marketId =
							market?._id ||
							market?.questionId ||
							market?.marketId;
						if (
							marketId &&
							market?.yesTokenId &&
							market?.noTokenId
						) {
							marketDataMap.set(marketId, {
								yesTokenId: market.yesTokenId,
								noTokenId: market.noTokenId,
							});
						}
					});
				});

				// Process resolved markets
				Object.values(resolvedMarketsByUmbrella).forEach(
					(resolvedMarkets) => {
						resolvedMarkets.forEach((market: any) => {
							const marketId =
								market?._id ||
								market?.questionId ||
								market?.marketId;
							if (
								marketId &&
								market?.yesTokenId &&
								market?.noTokenId
							) {
								marketDataMap.set(marketId, {
									yesTokenId: market.yesTokenId,
									noTokenId: market.noTokenId,
								});
							}
						});
					}
				);

				// Also fetch ALL umbrellas (including inactive) to ensure we have market data
				// for orders from inactive umbrellas
				try {
					const allUmbrellas =
						await umbrellaDataService.fetchAllUmbrellas();
					const allMarkets = await Promise.all(
						allUmbrellas.map((u: any) =>
							umbrellaDataService.fetchQuestionsForUmbrella(u, {
								includeResolved: true,
							})
						)
					);
					allMarkets.flat().forEach((market: any) => {
						const marketId =
							market?._id ||
							market?.questionId ||
							market?.marketId;
						if (
							marketId &&
							market?.yesTokenId &&
							market?.noTokenId
						) {
							// Only add if not already in map (active markets take precedence)
							if (!marketDataMap.has(marketId)) {
								marketDataMap.set(marketId, {
									yesTokenId: market.yesTokenId,
									noTokenId: market.noTokenId,
								});
							}
						}
					});
				} catch (error) {
					// If fetching all umbrellas fails, continue with what we have
					console.warn(
						"Failed to fetch all umbrellas for market data map:",
						error
					);
				}
			} catch {
				// Fallback to direct fetch if prediction data not ready
				const umbrellasDirect =
					await umbrellaDataService.fetchAllUmbrellas();
				const markets = await Promise.all(
					umbrellasDirect.map((u: any) =>
						umbrellaDataService.fetchQuestionsForUmbrella(u, {
							includeResolved: true,
						})
					)
				);
				markets.flat().forEach((market: any) => {
					const marketId =
						market?._id || market?.questionId || market?.marketId;
					if (marketId && market?.yesTokenId && market?.noTokenId) {
						marketDataMap.set(marketId, {
							yesTokenId: market.yesTokenId,
							noTokenId: market.noTokenId,
						});
					}
				});
			}

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

			console.log(
				`📊 Balance check optimization: ${filteredMarketDataMap.size} markets with positions (vs ${marketDataMap.size} total markets)`
			);

			// Load balances and check approval in parallel (only for traded markets)
			await Promise.all([
				loadTokenBalances(account, filteredMarketDataMap),
				checkApproval(),
			]);
		} finally {
			setLoading(false);
		}
	}, [
		account,
		checkApproval,
		loadTokenBalances,
		umbrellas,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
	]);

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

	// Throttle initial and dependency-driven reloads to prevent rapid RPC bursts
	useEffect(() => {
		if (!account) return;
		// Ensure markets are available before attempting load
		if (!Array.isArray(umbrellas) || umbrellas.length === 0) return;
		const t = setTimeout(load, 200);
		return () => clearTimeout(t);
	}, [account, umbrellas]); // Removed 'load' from dependencies to prevent circular dependency

	const value = useMemo<UserDataContextValue>(
		() => ({
			orders,
			tokenBalances,
			usdcBalance,
			approvalState,
			loading,
			refresh: load,
			getTokenBalance,
			checkApproval,
			approveToken,
		}),
		[
			orders,
			tokenBalances,
			usdcBalance,
			approvalState,
			loading,
			load,
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
