import { useMemo } from "react";
import { useAnimatedDots } from "../../../../hooks/useAnimatedDots";

export interface ButtonStateResult {
  text: string;
  disabled: boolean;
  onClick: () => void;
  // Info for "sweeping the book" warning
  isSweepingBook?: boolean;
  availableShares?: number;
}

export function useButtonState({
  authenticated,
  account,
  state,
  login,
  approvalState,
  approveToken,
  marketOrderHandler,
  usdcBalance,
  yesBalance,
  noBalance,
  handleTrade,
  checkSufficientBalance,
  checkSufficientShares,
  market,
  handleAddFunds,
  polymarketTrading,
  orderbookWalkPosition = undefined as "yes" | "no" | undefined,
  predictTrading = undefined as
    | {
        hasPandascoreLink: boolean;
        hasMonitorMatch: boolean;
        hasPredictMarketIds: boolean;
        ready: boolean;
        loading: boolean;
        blockedReason: string | null;
      }
    | undefined,
  predictApproval = undefined as
    | {
        isApproved: boolean;
        isChecking: boolean;
        approve: () => void | Promise<void>;
        isApproving: boolean;
      }
    | undefined,
  predictUsdtBalance = undefined as number | undefined,
  predictSellShareBalance = undefined as number | null | undefined,
  dflowProofVerified = undefined as boolean | undefined,
  dflowProofLoading = undefined as boolean | undefined,
}: any): ButtonStateResult {
  const animatedDots = useAnimatedDots(400);
  
  return useMemo(() => {
    if (!authenticated) {
      return { text: "Log In or Sign Up", disabled: false, onClick: () => login() };
    }
    if (!account) {
      return { text: "Loading wallet...", disabled: true, onClick: () => {} };
    }
    if (state.isLoading) {
      return { text: "Processing...", disabled: true, onClick: () => {} };
    }

    if (state.tradingVenue === "polymarket") {
      const pt = polymarketTrading as
        | {
            hasPandascoreLink: boolean;
            hasMonitorMatch: boolean;
            ready: boolean;
            loading: boolean;
            blockedReason: string | null;
          }
        | undefined;
      if (!pt?.hasPandascoreLink) {
        return {
          text: "Polymarket: esports match not linked",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasMonitorMatch) {
        return {
          text: "Polymarket: odds monitor has no row",
          disabled: true,
          onClick: () => {},
        };
      }
      if (pt.loading && !pt.ready) {
        return {
          text: "Preparing Polymarket…",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.ready) {
        return {
          text: pt.blockedReason
            ? "Polymarket setup required"
            : "Polymarket unavailable",
          disabled: true,
          onClick: () => {},
        };
      }
      if (
        !state.selectedPosition ||
        !state.amount ||
        (state.orderType === "limit" && !state.price)
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      const actionText = state.side === "buy" ? "Buy" : "Sell";
      let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
      if (market) {
        const title = (
          market?.displayName ||
          (market as any)?.question ||
          ""
        ).trim();
        const parts = title
          .split(/\s*vs\.?\s*/i)
          .map((s: string) => s.trim())
          .filter(Boolean);
        const isVsSingle =
          parts.length === 2 &&
          (market as any)?.umbrellaChildrenCount === 1;
        if (isVsSingle) {
          const teamName =
            state.selectedPosition === "yes" ? parts[0] : parts[1];
          buttonText = `${actionText} ${teamName}`;
        }
      }
      return {
        text: `${buttonText} (Polymarket)`,
        disabled: false,
        onClick: handleTrade,
      };
    }

    if (state.tradingVenue === "dflow") {
      if (dflowProofLoading) {
        return { text: "Checking DFlow KYC…", disabled: true, onClick: () => {} };
      }
      if (dflowProofVerified === false) {
        return {
          text: "Complete Proof KYC (Profile)",
          disabled: true,
          onClick: () => {},
        };
      }
      if (
        !state.selectedPosition ||
        !state.amount ||
        (state.orderType === "limit" && !state.price)
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      const actionText = state.side === "buy" ? "Buy" : "Sell";
      let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
      if (market) {
        const title = (
          market?.displayName ||
          (market as any)?.question ||
          ""
        ).trim();
        const parts = title
          .split(/\s*vs\.?\s*/i)
          .map((s: string) => s.trim())
          .filter(Boolean);
        const isVsSingle =
          parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1;
        if (isVsSingle) {
          const teamName =
            state.selectedPosition === "yes" ? parts[0] : parts[1];
          buttonText = `${actionText} ${teamName}`;
        }
      }
      return {
        text: `${buttonText} (DFlow)`,
        disabled: false,
        onClick: handleTrade,
      };
    }

    if (state.tradingVenue === "predictfun") {
      const pt = predictTrading;
      if (!pt?.hasPandascoreLink) {
        return {
          text: "Predict.fun: esports match not linked",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasMonitorMatch) {
        return {
          text: "Predict.fun: odds monitor has no row",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasPredictMarketIds) {
        return {
          text: "Predict.fun: market ids not linked",
          disabled: true,
          onClick: () => {},
        };
      }
      if (pt.loading && !pt.ready) {
        return {
          text: "Preparing Predict.fun…",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.ready) {
        return {
          text: pt.blockedReason
            ? "Predict.fun setup required"
            : "Predict.fun unavailable",
          disabled: true,
          onClick: () => {},
        };
      }
      const pa = predictApproval;
      if (pa && (pa.isChecking || (!pa.isApproved && pa.isApproving))) {
        return {
          text: pa.isApproving ? `Approving on BNB${animatedDots}` : "Checking BNB approvals…",
          disabled: true,
          onClick: () => {},
        };
      }
      if (pa && !pa.isApproved) {
        return {
          text: "Approve Predict on BNB",
          disabled: Boolean(pa.isApproving),
          onClick: () => {
            void pa.approve();
          },
        };
      }
      if (
        !state.selectedPosition ||
        !state.amount ||
        (state.orderType === "limit" && !state.price)
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      const balRaw =
        typeof predictUsdtBalance === "number" && Number.isFinite(predictUsdtBalance)
          ? predictUsdtBalance
          : 0;
      if (balRaw <= 0 && state.side === "buy") {
        return {
          text: "Fund USDT on BNB",
          disabled: true,
          onClick: () => {},
        };
      }
      const actionText = state.side === "buy" ? "Buy" : "Sell";
      let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
      if (market) {
        const title = (
          market?.displayName ||
          (market as any)?.question ||
          ""
        ).trim();
        const parts = title
          .split(/\s*vs\.?\s*/i)
          .map((s: string) => s.trim())
          .filter(Boolean);
        const isVsSingle =
          parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1;
        if (isVsSingle) {
          const teamName =
            state.selectedPosition === "yes" ? parts[0] : parts[1];
          buttonText = `${actionText} ${teamName}`;
        }
      }
      return {
        text: `${buttonText} (Predict.fun)`,
        disabled: false,
        onClick: handleTrade,
      };
    }

    // Check if user has no USDC balance - show "Add Funds" BEFORE approval check
    // This ensures users with zero balance see "Add Funds" instead of "Approve Trading"
    const balance = typeof usdcBalance === 'number' ? usdcBalance : parseFloat(usdcBalance || '0');
    if (balance <= 0 && state.side === 'buy') {
      return { text: "Add Funds", disabled: false, onClick: handleAddFunds };
    }
    
    if (approvalState.isChecking) {
      return { text: "Checking Approvals...", disabled: true, onClick: () => {} };
    }
    if (!approvalState.isApproved) {
      return { text: approvalState.isApproving ? `Approving${animatedDots}` : "Approve Trading", disabled: approvalState.isApproving, onClick: approveToken };
    }
    if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) {
      return { text: "Enter amount", disabled: true, onClick: () => {} };
    }
    
    // Get available liquidity info for market orders
    let isSweepingBook = false;
    let availableShares = 0;
    
    const liqPosition =
      orderbookWalkPosition ?? state.selectedPosition ?? "yes";

    if (state.orderType === "market" && state.selectedPosition) {
      const liquidityInfo = marketOrderHandler.getAvailableLiquidity(
        liqPosition,
        state.side
      );
      availableShares = liquidityInfo.maxSharesAvailable;
      
      // Only block if there's truly ZERO liquidity (no shares at all)
      if (!liquidityInfo.hasAnyLiquidity) {
        return { text: "0 shares available. Place a limit order", disabled: true, onClick: () => {}, isSweepingBook: false, availableShares: 0 };
      }
      
      // Check if user is trying to buy more than available (sweeping the book)
      // For BUY orders: compare USD amount to max available USD value
      // For SELL orders: compare shares to max available shares
      if (state.side === "buy") {
        const usdAmount = parseFloat(state.amount);
        const effectiveBudget =
          state.tradingVenue === "levelup"
            ? usdAmount / 1.02
            : usdAmount;
        isSweepingBook = effectiveBudget > liquidityInfo.maxUsdValue + 0.01;
      } else {
        const sharesRequested = parseFloat(state.amount);
        isSweepingBook = sharesRequested > availableShares;
      }
    }
    
    // For market buy orders, pass the pre-calculated estimated cost (includes 2% trading fee on LevelUp)
    const marketOrderEstimatedCost = state.orderType === "market" && state.side === "buy" ? state.estimatedCost : null;
    const stableBal =
      state.tradingVenue === "predictfun" &&
      typeof predictUsdtBalance === "number" &&
      Number.isFinite(predictUsdtBalance)
        ? predictUsdtBalance
        : usdcBalance;
    const balanceCheck = checkSufficientBalance(
      state.amount,
      state.orderType,
      state.side,
      stableBal,
      state.price,
      marketOrderEstimatedCost,
      state.tradingVenue
    );
    if (!balanceCheck.hasSufficientBalance) return { text: "Insufficient Balance", disabled: true, onClick: () => {}, isSweepingBook, availableShares };
    const sharesCheck = checkSufficientShares(
      state.amount,
      state.orderType,
      state.side,
      state.selectedPosition,
      yesBalance,
      noBalance,
      state.tradingVenue === "predictfun" ? predictSellShareBalance ?? null : null
    );
    if (!sharesCheck.hasSufficientShares) return { text: "Insufficient Shares", disabled: true, onClick: () => {}, isSweepingBook, availableShares };
    
    // Determine button text based on side (buy/sell) and market type
    const actionText = state.side === 'buy' ? 'Buy' : 'Sell';
    let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
    
    // Check if this is a single VS market
    if (market) {
      const title = (market?.displayName || (market as any)?.question || '').trim();
      const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
      const isVsSingle = parts.length === 2 && ((market as any)?.umbrellaChildrenCount === 1);
      
      if (isVsSingle) {
        const teamName = state.selectedPosition === 'yes' ? parts[0] : parts[1];
        buttonText = `${actionText} ${teamName}`;
      }
    }
    
    return { text: buttonText, disabled: false, onClick: handleTrade, isSweepingBook, availableShares };
  }, [authenticated, account, state, login, approvalState, approveToken, marketOrderHandler, usdcBalance, yesBalance, noBalance, handleTrade, checkSufficientBalance, checkSufficientShares, market, animatedDots, handleAddFunds, polymarketTrading, orderbookWalkPosition, predictTrading, predictApproval, predictUsdtBalance, predictSellShareBalance, dflowProofVerified, dflowProofLoading]);
}


