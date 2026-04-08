export interface BookLevel {
	price: string;
	size: string;
}

export interface VenueBook {
	bids: BookLevel[];
	asks: BookLevel[];
}

export interface VenueBestPrices {
	bestBid: number | null;
	bestAsk: number | null;
}

/*
 * ═══════════════════════════════════════════════════════════════════
 *  BACKEND CHANGES NEEDED (for server owner)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  1. ADD maxPrice / minPrice to SOR RouteLeg (REQUIRED for EIP-712 signing)
 *     ─ File: predictions/src/sor/book-walker.ts
 *       In walkBook (buy side): track highest ask touched → worstPrice
 *       In walkBookBids (sell side): track lowest bid touched → worstPrice
 *       Return worstPrice alongside existing curve.
 *     ─ File: predictions/src/sor/types.ts
 *       Add to RouteLeg interface:
 *         maxPrice: number;  // worst (highest) ask touched for buy
 *         minPrice: number;  // worst (lowest) bid touched for sell
 *     ─ Frontend uses these for EIP-712 order signing: the signed price
 *       must be the worst-case to guarantee fills. Until added, the frontend
 *       applies a 5% slippage buffer on the avgPrice as a temporary workaround.
 *
 *  2. VERIFY SOR single-venue performance
 *     ─ When targetVenue is set, confirm the SOR skips bridge cost estimation
 *       and multi-venue optimization overhead. If slow for single-venue,
 *       consider a fast path: skip optimizer, just walkBook → return single leg.
 *
 *  3. VERIFY DFlow WS without API key
 *     ─ Test: can the browser connect to
 *       wss://dev-prediction-markets-api.dflow.net/api/v1/ws
 *       without the x-api-key header?
 *     ─ Test: can GET /api/v1/orderbook/<ticker> be called without the key?
 *     ─ If either fails, the frontend falls back to server's /ws/venue-prices
 *       for DFlow automatically (dflowFallback flag).
 * ═══════════════════════════════════════════════════════════════════
 */
