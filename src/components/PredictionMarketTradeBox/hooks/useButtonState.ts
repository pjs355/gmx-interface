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
    return { text: `Trade ${state.selectedPosition.toUpperCase()}`, disabled: false, onClick: handleTrade };
  }, [authenticated, account, state, login, approvalState, approveToken, marketOrderHandler, usdcBalance, yesBalance, noBalance, handleTrade, checkSufficientBalance, checkSufficientShares]);
}


