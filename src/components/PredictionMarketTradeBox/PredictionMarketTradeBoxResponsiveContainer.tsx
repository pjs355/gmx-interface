import React, { useMemo, useCallback } from 'react';
import { useMedia } from "react-use";
import PredictionMarketTradeBoxUI from './PredictionMarketTradeBoxUI';
import { PredictionCurtain, useIsCurtainOpen, useCurtainActions } from './PredictionCurtain';
import type { TradeBoxProps, TradeBoxState, ApprovalState } from './types';
import Button from "components/Button/Button";

interface PredictionMarketTradeBoxResponsiveContainerProps extends TradeBoxProps {
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

export default function PredictionMarketTradeBoxResponsiveContainer({
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
}: PredictionMarketTradeBoxResponsiveContainerProps) {
  const isMobile = useMedia("(max-width: 1100px)");
  const isCurtainOpen = useIsCurtainOpen();
  const { openCurtain, closeCurtain } = useCurtainActions();

  // Compute YES/NO labels and cents exactly like UI component
  const { yesTeamLabel, noTeamLabel } = useMemo(() => {
    const title = (market?.displayName || (market as any)?.question || '').trim();
    if (!title) return { yesTeamLabel: 'Yes', noTeamLabel: 'No' };
    const parts = title.split(/\s*vs\.?\s*/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length === 2 && (market as any)?.umbrellaChildrenCount === 1) {
      return { yesTeamLabel: parts[0], noTeamLabel: parts[1] };
    }
    return { yesTeamLabel: 'Yes', noTeamLabel: 'No' };
  }, [market]);

  const calcCents = useCallback((value?: number | null): string => {
    if (value === undefined || value === null || !isFinite(value)) return "--";
    return Math.round(value * 100).toString();
  }, []);

  const bestAsk = useMemo(() => {
    if (!orderbook?.asks || orderbook.asks.length === 0) return null;
    return Math.min(...orderbook.asks.map((a: any) => a.price));
  }, [orderbook]);

  const bestBid = useMemo(() => {
    if (!orderbook?.bids || orderbook.bids.length === 0) return null;
    return Math.max(...orderbook.bids.map((b: any) => b.price));
  }, [orderbook]);

  const yesPriceCents = useMemo(() => calcCents(bestAsk as any), [bestAsk, calcCents]);
  const noPriceCents = useMemo(() => calcCents(bestBid === null ? null : 1 - (bestBid as any)), [bestBid, calcCents]);

  const openWithPosition = useCallback((position: 'yes' | 'no') => {
    onPositionChange(position);
    openCurtain();
  }, [onPositionChange, openCurtain]);

  if (!isMobile) {
    return (
      <div 
        className="text-body-medium flex flex-col rounded-12 shadow-[0_2px_8px_rgba(0,0,0,0.3)] p-15" 
        style={{ backgroundColor: 'black' }}
        data-qa="prediction-tradebox"
      >
        <PredictionMarketTradeBoxUI
          market={market}
          orderbook={orderbook}
          state={state}
          onPositionChange={onPositionChange}
          onAmountChange={onAmountChange}
          onPriceChange={onPriceChange}
          onOrderTypeChange={onOrderTypeChange}
          onSideChange={onSideChange}
          onTrade={onTrade}
          buttonState={buttonState}
          approvalState={approvalState}
        />
      </div>
    );
  }

  return (
    <PredictionCurtain 
      header={
        isCurtainOpen ? null : (
          <div className="prediction-curtain-header">
            <div className="curtain-header-buttons flex gap-8">
              <Button
                variant="secondary"
                onClick={() => openWithPosition('yes')}
                className={`position-btn selected primary`}
                style={{ flex: 1, padding: 12, borderRadius: 8, fontSize: 18, fontWeight: 600, minHeight: 48 }}
              >
                {`${yesTeamLabel} ${yesPriceCents}¢`}
              </Button>
              <Button
                variant="secondary"
                onClick={() => openWithPosition('no')}
                className={`position-btn selected secondary`}
                style={{ flex: 1, padding: 12, borderRadius: 8, fontSize: 18, fontWeight: 600, minHeight: 48 }}
              >
                {`${noTeamLabel} ${noPriceCents}¢`}
              </Button>
            </div>
          </div>
        )
      } 
      dataQa="prediction-tradebox"
    >
      <div className="curtain-content-inner">
        <button className="curtain-close-btn" aria-label="Close trading panel" onClick={closeCurtain}>▾</button>
        <PredictionMarketTradeBoxUI
          market={market}
          orderbook={orderbook}
          state={state}
          onPositionChange={onPositionChange}
          onAmountChange={onAmountChange}
          onPriceChange={onPriceChange}
          onOrderTypeChange={onOrderTypeChange}
          onSideChange={onSideChange}
          onTrade={onTrade}
          buttonState={buttonState}
          approvalState={approvalState}
        />
      </div>
    </PredictionCurtain>
  );
}
