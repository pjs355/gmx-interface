import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useSignerContext } from 'context/SignerContext';
import { useUserData } from 'context/UserDataContext';
import { useCollateralTokens } from 'context/CollateralTokenContext';

/**
 * BalanceContext - Provides token balance lookups
 * 
 * NOTE: This context now uses UserDataContext's tokenBalances instead of
 * making separate subgraph calls. This prevents duplicate API requests
 * and rate limiting issues.
 */

interface BalanceContextType {
  getBalance: (tokenId: string) => number;
  refreshBalances: (tokenIds: string[]) => Promise<void>;
  isLoading: boolean;
}

const BalanceContext = createContext<BalanceContextType | null>(null);

export function BalanceProvider({ children }: { children: React.ReactNode }) {
  const { account } = useSignerContext();
  const { tokenBalances, loading: userDataLoading, refreshTokenPositions } = useUserData();
  const collateralTokens = useCollateralTokens();
  const [localCache, setLocalCache] = useState<Map<string, number>>(new Map());

  // Build a tokenId -> balance lookup from UserDataContext's tokenBalances
  useEffect(() => {
    if (!tokenBalances || tokenBalances.size === 0) return;

    const newCache = new Map<string, number>();
    
    tokenBalances.forEach((balances, marketId) => {
      // Map yesTokenId to yesBalance
      if (balances.yesTokenId) {
        const yesBalance = parseFloat(balances.yesBalance) || 0;
        newCache.set(balances.yesTokenId, yesBalance);
      }
      // Map noTokenId to noBalance
      if (balances.noTokenId) {
        const noBalance = parseFloat(balances.noBalance) || 0;
        newCache.set(balances.noTokenId, noBalance);
      }
    });

    setLocalCache(newCache);
  }, [tokenBalances]);

  const getBalance = useCallback((tokenId: string): number => {
    if (!account) return 0;
    return localCache.get(tokenId) || 0;
  }, [account, localCache]);

  const refreshBalances = useCallback(async (_tokenIds: string[]) => {
    // Refresh share-position balances (UserDataContext) AND collateral-token
    // balances (CollateralTokenContext) in parallel — both feed the trade UI.
    await Promise.all([refreshTokenPositions(), collateralTokens.refetch()]);
  }, [refreshTokenPositions, collateralTokens]);

  return (
    <BalanceContext.Provider value={{ 
      getBalance, 
      refreshBalances, 
      isLoading: userDataLoading 
    }}>
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
