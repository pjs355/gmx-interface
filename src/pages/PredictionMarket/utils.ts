export const getMarketId = (market: any): string => {
  if (!market) return "";
  return market._id || market.questionId || market.marketId || "";
};

export const sanitizeQuestions = (qs: any[] | undefined | null): any[] => {
  if (!Array.isArray(qs)) return [];
  return qs.filter((q) => q && getMarketId(q));
};

export const getBestAsk = (orderbook: any) => {
  if (!orderbook?.asks || orderbook.asks.length === 0) return null;
  return Math.min(...orderbook.asks.map((a: any) => a.price));
};

export const sortQuestionsByYesPriceDesc = (questions: any[], orderbooks: Record<string, any>) => {
  return [...questions].sort((a, b) => {
    const obA = orderbooks[getMarketId(a)];
    const obB = orderbooks[getMarketId(b)];
    const aAsk = getBestAsk(obA);
    const bAsk = getBestAsk(obB);
    if (aAsk === null && bAsk === null) return 0;
    if (aAsk === null) return 1;
    if (bAsk === null) return -1;
    return bAsk - aAsk;
  });
};

