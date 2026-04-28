import React, { useMemo } from 'react';
import type { TradeBoxState } from './types';
import './MobileTradingBoxHeader.scss';

interface MobileTradingBoxHeaderProps {
  market: any;
  state: TradeBoxState;
  onSideChange: (side: 'buy' | 'sell') => void;
  onPositionChange: (position: 'yes' | 'no') => void;
  onAmountChange: (amount: string) => void;
  onOrderTypeChange?: (orderType: 'market' | 'limit') => void;
  onTrade: () => void;
  buttonState: {
    text: string;
    disabled: boolean;
    onClick: () => void;
  };
}

export default function MobileTradingBoxHeader({
  market,
  state,
  onSideChange,
  onPositionChange,
  onAmountChange,
  onOrderTypeChange,
  onTrade,
  buttonState
}: MobileTradingBoxHeaderProps) {
  const { selectedPosition, amount, side, orderType } = state;

  // Check if this is an "Over {number}" market (daily player count style)
  const overUnderMatch = useMemo(() => {
    const title = (market?.displayName || market?.question || '').trim();
    // Match "Over" followed by a number (with optional commas)
    const match = title.match(/^Over\s+([\d,]+)/i);
    if (match) {
      return match[1]; // Return the number part
    }
    return null;
  }, [market?.displayName, market?.question]);

  // Derive labels: Over/Under for player count markets, Yes/No otherwise
  const { yesLabel, noLabel } = useMemo(() => {
    if (overUnderMatch) {
      return { yesLabel: 'Over', noLabel: 'Under' };
    }
    return { yesLabel: 'Yes', noLabel: 'No' };
  }, [overUnderMatch]);

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

  return (
    <div className="mobile-trading-header">
      <div className="mobile-trading-header-content">
        {/* Market title */}
        <div className="market-title-mobile">
          {market.displayName || market.question}
        </div>
        
        {/* Compact controls */}
        <div className="mobile-controls">
          {/* Side selector */}
          <div className="side-selector-mobile">
            <button
              className={`side-btn-mobile ${side === 'buy' ? 'active' : ''}`}
              onClick={() => onSideChange('buy')}
            >
              Buy
            </button>
            <button
              className={`side-btn-mobile ${side === 'sell' ? 'active' : ''}`}
              onClick={() => onSideChange('sell')}
            >
              Sell
            </button>
          </div>

          {/* Position selector */}
          <div className="position-selector-mobile">
            <button
              className={`position-btn-mobile ${selectedPosition === 'yes' ? 'active yes' : ''}`}
              onClick={() => onPositionChange('yes')}
            >
              {yesLabel}
            </button>
            <button
              className={`position-btn-mobile ${selectedPosition === 'no' ? 'active no' : ''}`}
              onClick={() => onPositionChange('no')}
            >
              {noLabel}
            </button>
          </div>

          {/* Order type selector */}
          <div className="order-type-selector-mobile">
            <button
              className={`order-type-btn-mobile ${orderType === 'market' ? 'active' : ''}`}
              onClick={() => onOrderTypeChange && onOrderTypeChange('market')}
            >
              Market
            </button>
            <button
              className={`order-type-btn-mobile ${orderType === 'limit' ? 'active' : ''}`}
              onClick={() => onOrderTypeChange && onOrderTypeChange('limit')}
            >
              Limit
            </button>
          </div>

          {/* Amount input */}
          <div className={`amount-input-mobile ${(!amount || amount === '') ? 'empty-input' : ''}`}>
            <input
              type="text"
              value={amount ? (side === 'buy' ? `$${formatNumberWithCommas(amount)}` : formatNumberWithCommas(amount)) : ''}
              onChange={(e) => {
                const value = e.target.value;
                // Remove $ and commas for processing
                const cleanValue = value.replace(/[$,\s]/g, '');
                
                // Allow only one decimal point
                const decimalCount = (cleanValue.match(/\./g) || []).length;
                if (decimalCount > 1) {
                  return;
                }
                
                // Shares (sell, limit, etc.): 6 dp; USD market buy: 2 dp
                const maxFractionDigits =
                  side === "buy" && orderType === "market" ? 2 : 6;
                const frac = cleanValue.includes(".") ? cleanValue.split(".")[1] : "";
                if (frac && frac.length > maxFractionDigits) {
                  return;
                }
                
                onAmountChange(cleanValue);
              }}
              onKeyDown={(e) => {
                // Only allow numbers, decimal point, and control keys
                const char = e.key;
                const isNumber = /[0-9]/.test(char);
                const isDecimal = char === '.';
                const isControlKey = ['Backspace', 'Delete', 'Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(char);
                
                // Block everything except numbers, decimal, and control keys
                if (!isNumber && !isDecimal && !isControlKey) {
                  e.preventDefault();
                }
              }}
              placeholder={side === 'buy' ? '$0' : '0'}
              className="amount-input-field"
            />
          </div>

          {/* Trade button */}
          <button
            className={`trade-btn-mobile ${buttonState.disabled ? 'disabled' : ''}`}
            onClick={buttonState.onClick}
            disabled={buttonState.disabled}
          >
            {buttonState.text}
          </button>
        </div>
      </div>
    </div>
  );
}
