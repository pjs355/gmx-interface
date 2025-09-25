import React from 'react';
import type { TradeBoxState } from './types';
import './MobileTradingBoxHeader.scss';

interface MobileTradingBoxHeaderProps {
  market: any;
  state: TradeBoxState;
  onSideChange: (side: 'buy' | 'sell') => void;
  onPositionChange: (position: 'yes' | 'no') => void;
  onAmountChange: (amount: string) => void;
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
  const { selectedPosition, amount, side } = state;

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

          {/* Amount input */}
          <div className="amount-input-mobile">
            <input
              type="number"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0"
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
