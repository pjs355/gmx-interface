import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { useSignerContext } from 'context/SignerContext';
import {
  subgraphService,
  fromMicroUnits,
} from '@/services/subgraph/subgraphService';

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
  const { account } = useSignerContext();
  const [isLoading, setIsLoading] = useState(false);
  // Track if we've already fetched all balances from subgraph
  const hasFetchedRef = useRef<string | null>(null);

  const getBalance = useCallback((tokenId: string): number => {
    if (!account) return 0;
    const key = getCacheKey(account, tokenId);
    const cached = balanceCache.get(key);
    return cached ? Number(cached) : 0;
  }, [account]);

  const refreshBalances = useCallback(async (tokenIds: string[]) => {
    if (!account || tokenIds.length === 0) return;

    // Check which balances we need to fetch
    const uncachedTokenIds = tokenIds.filter(tokenId => {
      const key = getCacheKey(account, tokenId);
      return !balanceCache.has(key);
    });

    // If we've already fetched from subgraph for this account and all requested are cached, skip
    if (uncachedTokenIds.length === 0) {
      return;
    }

    // If we haven't fetched from subgraph yet for this account, fetch all balances at once
    if (hasFetchedRef.current !== account) {
      setIsLoading(true);
      try {
        console.log(`📊 [BalanceContext] Fetching all balances from subgraph for ${account}`);
        
        const subgraphAccount = await subgraphService.getUserAccount(account);
        
        if (subgraphAccount) {
          // Cache all token balances from subgraph
          for (const tb of subgraphAccount.tokenBalances) {
            const key = getCacheKey(account, tb.tokenId);
            const balance = fromMicroUnits(tb.balance);
            balanceCache.set(key, balance);
          }
          console.log(`📊 [BalanceContext] Cached ${subgraphAccount.tokenBalances.length} token balances`);
        }
        
        hasFetchedRef.current = account;
      } catch (error) {
        console.error('Error fetching balances from subgraph:', error);
      } finally {
        setIsLoading(false);
      }
    }

    // After subgraph fetch, set any still-uncached tokens to 0
    // (tokens that don't exist in subgraph = user has 0 balance)
    for (const tokenId of uncachedTokenIds) {
      const key = getCacheKey(account, tokenId);
      if (!balanceCache.has(key)) {
        balanceCache.set(key, '0');
      }
    }
  }, [account]);

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
