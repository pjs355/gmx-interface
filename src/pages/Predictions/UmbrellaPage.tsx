import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from "react-router-dom";
import { Trans } from "@lingui/macro";
import Button from "components/Button/Button";
import { umbrellaDataService, Umbrella } from "lib/umbrellaDataService";
import { PredictionMarket } from "lib/predictionMarketDataService";
import "./Predictions.scss";

export default function UmbrellaPage() {
  const { umbrellaId } = useParams<{ umbrellaId: string }>();
  const navigate = useNavigate();
  const [umbrella, setUmbrella] = useState<Umbrella | null>(null);
  const [questions, setQuestions] = useState<PredictionMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadUmbrellaData = async () => {
      // First try to get umbrella data from localStorage
      const storedUmbrella = localStorage.getItem('currentUmbrella');
      
      if (storedUmbrella) {
        try {
          const parsedUmbrella = JSON.parse(storedUmbrella) as Umbrella;
          
          // Verify the umbrella ID matches the URL parameter
          if (parsedUmbrella._id === umbrellaId) {
            setUmbrella(parsedUmbrella);
            
            // Fetch all questions for this umbrella
            try {
              if (parsedUmbrella.children && parsedUmbrella.children.length > 0) {
                const fetchedQuestions = await umbrellaDataService.fetchQuestionsForUmbrella(parsedUmbrella);
                setQuestions(fetchedQuestions);
              } else {
                console.log('⚠️ No children found for umbrella:', parsedUmbrella.displayName);
                setQuestions([]);
              }
            } catch (error) {
              console.error('❌ Error fetching questions:', error);
              setError('Failed to load questions for this umbrella');
            }
          } else {
            console.log('❌ Umbrella ID mismatch:', parsedUmbrella._id, 'vs', umbrellaId);
            setError('Umbrella not found');
          }
        } catch (error) {
          console.error('❌ Error parsing stored umbrella data:', error);
          setError('Invalid umbrella data');
        }
      } else {
        console.log('❌ No umbrella data found in localStorage');
        setError('Umbrella data not found');
      }
      
      setLoading(false);
    };

    loadUmbrellaData();
  }, [umbrellaId]);

  const goBack = () => {
    history.push('/predictions');
  };

  const navigateToQuestion = (question: PredictionMarket) => {
    // Store umbrella data for the umbrella trading page
    localStorage.setItem("currentUmbrella", JSON.stringify(umbrella));
    navigate(`/predictions/umbrella/${umbrella._id}`);
  };

  const renderQuestionCard = (question: PredictionMarket) => {
    return (
      <div key={question._id} className="prediction-card">
        <div className="prediction-card-content">
          <div className="prediction-image">
            <div className="image-placeholder">
              <span className="placeholder-text">🎯</span>
            </div>
          </div>

          <div className="prediction-details">
            <h3
              className="prediction-title"
              style={{
                color: "white",
                fontSize: "16px",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "color 0.2s ease",
              }}
              onClick={() => navigateToQuestion(question)}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "#8b5cf6";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "white";
              }}
            >
              {question.displayName || question.question}
            </h3>
          </div>
        </div>

        <div className="prediction-actions">
          <Button
            variant="primary-action"
            className="action-button yes-button"
            onClick={() => navigateToQuestion(question)}
          >
            <Trans>View Trading Page</Trans>
          </Button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="predictions-page">
        <div className="predictions-header">
          <Button variant="secondary" onClick={goBack} style={{ marginBottom: '16px' }}>
            <Trans>← Back to Umbrellas</Trans>
          </Button>
          <h1>Loading...</h1>
        </div>
        <div className="loading-message">
          <p>Loading questions...</p>
        </div>
      </div>
    );
  }

  if (error || !umbrella) {
    return (
      <div className="predictions-page">
        <div className="predictions-header">
          <Button variant="secondary" onClick={goBack} style={{ marginBottom: '16px' }}>
            <Trans>← Back to Umbrellas</Trans>
          </Button>
          <h1>Error</h1>
        </div>
        <div className="error-message">
          <p>{error || 'Umbrella not found'}</p>
          <Button variant="primary" onClick={goBack}>
            <Trans>Go Back</Trans>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="predictions-page">
      <div className="predictions-header">
        <Button variant="secondary" onClick={goBack} style={{ marginBottom: '16px' }}>
          <Trans>← Back to Umbrellas</Trans>
        </Button>
        <h1>{umbrella.displayName}</h1>
        {umbrella.description && (
          <p style={{ color: '#888', fontSize: '16px', marginTop: '8px' }}>
            {umbrella.description}
          </p>
        )}
      </div>

      <div className="predictions-grid">
        {questions.length > 0 ? (
          questions.map(renderQuestionCard)
        ) : (
          <div className="no-markets-message">
            <p>No questions available for this umbrella.</p>
            <p>Questions loaded: {questions.length}</p>
          </div>
        )}
      </div>
    </div>
  );
}
