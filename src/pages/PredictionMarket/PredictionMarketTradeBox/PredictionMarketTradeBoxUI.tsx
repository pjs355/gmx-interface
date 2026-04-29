import { useMemo, useCallback, useState, useEffect, useRef } from 'react';

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
  RouteLeg,
  SorVenue,
  SorErrorCode,
  SorExecutionPhase,
  SorPrefundLegProgress,
} from "@/trading/sor";
import {
  VENUE_DISPLAY_NAMES,
  VENUE_COLORS,
  SorKalshiKycShortfallBanner,
  getSorLifiTransferFeeRowState,
  derivedBridgeUsdForDisplay,
  formatSorUsd2,
  formatToWinUsdDisplay,
  formatSorDetailsSharesDisplay,
  formatSorFeeUsdDisplay,
  rawInputBelowVenueMinimum,
  parseLimitPriceCents,
} from "@/trading/sor";
import { getYesNoTeamLabels } from "./teamLabels";
import type { TradeBoxShareBalancesSnapshot } from "./hooks/useTradeBoxShareBalances";
import {
	hexToRgba,
	getContrastingTextColor,
	mixHexOnBlack,
} from "@/helpers/predictionUtils";
import { SHARE_SELL_COMPARE_EPS } from "./checkBalances";

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

function aggregateFeesByVenue(legs: RouteLeg[]): { venue: SorVenue; fee: number }[] {
  const map = new Map<SorVenue, number>();
  for (const leg of legs) {
    map.set(leg.venue, (map.get(leg.venue) ?? 0) + leg.fee);
  }
  return [...map.entries()]
    .filter(([, fee]) => fee > 0)
    .map(([venue, fee]) => ({ venue, fee }));
}

/** Weighted average sale price in integer cents from SOR legs (multi-venue aware). */
function sorRouteSellAvgCents(route: RoutePlan): number | null {
  if (route.side !== "sell" || route.totalShares <= 0) return null;
  let weighted = 0;
  for (const leg of route.legs) {
    if (leg.shares > 0 && Number.isFinite(leg.avgPrice) && leg.avgPrice > 0) {
      weighted += leg.shares * leg.avgPrice;
    }
  }
  if (!(weighted > 0)) return null;
  const avg = weighted / route.totalShares;
  if (!Number.isFinite(avg) || avg <= 0) return null;
  return Math.round(avg * 100);
}

/** One “Fees $total” row; itemized breakdown is tooltip-only on the word “Fees” (amount is plain text). */
function SorRouteConsolidatedFeesSummary({ route }: { route: RoutePlan }) {
  const feeByVenue = aggregateFeesByVenue(route.legs);
  const bridgeDerived = derivedBridgeUsdForDisplay(route);
  const lifi = getSorLifiTransferFeeRowState(route);
  /** Match `derivedBridgeUsdForDisplay`: API totalBridgeCost wins; else sum leg bridge estimates (avoids $0 after rounding when legs still have cost). */
  const transferUsd =
    route.side === "sell"
      ? 0
      : route.totalBridgeCost > 0
        ? bridgeDerived.displayUsd
        : bridgeDerived.legSumUsd > 1e-12
          ? bridgeDerived.legSumUsd
          : bridgeDerived.displayUsd;
  const venueSum = feeByVenue.reduce((s, { fee }) => s + fee, 0);
  const tradingUsd =
    typeof route.totalFees === "number" &&
    Number.isFinite(route.totalFees) &&
    route.totalFees > 1e-9
      ? route.totalFees
      : venueSum;
  const rawTotal = tradingUsd + transferUsd;
  if (rawTotal <= 1e-9) return null;

  const tooltipBody = (
    <div className="sor-details-consolidated-fees__tooltip-body">
      {feeByVenue
        .filter(({ fee }) => fee > 0)
        .map(({ venue, fee }) => (
          <div key={venue}>
            {VENUE_DISPLAY_NAMES[venue]} Fee: $ {formatSorFeeUsdDisplay(fee)}
          </div>
        ))}
      {feeByVenue.every(({ fee }) => fee <= 0) && tradingUsd > 0 ? (
        <div>Trading fees: $ {formatSorFeeUsdDisplay(tradingUsd)}</div>
      ) : null}
      {lifi.show ? (
        <div>Funds transfer fee (est.): $ {formatSorFeeUsdDisplay(transferUsd)}</div>
      ) : null}
    </div>
  );

  return (
    <div className="sor-details-row sor-details-row--fee sor-details-consolidated-fees">
      <Tooltip
        content={tooltipBody}
        position="top"
        withPortal={true}
        disableHandleStyle
        handleClassName="sor-details-consolidated-fees__fees-tooltip-handle"
      >
        <span className="sor-details-fee-label sor-details-consolidated-fees__fees-label">Fees</span>
      </Tooltip>
      <span className="sor-details-fee-value sor-details-consolidated-fees__amount">
        $ {formatSorFeeUsdDisplay(rawTotal)}
      </span>
    </div>
  );
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
    route: RoutePlan | null;
    isLoading: boolean;
    error: string | null;
    routeErrorCode: SorErrorCode | null;
    isStale: boolean;
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
  /** Best sell bid for YES among venues where the user holds shares (All Markets sell only). */
  allMarketsSellYesBid?: number | null;
  /** Best sell bid for NO among venues where the user holds shares (All Markets sell only). */
  allMarketsSellNoBid?: number | null;
  /** Share balance snapshot from parent (single `useTradeBoxShareBalances` instance). */
  shareBalances: TradeBoxShareBalancesSnapshot;
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
  matchedMonitor,
  allMarketsSellYesBid = null,
  allMarketsSellNoBid = null,
  shareBalances,
}: PredictionMarketTradeBoxUIProps) {
  const [sorDetailsExpanded, setSorDetailsExpanded] = useState(false);
  const [singleVenueDetailsExpanded, setSingleVenueDetailsExpanded] = useState(false);
  const { selectedPosition, amount, price, orderType, side, orderResult, calculatedContracts, remainingUsd, spent, tradingFee, estimatedCost, grossReceive, sellTradingFee, netReceive, tradingVenue } = state;

  /** Green “Filled” SOR banner (All Markets only). */
  const sorFilledBannerVisible =
    tradingVenue === "all" &&
    sorExecution.execution != null &&
    !sorExecution.isExecuting &&
    sorExecution.execution.status === "complete";

  const [positionSharesChainSyncUi, setPositionSharesChainSyncUi] = useState(false);

  /** Latest snapshot for effects that must not re-run on every balance poll. */
  const shareBalancesRef = useRef(shareBalances);
  shareBalancesRef.current = shareBalances;

  /** Baseline share totals when a fill completes or “Order Submitted!” fires (any venue). */
  const positionSyncBaselineRef = useRef<{
    buySum: number;
    sellTotal: number;
  } | null>(null);
  const fillBannerRouteIdRef = useRef<string | undefined>(undefined);
  /** True after `orderResult.success` rising edge until balances catch up or max wait (toast clears in 4s). */
  const orderSubmitSyncActiveRef = useRef(false);
  const prevOrderResultSuccessRef = useRef(false);
  const positionSyncMaxTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  const clearPositionSyncMaxTimer = useCallback(() => {
    if (positionSyncMaxTimerRef.current != null) {
      window.clearTimeout(positionSyncMaxTimerRef.current);
      positionSyncMaxTimerRef.current = null;
    }
  }, []);

  const armPositionSyncMaxTimer = useCallback(() => {
    clearPositionSyncMaxTimer();
    positionSyncMaxTimerRef.current = window.setTimeout(() => {
      positionSyncMaxTimerRef.current = null;
      setPositionSharesChainSyncUi(false);
      orderSubmitSyncActiveRef.current = false;
    }, 30_000);
  }, [clearPositionSyncMaxTimer]);

  const capturePositionSyncBaseline = useCallback(() => {
    const sb = shareBalancesRef.current;
    const buySum = sb.buyLines.reduce(
      (s, l) => s + (Number.isFinite(l.shares) ? l.shares : 0),
      0,
    );
    positionSyncBaselineRef.current = {
      buySum,
      sellTotal: sb.sellTotalShares,
    };
  }, []);

  /** All Markets: green “Filled / Sold” row — same timing as post-trade polling. */
  useEffect(() => {
    if (!sorFilledBannerVisible) {
      fillBannerRouteIdRef.current = undefined;
      if (!orderSubmitSyncActiveRef.current) {
        positionSyncBaselineRef.current = null;
        setPositionSharesChainSyncUi(false);
        clearPositionSyncMaxTimer();
      }
      return;
    }
    const routeId = sorExecution.execution?.routeId;
    if (fillBannerRouteIdRef.current !== routeId) {
      fillBannerRouteIdRef.current = routeId;
      capturePositionSyncBaseline();
      setPositionSharesChainSyncUi(true);
      armPositionSyncMaxTimer();
    }
  }, [
    sorFilledBannerVisible,
    sorExecution.execution?.routeId,
    capturePositionSyncBaseline,
    armPositionSyncMaxTimer,
    clearPositionSyncMaxTimer,
  ]);

  /** Any venue: “Order Submitted!” — single-venue Predict/Poly/etc. never shows the All Markets green row. */
  useEffect(() => {
    const success = !!orderResult?.success;
    const rising = success && !prevOrderResultSuccessRef.current;
    prevOrderResultSuccessRef.current = success;
    if (!rising) return;

    orderSubmitSyncActiveRef.current = true;
    capturePositionSyncBaseline();
    setPositionSharesChainSyncUi(true);
    armPositionSyncMaxTimer();
  }, [orderResult?.success, capturePositionSyncBaseline, armPositionSyncMaxTimer]);

  useEffect(() => {
    return () => {
      clearPositionSyncMaxTimer();
    };
  }, [clearPositionSyncMaxTimer]);

  useEffect(() => {
    if (!positionSharesChainSyncUi) return;

    const base = positionSyncBaselineRef.current;
    const sellT = shareBalances.sellTotalShares;
    const buySum = shareBalances.buyLines.reduce(
      (s, l) => s + (Number.isFinite(l.shares) ? l.shares : 0),
      0,
    );
    const filled = sorExecution.execution?.totalFilledShares;
    const haveFilled = Number.isFinite(filled) && filled !== undefined && filled > 1e-6;

    const endSync = () => {
      setPositionSharesChainSyncUi(false);
      orderSubmitSyncActiveRef.current = false;
      clearPositionSyncMaxTimer();
    };

    if (side === "sell") {
      if (haveFilled && sellT <= SHARE_SELL_COMPARE_EPS) {
        endSync();
        return;
      }
      if (base != null && sellT < base.sellTotal - 1e-6) {
        endSync();
      }
      return;
    }

    if (side === "buy" && base != null && buySum > base.buySum + 1e-6) {
      endSync();
    }
  }, [
    positionSharesChainSyncUi,
    shareBalances.buyLines,
    shareBalances.sellTotalShares,
    side,
    sorExecution.execution?.totalFilledShares,
    clearPositionSyncMaxTimer,
  ]);
  /**
   * Pulse only while `isStale` is true (inputs changed, tab resume, or grace after a transient error).
   * Background auto-refresh uses `isLoading` without flipping stale, so sitting on "1,000" does not blink every few seconds.
   */
  const sorTotalsRecalculating =
    tradingVenue === "all" && sorRoute.isStale && sorRoute.route != null;
  const sellFieldsLocked = side === "sell" && maxScopedSellShares <= 0;
  const venueConfig = getVenueConfig(tradingVenue);
  const { bestBid, bestAsk } = calculateOrderbookPrices(orderbook || null);
  /** Single-venue SOR snapshot for LI.FI / bridge lines — same freshness as the numeric overlay. */
  const singleVenueSorRouteForFees = useMemo(() => {
    if (tradingVenue === "all") return null;
    const sr = sorRoute.route;
    if (!sr || sorRoute.isStale) return null;
    const amt = parseFloat(amount) || 0;
    if (!Number.isFinite(amt) || amt <= 0) return null;
    if (Math.abs(sr.requestedAmount - amt) >= 0.0001) return null;
    return sr;
  }, [tradingVenue, sorRoute.route, sorRoute.isStale, amount]);

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

  const toCentsString = (value?: number | null): string => {
    if (value === undefined || value === null || !isFinite(value)) return "--";
    return Math.round(value * 100).toString();
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
  
  // Position buttons: All Markets sell = best bid only on outcomes you hold; else same as before.
  const yesPriceCents = useMemo(() => {
    if (tradingVenue === "all" && side === "sell") {
      if (allMarketsSellYesBid != null && Number.isFinite(allMarketsSellYesBid)) {
        return `${toCentsString(allMarketsSellYesBid)}¢`;
      }
      return "";
    }
    return yesPrice !== null ? `${toCentsString(yesPrice)}¢` : "--";
  }, [tradingVenue, side, allMarketsSellYesBid, yesPrice]);

  const noPriceCents = useMemo(() => {
    if (tradingVenue === "all" && side === "sell") {
      if (allMarketsSellNoBid != null && Number.isFinite(allMarketsSellNoBid)) {
        return `${toCentsString(allMarketsSellNoBid)}¢`;
      }
      return "";
    }
    return noPrice !== null ? `${toCentsString(noPrice)}¢` : "--";
  }, [tradingVenue, side, allMarketsSellNoBid, noPrice]);

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
      sorRoute.route &&
      sorRoute.route.legs.length > 0 &&
      !sorRoute.isStale &&
      Math.abs(sorRoute.route.requestedAmount - usdAmount) < 0.0001;

    if (sorRouteFreshForAmount) {
      const leg = sorRoute.route!.legs[0];
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
    sorRoute.route,
    sorRoute.isStale,
  ]);

  // Compute Avg Price (¢) for market SELL orders using weighted average sale price.
  // Prefers SOR route data when available.
  const sellAvgCents = useMemo(() => {
    if (orderType !== 'market' || side !== 'sell') return null;
    if (!amount || !selectedPosition) return null;
    const shares = Number(amount);
    if (!Number.isFinite(shares) || shares <= 0) return null;

    const sorRouteFreshForAmount =
      sorRoute.route &&
      sorRoute.route.legs.length > 0 &&
      !sorRoute.isStale &&
      Math.abs(sorRoute.route.requestedAmount - shares) < 0.0001;

    if (sorRouteFreshForAmount) {
      const leg = sorRoute.route!.legs[0];
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
  }, [orderType, side, amount, selectedPosition, calculateContractsForMarketOrder, sorRoute.route, sorRoute.isStale]);

  return (
    <div className="prediction-market-tradebox">
      {/* Title + venue dropdown (same control pattern as Market / Limit) */}
      <div className="market-name-header">
        <h3 className="market-name-header__title">{displayMarketTitle}</h3>
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
        {tradingVenue !== "all" && (
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

      {/* SOR route breakdown when venue is "all" */}
      {tradingVenue === "all" && (
        <div className="bet-size-section">
          {sorRoute.error && !sorRoute.route && !sorRoute.isLoading && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <span style={{ color: "#ef4444", fontSize: 12 }}>
                  {sorRoute.routeErrorCode === "EXECUTION_NOT_READY"
                    ? "Trading setup required: "
                    : "Route unavailable: "}
                  {sorRoute.error}
                </span>
              </div>
            </div>
          )}
          {sorRoute.route && (() => {
            const route = sorRoute.route;
            const isSell = route.side === "sell";
            const sorSellAvgCents = isSell ? sorRouteSellAvgCents(route) : null;
            const sorSellNetReceiveUsd =
              isSell &&
              Number.isFinite(route.totalCost) &&
              Number.isFinite(route.totalFees)
                ? Math.max(0, route.totalCost - route.totalFees)
                : null;
            return (
            <div
              className={
                sorTotalsRecalculating
                  ? "sor-route-totals sor-route-totals--recalculating"
                  : "sor-route-totals"
              }
            >
              {!isSell && route.totalShares > 0 && (
                <div className="bet-size-info">
                  <div className="bet-size-main-row">
                    <span className="bet-size-label to-win-label">To Win</span>
                    <span className="bet-size-value">
                      $ {formatToWinUsdDisplay(route.totalShares)}
                    </span>
                  </div>
                  <div className="bet-size-odds-subtext">
                    Avg. odds {(route.totalCost / route.totalShares * 100).toFixed(0)}%
                  </div>
                </div>
              )}
              {isSell && route.totalShares > 0 && sorSellAvgCents !== null && (
                <div className="bet-size-info">
                  <div className="bet-size-main-row">
                    <span className="bet-size-label">Avg Price</span>
                    <span className="bet-size-value avg-price-value">{sorSellAvgCents}¢</span>
                  </div>
                </div>
              )}
              {isSell && route.totalShares > 0 && sorSellNetReceiveUsd !== null && (
                <div className="bet-size-info">
                  <div className="bet-size-main-row">
                    <Tooltip
                      content={venueConfig.feeTooltip}
                      position="top"
                      withPortal={true}
                    >
                      <span className="bet-size-label">
                        {`Estimated Receive${venueConfig.collateral !== "USDC" ? ` (${venueConfig.collateral})` : ""}`}
                      </span>
                    </Tooltip>
                    <span className="bet-size-value estimated-receive-value">
                      $ {(Math.floor(sorSellNetReceiveUsd * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}
              <div className="bet-size-info sor-details-wrap">
                <button
                  type="button"
                  className="sor-details-toggle"
                  aria-expanded={sorDetailsExpanded}
                  onClick={() => setSorDetailsExpanded((open) => !open)}
                >
                  <span className="sor-details-toggle-inline">
                    <span className="sor-details-toggle-label">Details</span>
                    <span
                      className={`sor-details-chevron${sorDetailsExpanded ? " sor-details-chevron--open" : ""}`}
                      aria-hidden
                    />
                  </span>
                </button>
                {sorDetailsExpanded && (
                  <div className="sor-details-panel">
                    {route.legs.map((leg, idx) => {
                      const shareStr = formatSorDetailsSharesDisplay(leg.shares);
                      const cents = (leg.avgPrice * 100).toFixed(0);
                      return (
                        <div
                          key={`${leg.venue}-${idx}`}
                          className="sor-details-row sor-details-row--leg"
                          data-qa="sor-leg"
                          data-leg-venue={leg.venue}
                          data-leg-side={isSell ? "sell" : "buy"}
                          data-leg-num-shares={leg.shares}
                          data-leg-price-cents={cents}
                        >
                          <span className="sor-details-leg-text">
                            {VENUE_DISPLAY_NAMES[leg.venue]}
                            {isSell ? ` Sell ${shareStr}` : ` ${shareStr}`} Shares @ {cents}¢
                          </span>
                        </div>
                      );
                    })}
                    <SorRouteConsolidatedFeesSummary route={route} />
                    {!isSell && Number.isFinite(route.totalCost) && (
                      <div className="sor-details-row sor-details-row--fee">
                        <span className="sor-details-fee-label">Cost:</span>
                        <span
                          className="sor-details-fee-value"
                          data-qa="sor-leg-cost"
                          data-cost-usd={route.totalCost}
                        >
                          $ {formatSorUsd2(Math.floor(route.totalCost * 100) / 100)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {route.insufficientLiquidity && (
                <div className="bet-size-info">
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 500, padding: "4px 0" }}>
                    {isSell ? "Not enough bids to reach your proceeds target" : "Not enough shares to fill your order"}
                  </div>
                </div>
              )}
            </div>
            );
          })()}
        </div>
      )}

      {/* Bet Size / To Win for single-venue orders */}
      {tradingVenue !== "all" &&
        !belowTradeFloor &&
        (toWinNumeric !== null || limitOrderAmount !== null || oddsData !== null || sellAvgCents !== null || netReceive !== null) && (
        <div className="bet-size-section">
          {/* Avg Price line for market SELL orders */}
          {sellAvgCents !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <span className="bet-size-label">Avg Price</span>
                <span className="bet-size-value avg-price-value">{sellAvgCents}¢</span>
              </div>
            </div>
          )}
          {/* Estimated Receive for market SELL orders */}
          {orderType === 'market' && side === 'sell' && netReceive !== null && sellTradingFee !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={venueConfig.feeTooltip}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">
                    {`Estimated Receive${venueConfig.collateral !== "USDC" ? ` (${venueConfig.collateral})` : ""}`}
                  </span>
                </Tooltip>
                <span
                  className="bet-size-value estimated-receive-value"
                  data-qa="tradebox-estimated-receive-usd"
                  data-receive-usd={netReceive}
                >
                  $ {(Math.floor(netReceive * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
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
                <span className="bet-size-value amount-value">
                  $ {(Math.floor((limitOrderAmount - limitOrderFee) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}

          {/* Show To Win line for BUY orders only (SELL orders show Estimated Receive above) */}
          {toWinNumeric !== null && side === 'buy' && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <span className={`bet-size-label to-win-label`}>To Win</span>
                <span className="bet-size-value">$ {formatToWinUsdDisplay(toWinNumeric)}</span>
              </div>
              {orderType === 'market' && oddsData && (
                <div className="bet-size-odds-subtext">Avg. odds {oddsData.pct}%</div>
              )}
            </div>
          )}

          {/* Details: venue fill + fees (all single-venue markets) */}
          <div className="bet-size-info sor-details-wrap">
            <button
              type="button"
              className="sor-details-toggle"
              aria-expanded={singleVenueDetailsExpanded}
              onClick={() => setSingleVenueDetailsExpanded((o) => !o)}
            >
              <span className="sor-details-toggle-inline">
                <span className="sor-details-toggle-label">Details</span>
                <span
                  className={`sor-details-chevron${singleVenueDetailsExpanded ? " sor-details-chevron--open" : ""}`}
                  aria-hidden
                />
              </span>
            </button>
            {singleVenueDetailsExpanded && (
              <div className="sor-details-panel">
                {orderType === "limit" && limitOrderAmount !== null && amount && price && (
                  <div
                    className="sor-details-row sor-details-row--leg"
                    data-qa="sor-leg"
                    data-leg-venue={state.tradingVenue}
                    data-leg-side="limit"
                    data-leg-num-shares={Number(amount)}
                    data-leg-price-cents={Number(price)}
                  >
                    <span className="sor-details-leg-text">
                      Limit — {formatSorDetailsSharesDisplay(Number(amount))} shares @ {price}¢
                    </span>
                  </div>
                )}
                {orderType === "market" && side === "buy" && oddsData !== null && calculatedContracts !== null && (
                  <div
                    className="sor-details-row sor-details-row--leg"
                    data-qa="sor-leg"
                    data-leg-venue={state.tradingVenue}
                    data-leg-side="market-buy"
                    data-leg-num-shares={calculatedContracts}
                    data-leg-price-cents={oddsData.pct}
                  >
                    <span className="sor-details-leg-text">
                      {venueConfig.displayName} {formatSorDetailsSharesDisplay(calculatedContracts)} Shares @ {oddsData.pct}¢
                    </span>
                  </div>
                )}
                {orderType === "market" && side === "sell" && sellAvgCents !== null && amount && Number(amount) > 0 && (
                  <div
                    className="sor-details-row sor-details-row--leg"
                    data-qa="sor-leg"
                    data-leg-venue={state.tradingVenue}
                    data-leg-side="market-sell"
                    data-leg-num-shares={Number(amount)}
                    data-leg-price-cents={sellAvgCents}
                  >
                    <span className="sor-details-leg-text">
                      {venueConfig.displayName} Sell {formatSorDetailsSharesDisplay(Number(amount))} Shares @ {sellAvgCents}¢
                    </span>
                  </div>
                )}
                {singleVenueSorRouteForFees ? (
                  <SorRouteConsolidatedFeesSummary route={singleVenueSorRouteForFees} />
                ) : null}
                {orderType === "limit" &&
                  limitOrderFee > 0 &&
                  !singleVenueSorRouteForFees && (
                  <div className="sor-details-row sor-details-row--fee">
                    <Tooltip content={venueConfig.feeTooltip} position="top" withPortal={true}>
                      <span className="sor-details-fee-label">Fees</span>
                    </Tooltip>
                    <span className="sor-details-fee-value">
                      $ {formatSorFeeUsdDisplay(limitOrderFee)}
                    </span>
                  </div>
                )}
                {orderType === "market" &&
                  side === "buy" &&
                  !singleVenueSorRouteForFees &&
                  tradingFee !== null &&
                  tradingFee > 0 && (
                  <div className="sor-details-row sor-details-row--fee">
                    <Tooltip content={venueConfig.feeTooltip} position="top" withPortal={true}>
                      <span className="sor-details-fee-label">Fees</span>
                    </Tooltip>
                    <span className="sor-details-fee-value">
                      $ {formatSorFeeUsdDisplay(tradingFee)}
                    </span>
                  </div>
                )}
                {orderType === "market" &&
                  side === "sell" &&
                  !singleVenueSorRouteForFees &&
                  sellTradingFee !== null &&
                  sellTradingFee > 0 && (
                  <div className="sor-details-row sor-details-row--fee">
                    <Tooltip content={venueConfig.feeTooltip} position="top" withPortal={true}>
                      <span className="sor-details-fee-label">Fees</span>
                    </Tooltip>
                    <span className="sor-details-fee-value">
                      $ {formatSorFeeUsdDisplay(sellTradingFee)}
                    </span>
                  </div>
                )}
                {side === "buy" &&
                  orderType === "market" &&
                  estimatedCost !== null &&
                  Number.isFinite(estimatedCost) && (
                  <div className="sor-details-row sor-details-row--fee">
                    <span className="sor-details-fee-label">Cost:</span>
                    <span
                      className="sor-details-fee-value"
                      data-qa="sor-leg-cost"
                      data-cost-usd={estimatedCost}
                    >
                      $ {formatSorUsd2(Math.floor(estimatedCost * 100) / 100)}
                    </span>
                  </div>
                )}
                {side === "buy" &&
                  orderType === "limit" &&
                  limitOrderAmount !== null &&
                  amount &&
                  price && (
                  <div className="sor-details-row sor-details-row--fee">
                    <span className="sor-details-fee-label">Cost:</span>
                    <span
                      className="sor-details-fee-value"
                      data-qa="sor-leg-cost"
                      data-cost-usd={limitOrderAmount + limitOrderFee}
                    >
                      $ {formatSorUsd2(Math.floor((limitOrderAmount + limitOrderFee) * 100) / 100)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
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
      {typeof buttonState.depositShortfallUsd === "number" &&
        buttonState.depositShortfallUsd > 0 && (
          <div
            className="trade-deposit-shortfall-hint"
            style={{
              marginTop: 10,
              padding: "0 4px",
              fontSize: 12,
              color: "#f59e0b",
              fontWeight: 500,
              textAlign: "center",
              lineHeight: 1.35,
            }}
          >
            Deposit needed $ {formatSorUsd2(buttonState.depositShortfallUsd)}
          </div>
        )}
      {tradingVenue === "all" &&
        side === "buy" &&
        sorRoute.route?.sizeSuggestion &&
        (() => {
          const s = sorRoute.route!.sizeSuggestion!;
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
              {Math.round(s.unlockedEffectivePrice * 100)}¢ / share)
            </div>
          );
        })()}
      {tradingVenue === "all" && sorRoute.route && (
        <SorKalshiKycShortfallBanner route={sorRoute.route} variant="tradebox" />
      )}
      </>
      )}

      {/* SOR execution result */}
      {tradingVenue === "all" && sorExecution.execution && !sorExecution.isExecuting && (
        <div
          style={{
            marginTop: 8,
            padding: "8px 12px",
            borderRadius: 6,
            fontSize: 12,
            backgroundColor:
              sorExecution.execution.status === "complete"
                ? "rgba(34, 197, 94, 0.08)"
                : sorExecution.execution.status === "partial"
                  ? "rgba(245, 158, 11, 0.08)"
                  : "rgba(239, 68, 68, 0.08)",
            color:
              sorExecution.execution.status === "complete"
                ? "#22c55e"
                : sorExecution.execution.status === "partial"
                  ? "#f59e0b"
                  : "#ef4444",
          }}
        >
          {sorExecution.execution.status === "complete" && (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{side === "sell" ? "Sold" : "Filled"}: {formatSorDetailsSharesDisplay(sorExecution.execution.totalFilledShares)} shares{side === "sell" && sorExecution.execution.totalSpent > 0 ? ` — received $${formatToWinUsdDisplay(sorExecution.execution.totalSpent)}` : ""}</span>
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

      {/* Small Popup Notification */}
      {orderResult && (
        <div
          data-qa="tradebox-fill-confirmation"
          data-qa-fill-status={orderResult.success ? "success" : "error"}
          className={`trade-notification ${orderResult.success ? 'success' : 'error'}`}
        >
          <div className="notification-content">
            {orderResult.success ? (
              <div className="notification-text"> Order Submitted!</div>
            ) : (
              <div className="notification-text">
                {orderResult.error
                  ? `Order failed: ${orderResult.error}`
                  : "Order Failed"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
