import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePredictionData } from "context/PredictionDataContext";
// import { useCurrentPrices } from "context/CurrentPriceContext";
import { currentPriceService } from "lib/currentPriceService";
import { useUserData } from "context/UserDataContext";
import useWallet from "lib/wallets/useWallet";

type PortfolioContextValue = {
  portfolioTotal: number | null;
  cashBalance: number;
  loading: boolean;
};

const PortfolioContext = createContext<PortfolioContextValue | null>(null);

export function PortfolioProvider({ children }: { children: React.ReactNode }) {
  const [portfolioTotal, setPortfolioTotal] = useState<number | null>(null);
  // Deprecated local loading; rely on userDataLoading for display smoothing
  const lastCashRef = React.useRef<number>(0);
  const lastPositionsRef = React.useRef<number>(0);
  const { getDataAddress } = useWallet();
  const account = getDataAddress();
  const { umbrellas, getQuestionsForUmbrella } = usePredictionData();
  const { usdcBalance, tokenBalances, loading: userDataLoading } = useUserData();

  // Stable cash balance: do not drop to 0 when upstream temporarily returns null
  const cashBalance = useMemo(() => {
    if (usdcBalance === null || usdcBalance === undefined) {
      return lastCashRef.current;
    }
    const val = Number(usdcBalance) || 0;
    lastCashRef.current = val;
    return val;
  }, [usdcBalance]);

  const compute = useCallback(() => {
    if (!account) {
      setPortfolioTotal(0);
      return;
    }
    try {
      // Collect market IDs from PredictionData
      const marketIds: string[] = [];
      umbrellas.forEach((u: any) => {
        const markets = getQuestionsForUmbrella(u._id) as any[];
        markets.forEach((m: any) => {
          const id = m?._id || m?.questionId || m?.marketId;
          if (id) marketIds.push(id);
        });
      });
      // Compute positions total from tokenBalances and cached prices (refresh runs separately to avoid UI snap)
      let positions = 0;
      let pricedMarkets = 0;
      marketIds.forEach((id) => {
        const tb = tokenBalances.get(id);
        if (!tb) return;
        const yes = Number(tb.yesBalance) || 0;
        const no = Number(tb.noBalance) || 0;
        const cached = currentPriceService.getCachedPrices(id);
        const yp = cached?.yes.value ?? null;
        const np = cached?.no.value ?? null;
        if (typeof yp === 'number' || typeof np === 'number') {
          pricedMarkets += 1;
        }
        const yv = typeof yp === 'number' ? yes * yp : 0;
        const nv = typeof np === 'number' ? no * np : 0;
        positions += yv + nv;
      });

      // Smoothing: avoid snap-to-zero during transient loads
      const prevCash = lastCashRef.current;
      const prevPositions = lastPositionsRef.current;
      const nextCash = cashBalance;
      let nextPositions = positions;
      if ((pricedMarkets === 0 || marketIds.length === 0) && prevPositions > 0) {
        nextPositions = prevPositions;
      }
      const effectiveCash = (usdcBalance === null || usdcBalance === undefined) ? prevCash : nextCash;
      const nextTotal = effectiveCash + nextPositions;
      setPortfolioTotal((current) => {
        if (current !== null && nextTotal === 0 && (prevCash > 0 || prevPositions > 0)) {
          return current;
        }
        return nextTotal;
      });
      lastCashRef.current = effectiveCash;
      lastPositionsRef.current = nextPositions;
    } catch {
      setPortfolioTotal((current) => current ?? cashBalance);
    }
  }, [account, umbrellas, getQuestionsForUmbrella, tokenBalances, cashBalance]);

  useEffect(() => {
    if (!account) {
      setPortfolioTotal(0);
      return;
    }
    // Compute once on mount and whenever holdings or cash change.
    compute();
  }, [account, tokenBalances, usdcBalance, umbrellas, compute]);

  const value = useMemo<PortfolioContextValue>(() => ({ portfolioTotal, cashBalance, loading: userDataLoading }), [portfolioTotal, cashBalance, userDataLoading]);

  return <PortfolioContext.Provider value={value}>{children}</PortfolioContext.Provider>;
}

export function usePortfolio(): PortfolioContextValue {
  const ctx = useContext(PortfolioContext);
  if (!ctx) {
    throw new Error("usePortfolio must be used within a PortfolioProvider");
  }
  return ctx;
}

export default PortfolioContext;


