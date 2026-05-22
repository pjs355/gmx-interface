/** Normalized DFlow Pond quote economics (server-side overlay on POST /api/sor/route). */
export interface DflowOrderQuoteResult {
	/** Outcome contracts received (buy) / sold (sell). */
	contracts: number;
	/** USDC spent (buy) / received (sell), in human dollars. */
	usd: number;
	/** Average fill price per contract in (0, 1). */
	pricePerContract: number;
	code?: string;
}
