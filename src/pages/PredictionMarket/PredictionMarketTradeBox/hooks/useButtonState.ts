import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAnimatedDots } from "../../../../hooks/useAnimatedDots";
import { getVenueConfig } from "@/config/venueConfig";
import {
	checkRawInputAgainstVenueMinimum,
	getSorBuyCashShortfall,
	parseLimitPriceCents,
	routeFailsVenueMinimums,
	SOR_FLOOR_MESSAGES,
	type ExecutionLeg,
	type ExecutionLegStatus,
	type RoutePlan,
} from "@/trading/sor";

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
		depositShortfallUsd: gap.shortfall,
	};
}

/**
 * Priority order we use when multiple legs are mid-flight and we need to pick
 * one status to surface on the button. Bridging comes first because that's
 * the LI.FI prefund, which is the most likely thing to confuse a user staring
 * at the button ("why am I not signing yet?"). Venue-submitted states come
 * last because by the time we're there, the venue itself usually shows its
 * own confirmation UI.
 */
const LEG_STATUS_PRIORITY: ExecutionLegStatus[] = [
	"bridging",
	"awaiting_signature",
	"submitted",
	"partial_fill",
	"filled",
	"pending",
	"failed",
	"cancelled",
];

function pickDominantLegStatus(
	legs: ExecutionLeg[] | undefined,
): ExecutionLegStatus | null {
	if (!legs || legs.length === 0) return null;
	for (const status of LEG_STATUS_PRIORITY) {
		if (legs.some((leg) => leg.status === status)) return status;
	}
	return null;
}

function executingButtonText(
	dominant: ExecutionLegStatus | null,
	dots: string,
): string {
	switch (dominant) {
		case "bridging":
			return `Bridging funds${dots}`;
		case "awaiting_signature":
			return `Awaiting signature${dots}`;
		case "submitted":
			return `Submitting order${dots}`;
		case "partial_fill":
			return `Filling${dots}`;
		case "filled":
			return `Confirming${dots}`;
		case "failed":
		case "cancelled":
			return `Executing${dots}`;
		case "pending":
		case null:
		default:
			return `Executing${dots}`;
	}
}

/**
 * Unified SOR primary for every single-venue trade — market/limit, buy/sell.
 * Prefund (LI.FI) is orchestrated inside sorState.handleExecute, so every
 * path runs through the same "bridge USDC, then sign the venue order" flow.
 */
function sorUnifiedPrimary(
	side: "buy" | "sell",
	sorState:
		| {
				route: RoutePlan | null;
				isLoading: boolean;
				isStale: boolean;
				error: string | null;
				routeErrorCode?: string | null;
				isExecuting: boolean;
				routeExpired: boolean;
				handleExecute: () => void;
				totalAvailableCash?: number;
				handleAddFunds?: () => void;
				executionLegs?: ExecutionLeg[];
		  }
		| undefined,
	buttonText: string,
	executingDots: string,
	venueAutoSetupInFlight: boolean = false,
): ButtonStateResult | null {
	if (!sorState?.handleExecute) return null;

	const dep = trySorDepositToTrade(side, sorState);
	if (dep) return dep;
	if (sorState.isExecuting) {
		const dominant = pickDominantLegStatus(sorState.executionLegs);
		return {
			text: executingButtonText(dominant, executingDots),
			disabled: true,
			onClick: () => {},
		};
	}
	if (sorState.isLoading && !sorState.route) {
		return { text: "Finding best odds...", disabled: true, onClick: () => {} };
	}
	if (sorState.error && !sorState.route && !sorState.isLoading) {
		if (sorState.routeErrorCode === "AMOUNT_TOO_SMALL") {
			return {
				text: sorState.error || "Below trade minimum. Increase trade size",
				disabled: true,
				onClick: () => {},
			};
		}
		// Distinguish "books still loading" / "market just resolved" — those
		// are naturally transient — from "no venue can serve this size".
		// Prevents the blanket "Route unavailable" that used to pop every
		// time a book ingest lag crossed the grace window.
		const code = sorState.routeErrorCode;
		if (code === "NO_BOOKS_AVAILABLE" || code === "NO_MARKET_FOUND") {
			return { text: "Finding best odds…", disabled: true, onClick: () => {} };
		}
		if (code === "ALL_BOOKS_STALE") {
			return { text: "Refreshing venue prices…", disabled: true, onClick: () => {} };
		}
		const execNotReady = code === "EXECUTION_NOT_READY";
		return {
			text: execNotReady
				? venueAutoSetupInFlight
					? "Preparing Predict…"
					: "Complete venue setup"
				: "Route unavailable",
			disabled: true,
			onClick: () => {},
		};
	}
	if (sorState.routeExpired) {
		return { text: "Refreshing Odds…", disabled: true, onClick: () => {} };
	}
	if (!sorState.route) {
		return { text: "Finding best odds...", disabled: true, onClick: () => {} };
	}
	if (routeFailsVenueMinimums(sorState.route, side)) {
		const isLimit = sorState.route?.legs?.some((l) => l.orderType === "limit");
		const message = isLimit
			? SOR_FLOOR_MESSAGES.limitOrder
			: side === "buy"
				? SOR_FLOOR_MESSAGES.marketBuy
				: SOR_FLOOR_MESSAGES.marketSell;
		return { text: message, disabled: true, onClick: () => {} };
	}
	return {
		text: buttonText,
		disabled: false,
		onClick: sorState.handleExecute,
	};
}

export interface ButtonStateResult {
  text: string;
  disabled: boolean;
  onClick: () => void;
  /** Shown under the deposit CTA when SOR buy needs more cash. */
  depositShortfallUsd?: number;
  // Info for "sweeping the book" warning
  isSweepingBook?: boolean;
  availableShares?: number;
}

export function useButtonState({
  authenticated,
  account,
  state,
  login,
  marketOrderHandler,
  usdcBalance,
  yesBalance,
  noBalance,
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
  predictSellShareBalance = undefined as number | null | undefined,
  limitlessTrading = undefined as
    | {
        hasPandascoreLink: boolean;
        hasMonitorMatch: boolean;
        hasLimitlessMapping: boolean;
        ready: boolean;
        loading: boolean;
        blockedReason: string | null;
      }
    | undefined,
  limitlessSellShareBalance = undefined as number | null | undefined,
  dflowProofVerified = undefined as boolean | undefined,
  dflowProofLoading = undefined as boolean | undefined,
  dflowStartProofFlow = undefined as (() => void | Promise<void>) | undefined,
  /** Matched venues for Smart Routing ("all") — used for conservative trade-minimum preflight. */
  sorMatchedVenues = undefined as ReadonlySet<string> | undefined,
  sorState = undefined as
    | {
        route: any;
        isLoading: boolean;
        isStale: boolean;
        error: string | null;
        routeErrorCode?: string | null;
        isExecuting: boolean;
        routeExpired: boolean;
        handleExecute: () => void;
        venuePositions?: { venue: string; shares: number }[];
        totalAvailableCash?: number;
        handleAddFunds?: () => void;
        executionLegs?: ExecutionLeg[];
      }
    | undefined,
}: any): ButtonStateResult {
  const animatedDots = useAnimatedDots(400);
  /** Cycles "", ".", "..", "..." for SOR execute (same rhythm as Processing). */
  const sorExecutingDots = useAnimatedDots(400);
  const navigate = useNavigate();
  
  return useMemo(() => {
    if (!authenticated) {
      return { text: "Log In or Sign Up", disabled: false, onClick: () => login() };
    }
    if (!account) {
      return { text: "Loading wallet...", disabled: true, onClick: () => {} };
    }
    if (state.isLoading) {
      return { text: `Processing${animatedDots}`, disabled: true, onClick: () => {} };
    }

    const limitPriceCentsForMin =
      state.orderType === "limit" ? parseLimitPriceCents(state.price) : undefined;

    const checkInputMin = (
      tradingVenue: string,
      matched?: Iterable<string> | null,
    ) =>
      checkRawInputAgainstVenueMinimum({
        tradingVenue,
        matchedVenues: matched ?? undefined,
        side: state.side,
        orderType: state.orderType,
        amountStr: state.amount,
        limitPriceCents: limitPriceCentsForMin,
      });

    /** `check === true` branch helper that returns the product-specific copy. */
    const belowMinButton = (
      check: Extract<
        ReturnType<typeof checkInputMin>,
        { below: true }
      >,
    ): ButtonStateResult => ({
      text: check.message,
      disabled: true,
      onClick: () => {},
    });

    const scopedSellSharesTotal = (): number =>
      (sorState?.venuePositions ?? []).reduce(
        (sum: number, pos: { shares: number }) => sum + (Number(pos.shares) || 0),
        0,
      );

    const noSharesToSellButton = (): ButtonStateResult => ({
      text: "No shares to sell",
      disabled: true,
      onClick: () => {},
    });

    if (state.tradingVenue === "all") {
      if (!state.selectedPosition) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMin("all", sorMatchedVenues ?? null);
        if (chk.below) return belowMinButton(chk);
      }
      if (sorState?.isExecuting) {
        return { text: `Executing${sorExecutingDots}`, disabled: true, onClick: () => {} };
      }
      if (sorState?.isLoading && !sorState?.route) {
        return { text: "Finding best odds...", disabled: true, onClick: () => {} };
      }
      if (sorState?.error && !sorState?.route && !sorState?.isLoading) {
        if (sorState.routeErrorCode === "AMOUNT_TOO_SMALL") {
          return {
            text: sorState.error || "Below trade minimum. Increase trade size",
            disabled: true,
            onClick: () => {},
          };
        }
        const code = sorState.routeErrorCode;
        if (code === "NO_BOOKS_AVAILABLE" || code === "NO_MARKET_FOUND") {
          return { text: "Finding best odds…", disabled: true, onClick: () => {} };
        }
        if (code === "ALL_BOOKS_STALE") {
          return { text: "Refreshing venue prices…", disabled: true, onClick: () => {} };
        }
        const execNotReady = code === "EXECUTION_NOT_READY";
        // If a venue is actively running its automated setup, we expect SOR to flip
        // ready-state momentarily — show a progress label instead of "Complete venue setup".
        const venueAutoSetupInFlight =
          Boolean(predictTrading?.loading) || Boolean(limitlessTrading?.loading);
        return {
          text: execNotReady
            ? venueAutoSetupInFlight
              ? "Preparing Predict…"
              : "Complete venue setup"
            : "Route unavailable",
          disabled: true,
          onClick: () => {},
        };
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
          depositShortfallUsd: sorAllBuyDeposit.shortfall,
        };
      }

      if (routeFailsVenueMinimums(sorState.route, state.side)) {
        const isLimit = sorState.route?.legs?.some((l: { orderType?: string }) => l.orderType === "limit");
        const message = isLimit
          ? SOR_FLOOR_MESSAGES.limitOrder
          : state.side === "buy"
            ? SOR_FLOOR_MESSAGES.marketBuy
            : SOR_FLOOR_MESSAGES.marketSell;
        return { text: message, disabled: true, onClick: () => {} };
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
      if (!state.selectedPosition) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMin("polymarket");
        if (chk.below) return belowMinButton(chk);
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
      const sorBuy = sorUnifiedPrimary(
        state.side,
        sorState,
        buttonText,
        sorExecutingDots,
      );
      if (sorBuy) return sorBuy;
      return {
        text: "Finding best odds...",
        disabled: true,
        onClick: () => {},
      };
    }

    if (state.tradingVenue === "limitless") {
      const lt = limitlessTrading;
      if (!lt?.hasPandascoreLink) {
        return {
          text: "Limitless: esports match not linked",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!lt.hasMonitorMatch) {
        return {
          text: "Limitless: no matched market",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!lt.hasLimitlessMapping) {
        return {
          text: "Limitless: market not linked",
          disabled: true,
          onClick: () => {},
        };
      }
      if (lt.loading && !lt.ready) {
        return {
          text: "Preparing Limitless…",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!lt.ready) {
        return {
          text: lt.blockedReason ?? "Limitless unavailable",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!state.selectedPosition) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMin("limitless");
        if (chk.below) return belowMinButton(chk);
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
      const sorLx = sorUnifiedPrimary(
        state.side,
        sorState,
        buttonText,
        sorExecutingDots,
      );
      if (sorLx) return sorLx;
      return {
        text: "Finding best odds...",
        disabled: true,
        onClick: () => {},
      };
    }

    if (state.tradingVenue === "dflow") {
      if (dflowProofLoading) {
        return { text: "Checking Kalshi KYC…", disabled: true, onClick: () => {} };
      }
      if (dflowProofVerified === false) {
        return {
          text: "Enable Kalshi trading",
          disabled: false,
          onClick: () => {
            if (dflowStartProofFlow) {
              void dflowStartProofFlow();
            } else {
              void navigate("/profile#dflow-kyc");
            }
          },
        };
      }
      if (!state.selectedPosition) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMin("dflow");
        if (chk.below) return belowMinButton(chk);
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
      // Kalshi/DFlow does not support limit orders — the SOR request layer
      // blocks them before a route is fetched, so fall back gracefully.
      if (state.orderType === "limit") {
        return {
          text: "Kalshi does not support limit orders",
          disabled: true,
          onClick: () => {},
        };
      }
      const sorDf = sorUnifiedPrimary(
        state.side,
        sorState,
        buttonText,
        sorExecutingDots,
      );
      if (sorDf) return sorDf;
      return {
        text: "Finding best odds...",
        disabled: true,
        onClick: () => {},
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
      if (!state.selectedPosition) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: "Enter amount", disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMin("predictfun");
        if (chk.below) return belowMinButton(chk);
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
      const sorPf = sorUnifiedPrimary(
        state.side,
        sorState,
        buttonText,
        sorExecutingDots,
        Boolean(predictTrading?.loading),
      );
      if (sorPf) return sorPf;
      return {
        text: "Finding best odds...",
        disabled: true,
        onClick: () => {},
      };
    }

    // One pooled cash figure (Base USDC + Polygon + Solana + BNB USDT, etc.) — same basis as SOR.
    const baseUsdc =
      typeof usdcBalance === "number" ? usdcBalance : parseFloat(String(usdcBalance || "0"));
    const aggregateCash =
      sorState &&
      typeof sorState.totalAvailableCash === "number" &&
      Number.isFinite(sorState.totalAvailableCash)
        ? sorState.totalAvailableCash
        : baseUsdc;
    if (aggregateCash <= 0 && state.side === "buy") {
      return { text: "Add Funds", disabled: false, onClick: handleAddFunds };
    }

    if (!state.selectedPosition) {
      return { text: "Enter amount", disabled: true, onClick: () => {} };
    }

    if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
      return noSharesToSellButton();
    }
    
    if (
      !state.amount ||
      (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
    ) {
      return { text: "Enter amount", disabled: true, onClick: () => {} };
    }

    if (state.tradingVenue === "levelup") {
      const chk = checkInputMin("levelup");
      if (chk.below) return belowMinButton(chk);
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

    if (state.tradingVenue === "levelup" && state.side === "buy") {
      const dep = trySorDepositToTrade("buy", sorState);
      if (dep) return { ...dep, isSweepingBook, availableShares };
    }

    const marketOrderEstimatedCost = state.orderType === "market" && state.side === "buy" ? state.estimatedCost : null;
    const balanceCheck = checkSufficientBalance(
      state.amount,
      state.orderType,
      state.side,
      aggregateCash,
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
      state.tradingVenue === "predictfun"
        ? predictSellShareBalance ?? null
        : state.tradingVenue === "limitless"
          ? limitlessSellShareBalance ?? null
          : null
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

    if (state.tradingVenue === "levelup") {
      const sorLu = sorUnifiedPrimary(
        state.side,
        sorState,
        buttonText,
        sorExecutingDots,
      );
      if (sorLu) {
        return { ...sorLu, isSweepingBook, availableShares };
      }
    }

    // Every venue — including LevelUp native — is expected to have a SOR
    // handler by this point. If we get here, the route hasn't been generated
    // yet (e.g. debounced fetch still in flight); we intentionally do NOT
    // fall back to the deprecated `handleTrade`, because that would bypass
    // the unified LI.FI prefund pipeline.
    return {
      text: "Finding best odds...",
      disabled: true,
      onClick: () => {},
      isSweepingBook,
      availableShares,
    };
  }, [authenticated, account, state, login, marketOrderHandler, usdcBalance, yesBalance, noBalance, checkSufficientBalance, checkSufficientShares, market, animatedDots, sorExecutingDots, handleAddFunds, polymarketTrading, orderbookWalkPosition, predictTrading, predictSellShareBalance, limitlessTrading, limitlessSellShareBalance, dflowProofVerified, dflowProofLoading, dflowStartProofFlow, sorMatchedVenues, sorState, navigate]);
}


