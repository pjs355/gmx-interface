import { useState, useEffect } from "react";
import { umbrellaDataService, Umbrella } from "lib/umbrellaDataService";
import { OrderbookService } from "lib/orderbookService";
import type { PredictionMarket } from "lib/predictionMarketDataService";

export interface PredictionDataState {
  umbrellas: Umbrella[];
  loading: boolean;
  error: string | null;
  singleMarketOrderbooks: {[umbrellaId: string]: any};
  singleMarketQuestions: {[umbrellaId: string]: PredictionMarket};
  multiMarketData: {[umbrellaId: string]: {questions: PredictionMarket[], orderbooks: {[questionId: string]: any}}};
}

export const usePredictionData = () => {
  const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [singleMarketOrderbooks, setSingleMarketOrderbooks] = useState<{[umbrellaId: string]: any}>({});
  const [singleMarketQuestions, setSingleMarketQuestions] = useState<{[umbrellaId: string]: PredictionMarket}>({});
  const [multiMarketData, setMultiMarketData] = useState<{[umbrellaId: string]: {questions: PredictionMarket[], orderbooks: {[questionId: string]: any}}}>({});

  const fetchSingleMarketData = async (umbrellas: Umbrella[]) => {
    const orderbookService = new OrderbookService();
    const singleMarketOrderbooksData: {[umbrellaId: string]: any} = {};
    const singleMarketQuestionsData: {[umbrellaId: string]: PredictionMarket} = {};

    for (const umbrella of umbrellas) {
      // Only process umbrellas with exactly 1 market
      if (umbrella.children && umbrella.children.length === 1) {
        try {
          // Fetch the single question for this umbrella
          const questions = await umbrellaDataService.fetchQuestionsForUmbrella(umbrella);
          if (questions.length > 0) {
            const question = questions[0];
            singleMarketQuestionsData[umbrella._id] = question;

            // Fetch orderbook for this question
            const orderBookId = question._id || question.questionId || question.marketId;
            if (orderBookId) {
              try {
                const orderbook = await orderbookService.fetchOrderbook(orderBookId);
                singleMarketOrderbooksData[umbrella._id] = orderbook;
              } catch (error) {
                console.log(`Failed to fetch orderbook for umbrella ${umbrella._id}:`, error);
                singleMarketOrderbooksData[umbrella._id] = null;
              }
            }
          }
        } catch (error) {
          console.log(`Failed to fetch questions for umbrella ${umbrella._id}:`, error);
        }
      }
    }

    setSingleMarketOrderbooks(singleMarketOrderbooksData);
    setSingleMarketQuestions(singleMarketQuestionsData);
  };

  const fetchMultiMarketData = async (umbrellas: Umbrella[]) => {
    const orderbookService = new OrderbookService();
    const multiMarketDataResult: {[umbrellaId: string]: {questions: PredictionMarket[], orderbooks: {[questionId: string]: any}}} = {};

    for (const umbrella of umbrellas) {
      // Only process umbrellas with 2+ markets
      if (umbrella.children && umbrella.children.length >= 2) {
        try {
          // Fetch all questions for this umbrella
          const questions = await umbrellaDataService.fetchQuestionsForUmbrella(umbrella);
          if (questions.length > 0) {
            const orderbooks: {[questionId: string]: any} = {};
            
            // Fetch orderbooks for all questions
            for (const question of questions) {
              const orderBookId = question._id || question.questionId || question.marketId;
              if (orderBookId) {
                try {
                  const orderbook = await orderbookService.fetchOrderbook(orderBookId);
                  orderbooks[orderBookId] = orderbook;
                } catch (error) {
                  console.log(`Failed to fetch orderbook for question ${orderBookId}:`, error);
                  orderbooks[orderBookId] = null;
                }
              }
            }
            
            multiMarketDataResult[umbrella._id] = { questions, orderbooks };
          }
        } catch (error) {
          console.log(`Failed to fetch questions for umbrella ${umbrella._id}:`, error);
        }
      }
    }

    setMultiMarketData(multiMarketDataResult);
  };

  useEffect(() => {
    const fetchUmbrellas = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log("🌂 Starting to fetch umbrellas...");
        const fetchedUmbrellas = await umbrellaDataService.fetchAllUmbrellas();

        console.log("📋 Fetched umbrellas:", fetchedUmbrellas);

        // Filter out umbrellas that only have resolved markets
        const umbrellasWithActiveMarkets: Umbrella[] = [];
        for (const umb of fetchedUmbrellas) {
          try {
            const qs = await umbrellaDataService.fetchQuestionsForUmbrella(umb);
            if (qs && qs.length > 0) {
              umbrellasWithActiveMarkets.push(umb);
            }
          } catch (e) {
            // ignore umbrella on error
          }
        }

        setUmbrellas(umbrellasWithActiveMarkets);

        // Fetch orderbook data for umbrellas with only 1 active market
        await fetchSingleMarketData(umbrellasWithActiveMarkets);
        // Fetch data for umbrellas with 2+ active markets
        await fetchMultiMarketData(umbrellasWithActiveMarkets);
      } catch (err) {
        console.error("❌ Failed to fetch umbrellas:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch umbrellas");
      } finally {
        setLoading(false);
      }
    };

    fetchUmbrellas();
  }, []);

  return {
    umbrellas,
    loading,
    error,
    singleMarketOrderbooks,
    singleMarketQuestions,
    multiMarketData
  };
};
