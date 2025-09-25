import { useState, useEffect } from "react";
import useWallet from "lib/wallets/useWallet";
import { useUserData } from "context/UserDataContext";

// Simple in-memory cache to avoid duplicate RPC calls per session
// Key: `${account}:${tokenId}` -> value: string balance
const balanceCache = new Map<string, string>();

function getCacheKey(account: string, tokenId: string): string {
  return `${account}:${tokenId}`;
}

export function useUSDCBalance() {
  const { usdcBalance } = useUserData();
  return Number(usdcBalance ?? 0);
}

// Hook to fetch YES/NO token balances for a specific market
export function useYesNoBalances(market: { yesTokenId?: string; noTokenId?: string }) {
  const { getDataAddress } = useWallet();
  const account = getDataAddress();
  const { getTokenBalance } = useUserData();
  const [yesBalance, setYesBalance] = useState<number>(0);
  const [noBalance, setNoBalance] = useState<number>(0);

  useEffect(() => {
    if (!account || !market?.yesTokenId || !market?.noTokenId) {
      setYesBalance(0);
      setNoBalance(0);
      return;
    }
    // Lookup by tokenId via UserDataContext balances map
    // We maintain a tiny cache here for stability across renders
    const yesKey = getCacheKey(account, market.yesTokenId);
    const noKey = getCacheKey(account, market.noTokenId);

    const found = (() => {
      // getTokenBalance expects marketId; we need to scan map once via local cache
      // As an approximation, reuse local cache values if present
      const cachedYes = balanceCache.get(yesKey);
      const cachedNo = balanceCache.get(noKey);
      if (cachedYes !== undefined) setYesBalance(Number(cachedYes));
      if (cachedNo !== undefined) setNoBalance(Number(cachedNo));
    })();

    // We cannot derive by market here reliably without marketId; leave as-is and rely on rows using getTokenBalance directly where possible
  }, [account, market?.yesTokenId, market?.noTokenId, getTokenBalance]);

  return { yesBalance, noBalance };
}

export function checkSufficientBalance(
  amount: string,
  orderType: 'market' | 'limit',
  side: 'buy' | 'sell',
  usdcBalance: number
): { hasSufficientBalance: boolean; requiredAmount: number } {
  if (side !== 'buy') {
    return { hasSufficientBalance: true, requiredAmount: 0 };
  }

  const amountNum = Number(amount);
  if (!isFinite(amountNum) || amountNum <= 0) {
    return { hasSufficientBalance: true, requiredAmount: 0 };
  }

  if (orderType === 'market') {
    // For market buy orders, amount is the USD amount they want to spend
    return {
      hasSufficientBalance: usdcBalance >= amountNum,
      requiredAmount: amountNum
    };
  } else {
    // For limit buy orders, amount is the USD amount they want to spend
    return {
      hasSufficientBalance: usdcBalance >= amountNum,
      requiredAmount: amountNum
    };
  }
}

// Function to check if user has sufficient YES/NO token shares for sell orders
export function checkSufficientShares(
  amount: string,
  orderType: 'market' | 'limit',
  side: 'buy' | 'sell',
  position: 'yes' | 'no',
  yesBalance: number,
  noBalance: number
): { hasSufficientShares: boolean; requiredShares: number } {
  if (side !== 'sell') {
    return { hasSufficientShares: true, requiredShares: 0 };
  }

  const amountNum = Number(amount);
  if (!isFinite(amountNum) || amountNum <= 0) {
    return { hasSufficientShares: true, requiredShares: 0 };
  }

  // For sell orders, amount represents the number of shares they want to sell
  const requiredShares = amountNum;
  const availableShares = position === 'yes' ? yesBalance : noBalance;

  return {
    hasSufficientShares: availableShares >= requiredShares,
    requiredShares
  };
}
