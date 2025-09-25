import React from 'react';
import { useMedia } from "react-use";
import PredictionMarketChart from 'components/PredictionMarketChart';
import OrderbookDisplay from 'components/OrderbookDisplay/OrderbookDisplay';
import PredictionMarketTradeBox from 'components/PredictionMarketTradeBox/PredictionMarketTradeBox';
import RulesSection from 'components/RulesSection/RulesSection';
import type { PredictionMarket } from 'lib/predictionMarketDataService';
import type { Umbrella } from 'lib/umbrellaDataService';
import { getMarketId } from './utils';

type PanelsProps = {
  umbrella: Umbrella;
  sortedQuestions: PredictionMarket[];
  questionOrderbooks: Record<string, any>;
  activeMarket: PredictionMarket | null;
  activePosition: 'yes' | 'no';
  openOrderbookId: string | null;
  onMarketSwitch: (q: PredictionMarket, p: 'yes' | 'no') => void;
  onMarketSwitchWithOrderbook: (q: PredictionMarket, p: 'yes' | 'no') => void;
  onOrderbookToggle: (marketId: string) => void;
  onPositionChange: (p: 'yes' | 'no') => void;
  fetchAllOrderbooks: (qs: PredictionMarket[]) => Promise<void>;
  chartState: {
    isInitialized: boolean;
    primaryQuestionId: string;
    primaryMarket: any;
    secondaryMarket: any | null;
    frozenOrderbooks: Record<string, any>;
  };
};

export const MarketPanels: React.FC<PanelsProps> = ({
  umbrella,
  sortedQuestions,
  questionOrderbooks,
  activeMarket,
  activePosition,
  openOrderbookId,
  onMarketSwitch,
  onMarketSwitchWithOrderbook,
  onOrderbookToggle,
  onPositionChange,
  fetchAllOrderbooks,
  chartState,
}) => {
  useMedia("(max-width: 1100px)");

  return (
    <div className="prediction-market-content">
      {/* Desktop Layout */}
      <div className="desktop-layout">
        <div className="left-panel">
          <div className="chart-section" style={{ marginTop: 0 }}>
            <div className="ExchangeChart" style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
              <div className="flex grow flex-col overflow-visible rounded-4 bg-black" style={{ minHeight: 300 }}>
                <PredictionMarketChart
                  questionId={chartState.primaryQuestionId || (chartState.primaryMarket?._id || chartState.primaryMarket?.questionId || chartState.primaryMarket?.marketId || '')}
                  activeMarket={chartState.primaryMarket ? { ...(chartState.primaryMarket as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } : undefined}
                  secondMarket={chartState.secondaryMarket ? { ...(chartState.secondaryMarket as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } : undefined}
                  questionOrderbooks={chartState.frozenOrderbooks}
                />
              </div>
            </div>
          </div>

          <div className="orderbook-section" style={{ marginTop: 8 }}>
            {sortedQuestions.map((question, index) => {
              if (!question) return null;
              const orderBookId = getMarketId(question) || `${index}`;
              return (
                <div key={orderBookId} className="question-orderbook">
                  <OrderbookDisplay
                    orderbook={questionOrderbooks[orderBookId]}
                    loading={!questionOrderbooks[orderBookId]}
                    error={null}
                    onRefresh={() => fetchAllOrderbooks(sortedQuestions)}
                    customTitle={question.displayName || (question as any).question}
                    market={{ ...(question as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } as any}
                    onMarketSwitch={onMarketSwitch}
                    onMarketSwitchWithOrderbook={onMarketSwitchWithOrderbook}
                    onOrderbookToggle={onOrderbookToggle}
                    isActiveMarket={getMarketId(activeMarket) === getMarketId(question)}
                    activePosition={activePosition}
                    isCollapsed={openOrderbookId !== orderBookId}
                  />
                </div>
              );
            })}

            <RulesSection umbrella={umbrella} />
          </div>
        </div>

        <div className="right-panel">
          {activeMarket && (
            <PredictionMarketTradeBox
              market={{ ...(activeMarket as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } as any}
              orderbook={questionOrderbooks[getMarketId(activeMarket)]}
              initialPosition={activePosition}
              onPositionChange={onPositionChange}
            />
          )}
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="mobile-layout">
        <div className="chart-section-mobile">
          <div className="ExchangeChart" style={{ display: 'flex', flexDirection: 'column', minHeight: 300 }}>
            <div className="flex grow flex-col overflow-visible rounded-4 bg-black" style={{ minHeight: 300 }}>
              <PredictionMarketChart
                questionId={chartState.primaryQuestionId || (chartState.primaryMarket?._id || chartState.primaryMarket?.questionId || chartState.primaryMarket?.marketId || '')}
                activeMarket={chartState.primaryMarket ? { ...(chartState.primaryMarket as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } : undefined}
                secondMarket={chartState.secondaryMarket ? { ...(chartState.secondaryMarket as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } : undefined}
                questionOrderbooks={chartState.frozenOrderbooks}
              />
            </div>
          </div>
        </div>

        <div className="orderbook-section-mobile">
          {sortedQuestions.map((question, index) => {
            if (!question) return null;
            const orderBookId = getMarketId(question) || `${index}`;
            return (
              <div key={orderBookId} className="question-orderbook">
                <OrderbookDisplay
                  orderbook={questionOrderbooks[orderBookId]}
                  loading={!questionOrderbooks[orderBookId]}
                  error={null}
                  onRefresh={() => fetchAllOrderbooks(sortedQuestions)}
                  customTitle={question.displayName || (question as any).question}
                  market={{ ...(question as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } as any}
                  onMarketSwitch={onMarketSwitch}
                  onMarketSwitchWithOrderbook={onMarketSwitchWithOrderbook}
                  onOrderbookToggle={onOrderbookToggle}
                  isActiveMarket={getMarketId(activeMarket) === getMarketId(question)}
                  activePosition={activePosition}
                  isCollapsed={openOrderbookId !== orderBookId}
                />
              </div>
            );
          })}

          <RulesSection umbrella={umbrella} />
        </div>

        {/* Mobile Trading Container - Fixed at bottom */}
        {activeMarket && (
          <div className="mobile-trading-container">
            <PredictionMarketTradeBox
              market={{ ...(activeMarket as any), umbrellaChildrenCount: umbrella?.children?.length || 0 } as any}
              orderbook={questionOrderbooks[getMarketId(activeMarket)]}
              initialPosition={activePosition}
              onPositionChange={onPositionChange}
            />
          </div>
        )}
      </div>
    </div>
  );
};


