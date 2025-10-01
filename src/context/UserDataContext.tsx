import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { Contract, JsonRpcProvider, formatUnits, ethers } from "ethers";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import useWallet from "lib/wallets/useWallet";
import { fetchUserOrders, type ProcessedOrder } from "lib/simplifiedOrderService";
import { CTF_ADDRESS, USDC_ADDRESS, EXCHANGE_ADDRESS } from "config/addresses";
import { DEFAULT_RPC_URL } from "config/rpc";
import { umbrellaDataService } from "lib/umbrellaDataService";
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
  const { getDataAddress } = useWallet();
  const account = getDataAddress();
  const { user } = usePrivy();
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
    readProviderRef.current = new JsonRpcProvider(DEFAULT_RPC_URL);
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

      // Add detailed console logging for debugging
      console.log("🔍 APPROVAL CHECK DEBUG:", {
        account,
        usdcAllowance: usdcAllowance.toString(),
        usdcAllowanceFormatted: formatUnits(usdcAllowance, 6),
        hasUsdcApproval,
        hasCtfApproval,
        overallApproved: hasUsdcApproval && hasCtfApproval,
        walletType: "checking wallet types...",
        privyWallets: privyWallets?.map((w: any) => ({
          type: w.type,
          walletClientType: w.walletClientType,
          connectorType: w.connectorType,
          address: w.address
        }))
      });

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
        Object.entries(resolvedMarketsByUmbrella).forEach(([, resolvedMarkets]) => {
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

      // Detect wallet type properly
      const smartWalletAccount = (user?.linkedAccounts || [])
        .find((acct: any) => acct?.type === "smart_wallet") as any;
      const smartAddress = smartWalletAccount?.address;
      
      const embeddedWallet = (privyWallets || []).find((w: any) => 
        w?.type === "embedded_wallet" || 
        w?.walletClientType === "privy" || 
        w?.connectorType === "privy"
      );
      
      const externalWallet = (privyWallets || []).find((w: any) => 
        w?.type === "wallet" || 
        w?.connectorType !== "privy"
      );

      const hasSmartWallet = Boolean(smartAddress);
      const hasEmbeddedWallet = Boolean(embeddedWallet);
      const hasExternalWallet = Boolean(externalWallet);

      console.log("🔍 WALLET TYPE DETECTION:", {
        smartAddress,
        hasSmartWallet,
        hasEmbeddedWallet,
        hasExternalWallet,
        embeddedWallet: embeddedWallet ? {
          type: embeddedWallet.type,
          walletClientType: embeddedWallet.walletClientType,
          connectorType: embeddedWallet.connectorType,
          address: embeddedWallet.address
        } : null,
        externalWallet: externalWallet ? {
          type: externalWallet.type,
          walletClientType: externalWallet.walletClientType,
          connectorType: externalWallet.connectorType,
          address: externalWallet.address
        } : null
      });

      // Approve USDC
      const usdcAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
      const usdcInterface = new ethers.Interface(usdcAbi);
      const approvalData = usdcInterface.encodeFunctionData("approve", [EXCHANGE_ADDRESS, ethers.MaxUint256]);

      if (hasSmartWallet || hasEmbeddedWallet) {
        // Use smart wallet client for embedded/smart wallets
        const smartWalletClient = await getClientForChain({ id: 8453 });
        if (!smartWalletClient) throw new Error("No smart wallet client available for Base chain");
        await smartWalletClient.sendTransaction({ 
          to: USDC_ADDRESS as `0x${string}`, 
          data: approvalData as `0x${string}`, 
          value: 0n 
        });
        console.log("✅ USDC approved via smart wallet");
      } else if (hasExternalWallet && externalWallet) {
        // Use external wallet signer
        if (typeof externalWallet.getEthereumProvider !== "function") {
          throw new Error("External wallet does not support getEthereumProvider");
        }
        
        const eip1193 = await externalWallet!.getEthereumProvider();
        const provider = new ethers.BrowserProvider(eip1193 as any);
        const signer = await provider.getSigner();
        
        const usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, signer);
        const tx = await usdcContract.approve(EXCHANGE_ADDRESS, ethers.MaxUint256);
        await tx.wait();
        console.log("✅ USDC approved via external wallet");
      } else {
        throw new Error("No compatible wallet found for approval");
      }

      await new Promise((r) => setTimeout(r, 1500));

      // Approve CTF (ERC1155) operator
      const ctfAbi = ["function setApprovalForAll(address operator, bool approved)"];
      if (hasSmartWallet || hasEmbeddedWallet) {
        const smartWalletClient = await getClientForChain({ id: 8453 });
        if (!smartWalletClient) throw new Error("No smart wallet client available for Base chain");
        const ctfInterface = new ethers.Interface(ctfAbi);
        const ctfData = ctfInterface.encodeFunctionData("setApprovalForAll", [EXCHANGE_ADDRESS, true]);
        await smartWalletClient.sendTransaction({ 
          to: CTF_ADDRESS as `0x${string}`, 
          data: ctfData as `0x${string}`, 
          value: 0n 
        });
        console.log("✅ CTF approved via smart wallet");
      } else if (hasExternalWallet && externalWallet) {
        const eip1193 = await externalWallet!.getEthereumProvider();
        const provider = new ethers.BrowserProvider(eip1193 as any);
        const signer = await provider.getSigner();
        
        const ctfContract = new ethers.Contract(CTF_ADDRESS, ctfAbi, signer);
        const tx = await ctfContract.setApprovalForAll(EXCHANGE_ADDRESS, true);
        await tx.wait();
        console.log("✅ CTF approved via external wallet");
      } else {
        throw new Error("No compatible wallet found for CTF approval");
      }

      // Re-check approval status
      await checkApproval();
      setApprovalState((prev) => ({ ...prev, isApproving: false, isApproved: true }));
    } catch (error) {
      console.error("Error approving tokens:", error);
      setApprovalState((prev) => ({ ...prev, isApproving: false }));
    }
  }, [account, checkApproval, approvalState.isApproved, privyWallets, user?.linkedAccounts, getClientForChain]);

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


