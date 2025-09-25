import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { PredictionMarket } from 'lib/predictionMarketDataService';
import type { Umbrella } from 'lib/umbrellaDataService';
import { usePredictionData } from 'context/PredictionDataContext';
import { sanitizeQuestions, getMarketId, sortQuestionsByYesPriceDesc } from './utils';

export function usePredictionMarket() {
  const { umbrellaId } = useParams<{ umbrellaId: string }>();
  const navigate = useNavigate();
  const { getUmbrellaById, getQuestionsForUmbrella, getOrderbookForQuestion, refreshOrderbook } = usePredictionData();

  const [umbrella, setUmbrella] = useState<Umbrella | null>(null);
  const [questions, setQuestions] = useState<PredictionMarket[]>([]);
  const [questionOrderbooks, setQuestionOrderbooks] = useState<Record<string, any>>({});
  const [activeMarket, setActiveMarket] = useState<PredictionMarket | null>(null);
  const [activePosition, setActivePosition] = useState<'yes' | 'no'>(() => {
    const stored = localStorage.getItem('activePosition');
    return stored === 'no' ? 'no' : 'yes';
  });
  const [openOrderbookId, setOpenOrderbookId] = useState<string | null>(null);
  const [hasUserSelectedMarket, setHasUserSelectedMarket] = useState(false);
  const [hasProcessedStoredSelection, setHasProcessedStoredSelection] = useState(false);
  const [loading, setLoading] = useState(true);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('currentUmbrella');
    let parsed: Umbrella | null = null;
    try { parsed = stored ? JSON.parse(stored) : null; } catch { parsed = null; }

    const umb = getUmbrellaById(umbrellaId) || parsed;
    if (!umb) {
      setUmbrella(null);
      setQuestions([]);
      setLoading(false);
      return;
    }
    setUmbrella(umb);

    const qs = sanitizeQuestions(getQuestionsForUmbrella(umb._id) as any[]);
    if (qs.length === 0) {
      setQuestions([]);
      setLoading(false);
      history.replace('/predictions');
      return;
    }
    setQuestions(qs as any);

    const seeded: Record<string, any> = {};
    for (const q of qs) {
      const qid = getMarketId(q);
      if (qid) seeded[qid] = getOrderbookForQuestion(umb._id, qid);
    }
    setQuestionOrderbooks(seeded);
    setLoading(false);
  }, [umbrellaId, getUmbrellaById, getQuestionsForUmbrella, getOrderbookForQuestion, history]);

  const sortedQuestions = useMemo(() => sortQuestionsByYesPriceDesc(questions as any[], questionOrderbooks), [questions, questionOrderbooks]);

  useEffect(() => {
    if (!hasUserSelectedMarket && !hasProcessedStoredSelection && sortedQuestions.length > 0) {
      setHasProcessedStoredSelection(true);
      const storedMarketId = localStorage.getItem('selectedMarketId');
      let target: PredictionMarket | null = null;
      if (storedMarketId) {
        target = sortedQuestions.find((q) => getMarketId(q) === storedMarketId) || null;
        localStorage.removeItem('selectedMarketId');
      }
      if (!target) target = sortedQuestions[0];
      if (target && (!activeMarket || getMarketId(activeMarket) !== getMarketId(target))) {
        setActiveMarket(target);
      }
    }
  }, [hasUserSelectedMarket, hasProcessedStoredSelection, sortedQuestions, activeMarket]);

  useEffect(() => {
    if (!activeMarket || !umbrella) return;
    const id = getMarketId(activeMarket);
    if (!id) return;
    
    let isActive = true;
    const refresh = async () => {
      if (!isActive) return;
      await refreshOrderbook(umbrella._id, id);
      if (!isActive) return; // Check after async call
      const ob = getOrderbookForQuestion(umbrella._id, id);
      setQuestionOrderbooks((prev) => ({ ...prev, [id]: ob }));
    };
    refresh();
    const interval = setInterval(refresh, 30000); // Reduced from 15s to 30s
    return () => {
      isActive = false;
      clearInterval(interval);
    };
  }, [activeMarket, umbrella, refreshOrderbook, getOrderbookForQuestion]);

  const handleMarketSwitch = useCallback((market: PredictionMarket, position: 'yes' | 'no') => {
    setActiveMarket(market);
    setActivePosition(position);
    setHasUserSelectedMarket(true);
  }, []);

  const handlePositionChange = useCallback((position: 'yes' | 'no') => {
    setActivePosition(position);
  }, []);

  const handleOrderbookToggle = useCallback((marketId: string) => {
    setOpenOrderbookId((prev) => (prev === marketId ? null : marketId));
  }, []);

  const handleMarketSwitchWithOrderbook = useCallback((market: PredictionMarket, position: 'yes' | 'no') => {
    const id = getMarketId(market);
    setActiveMarket(market);
    setActivePosition(position);
    setHasUserSelectedMarket(true);
    setOpenOrderbookId(id);
  }, []);

  const fetchAllOrderbooks = useCallback(async (qs: PredictionMarket[]) => {
    if (!umbrella) return;
    await Promise.all((qs || []).map(async (q) => {
      const id = getMarketId(q);
      if (!id) return;
      await refreshOrderbook(umbrella._id, id);
    }));
    const updated: Record<string, any> = {};
    for (const q of qs) {
      const id = getMarketId(q);
      if (id) updated[id] = getOrderbookForQuestion(umbrella._id, id);
    }
    setQuestionOrderbooks(updated);
  }, [umbrella, refreshOrderbook, getOrderbookForQuestion]);

  return {
    titleRef,
    loading,
    umbrella,
    questions,
    questionOrderbooks,
    sortedQuestions,
    activeMarket,
    activePosition,
    openOrderbookId,
    handleMarketSwitch,
    handlePositionChange,
    handleOrderbookToggle,
    handleMarketSwitchWithOrderbook,
    fetchAllOrderbooks,
  } as const;
}


