import { useMemo } from "react";

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
}: any) {
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
    if (approvalState.isChecking) {
      return { text: "Checking Approvals...", disabled: true, onClick: () => {} };
    }
    if (!approvalState.isApproved) {
      return { text: approvalState.isApproving ? "Approving..." : "Approve Tokens", disabled: approvalState.isApproving, onClick: approveToken };
    }
    if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) {
      return { text: "Enter amount", disabled: true, onClick: () => {} };
    }
    if (state.orderType === "market") {
      const hasLiquidity = marketOrderHandler.hasSufficientLiquidity(
        parseFloat(state.amount),
        state.selectedPosition,
        state.side
      );
      if (!hasLiquidity) return { text: "Not enough liquidity", disabled: true, onClick: () => {} };
    }
    const balanceCheck = checkSufficientBalance(state.amount, state.orderType, state.side, usdcBalance);
    if (!balanceCheck.hasSufficientBalance) return { text: "Insufficient Balance", disabled: true, onClick: () => {} };
    const sharesCheck = checkSufficientShares(state.amount, state.orderType, state.side, state.selectedPosition, yesBalance, noBalance);
    if (!sharesCheck.hasSufficientShares) return { text: "Insufficient Shares", disabled: true, onClick: () => {} };
    
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
    
    return { text: buttonText, disabled: false, onClick: handleTrade };
  }, [authenticated, account, state, login, approvalState, approveToken, marketOrderHandler, usdcBalance, yesBalance, noBalance, handleTrade, checkSufficientBalance, checkSufficientShares, market]);
}


