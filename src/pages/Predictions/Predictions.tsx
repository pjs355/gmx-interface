import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { usePredictionData } from "context/PredictionDataContext";
import { PredictionCard } from "./components/PredictionCard";
import { LoadingState } from "./components/LoadingState";
import type { Umbrella } from "lib/umbrellaDataService";
import type { PredictionMarket } from "lib/predictionMarketDataService";
import "./Predictions.scss";
import ImageBanner from "./ImageBanner";
import GameLinks from "./GameLinks";
import Footer from "components/Footer/Footer";

export default function Predictions() {
  const navigate = useNavigate();
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  // Listen for reset filter event from header
  useEffect(() => {
    const handleResetFilter = () => {
      setSelectedGame(null);
    };

    window.addEventListener('resetGameFilter', handleResetFilter);
    return () => {
      window.removeEventListener('resetGameFilter', handleResetFilter);
    };
  }, []);
  const {
    umbrellas,
    loading,
    error,
    singleMarketOrderbooks,
    singleMarketQuestions,
    multiMarketData
  } = usePredictionData();

  const normalizeTag = (value: string) =>
    value
      .toUpperCase()
      .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const filteredUmbrellas = React.useMemo(() => {
    if (!selectedGame) return umbrellas;
    
    const normalizedSelected = normalizeTag(selectedGame);
    return umbrellas.filter((umbrella) => {
      const children = (umbrella as any).children as Array<any> | undefined;
      if (!children || children.length === 0) return false;
      return children.some((q) => {
        const tags: string[] | undefined = (q && (q as any).tags) as any;
        if (!tags || tags.length === 0) return false;
        return tags.some((t) => normalizeTag(t) === normalizedSelected);
      });
    });
  }, [umbrellas, selectedGame]);

  // Navigation functions
  const navigateToUmbrella = (umbrella: Umbrella) => {
    localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
    navigate(`/predictions/umbrella/${umbrella._id}`);
  };

  const navigateToSingleMarket = (umbrella: Umbrella, position: 'yes' | 'no') => {
    localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
    const question = singleMarketQuestions[umbrella._id];
    if (question) {
      localStorage.setItem("currentPredictionMarket", JSON.stringify(question));
      localStorage.setItem("activePosition", position);
    }
    navigate(`/predictions/umbrella/${umbrella._id}`);
  };

  const navigateToMultiMarket = (umbrella: Umbrella, question: PredictionMarket, position: 'yes' | 'no') => {
    localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
    localStorage.setItem("currentPredictionMarket", JSON.stringify(question));
    localStorage.setItem("activePosition", position);
    
    // Store the selected market ID so it becomes the active market on the trading page
    const marketId = question._id || question.questionId || question.marketId;
    if (marketId) {
      localStorage.setItem("selectedMarketId", marketId);
    }
    
    navigate(`/predictions/umbrella/${umbrella._id}`);
  };

  const handleRetry = () => {
    window.location.reload();
  };

  if (loading || error) {
    return <LoadingState error={error} onRetry={handleRetry} />;
  }

  return (
    <div className="predictions-page page-layout">
      {/** <ImageBanner /> */}
      <GameLinks 
        selectedGame={selectedGame} 
        onGameSelect={setSelectedGame} 
        umbrellas={umbrellas}
        loading={loading}
      />

      <div className="predictions-grid">
        {(filteredUmbrellas.length > 0) ? (
          filteredUmbrellas.map(umbrella => (
            <PredictionCard
              key={umbrella._id}
              umbrella={umbrella}
              singleMarketOrderbooks={singleMarketOrderbooks}
              singleMarketQuestions={singleMarketQuestions}
              multiMarketData={multiMarketData}
              onNavigateToUmbrella={navigateToUmbrella}
              onNavigateToSingleMarket={navigateToSingleMarket}
              onNavigateToMultiMarket={navigateToMultiMarket}
            />
          ))
        ) : (
          <div className="no-markets-message no-markets-message--empty">
            <p>{`No current markets for ${selectedGame ?? 'this filter'}`}</p>
          </div>
        )}
      </div>
      <Footer />
    </div>
  );
}
