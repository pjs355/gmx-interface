import { getVenueConfig, type TradingVenue } from "@/config/venueConfig";
import {
	checkRawInputAgainstVenueMinimum,
	parseLimitPriceCents,
	routeFailsVenueMinimums,
	SOR_FLOOR_MESSAGES,
	type RoutePlan,
	type SorExecutionPhase,
	type SorPrefundLegProgress,
} from "@/trading/sor";
import { SHARE_SELL_COMPARE_EPS } from "../../checkBalances";
import {
	EMPTY_TRADE_PREVIEW,
	type TradePreviewFields,
} from "../../tradeQuote/types";
import type { AccountWalletGate } from "@/context/accountWallets";
import {
	userMessage,
	BTN_ENTER_AMOUNT,
	BTN_FETCHING_PRICE,
	BTN_KALSHI_ENABLE_TRADING,
	BTN_KALSHI_LIMIT_NOT_SUPPORTED,
	BTN_LIMITLESS_ESPORTS_NOT_LINKED,
	BTN_LIMITLESS_MARKET_NOT_LINKED,
	BTN_LIMITLESS_NO_MATCHED_MARKET,
	BTN_NO_BIDS_AVAILABLE,
	BTN_NO_SHARES_AVAILABLE,
	BTN_NO_SHARES_TO_SELL,
	BTN_NOT_ENOUGH_BIDS_TO_SELL,
	BTN_NOT_ENOUGH_SHARES,
	BTN_POLY_ESPORTS_NOT_LINKED,
	BTN_POLY_NO_MATCHED_MARKET,
	BTN_POLY_SETUP_REQUIRED,
	BTN_POLY_UNAVAILABLE,
	BTN_PREDICT_ESPORTS_NOT_LINKED,
	BTN_PREDICT_MARKET_IDS_NOT_LINKED,
	BTN_PREDICT_NO_MATCHED_MARKET,
	BTN_REFRESHING_VENUE_PRICES,
} from "@/errors";
import type { ButtonStateResult } from "./types";
import {
	aggregateCashFromSor,
	buildTradeActionButtonText,
	buyAddFundsIfZeroPooledCash,
	buyInsufficientBalanceIfPositivePooledCash,
	SETUP_IN_PROGRESS_LABEL,
	sorUnifiedPrimary,
	trySorDepositToTrade,
	VENUE_LOADING_LABEL,
} from "./shared";

export interface ButtonStateResolveContext {
	authenticated: boolean;
	account: string | null | undefined;
	fundingGate: AccountWalletGate;
	state: {
		isLoading: boolean;
		side: "buy" | "sell";
		orderType: "market" | "limit";
		amount: string;
		price: string;
		selectedPosition: "yes" | "no" | null;
		tradingVenue: TradingVenue;
	};
	tradePreview: TradePreviewFields;
	login: () => void;
	marketOrderHandler: {
		getAvailableLiquidity: (
			position: "yes" | "no",
			side: "buy" | "sell",
		) => {
			hasAnyLiquidity: boolean;
			maxSharesAvailable: number;
			maxUsdValue: number;
		};
	};
	usdcBalance: unknown;
	yesBalance: unknown;
	noBalance: unknown;
	checkSufficientBalance: (
		amount: string,
		orderType: "market" | "limit",
		side: "buy" | "sell",
		usdcBalance: number,
		price?: string,
		marketOrderEstimatedCost?: number | null,
		tradingVenue?: TradingVenue,
	) => { hasSufficientBalance: boolean; requiredAmount: number };
	checkSufficientShares: (
		amount: string,
		orderType: "market" | "limit",
		side: "buy" | "sell",
		selectedPosition: "yes" | "no",
		yesBalance: number,
		noBalance: number,
		scopedSellShares: number | null,
	) => { hasSufficientShares: boolean };
	market: unknown;
	handleAddFunds: () => void;
	polymarketTrading?: {
		hasPandascoreLink: boolean;
		hasMonitorMatch: boolean;
		ready: boolean;
		loading: boolean;
		blockedReason: string | null;
	};
	orderbookWalkPosition?: "yes" | "no";
	predictTrading?: {
		hasPandascoreLink: boolean;
		hasMonitorMatch: boolean;
		hasPredictMarketIds: boolean;
		ready: boolean;
		loading: boolean;
		blockedReason: string | null;
		approvalsOk?: boolean;
	};
	limitlessTrading?: {
		hasPandascoreLink: boolean;
		hasMonitorMatch: boolean;
		hasLimitlessMapping: boolean;
		ready: boolean;
		loading: boolean;
		blockedReason: string | null;
		approvalComplete?: boolean;
	};
	dflowProofVerified?: boolean;
	dflowProofLoading?: boolean;
	dflowStartProofFlow?: () => void | Promise<void>;
	sorMatchedVenues?: ReadonlySet<string>;
	sorState?: {
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
		venuePositions?: { venue: string; shares: number }[];
		totalAvailableCash?: number;
		handleAddFunds?: () => void;
	};
	animatedDots: string;
	globalSetupInProgress: boolean;
	debouncedAmountForMinLabel: string;
	navigate: (path: string) => void;
}

export function resolveButtonState(ctx: ButtonStateResolveContext): ButtonStateResult {
	const {
		authenticated,
		account,
		fundingGate,
		state,
		tradePreview,
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
		orderbookWalkPosition,
		predictTrading,
		limitlessTrading,
		dflowProofVerified,
		dflowProofLoading,
		dflowStartProofFlow,
		sorMatchedVenues,
		sorState,
		animatedDots,
		globalSetupInProgress,
		debouncedAmountForMinLabel,
		navigate,
	} = ctx;

    if (!authenticated) {
      return { text: "Log In or Sign Up", disabled: false, onClick: () => login() };
    }
    if (!account) {
      return { text: "Loading wallet...", disabled: true, onClick: () => {} };
    }
    if (fundingGate.status !== "ready") {
      const label =
        fundingGate.status === "loading" && globalSetupInProgress
          ? "Setting up your account"
          : fundingGate.message;
      return {
        text: `${label}${animatedDots}`,
        disabled: true,
        onClick: () => {},
      };
    }
    if (state.isLoading) {
      return { text: `Processing${animatedDots}`, disabled: true, onClick: () => {} };
    }

    const limitPriceCentsForMin =
      state.orderType === "limit" ? parseLimitPriceCents(state.price) : undefined;

    const checkInputMinForButtonLabel = (
      tradingVenue: string,
      matched?: Iterable<string> | null,
    ) =>
      checkRawInputAgainstVenueMinimum({
        tradingVenue,
        matchedVenues: matched ?? undefined,
        side: state.side,
        orderType: state.orderType,
        amountStr: debouncedAmountForMinLabel,
        limitPriceCents: limitPriceCentsForMin,
      });

    /** `check === true` branch helper that returns the product-specific copy. */
    const belowMinButton = (
      check: Extract<
        ReturnType<typeof checkInputMinForButtonLabel>,
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
      text: userMessage(BTN_NO_SHARES_TO_SELL),
      disabled: true,
      onClick: () => {},
    });

    if (state.tradingVenue === "all") {
      if (!state.selectedPosition) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMinForButtonLabel("all", sorMatchedVenues ?? null);
        if (chk.below) return belowMinButton(chk);
      }
      if (sellExceedsScopedHoldings()) {
        return { text: userMessage(BTN_NOT_ENOUGH_SHARES), disabled: true, onClick: () => {} };
      }
      const smartRoutingSor = sorUnifiedPrimary(
        state.side,
        sorState,
        buildTradeActionButtonText(state.side, state.selectedPosition, market),
        animatedDots,
        {
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
          globalSetupInProgress,
          smartRoutingTab: true,
          venueAutoSetupInFlight:
            Boolean(predictTrading?.loading) || Boolean(limitlessTrading?.loading),
        },
      );
      if (smartRoutingSor) return smartRoutingSor;
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
          text: userMessage(BTN_POLY_ESPORTS_NOT_LINKED),
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasMonitorMatch) {
        return {
          text: userMessage(BTN_POLY_NO_MATCHED_MARKET),
          disabled: true,
          onClick: () => {},
        };
      }
      if (pt.loading && !pt.ready) {
        return {
          text: globalSetupInProgress
            ? SETUP_IN_PROGRESS_LABEL
            : VENUE_LOADING_LABEL,
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.ready) {
        return {
          text: globalSetupInProgress
            ? SETUP_IN_PROGRESS_LABEL
            : pt.blockedReason
              ? userMessage(BTN_POLY_SETUP_REQUIRED)
              : userMessage(BTN_POLY_UNAVAILABLE),
          disabled: true,
          onClick: () => {},
        };
      }
      if (!state.selectedPosition) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMinForButtonLabel("polymarket");
        if (chk.below) return belowMinButton(chk);
      }
      if (sellExceedsScopedHoldings()) {
        return { text: userMessage(BTN_NOT_ENOUGH_SHARES), disabled: true, onClick: () => {} };
      }
      const actionText = state.side === "buy" ? "Buy" : "Sell";
      let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
      if (market) {
        const title = (
          (market as { displayName?: string; question?: string })?.displayName ||
          (market as { question?: string })?.question ||
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
          globalSetupInProgress,
        },
      );
      if (sorBuy) return sorBuy;
      return {
        text: userMessage(BTN_FETCHING_PRICE),
        disabled: true,
        onClick: () => {},
      };
    }

    if (state.tradingVenue === "limitless") {
      const lt = limitlessTrading;
      if (!lt?.hasPandascoreLink) {
        return {
          text: userMessage(BTN_LIMITLESS_ESPORTS_NOT_LINKED),
          disabled: true,
          onClick: () => {},
        };
      }
      if (!lt.hasMonitorMatch) {
        return {
          text: userMessage(BTN_LIMITLESS_NO_MATCHED_MARKET),
          disabled: true,
          onClick: () => {},
        };
      }
      if (!lt.hasLimitlessMapping) {
        return {
          text: userMessage(BTN_LIMITLESS_MARKET_NOT_LINKED),
          disabled: true,
          onClick: () => {},
        };
      }
      if (lt.loading && !lt.ready) {
        return {
          text: globalSetupInProgress
            ? SETUP_IN_PROGRESS_LABEL
            : VENUE_LOADING_LABEL,
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
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMinForButtonLabel("limitless");
        if (chk.below) return belowMinButton(chk);
      }
      if (sellExceedsScopedHoldings()) {
        return { text: userMessage(BTN_NOT_ENOUGH_SHARES), disabled: true, onClick: () => {} };
      }
      if (state.orderType === "market" && state.selectedPosition) {
        const liqPosition =
          orderbookWalkPosition ?? state.selectedPosition ?? "yes";
        const liquidityInfo = marketOrderHandler.getAvailableLiquidity(
          liqPosition,
          state.side,
        );
        if (state.side === "sell") {
          if (!liquidityInfo.hasAnyLiquidity) {
            return {
              text: userMessage(BTN_NO_BIDS_AVAILABLE),
              disabled: true,
              onClick: () => {},
            };
          }
          const requested = parseFloat(state.amount);
          if (
            Number.isFinite(requested) &&
            requested > 0 &&
            requested >
              liquidityInfo.maxSharesAvailable + SHARE_SELL_COMPARE_EPS
          ) {
            return {
              text: userMessage(BTN_NOT_ENOUGH_BIDS_TO_SELL),
              disabled: true,
              onClick: () => {},
            };
          }
        } else if (!liquidityInfo.hasAnyLiquidity) {
          return {
            text: userMessage(BTN_NO_SHARES_AVAILABLE),
            disabled: true,
            onClick: () => {},
          };
        }
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
          estimatedCost: tradePreview.estimatedCost,
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
          (market as { displayName?: string; question?: string })?.displayName ||
          (market as { question?: string })?.question ||
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
          globalSetupInProgress,
        },
      );
      if (sorLx) return sorLx;
      return {
        text: userMessage(BTN_FETCHING_PRICE),
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
          text: userMessage(BTN_KALSHI_ENABLE_TRADING),
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
          text: userMessage(BTN_KALSHI_LIMIT_NOT_SUPPORTED),
          disabled: true,
          onClick: () => {},
        };
      }
      if (!state.selectedPosition) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (!state.amount) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMinForButtonLabel("dflow");
        if (chk.below) return belowMinButton(chk);
      }
      if (sellExceedsScopedHoldings()) {
        return { text: userMessage(BTN_NOT_ENOUGH_SHARES), disabled: true, onClick: () => {} };
      }
      const actionText = state.side === "buy" ? "Buy" : "Sell";
      let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
      if (market) {
        const title = (
          (market as { displayName?: string; question?: string })?.displayName ||
          (market as { question?: string })?.question ||
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
          globalSetupInProgress,
        },
      );
      if (sorDf) return sorDf;
      return {
        text: userMessage(BTN_FETCHING_PRICE),
        disabled: true,
        onClick: () => {},
      };
    }

    if (state.tradingVenue === "predictfun") {
      const pt = predictTrading;
      if (!pt?.hasPandascoreLink) {
        return {
          text: userMessage(BTN_PREDICT_ESPORTS_NOT_LINKED),
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasMonitorMatch) {
        return {
          text: userMessage(BTN_PREDICT_NO_MATCHED_MARKET),
          disabled: true,
          onClick: () => {},
        };
      }
      if (!pt.hasPredictMarketIds) {
        return {
          text: userMessage(BTN_PREDICT_MARKET_IDS_NOT_LINKED),
          disabled: true,
          onClick: () => {},
        };
      }
      // Sells lazy-handle every prerequisite at execute time:
      //   • `placeMarketOrder` / `placeLimitOrder` call `ensureSession()` for JWT.
      //   • `ensurePredictApprovalsForTrade` runs CTF approval if missing.
      // Buys with `approvalsOk === true` are also fully lazy.
      // The Predict bootstrap gate is only meaningful for first-time BUYERS
      // whose on-chain approvals are confirmed missing — gating sells (or
      // returning buyers) on it just freezes the UI behind a redundant
      // server roundtrip + BSC RPC every time the user navigates markets.
      const skipPredictBootstrapGate =
        state.side === "sell" || pt.approvalsOk === true;
      if (!skipPredictBootstrapGate) {
        if (pt.loading && !pt.ready) {
          return {
            text: globalSetupInProgress
              ? SETUP_IN_PROGRESS_LABEL
              : VENUE_LOADING_LABEL,
            disabled: true,
            onClick: () => {},
          };
        }
        if (!pt.ready) {
          return {
            text: globalSetupInProgress
              ? SETUP_IN_PROGRESS_LABEL
              : pt.blockedReason
                ? "Predict setup required"
                : "Predict unavailable",
            disabled: true,
            onClick: () => {},
          };
        }
      }
      if (!state.selectedPosition) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
        return noSharesToSellButton();
      }
      if (
        !state.amount ||
        (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
      ) {
        return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
      }
      {
        const chk = checkInputMinForButtonLabel("predictfun");
        if (chk.below) return belowMinButton(chk);
      }
      if (sellExceedsScopedHoldings()) {
        return { text: userMessage(BTN_NOT_ENOUGH_SHARES), disabled: true, onClick: () => {} };
      }
      const actionText = state.side === "buy" ? "Buy" : "Sell";
      let buttonText = `${actionText} ${state.selectedPosition.toUpperCase()}`;
      if (market) {
        const title = (
          (market as { displayName?: string; question?: string })?.displayName ||
          (market as { question?: string })?.question ||
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
      // `venueAutoSetupInFlight` only governs SOR's EXECUTION_NOT_READY copy
      // (loading vs "Complete venue setup"). When approvals are
      // already on-chain, EXECUTION_NOT_READY is genuinely a server-side
      // tradingEnabled drift — surfacing a warm-up label implies we're
      // doing something we're not. Suppress it for sells / approved buyers.
      const venueAutoSetupInFlight =
        Boolean(predictTrading?.loading) && !skipPredictBootstrapGate;
      const sorPf = sorUnifiedPrimary(
        state.side,
        sorState,
        buttonText,
        animatedDots,
        {
          venueAutoSetupInFlight,
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
          globalSetupInProgress,
        },
      );
      if (sorPf) return sorPf;
      return {
        text: userMessage(BTN_FETCHING_PRICE),
        disabled: true,
        onClick: () => {},
      };
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
      return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
    }

    if (state.side === "sell" && scopedSellSharesTotal() <= 0) {
      return noSharesToSellButton();
    }
    
    if (
      !state.amount ||
      (state.orderType === "limit" && (!state.price || limitPriceCentsForMin == null))
    ) {
      return { text: userMessage(BTN_ENTER_AMOUNT), disabled: true, onClick: () => {} };
    }

    if (state.tradingVenue === "levelup") {
      const chk = checkInputMinForButtonLabel("levelup");
      if (chk.below) return belowMinButton(chk);
    }

    if (sellExceedsScopedHoldings()) {
      return {
        text: userMessage(BTN_NOT_ENOUGH_SHARES),
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
          if (state.side === "sell") {
            return {
              text: userMessage(BTN_NO_BIDS_AVAILABLE),
              disabled: true,
              onClick: () => {},
              isSweepingBook: false,
              availableShares: 0,
            };
          }
          return {
            text: userMessage(BTN_NO_SHARES_AVAILABLE),
            disabled: true,
            onClick: () => {},
            isSweepingBook: false,
            availableShares: 0,
          };
        }

        if (state.side === "sell") {
          const requested = parseFloat(state.amount);
          if (
            Number.isFinite(requested) &&
            requested > 0 &&
            requested >
              liquidityInfo.maxSharesAvailable + SHARE_SELL_COMPARE_EPS
          ) {
            return {
              text: userMessage(BTN_NOT_ENOUGH_BIDS_TO_SELL),
              disabled: true,
              onClick: () => {},
              isSweepingBook: false,
              availableShares: 0,
            };
          }
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
      estimatedCost: tradePreview.estimatedCost,
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
      Number(yesBalance),
      Number(noBalance),
      scopedSellForShareCheck != null ? scopedSellForShareCheck : null,
    );
    if (!sharesCheck.hasSufficientShares) {
      return {
        text: userMessage(BTN_NOT_ENOUGH_SHARES),
        disabled: true,
        onClick: () => {},
        isSweepingBook,
        availableShares,
      };
    }
    
    const fallbackButtonText = buildTradeActionButtonText(
      state.side,
      state.selectedPosition,
      market,
    );

    if (state.tradingVenue === "levelup") {
      const sorLu = sorUnifiedPrimary(
        state.side,
        sorState,
        fallbackButtonText,
        animatedDots,
        {
          sellAmountStr: state.amount,
          maxSellShares: scopedSellSharesTotal(),
          globalSetupInProgress,
        },
      );
      if (sorLu) {
        return { ...sorLu, isSweepingBook, availableShares };
      }
    }

    // Route still loading after venue-specific gates (debounced SOR fetch).
    return {
      text: userMessage(BTN_FETCHING_PRICE),
      disabled: true,
      onClick: () => {},
      isSweepingBook,
      availableShares,
    };

}
