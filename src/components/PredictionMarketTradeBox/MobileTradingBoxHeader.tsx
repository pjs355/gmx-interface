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
  onTrade,
  buttonState
}: MobileTradingBoxHeaderProps) {
  const { selectedPosition, amount, side, orderType } = state;

  // Format amount string for display with $ symbol and thousands separators
  const formatAmountForDisplay = (value: string | undefined): string => {
    // Mobile is always market orders, so only show $ for BUY
    const showDollar = (side === 'buy');
    
    console.log('DEBUG Mobile formatAmountForDisplay:', { side, showDollar, value });
    
    if (!value || value === '') return showDollar ? '$0' : '0';
    
    // Handle leading dot like '.5'
    let raw = value;
    if (raw.startsWith('.')) raw = `0${raw}`;

    const endsWithDot = raw.endsWith('.') && !raw.endsWith('..');
    const [intPartRaw, fracPartRaw] = raw.split('.');

    // Remove any non-digits from integer part
    const intPartDigits = (intPartRaw ?? '0').replace(/\D/g, '');
    const intNumber = Number(intPartDigits || '0');
    const intFormatted = intNumber.toLocaleString('en-US');

    const prefix = showDollar ? '$' : '';

    if (endsWithDot) {
      // Preserve trailing dot while formatting the integer part
      return `${prefix}${intFormatted}.`;
    }

    if (typeof fracPartRaw === 'string') {
      // Preserve fractional part as typed
      return `${prefix}${intFormatted}.${fracPartRaw}`;
    }

    return `${prefix}${intFormatted}`;
  };

  const formattedAmountDisplay = useMemo(() => formatAmountForDisplay(amount), [amount, side]);

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
              Yes
            </button>
            <button
              className={`position-btn-mobile ${selectedPosition === 'no' ? 'active no' : ''}`}
              onClick={() => onPositionChange('no')}
            >
              No
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
              value={formattedAmountDisplay}
              onChange={(e) => {
                const value = e.target.value;
                // Remove $ and commas for processing
                const cleanValue = value.replace(/[$,\s]/g, '');
                onAmountChange(cleanValue);
              }}
              placeholder={side === 'buy' ? 'Enter amount' : 'Enter shares'}
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
