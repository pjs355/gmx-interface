import React, { createContext, useContext, useState, useCallback } from 'react';
import useWallet from 'lib/wallets/useWallet';
import { useWallets as usePrivyWallets } from '@privy-io/react-auth';
import { Contract, JsonRpcProvider, formatUnits } from 'ethers';

const CTF_ADDRESS = '0xd51B2c739eE5Fe24Bd7d958C1EaE65572183530f';
const BASE_PUBLIC_RPC = 'https://base-mainnet.infura.io/v3/5b51ad43553b44ffabc2980afa70f7ae';

// Global balance cache
const balanceCache = new Map<string, string>();

function getCacheKey(account: string, tokenId: string): string {
  return `${account}:${tokenId}`;
}

interface BalanceContextType {
  getBalance: (tokenId: string) => number;
  refreshBalances: (tokenIds: string[]) => Promise<void>;
  isLoading: boolean;
}

const BalanceContext = createContext<BalanceContextType | null>(null);

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const { getDataAddress } = useWallet();
  const account = getDataAddress();
  const { wallets: privyWallets } = usePrivyWallets();
  const [isLoading, setIsLoading] = useState(false);

  const getBalance = useCallback((tokenId: string): number => {
    if (!account) return 0;
    const key = getCacheKey(account, tokenId);
    const cached = balanceCache.get(key);
    return cached ? Number(cached) : 0;
  }, [account]);

  const refreshBalances = useCallback(async (tokenIds: string[]) => {
    if (!account || tokenIds.length === 0) return;

    setIsLoading(true);
    try {
      // Check which balances we need to fetch
      const uncachedTokenIds = tokenIds.filter(tokenId => {
        const key = getCacheKey(account, tokenId);
        return !balanceCache.has(key);
      });

      if (uncachedTokenIds.length === 0) {
        setIsLoading(false);
        return;
      }

      // Get shared read-only provider
      const provider = new JsonRpcProvider(BASE_PUBLIC_RPC);

      // Batch fetch all balances
      const ctf = new Contract(CTF_ADDRESS, [
        'function balanceOf(address account, uint256 id) view returns (uint256)',
      ], provider);

      const balancePromises = uncachedTokenIds.map(tokenId => 
        ctf.balanceOf(account, tokenId).then(balance => ({
          tokenId,
          balance: formatUnits(balance, 6)
        }))
      );

      const results = await Promise.all(balancePromises);
      
      // Cache results
      results.forEach(({ tokenId, balance }) => {
        const key = getCacheKey(account, tokenId);
        balanceCache.set(key, balance);
      });

    } catch (error) {
      console.error('Error fetching balances:', error);
    } finally {
      setIsLoading(false);
    }
  }, [account, privyWallets]);

  return (
    <BalanceContext.Provider value={{ getBalance, refreshBalances, isLoading }}>
      {children}
    </BalanceContext.Provider>
  );
}

export function useBalances() {
  const context = useContext(BalanceContext);
  if (!context) {
    throw new Error('useBalances must be used within a BalanceProvider');
  }
  return context;
}

export default BalanceContext;
