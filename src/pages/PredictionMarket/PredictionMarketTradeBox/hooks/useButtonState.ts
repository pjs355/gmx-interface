import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAnimatedDots } from "../../../../hooks/useAnimatedDots";
import { getVenueConfig } from "@/config/venueConfig";
import { getSorBuyCashShortfall, type RoutePlan } from "@/trading/sor";

type SorStateForDeposit = {
	route: RoutePlan | null;
	isLoading: boolean;
	isStale?: boolean;
	routeExpired: boolean;
	totalAvailableCash?: number;
	handleAddFunds?: () => void;
};

function trySorDepositToTrade(side: "buy" | "sell", sorState: SorStateForDeposit | undefined): ButtonStateResult | null {
	if (!sorState?.handleAddFunds) return null;
	const gap = getSorBuyCashShortfall(sorState.route, sorState.totalAvailableCash, {
		routeExpired: sorState.routeExpired,
		isLoading: sorState.isLoading,
		isStale: sorState.isStale ?? false,
		side,
	});
	if (!gap) return null;
	return {
		text: "Deposit to Trade",
		disabled: false,
		onClick: sorState.handleAddFunds,
	};
}

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
  sorState = undefined as
    | {
        route: any;
        isLoading: boolean;
        isStale: boolean;
        error: string | null;
        isExecuting: boolean;
        routeExpired: boolean;
        handleExecute: () => void;
        venuePositions?: { venue: string; shares: number }[];
        totalAvailableCash?: number;
        handleAddFunds?: () => void;
      }
    | undefined,
}: any): ButtonStateResult {
  const animatedDots = useAnimatedDots(400);
  const navigate = useNavigate();
  
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

    if (state.tradingVenue === "all") {
      if (!state.selectedPosition || !state.amount) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      if (state.side === "sell") {
        const totalHeld = (sorState?.venuePositions ?? []).reduce(
          (sum: number, pos: { venue: string; shares: number }) => sum + pos.shares,
          0,
        );
        if (totalHeld <= 0) {
          return { text: "No shares to sell", disabled: true, onClick: () => {} };
        }
      }
      if (sorState?.isExecuting) {
        return { text: "Executing…", disabled: true, onClick: () => {} };
      }
      if (sorState?.isLoading && !sorState?.route) {
        return { text: "Finding best odds...", disabled: true, onClick: () => {} };
      }
      if (sorState?.error && !sorState?.route) {
        return { text: "Route unavailable", disabled: true, onClick: () => {} };
      }
      if (sorState?.routeExpired) {
        return { text: "Refreshing Odds…", disabled: true, onClick: () => {} };
      }
      if (!sorState?.route) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      const actionText = state.side === "buy" ? "Buy" : "Sell";
      let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
      if (market) {
        const title = (market?.displayName || (market as any)?.question || "").trim();
        const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
        const isVsSingle = parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1;
        if (isVsSingle) {
          const teamName = state.selectedPosition === "yes" ? parts[0] : parts[1];
          buttonText = `${actionText} ${teamName}`;
        }
      }

      const sorAllBuyDeposit = getSorBuyCashShortfall(sorState.route, sorState.totalAvailableCash, {
        routeExpired: sorState.routeExpired,
        isLoading: sorState.isLoading,
        isStale: sorState.isStale,
        side: state.side,
      });
      if (sorAllBuyDeposit && sorState.handleAddFunds) {
        return {
          text: "Deposit to Trade",
          disabled: false,
          onClick: sorState.handleAddFunds,
        };
      }

      return {
        text: buttonText,
        disabled: false,
        onClick: sorState.handleExecute,
      };
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
          text: "Polymarket: no matched market",
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
      const sorBuyDeposit = trySorDepositToTrade(state.side, sorState);
      if (sorBuyDeposit) return sorBuyDeposit;
      return {
        text: buttonText,
        disabled: false,
        onClick: handleTrade,
      };
    }

    if (state.tradingVenue === "dflow") {
      if (dflowProofLoading) {
        return { text: "Checking Kalshi KYC…", disabled: true, onClick: () => {} };
      }
      if (dflowProofVerified === false) {
        return {
          text: "Complete Proof KYC →",
          disabled: false,
          onClick: () => navigate("/profile"),
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
      const sorDflowDeposit = trySorDepositToTrade(state.side, sorState);
      if (sorDflowDeposit) return sorDflowDeposit;
      return {
        text: buttonText,
        disabled: false,
        onClick: handleTrade,
      };
    }

    if (state.tradingVenue === "predictfun") {
      const pt = predictTrading;
      if (!pt?.hasPandascoreLink) {
        return {
          text: "Predict: esports match not linked",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasMonitorMatch) {
        return {
          text: "Predict: no matched market",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasPredictMarketIds) {
        return {
          text: "Predict: market ids not linked",
          disabled: true,
          onClick: () => {},
        };
      }
      if (pt.loading && !pt.ready) {
        return {
          text: "Preparing Predict…",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.ready) {
        return {
          text: pt.blockedReason
            ? "Predict setup required"
            : "Predict unavailable",
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
      const sorPredictDeposit = trySorDepositToTrade(state.side, sorState);
      if (sorPredictDeposit) return sorPredictDeposit;
      const balRaw =
        typeof predictUsdtBalance === "number" && Number.isFinite(predictUsdtBalance)
          ? predictUsdtBalance
          : 0;
      if (balRaw <= 0 && state.side === "buy") {
        return {
          text: "Add funds on Base (bridge to BNB for Predict)",
          disabled: false,
          onClick: handleAddFunds,
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
        text: buttonText,
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
        const vc = getVenueConfig(state.tradingVenue);
        const effectiveBudget = vc.effectiveBuyBudget(usdAmount);
        isSweepingBook = effectiveBudget > liquidityInfo.maxUsdValue + 0.01;
      } else {
        const sharesRequested = parseFloat(state.amount);
        isSweepingBook = sharesRequested > availableShares;
      }
    }

    if (state.tradingVenue === "levelup") {
      const sorLuDeposit = trySorDepositToTrade(state.side, sorState);
      if (sorLuDeposit) return sorLuDeposit;
    }
    
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
  }, [authenticated, account, state, login, approvalState, approveToken, marketOrderHandler, usdcBalance, yesBalance, noBalance, handleTrade, checkSufficientBalance, checkSufficientShares, market, animatedDots, handleAddFunds, polymarketTrading, orderbookWalkPosition, predictTrading, predictApproval, predictUsdtBalance, predictSellShareBalance, dflowProofVerified, dflowProofLoading, sorState, navigate]);
}


