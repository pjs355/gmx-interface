import React from 'react';
import Button from "components/Button/Button";
import { calculateOrderbookPrices, toCentsString, getTopTwoMarkets, truncateMarketName } from '../utils/predictionUtils';
import type { PredictionMarket } from "lib/predictionMarketDataService";

interface MultiMarketActionsProps {
  umbrellaId: string;
  multiMarketData: {[umbrellaId: string]: {questions: PredictionMarket[], orderbooks: {[questionId: string]: any}}};
  onNavigate: (question: PredictionMarket, position: 'yes' | 'no') => void;
}

export const MultiMarketActions: React.FC<MultiMarketActionsProps> = ({ 
  umbrellaId, 
  multiMarketData, 
  onNavigate 
}) => {
  const topMarkets = getTopTwoMarkets(umbrellaId, multiMarketData);
  
  return (
    <div className="multi-market-actions">
      {topMarkets.map((marketData, index) => {
        const { question, yesPrice, orderBookId } = marketData;
        const orderbook = multiMarketData[umbrellaId]?.orderbooks[orderBookId];
        const { bestBid } = calculateOrderbookPrices(orderbook);
        const yesCents = toCentsString(yesPrice);
        const noCents = toCentsString(bestBid === null ? null : 1 - bestBid);
        
        return (
          <div key={question._id || question.questionId || index} className="market-row">
            <div className="market-info">
              <span className="market-name">{truncateMarketName(question.displayName || question.question)}</span>
            </div>
            <div className="market-buttons">
              <Button
                variant="secondary"
                className="action-button yes-button"
                onClick={() => onNavigate(question, 'yes')}
                style={{
                  background: "rgba(34, 197, 94, 0.1)",
                  color: "#22c55e",
                  border: "2px solid #22c55e",
                  marginRight: "8px",
                  fontSize: "16px",
                  padding: "10px 16px",
                  minHeight: "42px",
                  width: "100px",
                  flex: "0 0 100px",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(34, 197, 94, 0.2)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(34, 197, 94, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(34, 197, 94, 0.1)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <strong>Yes {yesCents}¢</strong>
              </Button>
              <Button
                variant="secondary"
                className="action-button no-button"
                onClick={() => onNavigate(question, 'no')}
                style={{
                  background: "rgba(239, 68, 68, 0.1)",
                  color: "#ef4444",
                  border: "2px solid #ef4444",
                  fontSize: "16px",
                  padding: "10px 16px",
                  minHeight: "42px",
                  width: "100px",
                  flex: "0 0 100px",
                  textAlign: "center",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(239, 68, 68, 0.2)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                  e.currentTarget.style.boxShadow = "0 4px 8px rgba(239, 68, 68, 0.3)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(239, 68, 68, 0.1)";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <strong>No {noCents}¢</strong>
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
};
