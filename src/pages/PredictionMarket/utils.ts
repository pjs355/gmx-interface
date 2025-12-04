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

// Calculate total volume from orderbook (sum of all bid and ask sizes)
export const getTotalVolume = (orderbook: any): number => {
  if (!orderbook) return 0;

  let totalVolume = 0;

  // Sum ask sizes
  if (orderbook.asks && Array.isArray(orderbook.asks)) {
    for (const ask of orderbook.asks) {
      if (typeof ask.size === "number") {
        totalVolume += ask.size;
      }
    }
  }

  // Sum bid sizes
  if (orderbook.bids && Array.isArray(orderbook.bids)) {
    for (const bid of orderbook.bids) {
      if (typeof bid.size === "number") {
        totalVolume += bid.size;
      }
    }
  }

  return totalVolume;
};

// Sort questions by highest trading volume (descending)
// Markets with the most interest appear at the top
export const sortQuestionsByVolumeDesc = (questions: any[], orderbooks: Record<string, any>) => {
  return [...questions].sort((a, b) => {
    const obA = orderbooks[getMarketId(a)];
    const obB = orderbooks[getMarketId(b)];
    const volumeA = getTotalVolume(obA);
    const volumeB = getTotalVolume(obB);
    return volumeB - volumeA;
  });
};

// Legacy function - kept for backward compatibility but now sorts by volume
export const sortQuestionsByYesPriceDesc = (questions: any[], orderbooks: Record<string, any>) => {
  return sortQuestionsByVolumeDesc(questions, orderbooks);
};

