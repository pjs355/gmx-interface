import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { umbrellaDataService, type Umbrella } from "lib/umbrellaDataService";
import { currentPriceService } from "lib/currentPriceService";

type MarketLite = any;

type PredictionDataContextValue = {
  umbrellas: Umbrella[];
  marketsByUmbrella: Record<string, MarketLite[]>;
  allMarketsByUmbrella: Record<string, MarketLite[]>;
  // Legacy fields expected by existing pages/components
  singleMarketQuestions: Record<string, any>;
  singleMarketOrderbooks: Record<string, any>;
  multiMarketData: Record<string, any>;
  loading: boolean;
  error?: string;
  refresh: () => Promise<void>;
  // Helpers for consumers (e.g. trading page)
  getUmbrellaById: (umbrellaId: string) => Umbrella | undefined;
  getQuestionsForUmbrella: (umbrellaId: string) => any[];
  getAllQuestionsForUmbrella: (umbrellaId: string) => any[];
  getOrderbookForQuestion: (umbrellaId: string, questionId: string) => any | null;
  refreshOrderbook: (umbrellaId: string, questionId: string) => Promise<void>;
};

const PredictionDataContext = createContext<PredictionDataContextValue>({
  umbrellas: [],
  marketsByUmbrella: {},
  allMarketsByUmbrella: {},
  singleMarketQuestions: {},
  singleMarketOrderbooks: {},
  multiMarketData: {},
  loading: true,
  error: undefined,
  refresh: async () => {},
  getUmbrellaById: () => undefined,
  getQuestionsForUmbrella: () => [],
  getAllQuestionsForUmbrella: () => [],
  getOrderbookForQuestion: () => null,
  refreshOrderbook: async () => {},
});

export function PredictionDataProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(false);
  const [umbrellas, setUmbrellas] = useState<Umbrella[]>([]);
  const [marketsByUmbrella, setMarketsByUmbrella] = useState<Record<string, MarketLite[]>>({});
  const [allMarketsByUmbrella, setAllMarketsByUmbrella] = useState<Record<string, MarketLite[]>>({});
  const [singleMarketQuestions, setSingleMarketQuestions] = useState<Record<string, any>>({});
  const [singleMarketOrderbooks, setSingleMarketOrderbooks] = useState<Record<string, any>>({});
  const [multiMarketData, setMultiMarketData] = useState<Record<string, any>>({});
  const [error, setError] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const { OrderbookService } = await import("lib/orderbookService");
      const orderbookService = new OrderbookService();
      const umbrellas = await umbrellaDataService.fetchAllUmbrellas();
      const entries = await Promise.all(
        umbrellas.map(async (umbrella: any) => {
          const markets = await umbrellaDataService.fetchQuestionsForUmbrella(umbrella, { includeResolved: true });
          const key = umbrella?._id || umbrella?.id || umbrella?.slug || JSON.stringify(umbrella);
          // Filter out resolved markets here so downstream consumers never see them
          const filteredMarkets = Array.isArray(markets)
            ? markets.filter((m: any) => String((m?.status ?? "")).toLowerCase() !== "resolved")
            : [];
          // Provide a cleaned umbrella copy with filtered children for pages that read umbrella.children
          const cleanedUmbrella = { ...umbrella, children: filteredMarkets };
          return [key as string, filteredMarkets, cleanedUmbrella] as const;
        })
      );
      const marketsMap: Record<string, MarketLite[]> = {};
      const allMarketsMap: Record<string, MarketLite[]> = {};
      const singleQuestions: Record<string, any> = {};
      const orderbooks: Record<string, any> = {};
      const multiData: Record<string, any> = {};

      const cleanedUmbrellas: any[] = [];
      entries.forEach(([key, markets, cleanedUmbrella]) => {
        // Skip umbrellas that have no active markets left
        if (!Array.isArray(markets) || markets.length === 0) {
          return;
        }

        // Store all markets (including resolved) for consumers like Positions page (no re-fetch on mount)
        allMarketsMap[key] = markets;

        marketsMap[key] = markets;
        const isSingle = Array.isArray(markets) && markets.length === 1;
        if (isSingle) {
          singleQuestions[key] = markets[0];
        } else {
          // Legacy shape expected by utils: { questions: any[], orderbooks: { [id]: orderbook } }
          multiData[key] = {
            questions: markets,
            orderbooks: {},
          };
        }
        // Placeholder for orderbooks; keep empty object to avoid undefined lookups
        orderbooks[key] = orderbooks[key] || {};
        cleanedUmbrellas.push(cleanedUmbrella);
      });

      setUmbrellas(cleanedUmbrellas as any);
      setMarketsByUmbrella(marketsMap);
      setAllMarketsByUmbrella(allMarketsMap);
      setSingleMarketQuestions(singleQuestions);
      setSingleMarketOrderbooks(orderbooks);
      setMultiMarketData(multiData);

      // Kick off orderbook and historical data fetches in background
      const fetchAll = async () => {
        const { predictionMarketDataService } = await import("lib/predictionMarketDataService");
        const updatesSingle: Record<string, any> = {};
        const updatesMulti: Record<string, any> = {};
        
        console.log('🔄 Starting background data fetch for', Object.keys(marketsMap).length, 'umbrellas');

        // Warm price cache for all markets across umbrellas
        try {
          const allMarketIds: string[] = [];
          Object.values(marketsMap).forEach((markets) => {
            (markets || []).forEach((q: any) => {
              const qid = q?._id || q?.questionId || q?.marketId;
              if (qid) allMarketIds.push(qid);
            });
          });
          if (allMarketIds.length > 0) {
            // Fire-and-forget; PortfolioContext will read from cache
            currentPriceService.refreshMarkets(allMarketIds).catch(() => {});
          }
        } catch {}
        
        for (const [umbId, markets] of Object.entries(marketsMap)) {
          if (!Array.isArray(markets) || markets.length === 0) continue;
          
          console.log(`📂 Processing umbrella ${umbId} with ${markets.length} markets`);
          
          if (markets.length === 1) {
            const q = markets[0] as any;
            const qid = q?._id || q?.questionId || q?.marketId;
            if (!qid) continue;
            
            console.log(`📊 Processing single market: ${q.displayName || q.question} (${qid})`);
            
            // First, ensure market is cached
            try {
              predictionMarketDataService.getCachedMarketData(qid) || 
              await predictionMarketDataService.fetchMarketById(qid);
            } catch (error) {
              console.warn('Failed to cache market data for', qid, error);
            }
            
            // Fetch orderbook
            const ob = await orderbookService.fetchOrderbook(qid);
            if (ob) updatesSingle[umbId] = ob;
            
            // Fetch historical data
            try {
              const success = await predictionMarketDataService.refreshHistoricalData(qid);
              console.log(`📈 Historical data for ${qid}:`, success ? '✅ Success' : '⚠️ No data');
            } catch (error) {
              console.warn('Failed to load historical data for', qid, error);
            }
          } else {
            // Fetch orderbooks and historical data for each question under umbrella
            const obMap: Record<string, any> = {};
            await Promise.all(
              markets.map(async (q: any) => {
                const qid = q?._id || q?.questionId || q?.marketId;
                if (!qid) return;
                
                console.log(`📊 Processing multi market: ${q.displayName || q.question} (${qid})`);
                
                // First, ensure market is cached
                try {
                  predictionMarketDataService.getCachedMarketData(qid) || 
                  await predictionMarketDataService.fetchMarketById(qid);
                } catch (error) {
                  console.warn('Failed to cache market data for', qid, error);
                }
                
                // Fetch orderbook
                const ob = await orderbookService.fetchOrderbook(qid);
                if (ob) obMap[qid] = ob;
                
                // Fetch historical data
                try {
                  const success = await predictionMarketDataService.refreshHistoricalData(qid);
                  console.log(`📈 Historical data for ${qid}:`, success ? '✅ Success' : '⚠️ No data');
                } catch (error) {
                  console.warn('Failed to load historical data for', qid, error);
                }
              })
            );
            if (!updatesMulti[umbId]) updatesMulti[umbId] = {};
            updatesMulti[umbId] = { ...(multiData[umbId] || { questions: markets, orderbooks: {} }), orderbooks: obMap };
          }
        }
        
        console.log('✅ Background data fetch completed');
        if (Object.keys(updatesSingle).length) setSingleMarketOrderbooks((prev) => ({ ...prev, ...updatesSingle }));
        if (Object.keys(updatesMulti).length) setMultiMarketData((prev) => ({ ...prev, ...updatesMulti }));
      };
      fetchAll().catch(() => {});
    } catch (e: any) {
      setError(e?.message || "Failed to load markets");
    } finally {
      setLoading(false);
    }
  }, []);

  const getUmbrellaById = useCallback((umbrellaId: string) => {
    return umbrellas.find((u: any) => u?._id === umbrellaId);
  }, [umbrellas]);

  const getQuestionsForUmbrella = useCallback((umbrellaId: string) => {
    const umbrellaMarkets = marketsByUmbrella[umbrellaId];
    if (Array.isArray(umbrellaMarkets)) return umbrellaMarkets as any[];
    const umbrella = getUmbrellaById(umbrellaId) as any;
    return (umbrella && Array.isArray(umbrella.children)) ? umbrella.children : [];
  }, [marketsByUmbrella, getUmbrellaById]);

  const getOrderbookForQuestion = useCallback((umbrellaId: string, questionId: string) => {
    // single-market umbrella
    if (singleMarketQuestions[umbrellaId]) {
      const q = singleMarketQuestions[umbrellaId];
      const qid = q?._id || q?.questionId || q?.marketId;
      if (qid && qid === questionId) {
        return singleMarketOrderbooks[umbrellaId] || null;
      }
    }
    // multi-market umbrella
    const multi = multiMarketData[umbrellaId];
    if (multi && multi.orderbooks) {
      return multi.orderbooks[questionId] || null;
    }
    return null;
  }, [singleMarketQuestions, singleMarketOrderbooks, multiMarketData]);

  const getAllQuestionsForUmbrella = useCallback((umbrellaId: string) => {
    const all = allMarketsByUmbrella[umbrellaId];
    if (Array.isArray(all)) return all as any[];
    // fallback to active-only if all not present yet
    return getQuestionsForUmbrella(umbrellaId);
  }, [allMarketsByUmbrella, getQuestionsForUmbrella]);

  const refreshOrderbook = useCallback(async (umbrellaId: string, questionId: string) => {
    try {
      const { OrderbookService } = await import("lib/orderbookService");
      const orderbookService = new OrderbookService();
      const ob = await orderbookService.fetchOrderbook(questionId);
      if (!ob) return;
      // Decide which bucket to update
      if (singleMarketQuestions[umbrellaId]) {
        setSingleMarketOrderbooks((prev) => ({ ...prev, [umbrellaId]: ob }));
      } else {
        setMultiMarketData((prev) => ({
          ...prev,
          [umbrellaId]: {
            ...(prev[umbrellaId] || { questions: getQuestionsForUmbrella(umbrellaId), orderbooks: {} }),
            orderbooks: {
              ...((prev[umbrellaId] && prev[umbrellaId].orderbooks) || {}),
              [questionId]: ob,
            },
          },
        }));
      }
    } catch {
      // silent
    }
  }, [singleMarketQuestions, getQuestionsForUmbrella]);

  useEffect(() => {
    load();
  }, [load]);

  const value = useMemo<PredictionDataContextValue>(() => ({
    umbrellas,
    marketsByUmbrella,
    allMarketsByUmbrella,
    singleMarketQuestions,
    singleMarketOrderbooks,
    multiMarketData,
    loading,
    error,
    refresh: load,
    getUmbrellaById,
    getQuestionsForUmbrella,
    getAllQuestionsForUmbrella,
    getOrderbookForQuestion,
    refreshOrderbook,
  }), [umbrellas, marketsByUmbrella, allMarketsByUmbrella, singleMarketQuestions, singleMarketOrderbooks, multiMarketData, loading, error, load, getUmbrellaById, getQuestionsForUmbrella, getAllQuestionsForUmbrella, getOrderbookForQuestion, refreshOrderbook]);

  return <PredictionDataContext.Provider value={value}>{children}</PredictionDataContext.Provider>;
}

export function usePredictionData(): PredictionDataContextValue {
  return useContext(PredictionDataContext);
}


