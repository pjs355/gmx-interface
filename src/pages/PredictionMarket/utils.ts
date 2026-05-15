export const getMarketId = (market: any): string => {
  if (!market) return "";
  return market._id || market.questionId || market.marketId || "";
};

/**
 * Orderbook map key for the canonical LevelUp (winner) question — same question
 * the predictions API uses for venue-prices / venue-bbo (`exchangeMatching.levelup.questionId`
 * is the on-chain questionId hex; `questionOrderbooks` is keyed by client market id).
 */
export function resolveLevelUpOrderbookKey(
	sortedQuestions: any[] | undefined | null,
	exchangeMatchingLevelupQuestionId?: string | null,
): string | null {
	const qs = Array.isArray(sortedQuestions)
		? sortedQuestions.filter((q) => q && getMarketId(q))
		: [];
	if (qs.length === 0) return null;
	const raw = String(exchangeMatchingLevelupQuestionId ?? "").trim();
	if (raw) {
		const byChainQuestionId = qs.find(
			(q) => String(q?.questionId ?? "").trim() === raw,
		);
		if (byChainQuestionId) return getMarketId(byChainQuestionId);
		const byMongoOrOtherId = qs.find((q) => getMarketId(q) === raw);
		if (byMongoOrOtherId) return getMarketId(byMongoOrOtherId);
	}
	const winner = qs.find(
		(q) => String(q?.pandascore_template ?? "") === "winner-2-way",
	);
	if (winner) return getMarketId(winner);
	return getMarketId(qs[0]);
}

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

function restingSizeFromOrderbookRow(row: unknown): number {
  if (row == null) return 0;
  if (Array.isArray(row)) {
    if (row.length >= 2) {
      const n = Number(row[1]);
      return Number.isFinite(n) && n > 0 ? n : 0;
    }
    return 0;
  }
  if (typeof row !== "object") return 0;
  const o = row as Record<string, unknown>;
  for (const key of ["size", "amount", "quantity", "shares", "qty"] as const) {
    const n = Number(o[key]);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function sumPositiveRestingSizes(levels: unknown): number {
  if (!Array.isArray(levels)) return 0;
  let sum = 0;
  for (const row of levels) {
    sum += restingSizeFromOrderbookRow(row);
  }
  return sum;
}

/** True when normalized bids/asks have at least one strictly positive size (coerced). Used for chart gating on REST snapshot depth. */
export function levelUpOrderbookHasRestingShares(raw: unknown): boolean {
  const norm = normalizeOrderbookPayload(raw);
  if (!norm || typeof norm !== "object" || Array.isArray(norm)) return false;
  const o = norm as { asks?: unknown; bids?: unknown };
  return sumPositiveRestingSizes(o.asks) + sumPositiveRestingSizes(o.bids) > 0;
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

