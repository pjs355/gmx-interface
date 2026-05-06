import { useMemo, useCallback } from 'react';

import Button from "components/Button/Button";
import SpinningLoader from "@/components/Common/SpinningLoader";
import Tabs from "components/Tabs/Tabs";
import Tooltip from "components/Tooltip/Tooltip";
import type { TradeBoxProps, TradeBoxState, ApprovalState, TradingVenue, MarketOrderCalculation } from './types';
import type { OrderbookSnapshot } from '@/services/api/orderbookService';
import './PredictionMarketTradeBox.scss';
import { MyPositionsRow } from './MyPositionsRow';
import { mixpanelTrack } from "@/utils/mixpanel";
import { getVenueConfig } from '@/config/venueConfig';
import type {
  RoutePlan,
  RouteExecution,
  SorVenue,
  SorErrorCode,
  SorExecutionPhase,
  SorPrefundLegProgress,
  VenueRoutePreview,
} from "@/trading/sor";
import {
  VENUE_COLORS,
  SorKalshiKycShortfallBanner,
  formatToWinUsdDisplay,
  formatSorDetailsSharesDisplay,
  rawInputBelowVenueMinimum,
  parseLimitPriceCents,
} from "@/trading/sor";
import { getYesNoTeamLabels } from "./teamLabels";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import type { TradeBoxShareBalancesSnapshot } from "./hooks/useTradeBoxShareBalances";
import {
	hexToRgba,
	getContrastingTextColor,
	mixHexOnBlack,
} from "@/helpers/predictionUtils";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { usePostTradeBalanceSyncPending } from "@/trading/sor/usePostTradeBalanceSync";
import SmartRoutingSection from "./SmartRoutingSection";
import { FlashingValue } from "@/utils/FlashingValue";
import { usePortfolio } from "@/context/PortfolioContext";

const BET_VALUE_CLASS = "bet-size-value";
const BET_VALUE_FLASH_CLASS = "bet-size-value--flash";

const calculateOrderbookPrices = (orderbook: any) => {
  if (!orderbook) return { bestAsk: null, bestBid: null };
  
  const bestAsk = orderbook.asks && orderbook.asks.length > 0 
    ? Math.min(...orderbook.asks.map((a: any) => a.price))
    : null;
    
  const bestBid = orderbook.bids && orderbook.bids.length > 0
    ? Math.max(...orderbook.bids.map((b: any) => b.price))
    : null;
    
  return { bestAsk, bestBid };
};

interface StableButtonPrices {
  yesBestAsk: number | null; yesBestBid: number | null;
  noBestAsk: number | null; noBestBid: number | null;
}

interface PredictionMarketTradeBoxUIProps extends TradeBoxProps {
  /** Book-walk functions from the parent's single useMarketOrderHandler instance. */
  calculateContractsForMarketOrder: (usdAmount: number, position: "yes" | "no", side: "buy" | "sell") => MarketOrderCalculation;
  getEffectivePrice: (usdAmount: number, contracts: number, remainingUsd: number) => number;
  state: TradeBoxState;
  walletAddress?: string;
  usdcBalance?: number;
  onPositionChange: (position: 'yes' | 'no') => void;
  onAmountChange: (amount: string) => void;
  onPriceChange: (price: string) => void;
  onTradingVenueChange: (venue: TradingVenue) => void;
  onOrderTypeChange: (orderType: 'market' | 'limit') => void;
  onSideChange: (side: 'buy' | 'sell') => void;
  /** Shown under the venue tabs when Polymarket is selected (setup / monitor status). */
  polymarketVenueHint?: string | null;
  predictVenueHint?: string | null;
  predictVenueBookHints?: {
    yes: OrderbookSnapshot | null;
    no: OrderbookSnapshot | null;
  } | null;
  dflowVenueHint?: string | null;
  matchedVenues?: Set<string>;
  onTrade: () => void;
  buttonState: {
    text: string;
    disabled: boolean;
    onClick: () => void;
    depositShortfallUsd?: number;
    isSweepingBook?: boolean;
    availableShares?: number;
  };
  approvalState: ApprovalState;
  sorRoute: {
    displayRoute: RoutePlan | null;
    executionRoute: RoutePlan | null;
    venuePreviews: VenueRoutePreview[] | null;
    displayLoading: boolean;
    displayStale: boolean;
    executionLoading: boolean;
    executionStale: boolean;
    displayError: string | null;
    displayErrorCode: SorErrorCode | null;
    executionError: string | null;
    executionErrorCode: SorErrorCode | null;
  };
  sorExecution: {
    execution: RouteExecution | null;
    isExecuting: boolean;
    executionPhase?: SorExecutionPhase;
    prefundLegProgress?: SorPrefundLegProgress | null;
    remainingBudget: number | null;
    requestReroute: () => Promise<number | null>;
    acceptResult: () => Promise<void>;
    resetExecution: () => void;
  };
  sorRouteExpired: boolean;
  handleSorExecute: () => void;
  crossBuyYes: number | null;
  crossBuyNo: number | null;
  /** Max sellable shares for active tab + selected outcome (from SOR-scoped positions). */
  maxScopedSellShares: number;
  /**
   * True while the active tab's per-token share-balance query is still in
   * flight. Used to suppress `sellFieldsLocked` so we don't disable the
   * amount input during the BSC RPC roundtrip (Predict's `balanceOf` takes
   * up to ~2s on a cold load — locking the input for that window made the
   * trade box feel like it had no idea the user owned shares).
   */
  sharesLoadingForActiveTab?: boolean;
  /** Best sell bid for YES among venues where the user holds shares (All Markets sell only). */
  allMarketsSellYesBid?: number | null;
  /** Best sell bid for NO among venues where the user holds shares (All Markets sell only). */
  allMarketsSellNoBid?: number | null;
  /** Share balance snapshot from parent (single `useTradeBoxShareBalances` instance). */
  shareBalances: TradeBoxShareBalancesSnapshot;
  /**
   * Snapshot of `accountsInitialized*` from the umbrella's `exchangeMatching.dflow`
   * captured at the moment the user pressed Submit. The DFlow `/order` endpoint
   * silently injects market tokenization when needed, so first-mint trades take
   * longer than a normal swap — surface that explicitly under the trade box so
   * users understand why a successful submit isn't yet reflected on-chain.
   */
  dflowUninitAtSubmit?: boolean;
  /**
   * True for any DFlow-routed order (whether the Kalshi market is initialized
   * or not). Surfaces a generic "balance reflected shortly" notice — the SOR
   * marks the leg `filled` the moment Solana accepts the broadcast, but the
   * actual Kalshi share balance lands ~30-90s later through DFlow's async
   * settlement. When `dflowUninitAtSubmit` is also true we prefer that more
   * specific message.
   */
  dflowSubmittedAtSubmit?: boolean;
}

export default function PredictionMarketTradeBoxUI({
  market,
  orderbook,
  pandascoreMatchId,
  umbrellaId,
  umbrellaDisplayName,
  state,
  onPositionChange,
  onAmountChange,
  onPriceChange,
  onTradingVenueChange,
  onOrderTypeChange,
  onSideChange,
  polymarketVenueHint,
  predictVenueHint,
  predictVenueBookHints,
  dflowVenueHint,
  matchedVenues,
  onTrade,
  buttonState,
  approvalState,
  walletAddress,
  usdcBalance,
  calculateContractsForMarketOrder,
  getEffectivePrice,
  sorRoute,
  sorExecution,
  sorRouteExpired,
  handleSorExecute,
  crossBuyYes,
  crossBuyNo,
  maxScopedSellShares,
  sharesLoadingForActiveTab = false,
  matchedMonitor,
  allMarketsSellYesBid = null,
  allMarketsSellNoBid = null,
  shareBalances,
  dflowUninitAtSubmit = false,
  dflowSubmittedAtSubmit = false,
}: PredictionMarketTradeBoxUIProps) {
  const { formatPrice } = useOddsDisplay();
  const { selectedPosition, amount, price, orderType, side, orderResult, calculatedContracts, remainingUsd, spent, tradingFee, estimatedCost, grossReceive, sellTradingFee, netReceive, tradingVenue } = state;
  // Suppression signal for the post-signup setup flow: while any of the
  // three background activators (Polymarket / Predict / Limitless) is still
  // bootstrapping, an EXECUTION_NOT_READY error is expected and transient.
  // We hide the "Trading setup required: …" inline error so brand-new users
  // never see venue-specific jargon while the modal is doing its job.
  const setupActivation = useSetupActivationOptional();
  const globalSetupInProgress = Boolean(
    setupActivation?.anyInProgress || setupActivation?.onboardingActive,
  );

  /* Reuse the same cash number the AppHeader's "Cash" pill displays, so the
   * "Balance: $X" line under the input is always identical to the header.
   * `cashBalance` sums baseUsdc + polygonStable + bscUsdt + solanaUsdc +
   * limitlessMakerUsdc (see PortfolioContext). */
  const { cashBalance } = usePortfolio();
  const formattedCashBalance =
    typeof cashBalance === "number" && Number.isFinite(cashBalance)
      ? new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        }).format(cashBalance)
      : null;

  const syncUiKey =
    String(
      (market as { _id?: string })?._id ??
        (market as { questionId?: string })?.questionId ??
        "",
    ).trim() || null;
  const positionSharesChainSyncUi = usePostTradeBalanceSyncPending(syncUiKey);
  // While the active venue's share-balance query is still resolving (e.g.
  // Predict's BSC `balanceOf`), `maxScopedSellShares` reads as 0 even when
  // the user holds shares. Don't lock the input for that ~1-2s window —
  // the button will say "Loading your Predict shares…" and re-enable as
  // soon as the balance lands. Locks only fire on a confirmed zero.
  const sellFieldsLocked =
    side === "sell" && maxScopedSellShares <= 0 && !sharesLoadingForActiveTab;
  const venueConfig = getVenueConfig(tradingVenue);
  const { bestBid, bestAsk } = calculateOrderbookPrices(orderbook || null);

  const venueDropdownOptions = useMemo(() => {
    const all: { value: string; label: string }[] = [
      { value: "levelup", label: "LevelUp" },
      { value: "polymarket", label: "Polymarket" },
      { value: "predictfun", label: "Predict" },
      { value: "limitless", label: "Limitless" },
      { value: "dflow", label: "Kalshi" },
    ];
    const venues = matchedVenues
      ? all.filter((v) => v.value === "levelup" || matchedVenues.has(v.value))
      : all;
    if (pandascoreMatchId && venues.length > 1) {
      venues.unshift({ value: "all", label: "All Markets" });
    }
    return [{ label: "Venue", options: venues }];
  }, [pandascoreMatchId, matchedVenues]);

  /** Pandascore odds match with 2+ venues: "All Markets" prepended — smart rows replace the venue dropdown. */
  const smartRoutingSurfaceActive = useMemo(() => {
    const opts = venueDropdownOptions[0]?.options;
    return Boolean(opts?.length && opts[0]?.value === "all");
  }, [venueDropdownOptions]);

  const predictHints = predictVenueBookHints;
  const yesHintPrices = predictHints?.yes
    ? calculateOrderbookPrices(predictHints.yes)
    : null;
  const noHintPrices = predictHints?.no
    ? calculateOrderbookPrices(predictHints.no)
    : null;

  // Helper function to format numbers with commas
  const formatNumberWithCommas = (value: string): string => {
    if (!value) return '';
    
    // Handle decimal numbers
    const parts = value.split('.');
    const integerPart = parts[0];
    const decimalPart = parts[1];
    
    // Add commas to integer part
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    
    // Rejoin with decimal part if it exists, or if there's a trailing decimal point
    if (decimalPart !== undefined) {
      return `${formattedInteger}.${decimalPart}`;
    }
    
    return formattedInteger;
  };

  // For polymarket/dflow the effective orderbook is the *selected* outcome's native
  // book.  When the user selects NO, bestAsk/bestBid come from the NO book, so we
  // must swap the display formulas: the NO button shows the book directly while the
  // YES button shows the 1−p complement.  LevelUp always uses a single YES book.
  // Predict uses separate per-outcome monitor hints so no complement is needed.
  const bookRepresentsNo =
    (tradingVenue === "polymarket" ||
      tradingVenue === "dflow" ||
      tradingVenue === "limitless") &&
    selectedPosition === "no";

  const yesPrice =
    tradingVenue === "all" &&
    side === "buy" &&
    crossBuyYes != null &&
    Number.isFinite(crossBuyYes)
      ? crossBuyYes
      : tradingVenue === "predictfun" && yesHintPrices
        ? side === "buy"
          ? yesHintPrices.bestAsk
          : yesHintPrices.bestBid
        : bookRepresentsNo
          ? side === "buy"
            ? (bestBid === null ? null : 1 - bestBid)
            : (bestAsk === null ? null : 1 - bestAsk)
          : side === "buy"
            ? bestAsk
            : bestBid;
  const noPrice =
    tradingVenue === "all" &&
    side === "buy" &&
    crossBuyNo != null &&
    Number.isFinite(crossBuyNo)
      ? crossBuyNo
      : tradingVenue === "predictfun" && noHintPrices
        ? side === "buy"
          ? noHintPrices.bestAsk
          : noHintPrices.bestBid
        : bookRepresentsNo
          ? side === "buy"
            ? bestAsk
            : bestBid
          : side === "buy"
            ? (bestBid === null ? null : 1 - bestBid)
            : (bestAsk === null ? null : 1 - bestAsk);
  
  // Sell-side YES/NO buttons show the highest bid among venues where the user holds
  // shares (regardless of tab). When no held venue has a valid bid, fall back to the
  // active-tab book bid so the button stays informative instead of blank.
  const yesPriceCents = useMemo(() => {
    if (side === "sell" && allMarketsSellYesBid != null && Number.isFinite(allMarketsSellYesBid)) {
      return formatPrice(allMarketsSellYesBid);
    }
    return yesPrice !== null ? formatPrice(yesPrice) : "--";
  }, [side, allMarketsSellYesBid, yesPrice, formatPrice]);

  const noPriceCents = useMemo(() => {
    if (side === "sell" && allMarketsSellNoBid != null && Number.isFinite(allMarketsSellNoBid)) {
      return formatPrice(allMarketsSellNoBid);
    }
    return noPrice !== null ? formatPrice(noPrice) : "--";
  }, [side, allMarketsSellNoBid, noPrice, formatPrice]);

  const getBorderColorForSelected = (backgroundColor: string): string => {
    if (!backgroundColor) return '#ffffff';
    const cleaned = backgroundColor.replace('#', '').toLowerCase();
    if (cleaned === '000000' || cleaned === '000' || backgroundColor.toLowerCase() === 'rgb(0, 0, 0)' || backgroundColor.toLowerCase() === 'black') {
      return '#ffffff';
    }
    if (cleaned === 'ffffff' || cleaned === 'fff' || backgroundColor.toLowerCase() === 'rgb(255, 255, 255)' || backgroundColor.toLowerCase() === 'white') {
      return '#000000';
    }
    const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
    const r = parseInt(full.substring(0, 2), 16) || 0;
    const g = parseInt(full.substring(2, 4), 16) || 0;
    const b = parseInt(full.substring(4, 6), 16) || 0;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    return brightness < 128 ? '#ffffff' : '#000000';
  };

  const isVsSingle = useMemo(() => {
    if (!market || (market as any)?.umbrellaChildrenCount !== 1) return false;
    const mt = (market?.displayName || (market as any)?.question || "").trim();
    if (mt.match(/^Over\s+/i)) return false;
    const raw =
      (umbrellaDisplayName || "")
        .replace(/\s*-\s*Match Winner$/i, "")
        .trim() || mt;
    const parts = raw
      .split(/\s*vs\.?\s*/i)
      .map((s: string) => s.trim())
      .filter(Boolean);
    return parts.length === 2;
  }, [market, umbrellaDisplayName]);

  const yesTeamColor: string = (market as any)?.yesColor || '#22c55e';
  const noTeamColor: string = (market as any)?.noColor || '#ef4444';

  const yesTeamTextSolid = useMemo(
    () => getContrastingTextColor(yesTeamColor),
    [yesTeamColor],
  );
  const yesTeamTextTint = useMemo(
    () => getContrastingTextColor(mixHexOnBlack(yesTeamColor, 0.35)),
    [yesTeamColor],
  );
  const noTeamTextSolid = useMemo(
    () => getContrastingTextColor(noTeamColor),
    [noTeamColor],
  );
  const noTeamTextTint = useMemo(
    () => getContrastingTextColor(mixHexOnBlack(noTeamColor, 0.35)),
    [noTeamColor],
  );

  const overUnderMatch = useMemo(() => {
    const title = (market?.displayName || (market as any)?.question || '').trim();
    const match = title.match(/^Over\s+([\d,]+)/i);
    return match ? match[1] : null;
  }, [market?.displayName, (market as any)?.question]);

  const { yesTeamLabel, noTeamLabel } = useMemo(
    () => getYesNoTeamLabels(market, umbrellaDisplayName),
    [market, umbrellaDisplayName],
  );

  // Transform the display title for Over/Under markets
  const displayMarketTitle = useMemo(() => {
    if (overUnderMatch) {
      return `${overUnderMatch} Players`;
    }
    return market.displayName || market.question;
  }, [overUnderMatch, market.displayName, market.question]);

  const orderTypeDropdownOptions = useMemo(() => {
    if (tradingVenue === "all") {
      return [
        {
          label: "Market",
          options: [{ value: "market" as const, label: "Market" }],
        },
      ];
    }
    const options: { value: "market" | "limit"; label: string }[] = [
      { value: "market", label: "Market" },
      { value: "limit", label: "Limit" },
    ];
    return [{ label: "Market", options }];
  }, [tradingVenue]);

  /** All Markets buy = USD; other venues use $ only for market buy. Sell (incl. All Markets) = share count, no $. */
  const amountInputShowsDollarPrefix = useMemo(() => {
    if (tradingVenue === "all") return side === "buy";
    return side === "buy" && orderType === "market";
  }, [tradingVenue, side, orderType]);

  /** Match Smart Routing: no To Win / Details breakdown under the SOR trade floor. */
  const belowTradeFloor = useMemo(() => {
    if (tradingVenue === "all") return false;
    return rawInputBelowVenueMinimum({
      tradingVenue,
      side,
      orderType,
      amountStr: amount ?? "",
      limitPriceCents:
        orderType === "limit" ? parseLimitPriceCents(price) : undefined,
    });
  }, [tradingVenue, side, orderType, amount, price]);

  // Compute values for limit orders
  const limitOrderAmount = (() => {
    if (orderType !== 'limit' || !amount || !price) return null;
    const shares = Number(amount);
    const cents = Number(price);
    if (!Number.isFinite(shares) || !Number.isFinite(cents) || shares <= 0 || cents <= 0) return null;
    return shares * cents / 100; // Convert cents to dollars
  })();

  const limitOrderToWin = (() => {
    if (orderType !== 'limit' || !amount || side !== 'buy') return null;
    const shares = Number(amount);
    return Number.isFinite(shares) && shares > 0 ? shares : null;
  })();

  const limitOrderFee = (() => {
    if (orderType !== 'limit' || !amount || !price) return 0;
    const shares = Number(amount);
    const cents = Number(price);
    if (!Number.isFinite(shares) || !Number.isFinite(cents) || shares <= 0 || cents <= 0) return 0;
    return venueConfig.estimateFee({ contracts: shares, price: cents / 100, side });
  })();

  // "To Win" = total payout if the position wins. Each contract pays $1.
  const toWinNumeric = (() => {
    if (tradingVenue === "all") return null;
    if (!amount || !selectedPosition) return null;

    if (orderType === 'limit') {
      if (side === 'sell') {
        return limitOrderAmount;
      }
      if (limitOrderToWin == null) return null;
      return Number.isFinite(limitOrderToWin) && limitOrderToWin > 0 ? limitOrderToWin : null;
    }

    if (calculatedContracts === null) return null;
    if (side === 'sell') {
      const v = remainingUsd;
      const num = v !== undefined && v !== null ? Number(v) : NaN;
      return Number.isFinite(num) && num > 0 ? num : null;
    }
    // Market buy: payout = $1 × contracts
    const profit = calculatedContracts;
    return Number.isFinite(profit) && profit > 0 ? profit : null;
  })();

  // Compute Odds % for market BUY orders using weighted average fill price.
  // Prefers SOR route data (server-side book walk) when available; falls back to local book walk.
  const oddsData = useMemo(() => {
    if (tradingVenue === "all") return null;
    if (orderType !== 'market' || side !== 'buy') return null;
    if (!amount || !selectedPosition) return null;
    const usdAmount = Number(amount);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) return null;

    const sorRouteFreshForAmount =
      sorRoute.executionRoute &&
      sorRoute.executionRoute.legs.length > 0 &&
      !sorRoute.executionStale &&
      Math.round(sorRoute.executionRoute.requestedAmount * 100) ===
        Math.round(usdAmount * 100);

    if (sorRouteFreshForAmount) {
      const leg = sorRoute.executionRoute!.legs[0];
      const avgPrice = leg.avgPrice;
      if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
      const referencePrice = bestAsk ?? null;
      const pct = Math.round(avgPrice * 100);
      if (!Number.isFinite(pct) || pct < 0) return null;
      const isUpdated = referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
        ? avgPrice > referencePrice * 1.1
        : false;
      const fromPct = referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
        ? Math.round(referencePrice * 100)
        : null;
      return { pct, avgPrice, isUpdated, fromPct };
    }

    // Local book walk while SOR is loading/stale or amount does not match the current route
    const walkUsd = venueConfig.effectiveBuyBudget(usdAmount, {
      approxPrice: bestAsk ?? undefined,
    });
    const { contracts, remainingUsd } = calculateContractsForMarketOrder(walkUsd, selectedPosition, 'buy');
    if (!contracts || contracts <= 0) return null;
    const avgPrice = getEffectivePrice(walkUsd, contracts, remainingUsd);
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
    const referencePrice = (() => {
      if (tradingVenue === "predictfun" && predictHints) {
        const hp =
          selectedPosition === "yes" ? yesHintPrices : noHintPrices;
        if (!hp) return null;
        return hp.bestAsk ?? null;
      }
      if (
        tradingVenue === "polymarket" ||
        tradingVenue === "dflow" ||
        tradingVenue === "limitless"
      ) {
        return bestAsk ?? null;
      }
      return selectedPosition === 'yes'
        ? (bestAsk ?? null)
        : (bestBid === null || bestBid === undefined ? null : (1 - bestBid));
    })();
    const pct = Math.round(avgPrice * 100);
    if (!Number.isFinite(pct) || pct < 0) return null;
    const isUpdated = referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
      ? avgPrice > referencePrice * 1.1
      : false;
    const fromPct = referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
      ? Math.round(referencePrice * 100)
      : null;
    return { pct, avgPrice, isUpdated, fromPct };
  }, [
    orderType,
    side,
    amount,
    selectedPosition,
    tradingVenue,
    calculateContractsForMarketOrder,
    getEffectivePrice,
    bestAsk,
    bestBid,
    predictHints,
    yesHintPrices,
    noHintPrices,
    sorRoute.executionRoute,
    sorRoute.executionStale,
  ]);

  // Compute Avg Price (¢) for market SELL orders using weighted average sale price.
  // Prefers the SOR execution channel (single-venue) when fresh.
  const sellAvgCents = useMemo(() => {
    if (orderType !== 'market' || side !== 'sell') return null;
    if (!amount || !selectedPosition) return null;
    const shares = Number(amount);
    if (!Number.isFinite(shares) || shares <= 0) return null;

    const sorRouteFreshForAmount =
      sorRoute.executionRoute &&
      sorRoute.executionRoute.legs.length > 0 &&
      !sorRoute.executionStale &&
      Math.abs(sorRoute.executionRoute.requestedAmount - shares) < 0.0001;

    if (sorRouteFreshForAmount) {
      const leg = sorRoute.executionRoute!.legs[0];
      const avgPrice = leg.avgPrice;
      if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
      return Math.round(avgPrice * 100);
    }

    const { contracts, remainingUsd } = calculateContractsForMarketOrder(shares, selectedPosition, 'sell');
    if (!contracts || contracts <= 0) return null;
    const avgPrice = remainingUsd / contracts;
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
    const cents = Math.round(avgPrice * 100);
    return cents;
  }, [orderType, side, amount, selectedPosition, calculateContractsForMarketOrder, sorRoute.executionRoute, sorRoute.executionStale]);

  return (
    <div className="prediction-market-tradebox">
      {/* Title + venue dropdown (same control pattern as Market / Limit) */}
      <div className="market-name-header">
        <h3 className="market-name-header__title">{displayMarketTitle}</h3>
        {!smartRoutingSurfaceActive ? (
          <div className="market-name-header__venue trade-mode-selector">
            <Tabs
              options={venueDropdownOptions}
              regularOptionClassname="py-10"
              type="inline"
              selectedValue={state.tradingVenue}
              onChange={(value) =>
                onTradingVenueChange(value as TradingVenue)
              }
              qa="trade-venue"
            />
          </div>
        ) : null}
      </div>

      <div className="tradebox-header">
        <div className="side-selector">
          <Button
            qa="tradebox-side-buy"
            variant={side === 'buy' ? 'primary' : 'secondary'}
            onClick={() => onSideChange('buy')}
            className={`side-btn ${side === 'buy' ? 'selected primary' : ''}`}
          >
            Buy
          </Button>
          
          <Button
            qa="tradebox-side-sell"
            variant={side === 'sell' ? 'primary' : 'secondary'}
            onClick={() => onSideChange('sell')}
            className={`side-btn ${side === 'sell' ? 'selected secondary' : ''}`}
          >
            Sell
          </Button>
        </div>
        {/* Market/Limit hidden on pandascore multi-venue pages (market-only smart routing). */}
        {tradingVenue !== "all" && !smartRoutingSurfaceActive && (
          <div className="trade-mode-selector">
            <Tabs
              options={orderTypeDropdownOptions}
              regularOptionClassname="py-10"
              type="inline"
              selectedValue={orderType}
              onChange={(value) => onOrderTypeChange(value as 'market' | 'limit')}
              qa="trade-mode"
            />
          </div>
        )}
      </div>
      
      <div className="tradebox-separator" />

      {/* Position Selection */}
      <div className="position-selector" style={{ marginBottom: 24 }}>
        <Button
          qa="tradebox-position-yes"
          variant="secondary"
          onClick={() => onPositionChange('yes')}
          className={`position-btn ${selectedPosition === 'yes' ? 'selected primary' : ''}`}
          style={isVsSingle ? {
            background: selectedPosition === 'yes' ? yesTeamColor : hexToRgba(yesTeamColor, 0.35),
            color: selectedPosition === 'yes' ? yesTeamTextSolid : yesTeamTextTint,
            border: `2px solid ${selectedPosition === 'yes' ? getBorderColorForSelected(yesTeamColor) : hexToRgba(yesTeamColor, 0.35)}`,
          } : undefined}
          onMouseEnter={(e) => {
            if (isVsSingle && selectedPosition !== 'yes') {
              e.currentTarget.style.border = `2px solid ${yesTeamColor}`;
            }
          }}
          onMouseLeave={(e) => {
            if (isVsSingle && selectedPosition !== 'yes') {
              e.currentTarget.style.border = `2px solid ${hexToRgba(yesTeamColor, 0.35)}`;
            }
          }}
        >
          <strong className="position-btn__label-row">
            <span className="position-btn__name">{yesTeamLabel}</span>
            <span className="position-btn__price">{yesPriceCents}</span>
          </strong>
        </Button>
        
        <Button
          qa="tradebox-position-no"
          variant="secondary"
          onClick={() => onPositionChange('no')}
          className={`position-btn ${selectedPosition === 'no' ? 'selected secondary' : ''}`}
          style={isVsSingle ? {
            background: selectedPosition === 'no' ? noTeamColor : hexToRgba(noTeamColor, 0.35),
            color: selectedPosition === 'no' ? noTeamTextSolid : noTeamTextTint,
            border: `2px solid ${selectedPosition === 'no' ? getBorderColorForSelected(noTeamColor) : hexToRgba(noTeamColor, 0.35)}`,
          } : undefined}
          onMouseEnter={(e) => {
            if (isVsSingle && selectedPosition !== 'no') {
              e.currentTarget.style.border = `2px solid ${noTeamColor}`;
            }
          }}
          onMouseLeave={(e) => {
            if (isVsSingle && selectedPosition !== 'no') {
              e.currentTarget.style.border = `2px solid ${hexToRgba(noTeamColor, 0.35)}`;
            }
          }}
        >
          <strong className="position-btn__label-row">
            <span className="position-btn__name">{noTeamLabel}</span>
            <span className="position-btn__price">{noPriceCents}</span>
          </strong>
        </Button>
      </div>

      {/* My Positions - shown if user holds this market's YES/NO */}
      <div style={{ marginTop: 24 }}>
        <MyPositionsRow
          market={market as any}
          umbrellaId={umbrellaId}
          tradingVenue={tradingVenue}
          yesTeamLabel={yesTeamLabel}
          noTeamLabel={noTeamLabel}
          isVsSingle={isVsSingle}
          yesTeamColor={yesTeamColor}
          noTeamColor={noTeamColor}
          side={side}
          selectedPosition={selectedPosition}
          matchedMonitor={matchedMonitor}
          shareBalances={shareBalances}
          positionSharesRefreshing={positionSharesChainSyncUi}
        />
      </div>

      {/* Kalshi / DFlow: limit tab visible but trading area is disabled */}
      {state.tradingVenue === "dflow" && orderType === "limit" ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "200px",
            padding: "32px 24px",
            textAlign: "center",
            pointerEvents: "none",
            userSelect: "none",
          }}
        >
          <p
            style={{
              fontSize: "18px",
              fontWeight: 600,
              color: "#94a3b8",
              lineHeight: 1.4,
              margin: 0,
            }}
          >
            Limit orders on Kalshi through DFlow are not supported
          </p>
        </div>
      ) : (
      <>
      {/* Amount Input */}
      <div className="input-section">
        <div className="input-label">
          {tradingVenue === "all"
            ? side === "sell"
              ? "Shares"
              : "Amount"
            : orderType === 'market'
              ? (side === 'sell' ? 'Shares' : 'Amount')
              : 'Shares'
          }
        </div>
        <div className={`input-container prediction-input-container ${(!amount || amount === '') ? 'empty-input' : ''}`}>
          {/* Show $ symbol when there's a value, use placeholder when empty */}
          <input
            data-qa="tradebox-amount-input"
            type="text"
            disabled={sellFieldsLocked}
            value={amount ? (amountInputShowsDollarPrefix ? `$${formatNumberWithCommas(amount)}` : formatNumberWithCommas(amount)) : ''}
            onFocus={() => {
              try {
                mixpanelTrack("AmountInputFocused", {
                  marketId: market?._id || market?.questionId,
                  marketName: market?.displayName || market?.question,
                  orderType: orderType,
                  side: side,
                  selectedPosition: selectedPosition,
                });
              } catch (error) {
                console.error("error", error);
              }
            }}
            onChange={(e) => {
              const value = e.target.value;
              
              // Remove $ and commas for processing
              const cleanValue = value.replace(/[$,\s]/g, '');
              
              // LevelUp requires whole shares; other venues allow fractional
              const forceWholeShares = venueConfig.requiresWholeShares &&
                (orderType === 'limit' || (orderType === 'market' && side === 'sell'));
              if (forceWholeShares) {
                if (cleanValue.includes('.')) {
                  return;
                }
                if (!/^\d*$/.test(cleanValue)) {
                  return;
                }
              } else {
                // USD (market buy only in UI): 2 dp. Shares (sell, limit, All buy amount): up to 8 dp.
                const decimalCount = (cleanValue.match(/\./g) || []).length;
                if (decimalCount > 1) {
                  return;
                }
                const maxFractionDigits = amountInputShowsDollarPrefix ? 2 : 8;
                const frac = cleanValue.includes(".") ? cleanValue.split(".")[1] : "";
                if (frac && frac.length > maxFractionDigits) {
                  return;
                }
              }
              
              onAmountChange(cleanValue);
            }}
            onKeyDown={(e) => {
              const char = e.key;
              const isNumber = /[0-9]/.test(char);
              const isDecimal = char === '.';
              const isControlKey = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(char);
              
              // Only block decimals when venue requires whole shares and input is shares
              const blockDecimal = venueConfig.requiresWholeShares &&
                (orderType === 'limit' || (orderType === 'market' && side === 'sell'));
              if (blockDecimal && isDecimal) {
                e.preventDefault();
                return;
              }
              
              // Block everything except numbers, decimal (for market buy orders), and control keys
              if (!isNumber && !isDecimal && !isControlKey) {
                e.preventDefault();
              }
            }}
            placeholder={amountInputShowsDollarPrefix ? '$0' : '0'}
            className={`trade-input prediction-trade-input`}
          />
        </div>

      </div>

      {/* Cash balance hint — small line right under the Amount input.
          Shows the same value as the AppHeader "Cash" pill so the user always
          knows their available cash at a glance while sizing a trade. */}
      {formattedCashBalance !== null && (
        <div className="trade-cash-balance-hint">
          Balance: ${formattedCashBalance}
        </div>
      )}

      {/* Price Input (for Limit Orders) */}
      {orderType === 'limit' && (
        <div className="input-section">
          <div className="input-label">Limit Price</div>
          <div className={`input-container prediction-input-container ${(!price || price === '') ? 'empty-input' : ''}`}>
            <input
              type="number"
              value={price}
              onChange={(e) => {
                const value = e.target.value;
                const num = parseInt(value);
                
                // Only allow whole numbers between 1-99
                if (value && (isNaN(num) || num < 1 || num > 99 || !Number.isInteger(parseFloat(value)))) {
                  return;
                }
                onPriceChange(value);
              }}
              onKeyDown={(e) => {
                // Only allow numbers and control keys
                const char = e.key;
                const isNumber = /[0-9]/.test(char);
                const isControlKey = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(char);
                
                // Block everything except numbers and control keys
                if (!isNumber && !isControlKey) {
                  e.preventDefault();
                }
              }}
              placeholder="0"
              min="1"
              max="99"
              step="1"
              className="trade-input prediction-trade-input"
            />
            <span className="currency-symbol">¢</span>
          </div>
        </div>
      )}

      {smartRoutingSurfaceActive && (
        <SmartRoutingSection
          displayRoute={sorRoute.displayRoute}
          executionRoute={sorRoute.executionRoute}
          venuePreviews={sorRoute.venuePreviews ?? null}
          tradingVenue={tradingVenue}
          isLoading={sorRoute.displayLoading}
          onSelectVenue={onTradingVenueChange}
          userAmount={amount}
          side={side}
        />
      )}

      {/* SOR route breakdown when venue is "all" — sourced from the omnibus
          (display) channel. We only render the wrapper if there's something
          to show: an error, sell-side totals, or an insufficient-liquidity
          warning. Pure buy success cases are intentionally empty here because
          the smart-routing rows above already show the payout. */}
      {tradingVenue === "all" && (() => {
        // Hide the inline EXECUTION_NOT_READY block while the post-signup
        // setup is still wrapping up — the disabled CTA already shows
        // "Setting up your account…" and a duplicate red error line below it
        // is jarring. Other error codes (NO_BOOKS_AVAILABLE, validation,
        // floors) still surface normally.
        const isSetupErrorSuppressed =
          sorRoute.displayErrorCode === "EXECUTION_NOT_READY" &&
          globalSetupInProgress;
        const hasError = Boolean(
          sorRoute.displayError &&
            !sorRoute.displayRoute &&
            !sorRoute.displayLoading &&
            !isSetupErrorSuppressed,
        );
        const route = sorRoute.displayRoute;
        const isSell = route?.side === "sell";
        const hasSellTotals = Boolean(
          route && isSell && route.totalShares > 0,
        );
        /* Partial-fill warning moved under the Buy button, so it's no
         * longer part of the gate. */
        const hasAllTabContent = hasError || hasSellTotals;
        if (!hasAllTabContent) return null;
        return (
        <div className="bet-size-section">
          {sorRoute.displayError && !sorRoute.displayRoute && !sorRoute.displayLoading && !isSetupErrorSuppressed && (() => {
						const rawErr = sorRoute.displayError ?? "";
						const isKalshiWholeShareHint =
							sorRoute.displayErrorCode === "WHOLE_SHARES_ONLY" ||
							rawErr.includes(
								"Fractional share amounts are not supported on Kalshi",
							);
						// `NO_BOOKS_AVAILABLE` / `NO_MARKET_FOUND` are already phrased as a
						// complete, user-facing sentence in the SOR route formatter
						// ("No shares available" / "No bids available"). Don't double up
						// with a "Route unavailable: " prefix.
						const isNoLiquidityHint =
							sorRoute.displayErrorCode === "NO_BOOKS_AVAILABLE" ||
							sorRoute.displayErrorCode === "NO_MARKET_FOUND";
						const displayErr = rawErr
							.replace(/^\s*Route unavailable:\s*/i, "")
							.trim();
						return (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <span
                  style={
                    isKalshiWholeShareHint
                      ? {
							fontSize: 12,
							color: "#eab308",
							display: "inline-block",
							padding: "6px 8px",
							borderRadius: 6,
							backgroundColor: "rgba(234, 179, 8, 0.12)",
						}
                      : { color: "#ef4444", fontSize: 12 }
                  }
                >
                  {sorRoute.displayErrorCode === "EXECUTION_NOT_READY"
                    ? "Trading setup required: "
                    : isKalshiWholeShareHint || isNoLiquidityHint
                      ? ""
                      : "Route unavailable: "}
                  {displayErr}
                </span>
              </div>
            </div>
						);
          })()}
          {/* Sell-side Avg Price + Estimated Receive lines were intentionally
              removed: the per-venue smart-routing rows already show the
              proceeds for the selected sell route, and stacking these
              duplicate totals below cluttered the box. The partial-fill
              warning is rendered once below the Sell button. */}
        </div>
        );
      })()}

      {/* Bet Size / To Win for single-venue orders.
          The buy "To Win" row is hidden when smart routing is active (the
          selected smart-routing row already shows it), so we exclude it from
          the existence check too — otherwise we'd render an empty styled
          wrapper for buy-on-a-venue-tab in pandascore markets. */}
      {tradingVenue !== "all" &&
        !belowTradeFloor &&
        (
          (toWinNumeric !== null && side === 'buy' && !smartRoutingSurfaceActive) ||
          limitOrderAmount !== null ||
          oddsData !== null
        ) && (
        <div className="bet-size-section">
          {/* Market-sell Avg Price + Estimated Receive intentionally removed —
              the per-venue smart-routing rows already show this info, and the
              duplicate stack cluttered the box. Limit-sell still surfaces its
              own "Estimated Receive" / "Est. notional" line below because that
              is the only place a user sees what their limit price will yield. */}
          {orderType === 'limit' && side === 'sell' && limitOrderAmount !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={venueConfig.feeTooltip}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">
                    {limitOrderFee > 0 ? "Estimated Receive" : `Est. notional${venueConfig.collateral !== "USDC" ? ` (${venueConfig.collateral})` : ""}`}
                  </span>
                </Tooltip>
                <FlashingValue
                  value={`$ ${(Math.floor((limitOrderAmount - limitOrderFee) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  className={`${BET_VALUE_CLASS} amount-value`}
                  flashClassName={BET_VALUE_FLASH_CLASS}
                />
              </div>
            </div>
          )}

          {/* Show To Win line for BUY orders only (SELL orders show Estimated
              Receive above). Suppressed when the smart-routing surface is
              active because the selected smart-routing row already shows the
              same payout in large green text. Single-venue markets without
              smart routing still rely on this line as the only payout display. */}
          {toWinNumeric !== null && side === 'buy' && !smartRoutingSurfaceActive && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <span className={`bet-size-label to-win-label`}>To Win</span>
                <FlashingValue
                  value={`$ ${formatToWinUsdDisplay(toWinNumeric)}`}
                  className={BET_VALUE_CLASS}
                  flashClassName={BET_VALUE_FLASH_CLASS}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trade Button */}
      <Button
        qa="tradebox-submit"
        variant="primary"
        onClick={() => {
          try {
            mixpanelTrack("TradeButtonClicked", {
              marketId: market?._id || market?.questionId,
              marketName: market?.displayName || market?.question,
              orderType: orderType,
              side: side,
              selectedPosition: selectedPosition,
              tradingVenue: state.tradingVenue,
              amount: amount,
              price: price,
              limitPriceProb:
                orderType === "limit" && price
                  ? Number(price) / 100
                  : null,
              derivedAvgFillPriceFromBook:
                orderType === "market" && oddsData
                  ? oddsData.avgPrice
                  : null,
              derivedAvgFillCents:
                orderType === "market" && oddsData
                  ? Math.round(oddsData.avgPrice * 100)
                  : null,
              marketSellAvgCents:
                orderType === "market" && side === "sell"
                  ? sellAvgCents
                  : null,
              estContracts: state.calculatedContracts,
              buttonText: buttonState.text,
            });
          } catch (error) {
            console.error("error", error);
          }
          buttonState.onClick();
        }}
        disabled={buttonState.disabled}
        className="trade-button"
      >
        {buttonState.text}
      </Button>
      {/* The deposit-shortfall amount is already conveyed by the Buy button
          text via `useButtonState`'s `trySorDepositToTrade` path, so the
          standalone "Deposit needed $X" banner under the button was redundant
          and noisy — removed. */}
      {/* Partial-fill warning lives directly under the Buy button so it's the
          last thing the user reads before clicking. Pulls from the active
          executable route — `displayRoute` (omnibus) on the "all" tab,
          `executionRoute` (targeted) on a single-venue tab — so it covers
          both surfaces with one render path. */}
      {(() => {
        const route =
          tradingVenue === "all"
            ? sorRoute.displayRoute
            : sorRoute.executionRoute;
        if (!route?.insufficientLiquidity) return null;
        const isSell = route.side === "sell";
        return (
          <div className="trade-partial-fill-hint">
            {isSell
              ? "Not enough bids to sell all shares"
              : "Not enough shares to fill your order. Will fill partial order"}
          </div>
        );
      })()}
      {tradingVenue === "all" &&
        side === "buy" &&
        sorRoute.displayRoute?.sizeSuggestion &&
        (() => {
          const s = sorRoute.displayRoute!.sizeSuggestion!;
          const suggested = s.suggestedAmount;
          return (
            <div
              className="trade-size-suggestion-hint"
              style={{
                marginTop: 8,
                padding: "6px 10px",
                fontSize: 12,
                color: "#93c5fd",
                fontWeight: 500,
                textAlign: "center",
                lineHeight: 1.4,
                borderRadius: 6,
                backgroundColor: "rgba(59, 130, 246, 0.08)",
                cursor: "pointer",
                border: "1px solid rgba(59, 130, 246, 0.25)",
              }}
              onClick={() => {
                onAmountChange(suggested.toFixed(2));
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onAmountChange(suggested.toFixed(2));
                }
              }}
              title={s.reason}
            >
              Increase to ${suggested.toFixed(2)} for a better price (
              {formatPrice(s.unlockedEffectivePrice)} / share)
            </div>
          );
        })()}
      {tradingVenue === "all" && sorRoute.displayRoute && (
        <SorKalshiKycShortfallBanner route={sorRoute.displayRoute} variant="tradebox" />
      )}
      </>
      )}

      {/* SOR execution result (partial / failed only — success has no fill summary banner) */}
      {tradingVenue === "all" &&
        sorExecution.execution &&
        !sorExecution.isExecuting &&
        sorExecution.execution.status !== "complete" && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            backgroundColor:
              sorExecution.execution.status === "partial"
                  ? "rgba(245, 158, 11, 0.08)"
                  : "rgba(239, 68, 68, 0.08)",
            color:
              sorExecution.execution.status === "partial"
                  ? "#f59e0b"
                  : "#ef4444",
          }}
        >
          {sorExecution.execution.status === "partial" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{side === "sell" ? "Partially sold" : "Partially filled"}: {formatSorDetailsSharesDisplay(sorExecution.execution.totalFilledShares)} shares</span>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => sorExecution.requestReroute()}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid #f59e0b",
                    backgroundColor: "transparent",
                    color: "#f59e0b",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Re-route {sorExecution.remainingBudget != null ? `$${sorExecution.remainingBudget.toFixed(2)}` : "remaining"}
                </button>
                <button
                  type="button"
                  onClick={() => sorExecution.acceptResult()}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    border: "1px solid rgba(255,255,255,0.1)",
                    backgroundColor: "transparent",
                    color: "#9ca3af",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  Keep as-is
                </button>
              </div>
            </div>
          )}
          {sorExecution.execution.status === "failed" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{side === "sell" ? "Execution failed. Shares remain in your accounts." : "Execution failed. Funds remain in your wallets."}</span>
              <button
                type="button"
                onClick={() => sorExecution.resetExecution()}
                style={{
                  padding: "4px 8px",
                  borderRadius: 4,
                  border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "transparent",
                  color: "#9ca3af",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {/*
        E2E / automation: outcome hook only (visually hidden — `e2e/page-objects/tradebox.ts` `waitForFill`).
        The error reason is exposed via `data-qa-fill-error` so the verbose payload never lands in
        the rendered DOM/toast — Playwright reads the attribute, the user sees the toast text only.
      */}
      {orderResult && (
        <div
          data-qa="tradebox-fill-confirmation"
          data-qa-fill-status={orderResult.success ? "success" : "error"}
          data-qa-fill-error={
            orderResult.success ? undefined : orderResult.error || ""
          }
          className="trade-notification-e2e-sentinel"
          aria-hidden="true"
        >
          <span className="trade-notification-e2e-sentinel__label">
            {orderResult.success ? "Order Submitted!" : "Order Failed"}
          </span>
        </div>
      )}

      {orderResult?.success && dflowUninitAtSubmit && (
        <div
          data-qa="tradebox-dflow-uninit-notice"
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#9ca3af",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          Order may take longer as Kalshi via DFlow is creating this market
        </div>
      )}

      {orderResult?.success && dflowSubmittedAtSubmit && !dflowUninitAtSubmit && (
        <div
          data-qa="tradebox-dflow-submitted-notice"
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 8,
            backgroundColor: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#9ca3af",
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          Kalshi trade submitted. It may take a moment for your balance to be reflected.
        </div>
      )}

      {/*
        E2E / automation: single-venue market quote hook (visually hidden — `e2e/page-objects/tradebox.ts`
        `readLegAttrs`, `readQuotedBuyCostUsd`, `readQuotedSellReceiveUsd`, `expandSorDetailsIfCollapsed`).
        Populated directly from `sorRoute.executionRoute` (the targeted plan that Submit will sign);
        when the route is null the sentinel is absent and tests time out cleanly with their existing
        "no SOR quote" error path. The `aria-expanded="true"` toggle keeps the page object's expand
        helper a no-op without re-introducing the visible Details collapsible that was intentionally
        removed from the UI.
      */}
      {tradingVenue !== "all" &&
        orderType === "market" &&
        sorRoute.executionRoute &&
        sorRoute.executionRoute.legs.length > 0 && (() => {
          const route = sorRoute.executionRoute;
          const leg = route.legs[0];
          const legSide = route.side === "buy" ? "market-buy" : "market-sell";
          const priceCents = Math.round(leg.avgPrice * 100);
          const sellReceiveUsd =
            typeof leg.executionAmountUsd === "number" &&
            Number.isFinite(leg.executionAmountUsd) &&
            leg.executionAmountUsd > 0
              ? leg.executionAmountUsd
              : route.totalCost;
          return (
            <div
              className="sor-details-panel tradebox-e2e-sentinel"
              aria-hidden="true"
            >
              <button
                type="button"
                tabIndex={-1}
                className="sor-details-toggle tradebox-e2e-sentinel__toggle"
                aria-expanded="true"
              />
              <div
                data-qa="sor-leg"
                data-leg-side={legSide}
                data-leg-venue={leg.venue}
                data-leg-num-shares={leg.shares}
                data-leg-price-cents={priceCents}
              />
              {route.side === "buy" && Number.isFinite(route.totalCost) && (
                <div
                  data-qa="sor-leg-cost"
                  data-cost-usd={route.totalCost}
                />
              )}
              {route.side === "sell" && Number.isFinite(sellReceiveUsd) && (
                <div
                  data-qa="tradebox-estimated-receive-usd"
                  data-receive-usd={sellReceiveUsd}
                />
              )}
            </div>
          );
        })()}
    </div>
  );
}
