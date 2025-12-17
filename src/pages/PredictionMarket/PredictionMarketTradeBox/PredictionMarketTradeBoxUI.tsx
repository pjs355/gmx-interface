import { useMemo } from 'react';
import Button from "components/Button/Button";
import Tabs from "components/Tabs/Tabs";
import Tooltip from "components/Tooltip/Tooltip";
import type { TradeBoxProps, TradeBoxState, ApprovalState } from './types';
import './PredictionMarketTradeBox.scss';
import { MyPositionsRow } from './MyPositionsRow';
import { mixpanelTrack } from "@/utils/mixpanel";
// Helper function to calculate prices from orderbook
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
import { useMarketOrderHandler } from './MarketOrderHandler';
// import Tooltip from "components/Tooltip/Tooltip";

interface PredictionMarketTradeBoxUIProps extends TradeBoxProps {
  state: TradeBoxState;
  onPositionChange: (position: 'yes' | 'no') => void;
  onAmountChange: (amount: string) => void;
  onPriceChange: (price: string) => void;
  onOrderTypeChange: (orderType: 'market' | 'limit') => void;
  onSideChange: (side: 'buy' | 'sell') => void;
  onTrade: () => void;
  buttonState: {
    text: string;
    disabled: boolean;
    onClick: () => void;
  };
  approvalState: ApprovalState;
}

export default function PredictionMarketTradeBoxUI({
  market,
  orderbook,
  state,
  onPositionChange,
  onAmountChange,
  onPriceChange,
  onOrderTypeChange,
  onSideChange,
  onTrade,
  buttonState,
  approvalState
}: PredictionMarketTradeBoxUIProps) {
  const { selectedPosition, amount, price, orderType, side, orderResult, calculatedContracts, remainingUsd, spent, tradingFee, estimatedCost, grossReceive, sellTradingFee, netReceive } = state;
  const { bestBid, bestAsk } = calculateOrderbookPrices(orderbook || null);
  const { calculateContractsForMarketOrder, getEffectivePrice } = useMarketOrderHandler(orderbook as any);

  // Fee calculation helper - MUST match backend exactly
  // Backend uses: round UP to nearest cent (10000 micro-units)
  const calculateFeeMatchingBackend = (amountInDollars: number): number => {
    // Step 1: Convert to micro-units (USDC has 6 decimals)
    const amountMicro = Math.floor(amountInDollars * 1_000_000);
    // Step 2: Calculate 2% fee in micro-units
    const feeBeforeRounding = Math.floor(amountMicro * 2 / 100);
    // Step 3: Round UP to nearest cent (10000 micro-units)
    const feeRoundedUp = Math.ceil(feeBeforeRounding / 10000) * 10000;
    // Step 4: Convert back to dollars
    return feeRoundedUp / 1_000_000;
  };

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

  // Flip prices based on buy/sell side:
  // - BUY: YES shows bestAsk (what you pay), NO shows (1 - bestBid) (what you pay)
  // - SELL: YES shows bestBid (what you receive), NO shows (1 - bestAsk) (what you receive)
  const yesPriceCents = side === 'buy' 
    ? toCentsString(bestAsk) 
    : toCentsString(bestBid);
  const noPriceCents = side === 'buy'
    ? toCentsString(bestBid === null ? null : 1 - bestBid)
    : toCentsString(bestAsk === null ? null : 1 - bestAsk);

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

  const tabsOptions = [
    {
      label: "Market",
      options: [
        { value: 'market', label: 'Market' },
        { value: 'limit', label: 'Limit' }
      ]
    }
  ];

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

  // Compute numeric value for To Win / Receive; hide if null/NaN/0
  const toWinNumeric = (() => {
    if (!amount || !selectedPosition) return null;
    
    if (orderType === 'limit') {
      if (side === 'sell') {
        // For sell limit orders: shares × cents = total value received
        return limitOrderAmount;
      } else {
        // For buy limit orders: to win = shares amount
        return limitOrderToWin;
      }
    }
    
    // Market order calculations (existing logic)
    if (calculatedContracts === null) return null;
    if (side === 'sell') {
      const v = remainingUsd;
      const num = v !== undefined && v !== null ? Number(v) : NaN;
      return Number.isFinite(num) && num > 0 ? num : null;
    }
    // buy side calculation
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) return null;
    const rem = remainingUsd ?? 0;
    const avgPrice = (amt - rem) / calculatedContracts; // local only
    
    // For both YES and NO positions, if we win we get $1 per contract
    // So the total payout is just the number of contracts we bought
    const totalPayout = calculatedContracts * 1; // We get $1 per contract if we win
    return Number.isFinite(totalPayout) && totalPayout > 0 ? totalPayout : null;
  })();

  // Compute Odds % for market BUY orders using weighted average fill price
  const oddsData = useMemo(() => {
    if (orderType !== 'market' || side !== 'buy') return null;
    if (!amount || !selectedPosition) return null;
    const usdAmount = Number(amount);
    if (!Number.isFinite(usdAmount) || usdAmount <= 0) return null;
    const { contracts, remainingUsd } = calculateContractsForMarketOrder(usdAmount, selectedPosition, 'buy');
    if (!contracts || contracts <= 0) return null;
    const avgPrice = getEffectivePrice(usdAmount, contracts, remainingUsd);
    if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;
    // Determine reference current market price for comparison
    const referencePrice = selectedPosition === 'yes'
      ? (bestAsk ?? null)
      : (bestBid === null || bestBid === undefined ? null : (1 - bestBid));
    const pct = Math.round(avgPrice * 100);
    if (!Number.isFinite(pct) || pct < 0) return null;
    const isUpdated = referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
      ? avgPrice > referencePrice * 1.1
      : false;
    const fromPct = referencePrice !== null && referencePrice !== undefined && isFinite(referencePrice)
      ? Math.round(referencePrice * 100)
      : null;
    return { pct, avgPrice, isUpdated, fromPct };
  }, [orderType, side, amount, selectedPosition, calculateContractsForMarketOrder, getEffectivePrice, bestAsk, bestBid]);

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
      {/* Market Name Header */}
      <div className="market-name-header">
        <h3>{displayMarketTitle}</h3>
      </div>
      
      <div className="tradebox-header">
        {/* Buy/Sell Toggle moved to header */}
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
        <div className="trade-mode-selector">
          <Tabs
            options={tabsOptions}
            regularOptionClassname="py-10"
            type="inline"
            selectedValue={orderType}
            onChange={(value) => onOrderTypeChange(value as 'market' | 'limit')}
            qa="trade-mode"
          />
        </div>
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
          {`${yesTeamLabel} ${yesPriceCents}¢`}
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
          {`${noTeamLabel} ${noPriceCents}¢`}
        </Button>
      </div>

      {/* My Positions - shown if user holds this market's YES/NO */}
      <div style={{ marginTop: 24 }}>
        <MyPositionsRow market={market as any} />
      </div>

      {/* Amount Input */}
      <div className="input-section">
        <div className="input-label">
          {orderType === 'market' 
            ? (side === 'sell' ? 'Shares' : 'Amount')
            : 'Shares'
          }
        </div>
        <div className={`input-container prediction-input-container ${(!amount || amount === '') ? 'empty-input' : ''}`}>
          {/* Show $ symbol when there's a value, use placeholder when empty */}
          <input
            type="text"
            value={amount ? (side === 'buy' && orderType === 'market' ? `$${formatNumberWithCommas(amount)}` : formatNumberWithCommas(amount)) : ''}
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
              
              // For limit orders and market sell orders, only allow whole numbers (no decimals)
              if (orderType === 'limit' || (orderType === 'market' && side === 'sell')) {
                // Block any decimal points for limit orders and market sell orders
                if (cleanValue.includes('.')) {
                  return;
                }
                // Only allow digits for limit orders and market sell orders
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
              
              // For limit orders and market sell orders, block decimal points
              if ((orderType === 'limit' || (orderType === 'market' && side === 'sell')) && isDecimal) {
                e.preventDefault();
                return;
              }
              
              // Block everything except numbers, decimal (for market buy orders), and control keys
              if (!isNumber && !isDecimal && !isControlKey) {
                e.preventDefault();
              }
            }}
            placeholder={(side === 'buy' && orderType === 'market') ? '$0' : '0'}
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

      {/* Bet Size / To Win - render only when a positive numeric value exists */}
      {(toWinNumeric !== null || limitOrderAmount !== null || oddsData !== null || sellAvgCents !== null || netReceive !== null) && (
        <div className="bet-size-section">
          {/* Estimated Cost for market BUY orders (includes 2% trading fee) */}
          {oddsData !== null && calculatedContracts !== null && estimatedCost !== null && tradingFee !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={`Your cost was reduced to give you an even dollar payout. Includes a fee of $${tradingFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">Estimated Cost</span>
                </Tooltip>
                <span className="bet-size-value estimated-cost-value">
                  $ {estimatedCost.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          {/* Estimated Receive for market SELL orders (after 2% trading fee) */}
          {/* Round DOWN to avoid showing more than user will actually receive */}
          {orderType === 'market' && side === 'sell' && netReceive !== null && sellTradingFee !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content={`Includes a fee of $${sellTradingFee.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`}
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">Estimated Receive</span>
                </Tooltip>
                <span className="bet-size-value estimated-receive-value">
                  $ {(Math.floor(netReceive * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
          {/* Show Estimated Cost line for buy limit orders (includes 2% trading fee) */}
          {/* Uses backend-matching fee calculation: round UP to nearest cent */}
          {orderType === 'limit' && side === 'buy' && limitOrderAmount !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content="You may pay a fee up to 2% based on if your order is marked as a maker or taker. Makers pay 0% fees."
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">Estimated Cost</span>
                </Tooltip>
                <span className="bet-size-value amount-value">$ {(limitOrderAmount + calculateFeeMatchingBackend(limitOrderAmount)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
          {/* Show Estimated Receive line for sell limit orders (after 2% trading fee) */}
          {/* Uses backend-matching fee calculation, then floor to avoid showing more than user receives */}
          {orderType === 'limit' && side === 'sell' && limitOrderAmount !== null && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <Tooltip
                  content="You may pay a fee up to 2% based on if your order is marked as a maker or taker. Makers pay 0% fees."
                  position="top"
                  withPortal={true}
                >
                  <span className="bet-size-label">Estimated Receive</span>
                </Tooltip>
                <span className="bet-size-value amount-value">$ {(Math.floor((limitOrderAmount - calculateFeeMatchingBackend(limitOrderAmount)) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          )}
          
          {/* Show To Win line for BUY orders only (SELL orders show Estimated Receive above) */}
          {toWinNumeric !== null && side === 'buy' && (
            <div className="bet-size-info">
              <div className="bet-size-main-row">
                <span className={`bet-size-label to-win-label`}>To Win</span>
                <span className="bet-size-value">$ {toWinNumeric.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
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
              amount: amount,
              price: price,
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

      {/* Small Popup Notification */}
      {orderResult && (
        <div className={`trade-notification ${orderResult.success ? 'success' : 'error'}`}>
          <div className="notification-content">
            {orderResult.success ? (
              <div className="notification-text">Trade Executed Successfully!</div>
            ) : (
              <div className="notification-text">Trade Failed</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
