import { useEffect, useState } from 'react';
import { usePredictionData } from 'context/PredictionDataContext';

type ChartState = {
  isInitialized: boolean;
  primaryMarket: any;
  secondaryMarket: any | null;
  primaryQuestionId: string;
  secondaryQuestionId: string | null;
  frozenOrderbooks: Record<string, any>;
};

export function useChartState(sortedQuestions: any[], questionOrderbooks: Record<string, any>) {
  const { allBooksPreview } = usePredictionData();
  const [chartOnlyState, setChartOnlyState] = useState<ChartState>({
    isInitialized: false,
    primaryMarket: null,
    secondaryMarket: null,
    primaryQuestionId: '',
    secondaryQuestionId: null,
    frozenOrderbooks: {},
  });

  // Initialize/update chart state based on sorted questions
  useEffect(() => {
    if (sortedQuestions.length > 0) {
      const primaryMarket = { ...sortedQuestions[0] };
      const secondaryMarket = sortedQuestions.length > 1 ? { ...sortedQuestions[1] } : null;

      const primaryQuestionId = (primaryMarket._id || primaryMarket.questionId || primaryMarket.marketId || '') as string;
      const secondaryQuestionId = secondaryMarket ? (secondaryMarket._id || secondaryMarket.questionId || secondaryMarket.marketId) : null;

      // Only update if the markets actually changed
      if (primaryQuestionId !== chartOnlyState.primaryQuestionId || 
          secondaryQuestionId !== chartOnlyState.secondaryQuestionId) {
        
        const frozenOrderbooks: Record<string, any> = {};
        if (questionOrderbooks[primaryQuestionId]) frozenOrderbooks[primaryQuestionId] = { ...questionOrderbooks[primaryQuestionId] };
        if (secondaryQuestionId && questionOrderbooks[secondaryQuestionId]) frozenOrderbooks[secondaryQuestionId] = { ...questionOrderbooks[secondaryQuestionId] };

        console.log('📊 Chart state updated with top markets:', {
          primary: primaryMarket.displayName || primaryMarket.question,
          secondary: secondaryMarket?.displayName || secondaryMarket?.question,
          primaryPrice: allBooksPreview[primaryQuestionId]?.lowestAsk,
          secondaryPrice: secondaryQuestionId ? allBooksPreview[secondaryQuestionId]?.lowestAsk : null,
        });

        setChartOnlyState({
          isInitialized: true,
          primaryMarket,
          secondaryMarket,
          primaryQuestionId,
          secondaryQuestionId,
          frozenOrderbooks,
        });
      }
    }
  }, [sortedQuestions, questionOrderbooks, chartOnlyState.primaryQuestionId, chartOnlyState.secondaryQuestionId, allBooksPreview]);

  // Update frozen orderbooks when questionOrderbooks changes
  useEffect(() => {
    if (chartOnlyState.isInitialized && chartOnlyState.primaryQuestionId) {
      const frozenOrderbooks: Record<string, any> = {};
      if (questionOrderbooks[chartOnlyState.primaryQuestionId]) {
        frozenOrderbooks[chartOnlyState.primaryQuestionId] = { ...questionOrderbooks[chartOnlyState.primaryQuestionId] };
      }
      if (chartOnlyState.secondaryQuestionId && questionOrderbooks[chartOnlyState.secondaryQuestionId]) {
        frozenOrderbooks[chartOnlyState.secondaryQuestionId] = { ...questionOrderbooks[chartOnlyState.secondaryQuestionId] };
      }

      setChartOnlyState(prev => ({
        ...prev,
        frozenOrderbooks,
      }));
    }
  }, [questionOrderbooks, chartOnlyState.isInitialized, chartOnlyState.primaryQuestionId, chartOnlyState.secondaryQuestionId]);

  // Chart uses frozen data from global context - no additional API calls needed

  return chartOnlyState;
}


