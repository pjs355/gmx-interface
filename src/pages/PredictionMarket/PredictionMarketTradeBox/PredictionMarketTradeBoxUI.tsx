import { useMemo, useCallback } from 'react';
import { Link } from "react-router-dom";
import Button from "components/Button/Button";
import Tabs from "components/Tabs/Tabs";
import Tooltip from "components/Tooltip/Tooltip";
import type { TradeBoxProps, TradeBoxState, ApprovalState, TradingVenue, MarketOrderCalculation } from './types';
import type { OrderbookSnapshot } from '@/services/api/orderbookService';
import './PredictionMarketTradeBox.scss';
import { MyPositionsRow } from './MyPositionsRow';
import { mixpanelTrack } from "@/utils/mixpanel";
import { getVenueConfig } from '@/config/venueConfig';
import type { RoutePlan, RouteExecution } from "@/trading/sor";
import { VENUE_DISPLAY_NAMES, VENUE_COLORS } from "@/trading/sor";

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
    isSweepingBook?: boolean;
    availableShares?: number;
  };
  approvalState: ApprovalState;
  sorRoute: { route: RoutePlan | null; isLoading: boolean; error: string | null; isStale: boolean };
  sorExecution: {
    execution: RouteExecution | null;
    isExecuting: boolean;
    remainingBudget: number | null;
    requestReroute: () => Promise<number | null>;
    acceptResult: () => Promise<void>;
    resetExecution: () => void;
  };
  sorRouteExpired: boolean;
  handleSorExecute: () => void;
}

export default function PredictionMarketTradeBoxUI({
  market,
  orderbook,
  pandascoreMatchId,
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
}: PredictionMarketTradeBoxUIProps) {
  const { selectedPosition, amount, price, orderType, side, orderResult, calculatedContracts, remainingUsd, spent, tradingFee, estimatedCost, grossReceive, sellTradingFee, netReceive, tradingVenue } = state;
  const venueConfig = getVenueConfig(tradingVenue);
  const { bestBid, bestAsk } = calculateOrderbookPrices(orderbook || null);

  const venueDropdownOptions = useMemo(() => {
    const all: { value: string; label: string }[] = [
      { value: "levelup", label: "LevelUp" },
      { value: "polymarket", label: "Polymarket" },
      { value: "predictfun", label: "Predict.fun" },
      { value: "dflow", label: "DFlow" },
    ];
    const venues = matchedVenues
      ? all.filter((v) => v.value === "levelup" || matchedVenues.has(v.value))
      : all;
    if (pandascoreMatchId && venues.length > 1) {
      venues.unshift({ value: "all", label: "All" });
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
  // Predict.fun uses separate per-outcome monitor hints so no complement is needed.
  const bookRepresentsNo =
    (tradingVenue === "polymarket" || tradingVenue === "dflow") &&
    selectedPosition === "no";

  const yesPrice =
    tradingVenue === "predictfun" && yesHintPrices
      ? side === "buy"
        ? yesHintPrices.bestAsk
        : yesHintPrices.bestBid
      : bookRepresentsNo
        ? side === 'buy'
          ? (bestBid === null ? null : 1 - bestBid)
          : (bestAsk === null ? null : 1 - bestAsk)
        : side === 'buy' ? bestAsk : bestBid;
  const noPrice =
    tradingVenue === "predictfun" && noHintPrices
      ? side === "buy"
        ? noHintPrices.bestAsk
        : noHintPrices.bestBid
      : bookRepresentsNo
        ? side === 'buy' ? bestAsk : bestBid
        : side === 'buy'
          ? (bestBid === null ? null : 1 - bestBid)
          : (bestAsk === null ? null : 1 - bestAsk);
  
  // Format with ¢ only when price exists, otherwise just "--"
  const yesPriceCents = yesPrice !== null ? `${toCentsString(yesPrice)}¢` : "--";
  const noPriceCents = noPrice !== null ? `${toCentsString(noPrice)}¢` : "--";

  // Helpers for single vs markets coloring
  const hexToRgba = (hex?: string, alpha: number = 0.35): string => {
    if (!hex) return `rgba(0,0,0,${alpha})`;
    const cleaned = hex.replace('#', '');
    const full = cleaned.length === 3 ? cleaned.split('').map((c) => c + c).join('') : cleaned;
    const r = parseInt(full.substring(0, 2), 16) || 0;
    const g = parseInt(full.substring(2, 4), 16) || 0;
    const b = parseInt(full.substring(4, 6), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

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
    const title = (market?.displayName || (market as any)?.question || '').trim();
    const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
    return parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1;
  }, [market]);

  const yesTeamColor: string = (market as any)?.yesColor || '#22c55e';
  const noTeamColor: string = (market as any)?.noColor || '#ef4444';

  // Check if this is an "Over {number}" market (daily player count style)
  const overUnderMatch = useMemo(() => {
    const title = (market?.displayName || (market as any)?.question || '').trim();
    // Match "Over" followed by a number (with optional commas)
    const match = title.match(/^Over\s+([\d,]+)/i);
    if (match) {
      return match[1]; // Return the number part
    }
    return null;
  }, [market?.displayName, (market as any)?.question]);

  // Derive team labels conditionally based on market title and umbrella having a single market
  const { yesTeamLabel, noTeamLabel } = useMemo(() => {
    // If it's an Over/Under market, use Over/Under labels
    if (overUnderMatch) {
      return { yesTeamLabel: 'Over', noTeamLabel: 'Under' };
    }
    
    const title = (market?.displayName || (market as any)?.question || '').trim();
    if (!title) return { yesTeamLabel: 'Yes', noTeamLabel: 'No' };
    const parts = title.split(/\s*vs\.?\s*/i).map((s: string) => s.trim()).filter(Boolean);
    if (parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1) {
      return { yesTeamLabel: parts[0], noTeamLabel: parts[1] };
    }
    return { yesTeamLabel: 'Yes', noTeamLabel: 'No' };
  }, [market?.displayName, (market as any)?.question, (market as any)?.umbrellaChildrenCount, overUnderMatch]);

  // Transform the display title for Over/Under markets
  const displayMarketTitle = useMemo(() => {
    if (overUnderMatch) {
      return `${overUnderMatch} Players`;
    }
    return market.displayName || market.question;
  }, [overUnderMatch, market.displayName, market.question]);

  const orderTypeDropdownOptions = useMemo(() => {
    const options: { value: "market" | "limit"; label: string }[] = [
      { value: "market", label: "Market" },
      { value: "limit", label: "Limit" },
    ];
    return [{ label: "Market", options }];
  }, []);

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

  // Compute Odds % for market BUY orders using weighted average fill price
  const oddsData = useMemo(() => {
    if (tradingVenue === "all") return null;
    if (orderType !== 'market' || side !== 'buy') return null;
    if (!amount || !selectedPosition) return null;
    const usdAmount = Number(amount);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) return null;
    const walkUsd = venueConfig.effectiveBuyBudget(usdAmount, {
      approxPrice: bestAsk ?? undefined,
    });
    const { contracts, remainingUsd } = calculateContractsForMarketOrder(walkUsd, selectedPosition, 'buy');
    if (!contracts || contracts <= 0) return null;
    const avgPrice = getEffectivePrice(walkUsd, contracts, remainingUsd);
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
    // Determine reference current market price for comparison.
    // For poly/dflow/predict the effective book is already the selected outcome's
    // native book, so bestAsk is the direct price to buy that outcome.
    const referencePrice = (() => {
      if (tradingVenue === "predictfun" && predictHints) {
        const hp =
          selectedPosition === "yes" ? yesHintPrices : noHintPrices;
        if (!hp) return null;
        return hp.bestAsk ?? null;
      }
      if (tradingVenue === "polymarket" || tradingVenue === "dflow") {
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
  }, [orderType, side, amount, selectedPosition, tradingVenue, calculateContractsForMarketOrder, getEffectivePrice, bestAsk, bestBid, predictHints, yesHintPrices, noHintPrices]);

  // Compute Avg Price (¢) for market SELL orders using weighted average sale price
  const sellAvgCents = useMemo(() => {
    if (orderType !== 'market' || side !== 'sell') return null;
    if (!amount || !selectedPosition) return null;
    const shares = Number(amount);
    if (!Number.isFinite(shares) || shares <= 0) return null;
    const { contracts, remainingUsd } = calculateContractsForMarketOrder(shares, selectedPosition, 'sell');
    if (!contracts || contracts <= 0) return null;
    const avgPrice = remainingUsd / contracts; // remainingUsd holds total USD received for sell path
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
    const cents = Math.round(avgPrice * 100);
    return cents;
  }, [orderType, side, amount, selectedPosition, calculateContractsForMarketOrder]);

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
      {state.tradingVenue === "polymarket" && polymarketVenueHint ? (
        <p className="trade-venue-hint">
          {polymarketVenueHint}{" "}
          <Link to="/trading" className="trade-venue-hint__link">
            Open Trading
          </Link>
        </p>
      ) : null}
      {state.tradingVenue === "predictfun" && predictVenueHint ? (
        <p className="trade-venue-hint">
          {predictVenueHint}{" "}
          <Link to="/trading" className="trade-venue-hint__link">
            Open Trading
          </Link>
        </p>
      ) : null}
      {state.tradingVenue === "dflow" && dflowVenueHint ? (
        <p className="trade-venue-hint">
          {dflowVenueHint}{" "}
          <Link to="/profile" className="trade-venue-hint__link">
            Open Profile
          </Link>
        </p>
      ) : null}
      

      <div className="tradebox-header">
        <div className="side-selector">
          <Button
            variant={side === 'buy' ? 'primary' : 'secondary'}
            onClick={() => onSideChange('buy')}
            className={`side-btn ${side === 'buy' ? 'selected primary' : ''}`}
          >
            Buy
          </Button>
          
          <Button
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
          variant="secondary"
          onClick={() => onPositionChange('yes')}
          className={`position-btn ${selectedPosition === 'yes' ? 'selected primary' : ''}`}
          style={isVsSingle ? {
            background: selectedPosition === 'yes' ? yesTeamColor : hexToRgba(yesTeamColor, 0.35),
            color: '#ffffff',
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
          {`${yesTeamLabel} ${yesPriceCents}`}
        </Button>
        
        <Button
          variant="secondary"
          onClick={() => onPositionChange('no')}
          className={`position-btn ${selectedPosition === 'no' ? 'selected secondary' : ''}`}
          style={isVsSingle ? {
            background: selectedPosition === 'no' ? noTeamColor : hexToRgba(noTeamColor, 0.35),
            color: '#ffffff',
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
          {`${noTeamLabel} ${noPriceCents}`}
        </Button>
      </div>

      {/* My Positions - shown if user holds this market's YES/NO */}
      <div style={{ marginTop: 24 }}>
        <MyPositionsRow market={market as any} />
      </div>

      {/* DFlow does not support limit orders — show message instead of inputs */}
      {state.tradingVenue === "dflow" && orderType === "limit" ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '200px',
          padding: '32px 24px',
          textAlign: 'center',
        }}>
          <p style={{
            fontSize: '18px',
            fontWeight: 600,
            color: '#94a3b8',
            lineHeight: 1.4,
            margin: 0,
          }}>
            Kalshi via DFlow does not support limit orders at this time
          </p>
        </div>
      ) : (
      <>
      {/* Amount Input */}
      <div className="input-section">
        <div className="input-label">
          {tradingVenue === "all"
            ? "Amount"
            : orderType === 'market'
              ? (side === 'sell' ? 'Shares' : 'Amount')
              : 'Shares'
          }
        </div>
        <div className={`input-container prediction-input-container ${(!amount || amount === '') ? 'empty-input' : ''}`}>
          {/* Show $ symbol when there's a value, use placeholder when empty */}
          <input
            type="text"
            value={amount ? ((tradingVenue === "all" || (side === 'buy' && orderType === 'market')) ? `$${formatNumberWithCommas(amount)}` : formatNumberWithCommas(amount)) : ''}
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
                // For market buy orders, allow decimals with existing validation
                // Only block if there are multiple decimal points
                const decimalCount = (cleanValue.match(/\./g) || []).length;
                if (decimalCount > 1) {
                  return;
                }
                
                // Only block if there are more than 2 decimal places
                if (cleanValue.includes('.') && cleanValue.split('.')[1] && cleanValue.split('.')[1].length > 2) {
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
            placeholder={(tradingVenue === "all" || (side === 'buy' && orderType === 'market')) ? '$0' : '0'}
            className={`trade-input prediction-trade-input`}
          />
        </div>
        
        {/* Warning when sweeping the book (trying to buy more than available) */}
        {buttonState.isSweepingBook && orderType === 'market' && selectedPosition && (
          <div className="sweep-warning" style={{ 
            fontSize: '12px', 
            color: '#f59e0b', 
            marginTop: '6px',
            fontWeight: 500
          }}>
            Only {buttonState.availableShares} {selectedPosition === 'yes' ? 'Yes' : 'No'} shares are available
          </div>
        )}

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
        <div className="bet-size-section" style={{ opacity: sorRoute.isStale && !sorRoute.isLoading ? 0.7 : 1, transition: "opacity 0.2s" }}>
          {sorRoute.isLoading && !sorRoute.route && (
            <div className="bet-size-info">
              <style>{`@keyframes sorPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
              <div className="bet-size-main-row" style={{ justifyContent: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: "#6366f1", animation: "sorPulse 1.5s infinite", display: "inline-block" }} />
                <span style={{ color: "#9ca3af", fontSize: 13 }}>Computing optimal route…</span>
              </div>
            </div>
          )}
          {sorRoute.error && !sorRoute.route && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <span style={{ color: "#ef4444", fontSize: 12 }}>Route unavailable: {sorRoute.error}</span>
              </div>
            </div>
          )}
          {sorRoute.route && (() => {
            const isSell = sorRoute.route.side === "sell";
            return (
            <>
              {sorRoute.route.legs.map((leg, idx) => {
                const venue = leg.venue as keyof typeof VENUE_COLORS;
                return (
                  <div key={`${leg.venue}-${idx}`} className="bet-size-info">
                    <div className="bet-size-main-row" style={{ fontSize: 12 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: VENUE_COLORS[venue], flexShrink: 0 }} />
                        {VENUE_DISPLAY_NAMES[venue]}
                      </span>
                      <span style={{ color: "#d1d5db" }}>
                        {isSell ? "sell " : ""}{leg.shares % 1 === 0 ? String(leg.shares) : leg.shares.toFixed(1)} @ {(leg.avgPrice * 100).toFixed(0)}¢
                        <span style={{ color: "#9ca3af", marginLeft: 6 }}>fee ${leg.fee.toFixed(2)}</span>
                        {!isSell && leg.bridge && (
                          <span style={{ color: "#f59e0b", marginLeft: 6 }}>bridge ${leg.bridge.estimatedCost.toFixed(2)}</span>
                        )}
                      </span>
                    </div>
                  </div>
                );
              })}
              {isSell && sorRoute.route.totalShares > 0 && (
                <div className="bet-size-info">
                  <div className="bet-size-main-row">
                    <span className="bet-size-label">Shares to Sell</span>
                    <span className="bet-size-value">
                      {sorRoute.route.totalShares % 1 === 0 ? String(sorRoute.route.totalShares) : sorRoute.route.totalShares.toFixed(1)}
                    </span>
                  </div>
                </div>
              )}
              <div className="bet-size-info">
                <div className="bet-size-main-row">
                  <span className="bet-size-label">{isSell ? "Estimated Proceeds" : "Estimated Cost"}</span>
                  <span className={`bet-size-value ${isSell ? "estimated-receive-value" : "estimated-cost-value"}`}>
                    $ {sorRoute.route.totalCost.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {sorRoute.route.totalFees > 0 && (
                <div className="bet-size-info">
                  <div className="bet-size-main-row">
                    <Tooltip
                      content={`Venue fees: $${sorRoute.route.totalFees.toFixed(2)}${!isSell && sorRoute.route.totalBridgeCost > 0 ? ` · Bridge: $${sorRoute.route.totalBridgeCost.toFixed(2)}` : ""}`}
                      position="top"
                      withPortal={true}
                    >
                      <span className="bet-size-label" style={{ color: "#94a3b8", fontSize: "12px" }}>Fee (Smart Route)</span>
                    </Tooltip>
                    <span className="bet-size-value" style={{ color: "#94a3b8", fontSize: "12px" }}>
                      $ {(sorRoute.route.totalFees + (isSell ? 0 : sorRoute.route.totalBridgeCost)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                    </span>
                  </div>
                </div>
              )}
              {!isSell && sorRoute.route.totalShares > 0 && (
                <div className="bet-size-info">
                  <div className="bet-size-main-row">
                    <span className="bet-size-label to-win-label">To Win</span>
                    <span className="bet-size-value">
                      $ {sorRoute.route.totalShares.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="bet-size-odds-subtext">
                    Avg. odds {(sorRoute.route.totalCost / sorRoute.route.totalShares * 100).toFixed(0)}%
                  </div>
                </div>
              )}
              {sorRoute.route.savingsVsSingleVenue.percentImprovement > 5 && (
                <div className="bet-size-info">
                  <div style={{ fontSize: 12, color: "#22c55e", fontWeight: 500, padding: "4px 0" }}>
                    Smart Route: {isSell ? "" : "+"}{sorRoute.route.savingsVsSingleVenue.extraShares % 1 === 0
                      ? String(Math.abs(sorRoute.route.savingsVsSingleVenue.extraShares))
                      : Math.abs(sorRoute.route.savingsVsSingleVenue.extraShares).toFixed(1)} {isSell ? "fewer shares sold" : "shares"}
                    {" "}({sorRoute.route.savingsVsSingleVenue.percentImprovement >= 0 ? "+" : ""}{sorRoute.route.savingsVsSingleVenue.percentImprovement.toFixed(1)}%)
                    {" "}vs {VENUE_DISPLAY_NAMES[sorRoute.route.singleVenueBest.venue as keyof typeof VENUE_DISPLAY_NAMES]} alone
                  </div>
                </div>
              )}
              {sorRoute.route.insufficientLiquidity && (
                <div className="bet-size-info">
                  <div style={{ fontSize: 12, color: "#f59e0b", fontWeight: 500, padding: "4px 0" }}>
                    {isSell ? "Not enough bids to reach your proceeds target" : "Not enough asks to fill your order"}
                  </div>
                </div>
              )}
            </>
            );
          })()}
        </div>
      )}

      {/* Bet Size / To Win for single-venue orders */}
      {tradingVenue !== "all" && (toWinNumeric !== null || limitOrderAmount !== null || oddsData !== null || sellAvgCents !== null || netReceive !== null) && (
        <div className="bet-size-section">
          {/* Estimated Cost for market BUY orders */}
          {oddsData !== null && calculatedContracts !== null && estimatedCost !== null && tradingFee !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={venueConfig.feeTooltip}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">
                    {`Estimated Cost${venueConfig.collateral !== "USDC" ? ` (${venueConfig.collateral})` : ""}`}
                  </span>
                </Tooltip>
                <span className="bet-size-value estimated-cost-value">
                  $ {estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
          {/* Fee row for market BUY orders */}
          {oddsData !== null && calculatedContracts !== null && tradingFee !== null && tradingFee > 0 && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={venueConfig.feeTooltip}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label" style={{ color: '#94a3b8', fontSize: '12px' }}>
                    Fee ({venueConfig.feeDescription})
                  </span>
                </Tooltip>
                <span className="bet-size-value" style={{ color: '#94a3b8', fontSize: '12px' }}>
                  $ {tradingFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                </span>
              </div>
            </div>
          )}
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
                <span className="bet-size-value estimated-receive-value">
                  $ {(Math.floor(netReceive * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
          {/* Fee row for market SELL orders */}
          {orderType === 'market' && side === 'sell' && sellTradingFee !== null && sellTradingFee > 0 && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={venueConfig.feeTooltip}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label" style={{ color: '#94a3b8', fontSize: '12px' }}>
                    Fee ({venueConfig.feeDescription})
                  </span>
                </Tooltip>
                <span className="bet-size-value" style={{ color: '#94a3b8', fontSize: '12px' }}>
                  $ {sellTradingFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 })}
                </span>
              </div>
            </div>
          )}
          {/* Limit order cost/receive — unified across all venues */}
          {orderType === 'limit' && side === 'buy' && limitOrderAmount !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={venueConfig.feeTooltip}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">
                    {limitOrderFee > 0 ? "Estimated Cost" : `Est. notional${venueConfig.collateral !== "USDC" ? ` (${venueConfig.collateral})` : ""}`}
                  </span>
                </Tooltip>
                <span className="bet-size-value amount-value">
                  $ {(limitOrderAmount + limitOrderFee).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
                <span className="bet-size-value">$ {toWinNumeric.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {/* Small grey odds text under To Win for market buy orders only */}
              {orderType === 'market' && oddsData && (
                <div className="bet-size-odds-subtext">Avg. odds {oddsData.pct}%</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trade Button */}
      <Button
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
              <span>{side === "sell" ? "Sold" : "Filled"}: {sorExecution.execution.totalFilledShares} shares{side === "sell" && sorExecution.execution.totalSpent > 0 ? ` — received $${sorExecution.execution.totalSpent.toFixed(2)}` : ""}</span>
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
              <span>{side === "sell" ? "Partially sold" : "Partially filled"}: {sorExecution.execution.totalFilledShares} shares</span>
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
        <div className={`trade-notification ${orderResult.success ? 'success' : 'error'}`}>
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
