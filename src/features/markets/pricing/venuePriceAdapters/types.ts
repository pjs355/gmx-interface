import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";

export type BboPolicy = "standard" | "ladderFirst" | "restingOnly" | "kalshiDflow";

export type VenueQuotes = {
	askA: number | null;
	askB: number | null;
	bidA: number | null;
	bidB: number | null;
};

export type VenueMonitorBooks = {
	bookA: OrderbookData | null | undefined;
	bookB: OrderbookData | null | undefined;
};

/**
 * Display-only adapter: one venue row in the cross-venue strip / listing rollup.
 *
 * `bboPolicy`:
 * - `standard` — scalar BBO, then resting ladder (Poly, Limitless, Predict).
 * - `ladderFirst` — resting ladder, then scalar.
 * - `kalshiDflow` — whole-contract ladder touch (≥1 contract), then scalar (Kalshi/DFlow).
 * - `restingOnly` — ladder only, ignore bare BBO (LevelUp).
 */
export type VenuePriceAdapter = {
	id: string;
	label: string;
	/** Lower sorts first (LevelUp = 0). */
	sortPriority: number;
	bboPolicy: BboPolicy;
	isMapped(m: MatchedMarket): boolean;
	books(m: MatchedMarket): VenueMonitorBooks;
	/** When false, row is omitted (default: true). */
	shouldShowRow?(m: MatchedMarket, quotes: VenueQuotes): boolean;
};
