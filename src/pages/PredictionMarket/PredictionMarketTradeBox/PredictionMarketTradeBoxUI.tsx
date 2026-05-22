import { useMemo, useCallback, useEffect } from 'react';

import Button from "components/Button/Button";
import SpinningLoader from "@/components/Common/SpinningLoader";
import type { TradeBoxProps, TradeBoxCoreState, TradeBoxState, ApprovalState, TradingVenue, MarketOrderCalculation } from './types';
import type { TradeQuote } from "./tradeQuote/types";
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
  SorSide,
  SorTradeTrustContext,
} from "@/trading/sor";
import {
  VENUE_COLORS,
  SorKalshiKycShortfallBanner,
  formatSorDetailsSharesDisplay,
  rawInputBelowVenueMinimum,
  positionToSorOutcome,
  routeMatchesTradeContext,
  executionRouteTrustedForSingleVenueMarketBuy,
  executionRouteTrustedForSingleVenueMarketSell,
  sorBuyPredictLegNetHeldShares,
} from "@/trading/sor";
import { getYesNoTeamLabels } from "./teamLabels";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import type { TradeBoxShareBalancesSnapshot } from "./hooks/useTradeBoxShareBalances";
import {
  SHARE_SELL_COMPARE_EPS,
  formatShareCountDisplay,
  clampSellSharesNumeric,
  clampedSellSharesAmountString,
  sellBreakdownIsOnlyWholeContractVenues,
} from "./checkBalances";
import {
	hexToRgba,
	getContrastingTextColor,
	mixHexOnBlack,
} from "@/helpers/predictionUtils";
import { useOddsDisplay } from "@/context/OddsDisplayContext";
import { usePostTradeAccountSyncPending } from "@/trading/sor/usePostTradeAccountSync";
import { useTradeBoxMarketAvgCents } from "./hooks/useTradeBoxMarketAvgCents";
import SmartRoutingSection from "./SmartRoutingSection";
import TradeBoxExecutionFooter from "./components/TradeBoxExecutionFooter";
import OddsFormatMenu from "@/components/OddsFormatMenu/OddsFormatMenu";
import { usePortfolio } from "@/context/PortfolioContext";
import {
	dflowKalshiOutcomeDisplayPrices,
	hasDflowKalshiMonitorLink,
} from "@/trading/dflow/monitorDflowBooks";


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
  state: TradeBoxCoreState;
  /** Pricing preview (book / SOR / Pond) — `state` already includes `preview` fields. */
  tradeQuote: TradeQuote;
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
    displayRouteSourceQuestionId: string | null;
    executionRouteSourceQuestionId: string | null;
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
  routePreviewAllowed: boolean;
  smartRoutingMarketKey: string;
  /** Predict.fun market fee (bps) for net-held share display; omit when unknown. */
  predictFunFeeRateBps?: number;
  /**
   * Kalshi/DFlow market buy: when the debounced `/order/quote` matches typed USD,
   * E2E `data-leg-num-shares` uses these contracts instead of the SOR leg (Pond ground truth).
   */
  dflowOrderQuoteForSentinel?: {
    contracts: number | null;
    amountAlignedWithQuote: boolean;
  };
}

export default function PredictionMarketTradeBoxUI({
  market,
  orderbook,
  pandascoreMatchId,
  umbrellaId,
  umbrellaDisplayName,
  state,
  tradeQuote,
  onPositionChange,
  onAmountChange,
  onPriceChange,
  onTradingVenueChange,
  onOrderTypeChange,
  onSideChange,
  polymarketVenueHint,
  predictVenueHint,
  predictVenueBookHints,
  levelUpVenueBookHints = null,
  dflowVenueHint,
  matchedVenues,
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
  routePreviewAllowed,
  smartRoutingMarketKey,
  predictFunFeeRateBps,
  dflowOrderQuoteForSentinel,
}: PredictionMarketTradeBoxUIProps) {
  const { formatPrice } = useOddsDisplay();
  const { selectedPosition, amount, price, orderType, side, orderResult, tradingVenue } = state;
  const {
    calculatedContracts,
    remainingUsd,
    spent,
    tradingFee,
    estimatedCost,
    grossReceive,
    sellTradingFee,
    netReceive,
  } = tradeQuote.preview;
  /** Ensure outcome buttons never appear both unselected — core state should always be yes/no; this covers stale typings / edge transitions. */
  const outcomeSelection = selectedPosition ?? "yes";

  useEffect(() => {
    if (selectedPosition != null) return;
    onPositionChange("yes");
  }, [selectedPosition, onPositionChange]);
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
  const positionSharesChainSyncUi = usePostTradeAccountSyncPending(syncUiKey);
  // While the active venue's share-balance query is still resolving (e.g.
  // Predict's BSC `balanceOf`), `maxScopedSellShares` reads as 0 even when
  // the user holds shares. Don't lock the input for that ~1-2s window —
  // the button will say "Loading your Predict shares…" and re-enable as
  // soon as the balance lands. Locks only fire on a confirmed zero.
  const sellFieldsLocked =
    side === "sell" && maxScopedSellShares <= 0 && !sharesLoadingForActiveTab;
  const tradeInteractionLocked =
    sorExecution.isExecuting || state.isLoading;
  const venueConfig = getVenueConfig(tradingVenue);
  /**
   * Integer share amounts: LevelUp / DFlow **single-venue** tabs, or All Markets
   * when the **held** breakdown is only those venues (not "Poly + DFlow exists on
   * the fixture" while the wallet is 6.03 Poly only).
   */
  const matchedVenuesNeedWholeShareContracts =
    tradingVenue === "all" &&
    matchedVenues != null &&
    (matchedVenues.has("levelup") || matchedVenues.has("dflow")) &&
    sellBreakdownIsOnlyWholeContractVenues(shareBalances.sellVenueBreakdown);
  const shareAmountRequiresWholeContracts =
    (venueConfig.requiresWholeShares || matchedVenuesNeedWholeShareContracts) &&
    side === "sell";

  const userSellSharesByVenue = useMemo((): Partial<Record<SorVenue, number>> => {
    const o: Partial<Record<SorVenue, number>> = {};
    for (const row of shareBalances.sellVenueBreakdown) {
      o[row.key as SorVenue] = row.shares;
    }
    return o;
  }, [shareBalances.sellVenueBreakdown]);

  const { bestBid, bestAsk } = calculateOrderbookPrices(orderbook || null);

  const { yesTeamLabel, noTeamLabel } = useMemo(
    () => getYesNoTeamLabels(market, umbrellaDisplayName),
    [market, umbrellaDisplayName],
  );

  /** Kalshi/DFlow: two outcome-native YES books — do not derive both buttons via 1−p on one book. */
  const dflowOutcomeDisplayPrices = useMemo(() => {
    if (
      tradingVenue !== "dflow" ||
      !matchedMonitor ||
      !hasDflowKalshiMonitorLink(matchedMonitor)
    ) {
      return null;
    }
    return dflowKalshiOutcomeDisplayPrices(
      matchedMonitor,
      yesTeamLabel,
      noTeamLabel,
      side,
    );
  }, [tradingVenue, matchedMonitor, yesTeamLabel, noTeamLabel, side]);

  const venueDropdownOptions = useMemo(() => {
    const all: { value: string; label: string }[] = [
      { value: "levelup", label: "LevelUp" },
      { value: "polymarket", label: "Polymarket" },
      { value: "predictfun", label: "Predict" },
      { value: "limitless", label: "Limitless" },
      { value: "dflow", label: "Kalshi" },
    ];
    const venues = matchedVenues
      ? all.filter((v) => matchedVenues.has(v.value))
      : all;
    if (pandascoreMatchId && venues.length > 1) {
      venues.unshift({ value: "all", label: "All Markets" });
    }
    return [{ label: "Venue", options: venues }];
  }, [pandascoreMatchId, matchedVenues]);

  useEffect(() => {
    if (tradeInteractionLocked) return;
    const opts = venueDropdownOptions[0]?.options;
    if (!opts?.length) return;
    const allowed = opts.map((o) => o.value);
    if (!allowed.includes(state.tradingVenue)) {
      onTradingVenueChange(allowed[0] as TradingVenue);
    }
  }, [
    tradeInteractionLocked,
    venueDropdownOptions,
    state.tradingVenue,
    onTradingVenueChange,
  ]);

  const predictHints = predictVenueBookHints;
  const yesHintPrices = predictHints?.yes
    ? calculateOrderbookPrices(predictHints.yes)
    : null;
  const noHintPrices = predictHints?.no
    ? calculateOrderbookPrices(predictHints.no)
    : null;

  const luYesHintPrices = levelUpVenueBookHints?.yes
    ? calculateOrderbookPrices(levelUpVenueBookHints.yes)
    : null;
  const luNoHintPrices = levelUpVenueBookHints?.no
    ? calculateOrderbookPrices(levelUpVenueBookHints.no)
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

  // Polymarket/Limitless: selected outcome's native book; when NO is selected that
  // book is the NO token, so swap formulas (NO direct, YES via 1−p). Kalshi/DFlow
  // uses two YES books (A/B) — both buttons use `dflowOutcomeDisplayPrices`. LevelUp:
  // single YES book. Predict: per-outcome hints.
  const bookRepresentsNo =
    (tradingVenue === "polymarket" || tradingVenue === "limitless") &&
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
        : tradingVenue === "levelup" && luYesHintPrices
          ? side === "buy"
            ? luYesHintPrices.bestAsk
            : luYesHintPrices.bestBid
        : tradingVenue === "dflow" && dflowOutcomeDisplayPrices
          ? dflowOutcomeDisplayPrices.yes
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
        : tradingVenue === "levelup" && luNoHintPrices
          ? side === "buy"
            ? luNoHintPrices.bestAsk
            : luNoHintPrices.bestBid
        : tradingVenue === "dflow" && dflowOutcomeDisplayPrices
          ? dflowOutcomeDisplayPrices.no
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

  // Transform the display title for Over/Under markets
  const displayMarketTitle = useMemo(() => {
    if (overUnderMatch) {
      return `${overUnderMatch} Players`;
    }
    return market.displayName || market.question;
  }, [overUnderMatch, market.displayName, market.question]);

  /** Market buy = USD prefix; sells = share count (no $). */
  const amountInputShowsDollarPrefix = useMemo(() => side === "buy", [side]);

  const belowTradeFloor = useMemo(() => {
    if (tradingVenue === "all") return false;
    return rawInputBelowVenueMinimum({
      tradingVenue,
      side,
      orderType: "market",
      amountStr: amount ?? "",
    });
  }, [tradingVenue, side, amount]);

  const { sorTrustCtxMarket, oddsData, sellAvgCents } = useTradeBoxMarketAvgCents({
    tradingVenue,
    orderType,
    side,
    amount,
    selectedPosition,
    bestAsk,
    bestBid,
    predictHints,
    yesHintPrices,
    noHintPrices,
    sorRoute,
    calculateContractsForMarketOrder,
    getEffectivePrice,
  });

  return (
    <div className="prediction-market-tradebox">
      {/* Title — venue selection is only via SmartRoutingSection rows (no header dropdown). */}
      <div className="market-name-header">
        <h3 className="market-name-header__title">{displayMarketTitle}</h3>
      </div>

      <div className="tradebox-header">
        <div className="side-selector">
          <Button
            qa="tradebox-side-buy"
            variant={side === 'buy' ? 'primary' : 'secondary'}
            disabled={tradeInteractionLocked}
            onClick={() => onSideChange('buy')}
            className={`side-btn ${side === 'buy' ? 'selected primary' : ''}`}
          >
            Buy
          </Button>

          <Button
            qa="tradebox-side-sell"
            variant={side === 'sell' ? 'primary' : 'secondary'}
            disabled={tradeInteractionLocked}
            onClick={() => onSideChange('sell')}
            className={`side-btn ${side === 'sell' ? 'selected secondary' : ''}`}
          >
            Sell
          </Button>
        </div>
        <OddsFormatMenu iconSize={20} />
      </div>
      
      <div className="tradebox-separator" />

      {/* Position Selection */}
      <div
        className={`position-selector${tradeInteractionLocked ? " trade-control--locked" : ""}`}
        style={{ marginBottom: 24 }}
        title={
          tradeInteractionLocked ? "Trade in progress — outcome locked" : undefined
        }
      >
        <Button
          qa="tradebox-position-yes"
          variant="secondary"
          disabled={tradeInteractionLocked}
          onClick={() => onPositionChange('yes')}
          className={`position-btn ${outcomeSelection === 'yes' ? 'selected primary' : ''}`}
          style={isVsSingle ? {
            background: outcomeSelection === 'yes' ? yesTeamColor : hexToRgba(yesTeamColor, 0.35),
            color: outcomeSelection === 'yes' ? yesTeamTextSolid : yesTeamTextTint,
            border: `2px solid ${outcomeSelection === 'yes' ? getBorderColorForSelected(yesTeamColor) : hexToRgba(yesTeamColor, 0.35)}`,
          } : undefined}
          onMouseEnter={(e) => {
            if (isVsSingle && outcomeSelection !== 'yes') {
              e.currentTarget.style.border = `2px solid ${yesTeamColor}`;
            }
          }}
          onMouseLeave={(e) => {
            if (isVsSingle && outcomeSelection !== 'yes') {
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
          disabled={tradeInteractionLocked}
          onClick={() => onPositionChange('no')}
          className={`position-btn ${outcomeSelection === 'no' ? 'selected secondary' : ''}`}
          style={isVsSingle ? {
            background: outcomeSelection === 'no' ? noTeamColor : hexToRgba(noTeamColor, 0.35),
            color: outcomeSelection === 'no' ? noTeamTextSolid : noTeamTextTint,
            border: `2px solid ${outcomeSelection === 'no' ? getBorderColorForSelected(noTeamColor) : hexToRgba(noTeamColor, 0.35)}`,
          } : undefined}
          onMouseEnter={(e) => {
            if (isVsSingle && outcomeSelection !== 'no') {
              e.currentTarget.style.border = `2px solid ${noTeamColor}`;
            }
          }}
          onMouseLeave={(e) => {
            if (isVsSingle && outcomeSelection !== 'no') {
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

      <>
      {/* Amount Input */}
      <div className="input-section">
        <div className="input-label">
          {side === "sell" ? "Shares" : "Amount"}
        </div>
        <div className={`input-container prediction-input-container ${(!amount || amount === '') ? 'empty-input' : ''}`}>
          {/* Show $ symbol when there's a value, use placeholder when empty */}
          <input
            data-qa="tradebox-amount-input"
            type="text"
            disabled={sellFieldsLocked || tradeInteractionLocked}
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
              
              // Whole-share venues (LevelUp, Kalshi) and All Markets when those venues match
              const forceWholeShares = shareAmountRequiresWholeContracts;
              if (forceWholeShares) {
                if (cleanValue.includes('.')) {
                  return;
                }
                if (!/^\d*$/.test(cleanValue)) {
                  return;
                }
              } else {
                // USD (market buy only in UI): 2 dp. Sell shares: 2 dp (truncate-only UX
                // matches position headline; never show 6–8 dp from chain). Other share
                // modes (e.g. limit buy sizing): up to 8 dp.
                const decimalCount = (cleanValue.match(/\./g) || []).length;
                if (decimalCount > 1) {
                  return;
                }
                const maxFractionDigits =
                  amountInputShowsDollarPrefix
                    ? 2
                    : side === "sell"
                      ? 2
                      : 8;
                const frac = cleanValue.includes(".") ? cleanValue.split(".")[1] : "";
                if (frac && frac.length > maxFractionDigits) {
                  return;
                }
              }

              let next = cleanValue;
              if (
                side === "sell" &&
                !amountInputShowsDollarPrefix &&
                maxScopedSellShares > 0 &&
                cleanValue !== ""
              ) {
                const n = parseFloat(cleanValue);
                if (Number.isFinite(n) && n > 0) {
                  const clamped = clampSellSharesNumeric(
                    n,
                    maxScopedSellShares,
                    shareAmountRequiresWholeContracts,
                  );
                  // Cap at scoped holdings (same helper as submit/SOR). Update state to the
                  // canonical clamped string — avoids silent rejects that left the field stuck.
                  if (Math.abs(clamped - n) > SHARE_SELL_COMPARE_EPS) {
                    next = clampedSellSharesAmountString(
                      clamped,
                      shareAmountRequiresWholeContracts,
                    );
                  }
                }
              }

              onAmountChange(next);
            }}
            onKeyDown={(e) => {
              const char = e.key;
              const isNumber = /[0-9]/.test(char);
              const isDecimal = char === '.';
              const isControlKey = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(char);
              
              // Block decimals when share amount must be a whole number
              const blockDecimal = shareAmountRequiresWholeContracts;
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

      <SmartRoutingSection
        displayRoute={sorRoute.displayRoute}
        executionRoute={sorRoute.executionRoute}
        venuePreviews={sorRoute.venuePreviews ?? null}
        tradingVenue={tradingVenue}
        isLoading={sorRoute.displayLoading}
        onSelectVenue={onTradingVenueChange}
        userAmount={amount}
        side={side}
        routePreviewAllowed={routePreviewAllowed}
        smartRoutingMarketKey={smartRoutingMarketKey}
        sorDisplayRouteSourceQuestionId={sorRoute.displayRouteSourceQuestionId}
        sorExecutionRouteSourceQuestionId={sorRoute.executionRouteSourceQuestionId}
        selectedOutcome={positionToSorOutcome(outcomeSelection)}
        predictFunFeeRateBps={predictFunFeeRateBps}
        executionLoading={sorRoute.executionLoading}
        userSellSharesByVenue={userSellSharesByVenue}
        venueSelectionLocked={tradeInteractionLocked}
      />

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
						const isWholeShareContractHint =
							sorRoute.displayErrorCode === "WHOLE_SHARES_ONLY" ||
							rawErr.includes("Fractional share amounts");
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
                    isWholeShareContractHint
                      ? {
							fontSize: 12,
							fontWeight: 500,
							color: "#f59e0b",
							lineHeight: 1.35,
						}
                      : { color: "#ef4444", fontSize: 12 }
                  }
                >
                  {sorRoute.displayErrorCode === "EXECUTION_NOT_READY"
                    ? "Trading setup required: "
                    : isWholeShareContractHint || isNoLiquidityHint
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

      </>
      <TradeBoxExecutionFooter
        tradingVenue={tradingVenue}
        sorRoute={sorRoute}
        side={side}
        buttonState={buttonState}
        maxScopedSellShares={maxScopedSellShares}
        amount={amount}
        outcomeSelection={outcomeSelection}
        yesTeamLabel={yesTeamLabel}
        noTeamLabel={noTeamLabel}
        market={market}
        state={state}
        orderType={orderType}
        selectedPosition={selectedPosition}
        price={price}
        oddsData={oddsData}
        sellAvgCents={sellAvgCents}
        calculatedContracts={calculatedContracts}
        tradeQuote={tradeQuote}
        sorExecution={sorExecution}
        dflowUninitAtSubmit={dflowUninitAtSubmit}
        orderResult={orderResult}
        predictFunFeeRateBps={predictFunFeeRateBps}
        dflowOrderQuoteForSentinel={dflowOrderQuoteForSentinel}
      />
    </div>
  );
}

