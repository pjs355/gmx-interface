/**
 * Venue-aware position types.
 *
 * `VenueId` is an extensible union — add `"kalshi" | "predictfun"` etc.
 * `VenuePosition` is the normalised shape every venue hook must produce so
 * the Positions page and PortfolioContext can aggregate without caring
 * which exchange the shares live on.
 */

export type VenueId =
	| "levelup"
	| "polymarket"
	| "predictfun"
	| "dflow"
	| "limitless";

/** True when venue `marketStatus` indicates settlement (History tab, not open portfolio). */
export function isVenueMarketResolvedLike(
	status: string | null | undefined,
): boolean {
	const s = (status ?? "").toUpperCase().trim();
	return (
		s === "RESOLVED" ||
		s === "CLOSED" ||
		s === "SETTLED" ||
		s === "FINALIZED"
	);
}

/** Single label for History / Orders venue badges (matches existing copy). */
export function venueDisplayLabel(venue: VenueId): string {
	switch (venue) {
		case "levelup":
			return "LevelUp";
		case "polymarket":
			return "Polymarket";
		case "predictfun":
			return "Predict";
		case "dflow":
			return "Kalshi";
		case "limitless":
			return "Limitless";
	}
}

/** One venue fill for History trade expansion (e.g. each Polymarket activity row). */
export interface VenueHistoryFill {
	side: "buy" | "sell";
	shares: number;
	/** USDC leg: spent on buy, received on sell / redeem */
	usdc: number;
	/** ISO timestamp */
	tradedAt: string;
	sourceId?: string;
	/** Execution price when API provides it (probability 0–1 or cents) */
	price?: number | null;
	/**
	 * Kalshi/DFlow leg ticker from `onchain-trades` (`marketTicker`). Each fill may
	 * belong to a different leg market while the umbrella title stays “A vs B”.
	 */
	marketTicker?: string;
}

export interface VenuePosition {
	venue: VenueId;
	marketTitle: string;
	outcome: string;
	shares: number;
	avgPrice: number | null;
	currentPrice: number | null;
	cost: number | null;
	currentValue: number;
	pnl: number | null;
	pnlPercent: number | null;
	tokenId: string;
	/**
	 * DFlow / Kalshi metadata `eventTicker` from `markets/batch` (same key as
	 * `exchangeMatching.dflow.eventTicker` on umbrellas when present). For **live Positions**,
	 * matching still **must fall through to outcome `tokenId` (mint)** when no umbrella hits
	 * on event ticker alone — see `matchVenuePositionToUmbrella` (`venue === "dflow"`).
	 */
	dflowEventTicker?: string;
	conditionId?: string;
	eventSlug?: string;
	iconUrl?: string;
	redeemable?: boolean;
	/** Predict.fun numeric market id (used for settlement lookups) */
	numericMarketId?: number;
	/** Server-resolved LevelUp umbrella id (Predict positions proxy join). */
	levelUpUmbrellaId?: string;
	/** Optional display label from the same join (for UI only). */
	levelUpUmbrellaDisplayName?: string;
	/**
	 * DFlow/Kalshi: display label for the portfolio **Yes** / **No** column for this mint (see
	 * {@link portfolioColumnTeamLabels} / {@link patchDflowVenuePositionOutcomes}). Trade-history Side text.
	 */
	dflowTradeSideLabel?: string;
	/** Market-level status from the venue (e.g. "RESOLVED") */
	marketStatus?: string;
	/** Limitless `PositionMarket.closed` — when false, treat row as live for Positions vs History split. */
	marketClosed?: boolean;
	/** Limitless `PositionMarket.winningOutcomeIndex` (0 = YES, 1 = NO when set). */
	winningOutcomeIndex?: number | null;
	/** Per-outcome result: did this specific outcome win or lose? */
	outcomeResult?: "WON" | "LOST" | null;
	/**
	 * Stable id from venue trade-history rows (e.g. Limitless `HistoryEntry.id`).
	 * Used so History tab can show fills even when the same `tokenId` is still an open position.
	 */
	historySourceId?: string;
	/** ISO timestamp from venue trade-history API (`createdAt` / fill time). */
	historyTradeAt?: string;
	/** Buy/sell from venue trade-history when present. */
	historyTradeSide?: "buy" | "sell";
	/**
	 * When set, History expands one synthetic order per fill (buys + sells).
	 * Summary row still uses aggregated `shares` / `cost` / `pnl` on this position.
	 */
	historyFills?: VenueHistoryFill[];
	/**
	 * Polymarket Data API `negativeRisk` flag — true for multi-outcome (Match Winner,
	 * Election, etc.) NegRisk markets. Required so claim routing knows to call
	 * `NegRiskAdapter.redeemPositions(conditionId, [yesAmt, noAmt])` instead of
	 * the standard `CTF.redeemPositions(...)`. Without this the redeem tx mines
	 * but pays out 0 pUSD and the row vanishes from Winnings (silent claim bug).
	 */
	isNegRisk?: boolean;
}

/**
 * Venue-aware order type for the Orders tab.
 * Normalised shape so OrdersView can render any venue without branching.
 */
export interface VenueOrder {
	venue: VenueId;
	orderId: string;
	marketTitle: string;
	side: "buy" | "sell";
	position: "Yes" | "No";
	price: number;
	size: number;
	filled: boolean;
	tokenId: string;
	marketId?: string;
	/** Raw Predict.fun signed order for cancel payloads */
	rawOrder?: unknown;
}

/** Raw shape returned by `GET https://data-api.polymarket.com/positions?user=…` */
export interface PolymarketDataApiPosition {
	proxyWallet: string;
	asset: string;
	conditionId: string;
	size: number;
	avgPrice: number;
	initialValue: number;
	currentValue: number;
	cashPnl: number;
	percentPnl: number;
	totalBought: number;
	realizedPnl: number;
	percentRealizedPnl: number;
	curPrice: number;
	redeemable: boolean;
	mergeable: boolean;
	title: string;
	slug: string;
	icon: string;
	eventId: string;
	eventSlug: string;
	outcome: string;
	outcomeIndex: number;
	oppositeOutcome: string;
	oppositeAsset: string;
	endDate: string;
	negativeRisk: boolean;
}
