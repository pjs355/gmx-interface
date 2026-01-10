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
    
    if (state.orderType === "market" && state.selectedPosition) {
      const liquidityInfo = marketOrderHandler.getAvailableLiquidity(
        state.selectedPosition,
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
      if (state.side === 'buy') {
        const usdAmount = parseFloat(state.amount);
        // Account for 2% fee when comparing to available liquidity
        const effectiveBudget = usdAmount / 1.02;
        isSweepingBook = effectiveBudget > liquidityInfo.maxUsdValue + 0.01;
      } else {
        const sharesRequested = parseFloat(state.amount);
        isSweepingBook = sharesRequested > availableShares;
      }
    }
    
    // For market buy orders, pass the pre-calculated estimated cost (includes 2% trading fee)
    const marketOrderEstimatedCost = state.orderType === "market" && state.side === "buy" ? state.estimatedCost : null;
    const balanceCheck = checkSufficientBalance(state.amount, state.orderType, state.side, usdcBalance, state.price, marketOrderEstimatedCost);
    if (!balanceCheck.hasSufficientBalance) return { text: "Insufficient Balance", disabled: true, onClick: () => {}, isSweepingBook, availableShares };
    const sharesCheck = checkSufficientShares(state.amount, state.orderType, state.side, state.selectedPosition, yesBalance, noBalance);
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
  }, [authenticated, account, state, login, approvalState, approveToken, marketOrderHandler, usdcBalance, yesBalance, noBalance, handleTrade, checkSufficientBalance, checkSufficientShares, market, animatedDots, handleAddFunds]);
}


