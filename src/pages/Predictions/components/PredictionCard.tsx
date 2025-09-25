import React from 'react';
import { Trans } from "@lingui/macro";
import Button from "components/Button/Button";
import { SingleMarketActions } from './SingleMarketActions';
import { MultiMarketActions } from './MultiMarketActions';
import type { Umbrella } from "lib/umbrellaDataService";
import type { PredictionMarket } from "lib/predictionMarketDataService";
import { resolveUmbrellaBannerById } from "../utils/umbrellaBanners";

interface PredictionCardProps {
  umbrella: Umbrella;
  singleMarketOrderbooks: {[umbrellaId: string]: any};
  singleMarketQuestions: {[umbrellaId: string]: PredictionMarket};
  multiMarketData: {[umbrellaId: string]: {questions: PredictionMarket[], orderbooks: {[questionId: string]: any}}};
  onNavigateToUmbrella: (umbrella: Umbrella) => void;
  onNavigateToSingleMarket: (umbrella: Umbrella, position: 'yes' | 'no') => void;
  onNavigateToMultiMarket: (umbrella: Umbrella, question: PredictionMarket, position: 'yes' | 'no') => void;
}

export const PredictionCard: React.FC<PredictionCardProps> = ({
  umbrella,
  singleMarketOrderbooks,
  singleMarketQuestions,
  multiMarketData,
  onNavigateToUmbrella,
  onNavigateToSingleMarket,
  onNavigateToMultiMarket
}) => {
  const navigateToUmbrella = () => {
    onNavigateToUmbrella(umbrella);
  };

  const navigateToSingleMarket = (position: 'yes' | 'no') => {
    onNavigateToSingleMarket(umbrella, position);
  };

  const navigateToMultiMarket = (question: PredictionMarket, position: 'yes' | 'no') => {
    onNavigateToMultiMarket(umbrella, question, position);
  };

  const renderActions = () => {
    if (umbrella.children && umbrella.children.length === 1) {
      // Show Yes/No buttons for single market umbrellas
      const orderbook = singleMarketOrderbooks[umbrella._id];
      const question = singleMarketQuestions[umbrella._id];
      return (
        <SingleMarketActions 
          orderbook={orderbook} 
          onNavigate={navigateToSingleMarket}
          question={question}
        />
      );
    } else if (umbrella.children && umbrella.children.length >= 2) {
      // Show top 2 markets with Yes/No buttons for multi-market umbrellas
      return (
        <MultiMarketActions 
          umbrellaId={umbrella._id}
          multiMarketData={multiMarketData}
          onNavigate={navigateToMultiMarket}
        />
      );
    } else {
      // Show Explore Questions button for umbrellas with no markets
      return (
        <Button
          variant="primary-action"
          className="action-button yes-button"
          onClick={navigateToUmbrella}
        >
          <Trans>Explore Questions</Trans>
        </Button>
      );
    }
  };

  return (
    <div key={umbrella._id} className="prediction-card">
      {/* Banner Image */}
      <div className="prediction-banner">
        {umbrella.image || resolveUmbrellaBannerById(umbrella._id) ? (
          <img 
            src={umbrella.image || (resolveUmbrellaBannerById(umbrella._id) as string)}
            alt={umbrella.displayName}
            className="banner-image"
          />
        ) : (
          <div className="banner-placeholder">
            <span className="placeholder-text">🎮</span>
          </div>
        )}
      </div>

      <div className="prediction-card-content">
        <div className="prediction-details">
          <h3
            className="prediction-title"
            style={{
              cursor: "pointer",
              transition: "color 0.2s ease",
            }}
            onClick={navigateToUmbrella}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#8b5cf6";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "white";
            }}
          >
            {umbrella.displayName}
          </h3>
          {umbrella.description && (
            <p className="prediction-description" style={{ color: "#888", fontSize: "14px", marginTop: "8px" }}>
              {umbrella.description}
            </p>
          )}
        </div>
      </div>

      <div className="prediction-actions">
        {renderActions()}
      </div>
    </div>
  );
};
