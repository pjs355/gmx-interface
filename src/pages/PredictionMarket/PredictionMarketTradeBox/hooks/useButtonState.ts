import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAnimatedDots } from "../../../../hooks/useAnimatedDots";
import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import {
	checkRawInputAgainstVenueMinimum,
	getSorBuyCashShortfall,
	parseLimitPriceCents,
	routeFailsVenueMinimums,
	SOR_FLOOR_MESSAGES,
	type RoutePlan,
	type SorExecutionPhase,
	type SorPrefundLegProgress,
} from "@/trading/sor";
import { SHARE_SELL_COMPARE_EPS } from "../checkBalances";

/** Caps console noise when `useMemo` recomputes often with the same bad input. */
let missingPooledCashWarnCount = 0;
const MAX_MISSING_POOLED_CASH_WARNS = 3;

type SorStateForDeposit = {
	route: RoutePlan | null;
	isLoading: boolean;
	isStale?: boolean;
	routeExpired: boolean;
	totalAvailableCash?: number;
	handleAddFunds?: () => void;
};

const PREVIEW_ROUTE_NO_BALANCES_MSG =
	"Legacy route — refresh to load balance-backed execution";

/** Buy: legacy preview route only (disabled). Per-chain shortfall uses `trySorDepositToTrade`. */
function buttonIfBuyInsufficientFunds(
	side: "buy" | "sell",
	route: { sufficientFunds?: boolean; theoreticalLiquidity?: boolean } | null | undefined,
): ButtonStateResult | null {
	if (side !== "buy" || !route || route.theoreticalLiquidity !== true) return null;
	return { text: PREVIEW_ROUTE_NO_BALANCES_MSG, disabled: true, onClick: () => {} };
}

function trySorDepositToTrade(side: "buy" | "sell", sorState: SorStateForDeposit | undefined): ButtonStateResult | null {
	if (!sorState?.handleAddFunds || side !== "buy" || !sorState.route) return null;

	if (sorState.route.sufficientFunds === false) {
		const needed = sorState.route.totalCost;
		const avail = sorState.totalAvailableCash;
		let shortfall = 0;
		if (typeof needed === "number" && Number.isFinite(needed) && needed > 0) {
			if (typeof avail === "number" && Number.isFinite(avail)) {
				shortfall = Math.max(0, needed - avail);
			} else {
				shortfall = needed;
			}
		}
		if (shortfall > 0) {
			return {
				text: "Deposit to Trade",
				disabled: false,
				onClick: sorState.handleAddFunds,
				depositShortfallUsd: shortfall,
			};
		}
	}

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

function sorExecutingButtonLabel(
	phase: SorExecutionPhase | undefined,
	dots: string,
	prefundLegProgress: SorPrefundLegProgress | null | undefined,
): string {
	const prefundHop =
		prefundLegProgress &&
		prefundLegProgress.total > 1 &&
		prefundLegProgress.current >= 1
			? ` (${prefundLegProgress.current}/${prefundLegProgress.total})`
			: "";
	if (phase === "approving_funds_transfer") {
		return `Approving funds transfer${prefundHop}${dots}`;
	}
	if (phase === "approving_trades") {
		return `Approving trades${dots}`;
	}
	if (phase === "moving_funds") {
		if (prefundHop) {
			return `Moving funds${prefundHop}${dots}`;
		}
		return `Moving funds${dots}`;
	}
	return `Executing trade${dots}`;
}

function aggregateCashFromSor(
	usdcBalance: unknown,
	sorState: { totalAvailableCash?: number } | undefined,
): number {
	const baseUsdc =
		typeof usdcBalance === "number" ? usdcBalance : parseFloat(String(usdcBalance || "0"));
	if (
		sorState &&
		typeof sorState.totalAvailableCash === "number" &&
		Number.isFinite(sorState.totalAvailableCash)
	) {
		return sorState.totalAvailableCash;
	}
	if (sorState) {
		if (missingPooledCashWarnCount < MAX_MISSING_POOLED_CASH_WARNS) {
			missingPooledCashWarnCount += 1;
			console.warn(
				"[aggregateCashFromSor] totalAvailableCash missing or non-finite; pooled SOR cash treated as $0 (no Base-only fallback).",
			);
		}
		return 0;
	}
	return baseUsdc;
}

type CheckSufficientBalanceFn = (
	amount: string,
	orderType: "market" | "limit",
	side: "buy" | "sell",
	usdcBalance: number,
	price?: string,
	marketOrderEstimatedCost?: number | null,
	tradingVenue?: TradingVenue,
) => { hasSufficientBalance: boolean; requiredAmount: number };

/** Buy-only: zero pooled cash → Add Funds CTA (same semantics as unified block). */
function buyAddFundsIfZeroPooledCash(opts: {
	side: "buy" | "sell";
	aggregateCash: number;
	handleAddFunds: () => void;
}): ButtonStateResult | null {
	if (opts.side !== "buy" || !Number.isFinite(opts.aggregateCash) || opts.aggregateCash > 0) {
		return null;
	}
	return { text: "Add Funds", disabled: false, onClick: opts.handleAddFunds };
}

/** Buy-only: positive pooled cash but not enough for this order (after Add-Funds gate). */
function buyInsufficientBalanceIfPositivePooledCash(opts: {
	side: "buy" | "sell";
	aggregateCash: number;
	amount: string;
	orderType: "market" | "limit";
	price?: string;
	estimatedCost: number | null;
	tradingVenue: TradingVenue;
	checkSufficientBalance: CheckSufficientBalanceFn;
	handleAddFunds?: () => void;
}): ButtonStateResult | null {
	if (opts.side !== "buy") return null;
	if (!Number.isFinite(opts.aggregateCash)) return null;
	const marketOrderEstimatedCost =
		opts.orderType === "market" && opts.side === "buy" ? opts.estimatedCost : null;
	const balanceCheck = opts.checkSufficientBalance(
		opts.amount,
		opts.orderType,
		"buy",
		opts.aggregateCash,
		opts.price,
		marketOrderEstimatedCost,
		opts.tradingVenue,
	);
	if (balanceCheck.hasSufficientBalance) return null;
	const shortfall = Math.max(0, balanceCheck.requiredAmount - opts.aggregateCash);
	if (opts.handleAddFunds) {
		return {
			text: "Deposit to Trade",
			disabled: false,
			onClick: opts.handleAddFunds,
			depositShortfallUsd: shortfall,
		};
	}
	return { text: "Insufficient Balance", disabled: true, onClick: () => {} };
}

/**
 * Unified SOR primary for every single-venue trade — market/limit, buy/sell.
 * Prefund (LI.FI) is orchestrated inside sorState.handleExecute, so every
 * path runs through the same "bridge USDC, then sign the venue order" flow.
 */
type SorUnifiedPrimaryOptions = {
	venueAutoSetupInFlight?: boolean;
	/** Sell: requested share count in the amount field (validated vs `maxSellShares`). */
	sellAmountStr?: string;
	/** Combined held shares for the active outcome + venue scope (from SOR `venuePositions`). */
	maxSellShares?: number;
};

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
				executionPhase?: SorExecutionPhase;
				prefundLegProgress?: SorPrefundLegProgress | null;
				routeExpired: boolean;
				handleExecute: () => void;
				totalAvailableCash?: number;
				handleAddFunds?: () => void;
		  }
		| undefined,
	buttonText: string,
	animatedDots: string,
	options?: SorUnifiedPrimaryOptions | boolean,
): ButtonStateResult | null {
	if (!sorState?.handleExecute) return null;

	let venueAutoSetupInFlight = false;
	let sellAmountStr: string | undefined;
	let maxSellShares: number | undefined;
	if (typeof options === "boolean") {
		venueAutoSetupInFlight = options;
	} else if (options && typeof options === "object") {
		venueAutoSetupInFlight = options.venueAutoSetupInFlight ?? false;
		sellAmountStr = options.sellAmountStr;
		maxSellShares = options.maxSellShares;
	}

	const theoretical = buttonIfBuyInsufficientFunds(side, sorState.route);
	if (theoretical) return theoretical;

	const dep = trySorDepositToTrade(side, sorState);
	if (dep) return dep;
	if (sorState.isExecuting) {
		return {
			text: sorExecutingButtonLabel(
				sorState.executionPhase,
				animatedDots,
				sorState.prefundLegProgress,
			),
			disabled: true,
			onClick: () => {},
		};
	}
	if (sorState.isLoading && !sorState.route) {
		return { text: "Fetching price...", disabled: true, onClick: () => {} };
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
			return { text: "Fetching price...", disabled: true, onClick: () => {} };
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
		return { text: "Fetching price...", disabled: true, onClick: () => {} };
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
	if (
		side === "sell" &&
		maxSellShares != null &&
		Number.isFinite(maxSellShares) &&
		sellAmountStr != null
	) {
		const req = parseFloat(sellAmountStr);
		if (Number.isFinite(req) && req > 0 && req > maxSellShares + 1e-9) {
			return { text: "Not enough shares", disabled: true, onClick: () => {} };
		}
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
        /** From ensure-account `limitlessAccount.approvalComplete` — USDC allowance snapshot. */
        approvalComplete?: boolean;
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
        executionPhase?: SorExecutionPhase;
        prefundLegProgress?: SorPrefundLegProgress | null;
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

    /** Sell amount vs combined held shares for the active tab + outcome (`venuePositions`). */
    const sellExceedsScopedHoldings = (): boolean => {
      if (state.side !== "sell") return false;
      const req = parseFloat(state.amount);
      const held = scopedSellSharesTotal();
      return (
        Number.isFinite(req) &&
        req > 0 &&
        Number.isFinite(held) &&
        req > held + SHARE_SELL_COMPARE_EPS
      );
    };

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
      if (sellExceedsScopedHoldings()) {
        return { text: "Not enough shares", disabled: true, onClick: () => {} };
      }
      if (sorState?.isExecuting) {
        return {
          text: sorExecutingButtonLabel(
            sorState.executionPhase,
            animatedDots,
            sorState.prefundLegProgress,
          ),
          disabled: true,
          onClick: () => {},
        };
      }
      if (sorState?.isLoading && !sorState?.route) {
        return {
          text:
            state.side === "buy" ? "Finding best price..." : "Fetching price...",
          disabled: true,
          onClick: () => {},
        };
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
          return {
            text:
              state.side === "buy" ? "Finding best price..." : "Fetching price...",
            disabled: true,
            onClick: () => {},
          };
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
      {
        const tb = buttonIfBuyInsufficientFunds(state.side, sorState.route);
        if (tb) return tb;
      }
      {
        const dep = trySorDepositToTrade(state.side, sorState);
        if (dep) return dep;
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
      if (sellExceedsScopedHoldings()) {
        return { text: "Not enough shares", disabled: true, onClick: () => {} };
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
        animatedDots,
        {
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
        },
      );
      if (sorBuy) return sorBuy;
      return {
        text: "Fetching price...",
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
          text: "Unavailable",
          disabled: true,
          onClick: () => {},
        };
      }
      if (!lt.ready) {
        return {
          text: "Unavailable",
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
      if (sellExceedsScopedHoldings()) {
        return { text: "Not enough shares", disabled: true, onClick: () => {} };
      }
      if (state.orderType === "market" && state.selectedPosition) {
        const liqPosition =
          orderbookWalkPosition ?? state.selectedPosition ?? "yes";
        const liquidityInfo = marketOrderHandler.getAvailableLiquidity(
          liqPosition,
          state.side,
        );
        if (!liquidityInfo.hasAnyLiquidity) {
          return {
            text: "No shares available",
            disabled: true,
            onClick: () => {},
          };
        }
      }
      {
        const tb = buttonIfBuyInsufficientFunds(state.side, sorState?.route);
        if (tb) return tb;
      }
      if (state.side === "buy") {
        const aggregateCash = aggregateCashFromSor(usdcBalance, sorState);
        const addFunds = buyAddFundsIfZeroPooledCash({
          side: state.side,
          aggregateCash,
          handleAddFunds,
        });
        if (addFunds) return addFunds;
        const insufficient = buyInsufficientBalanceIfPositivePooledCash({
          side: state.side,
          aggregateCash,
          amount: state.amount,
          orderType: state.orderType,
          price: state.price,
          estimatedCost: state.estimatedCost,
          tradingVenue: "limitless",
          checkSufficientBalance,
          handleAddFunds,
        });
        if (insufficient) return insufficient;
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
        animatedDots,
        {
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
        },
      );
      if (sorLx) return sorLx;
      return {
        text: "Fetching price...",
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
      if (state.orderType === "limit") {
        return {
          text: "Limit orders on Kalshi through DFlow are not supported",
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
        const chk = checkInputMin("dflow");
        if (chk.below) return belowMinButton(chk);
      }
      if (sellExceedsScopedHoldings()) {
        return { text: "Not enough shares", disabled: true, onClick: () => {} };
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
      const sorDf = sorUnifiedPrimary(
        state.side,
        sorState,
        buttonText,
        animatedDots,
        {
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
        },
      );
      if (sorDf) return sorDf;
      return {
        text: "Fetching price...",
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
      if (sellExceedsScopedHoldings()) {
        return { text: "Not enough shares", disabled: true, onClick: () => {} };
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
        animatedDots,
        {
          venueAutoSetupInFlight: Boolean(predictTrading?.loading),
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
        },
      );
      if (sorPf) return sorPf;
      return {
        text: "Fetching price...",
        disabled: true,
        onClick: () => {},
      };
    }

    {
      const tb = buttonIfBuyInsufficientFunds(state.side, sorState?.route);
      if (tb) return tb;
    }

    // One pooled cash figure (Base USDC + Polygon + Solana + BNB USDT, etc.) — same basis as SOR.
    const aggregateCash = aggregateCashFromSor(usdcBalance, sorState);
    const addFundsEarly = buyAddFundsIfZeroPooledCash({
      side: state.side,
      aggregateCash,
      handleAddFunds,
    });
    if (addFundsEarly) return addFundsEarly;

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

    if (sellExceedsScopedHoldings()) {
      return {
        text: "Not enough shares",
        disabled: true,
        onClick: () => {},
        isSweepingBook: false,
        availableShares: 0,
      };
    }

    // Get available liquidity info for market orders
    let isSweepingBook = false;
    let availableShares = 0;
    
    const liqPosition =
      orderbookWalkPosition ?? state.selectedPosition ?? "yes";

    if (state.orderType === "market" && state.selectedPosition) {
      if (
        state.tradingVenue === "all" &&
        state.side === "buy" &&
        sorState?.route
      ) {
        isSweepingBook = sorState.route.insufficientLiquidity === true;
        availableShares = sorState.route.totalShares;
      } else {
        const liquidityInfo = marketOrderHandler.getAvailableLiquidity(
          liqPosition,
          state.side
        );
        availableShares = liquidityInfo.maxSharesAvailable;

        if (!liquidityInfo.hasAnyLiquidity) {
          return { text: "0 shares available. Place a limit order", disabled: true, onClick: () => {}, isSweepingBook: false, availableShares: 0 };
        }

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
    }

    if (state.tradingVenue === "levelup" && state.side === "buy") {
      const dep = trySorDepositToTrade("buy", sorState);
      if (dep) return { ...dep, isSweepingBook, availableShares };
    }

    const insufficientBal = buyInsufficientBalanceIfPositivePooledCash({
      side: state.side,
      aggregateCash,
      amount: state.amount,
      orderType: state.orderType,
      price: state.price,
      estimatedCost: state.estimatedCost,
      tradingVenue: state.tradingVenue,
      checkSufficientBalance,
      handleAddFunds,
    });
    if (insufficientBal) {
      return { ...insufficientBal, isSweepingBook, availableShares };
    }
    const scopedSellForShareCheck =
      state.side === "sell" && Array.isArray(sorState?.venuePositions)
        ? scopedSellSharesTotal()
        : null;
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
          : scopedSellForShareCheck != null
            ? scopedSellForShareCheck
            : null
    );
    if (!sharesCheck.hasSufficientShares) return { text: "Not enough shares", disabled: true, onClick: () => {}, isSweepingBook, availableShares };
    
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
        animatedDots,
        {
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
        },
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
      text: "Fetching price...",
      disabled: true,
      onClick: () => {},
      isSweepingBook,
      availableShares,
    };
  }, [authenticated, account, state, login, marketOrderHandler, usdcBalance, yesBalance, noBalance, checkSufficientBalance, checkSufficientShares, market, animatedDots, handleAddFunds, polymarketTrading, orderbookWalkPosition, predictTrading, predictSellShareBalance, limitlessTrading, limitlessSellShareBalance, dflowProofVerified, dflowProofLoading, dflowStartProofFlow, sorMatchedVenues, sorState, navigate]);
}


