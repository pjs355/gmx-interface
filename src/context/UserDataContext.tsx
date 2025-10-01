import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { Contract, JsonRpcProvider, formatUnits, ethers } from "ethers";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import useWallet from "lib/wallets/useWallet";
import { fetchUserOrders, type ProcessedOrder } from "lib/simplifiedOrderService";
import { CTF_ADDRESS, USDC_ADDRESS, EXCHANGE_ADDRESS } from "config/addresses";
import { umbrellaDataService } from "lib/umbrellaDataService";
import { usePredictionData } from "context/PredictionDataContext";

// Addresses centralized in config/addresses
const BASE_PUBLIC_RPC = "https://base-mainnet.infura.io/v3/5b51ad43553b44ffabc2980afa70f7ae";

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
  const { getDataAddress } = useWallet();
  const account = getDataAddress();
  const { wallets: privyWallets } = usePrivyWallets();
  const { getClientForChain } = useSmartWallets();
  const [loading, setLoading] = useState(false);
  const [orders, setOrders] = useState<ProcessedOrder[]>([]);
  const [tokenBalances, setTokenBalances] = useState<Map<string, TokenBalance>>(new Map());
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [approvalState, setApprovalState] = useState<ApprovalState>({ 
    isApproved: false, 
    isChecking: false, 
    isApproving: false 
  });

  // Cache a single provider instance to avoid repeated EIP-1193 calls (eth_accounts, eth_chainId)
  // Reserved for future signer-based flows
  // const providerRef = useRef<BrowserProvider | JsonRpcProvider | null>(null);
  const readProviderRef = useRef<JsonRpcProvider | null>(null);

  // Removed unused resolveProvider to avoid warnings; transactions use smart wallet client directly

  const getReadProvider = useCallback((): JsonRpcProvider => {
    if (readProviderRef.current) return readProviderRef.current;
    readProviderRef.current = new JsonRpcProvider(BASE_PUBLIC_RPC);
    return readProviderRef.current;
  }, []);

  const checkApproval = useCallback(async () => {
    if (!account) return;
    
    setApprovalState((prev) => ({ ...prev, isChecking: true }));
    
    try {
      const provider = getReadProvider();

      const usdcContract = new Contract(
        USDC_ADDRESS,
        ["function allowance(address owner, address spender) view returns (uint256)"],
        provider
      );
      const ctfRead = new Contract(
        CTF_ADDRESS,
        ["function isApprovedForAll(address owner, address operator) view returns (bool)"],
        provider
      );

      const usdcAllowance: bigint = await usdcContract.allowance(account, EXCHANGE_ADDRESS);
      const hasUsdcApproval = usdcAllowance > 0n;
      const hasCtfApproval: boolean = await ctfRead.isApprovedForAll(account, EXCHANGE_ADDRESS);

      setApprovalState((prev) => ({ 
        ...prev, 
        isApproved: hasUsdcApproval && hasCtfApproval, 
        isChecking: false 
      }));
    } catch (error) {
      console.error("Error checking approval:", error);
      setApprovalState((prev) => ({ ...prev, isChecking: false }));
    }
  }, [account, privyWallets]);

  const { umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella } = usePredictionData();

  const load = useCallback(async () => {
    if (!account) {
      setOrders([]);
      setTokenBalances(new Map());
      setUsdcBalance(null);
      return;
    }
    setLoading(true);
    try {
      // Build market data map once from already-loaded PredictionData (includes resolved)
      const marketDataMap = new Map<string, { yesTokenId: string; noTokenId: string }>();
      try {
        // Process active markets from umbrellas
        umbrellas.forEach((u: any) => {
          const marketsForUmb = getAllQuestionsForUmbrella(u._id) as any[];
          marketsForUmb.forEach((market: any) => {
            const marketId = market?._id || market?.questionId || market?.marketId;
            if (marketId && market?.yesTokenId && market?.noTokenId) {
              marketDataMap.set(marketId, { yesTokenId: market.yesTokenId, noTokenId: market.noTokenId });
            }
          });
        });
        
        // Process resolved markets separately
        // Quiet user data debug logs
        Object.entries(resolvedMarketsByUmbrella).forEach(([umbrellaId, resolvedMarkets]) => {
          // Quiet user data debug logs
          resolvedMarkets.forEach((market: any) => {
            const marketId = market?._id || market?.questionId || market?.marketId;
            if (marketId && market?.yesTokenId && market?.noTokenId) {
              // Quiet user data debug logs
              marketDataMap.set(marketId, { yesTokenId: market.yesTokenId, noTokenId: market.noTokenId });
            } else {
              // Quiet user data debug logs
            }
          });
        });
        
        // Quiet user data debug logs
      } catch {
        // Fallback to direct fetch if prediction data not ready
        const umbrellasDirect = await umbrellaDataService.fetchAllUmbrellas();
        const markets = await Promise.all(
          umbrellasDirect.map((u) => umbrellaDataService.fetchQuestionsForUmbrella(u, { includeResolved: true }))
        );
        markets.flat().forEach((market: any) => {
          const marketId = market?._id || market?.questionId || market?.marketId;
          if (marketId && market?.yesTokenId && market?.noTokenId) {
            marketDataMap.set(marketId, { yesTokenId: market.yesTokenId, noTokenId: market.noTokenId });
          }
        });
      }
      
      // Fetch user orders
      const userOrders = await fetchUserOrders(account, marketDataMap);
      setOrders(userOrders);

      // Fetch token balances
      await loadTokenBalances(account, marketDataMap);
      
      // Check approval status
      await checkApproval();
    } finally {
      setLoading(false);
    }
  }, [account, privyWallets, checkApproval, umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella]);

  const loadTokenBalances = useCallback(async (account: string, marketDataMap: Map<string, { yesTokenId: string; noTokenId: string }>) => {
    try {
      const provider = getReadProvider();

      const ctf = new Contract(CTF_ADDRESS, [
        "function balanceOf(address account, uint256 id) view returns (uint256)",
      ], provider);

      const erc20 = new Contract(USDC_ADDRESS, [
        "function balanceOf(address account) view returns (uint256)",
        "function decimals() view returns (uint8)",
      ], provider);

      // Fetch USDC balance
      const [usdcRaw, usdcDecimals] = await Promise.all([
        erc20.balanceOf(account),
        erc20.decimals(),
      ]);
      setUsdcBalance(formatUnits(usdcRaw, usdcDecimals));

      // Fetch CTF token balances with throttling to avoid RPC batch limits
      const entries = Array.from(marketDataMap.entries());
      const newTokenBalances = new Map<string, TokenBalance>();
      let processed = 0;
      for (const [marketId, { yesTokenId, noTokenId }] of entries) {
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
          console.error(`Error fetching balances for market ${marketId}:`, error);
          newTokenBalances.set(marketId, {
            yesTokenId,
            noTokenId,
            yesBalance: "0",
            noBalance: "0",
          });
        }

        processed += 1;
        // Brief pause every 20 markets to avoid provider batching too many calls
        if (processed % 20 === 0) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      
      setTokenBalances(newTokenBalances);
    } catch (error) {
      console.error('Error loading token balances:', error);
      setUsdcBalance("0");
      setTokenBalances(new Map());
    }
  }, [privyWallets]);

  const getTokenBalance = useCallback((marketId: string) => {
    return tokenBalances.get(marketId) || null;
  }, [tokenBalances]);

  const approveToken = useCallback(async () => {
    if (!account) return;
    
    setApprovalState((prev) => ({ ...prev, isApproving: true }));
    
    try {
      // Check current approval status first
      await checkApproval();
      if (approvalState.isApproved) {
        setApprovalState((prev) => ({ ...prev, isApproving: false }));
        return;
      }

      let embeddedWallet: any = Array.isArray(privyWallets)
        ? (privyWallets as any[]).find((w) => w?.type === "embedded_wallet") || (privyWallets as any[])[0]
        : undefined;

      const hasSmartWallet = Boolean(embeddedWallet);

      // Approve USDC
      const usdcAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
      const usdcInterface = new ethers.Interface(usdcAbi);
      const approvalData = usdcInterface.encodeFunctionData("approve", [EXCHANGE_ADDRESS, ethers.MaxUint256]);

      if (hasSmartWallet) {
        const smartWalletClient = await getClientForChain({ id: 8453 });
        if (!smartWalletClient) throw new Error("No smart wallet client available for Base chain");
        await smartWalletClient.sendTransaction({ 
          to: USDC_ADDRESS as `0x${string}`, 
          data: approvalData as `0x${string}`, 
          value: 0n 
        });
      } else {
        // For external wallets, we'd need a signer - this would need to be passed in
        throw new Error("External wallet approval not implemented in context");
      }

      await new Promise((r) => setTimeout(r, 1500));

      // Approve CTF (ERC1155) operator
      const ctfAbi = ["function setApprovalForAll(address operator, bool approved)"];
      if (hasSmartWallet) {
        const smartWalletClient = await getClientForChain({ id: 8453 });
        if (!smartWalletClient) throw new Error("No smart wallet client available for Base chain");
        const ctfInterface = new ethers.Interface(ctfAbi);
        const ctfData = ctfInterface.encodeFunctionData("setApprovalForAll", [EXCHANGE_ADDRESS, true]);
        await smartWalletClient.sendTransaction({ 
          to: CTF_ADDRESS as `0x${string}`, 
          data: ctfData as `0x${string}`, 
          value: 0n 
        });
      } else {
        throw new Error("External wallet approval not implemented in context");
      }

      // Re-check approval status
      await checkApproval();
      setApprovalState((prev) => ({ ...prev, isApproving: false, isApproved: true }));
    } catch (error) {
      console.error("Error approving tokens:", error);
      setApprovalState((prev) => ({ ...prev, isApproving: false }));
    }
  }, [account, checkApproval, approvalState.isApproved, privyWallets]);

  // Throttle initial and dependency-driven reloads to prevent rapid RPC bursts
  useEffect(() => {
    if (!account) return;
    // Ensure markets are available before attempting load
    if (!Array.isArray(umbrellas) || umbrellas.length === 0) return;
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [account, load, umbrellas]);

  const value = useMemo<UserDataContextValue>(() => ({ 
    orders, 
    tokenBalances, 
    usdcBalance, 
    approvalState,
    loading, 
    refresh: load, 
    getTokenBalance,
    checkApproval,
    approveToken
  }), [orders, tokenBalances, usdcBalance, approvalState, loading, load, getTokenBalance, checkApproval, approveToken]);
  
  return <UserDataContext.Provider value={value}>{children}</UserDataContext.Provider>;
}

export function useUserData(): UserDataContextValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) throw new Error("useUserData must be used within a UserDataProvider");
  return ctx;
}


