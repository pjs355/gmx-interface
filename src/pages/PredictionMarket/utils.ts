export const getMarketId = (market: any): string => {
  if (!market) return "";
  return market._id || market.questionId || market.marketId || "";
};

/**
 * Peel REST / WebSocket envelopes (`{ data: { asks, bids } }`, nested `snapshot`) so
 * asks/bids are at the top level like `OrderbookSnapshot`.
 */
export function normalizeOrderbookPayload(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  let cur: unknown = raw;
  for (let depth = 0; depth < 6; depth++) {
    if (!cur || typeof cur !== "object" || Array.isArray(cur)) break;
    const o = cur as Record<string, unknown>;
    if (Array.isArray(o.asks) || Array.isArray(o.bids)) return cur;
    const data = o.data;
    if (
      data &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (Array.isArray((data as Record<string, unknown>).asks) ||
        Array.isArray((data as Record<string, unknown>).bids))
    ) {
      cur = data;
      continue;
    }
    const snap = o.snapshot;
    if (snap && typeof snap === "object" && !Array.isArray(snap)) {
      cur = snap;
      continue;
    }
    break;
  }
  return cur;
}

/** True when the value looks like a real orderbook snapshot (not a truthy `{}`). */
export function hasUsableOrderbookSnapshot(ob: unknown): boolean {
  const norm = normalizeOrderbookPayload(ob);
  if (!norm || typeof norm !== "object" || Array.isArray(norm)) return false;
  const o = norm as Record<string, unknown>;
  return Array.isArray(o.asks) || Array.isArray(o.bids);
}

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

