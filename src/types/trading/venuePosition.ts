/**
 * Venue-aware position types.
 *
 * `VenueId` is an extensible union — add `"kalshi" | "predictfun"` etc.
 * `VenuePosition` is the normalised shape every venue hook must produce so
 * the Positions page and PortfolioContext can aggregate without caring
 * which exchange the shares live on.
 */

export type VenueId = "levelup" | "polymarket" | "predictfun"; // extensible union

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
	conditionId?: string;
	eventSlug?: string;
	iconUrl?: string;
	redeemable?: boolean;
	/** Predict.fun numeric market id (used for settlement lookups) */
	numericMarketId?: number;
	/** Market-level status from the venue (e.g. "RESOLVED") */
	marketStatus?: string;
	/** Per-outcome result: did this specific outcome win or lose? */
	outcomeResult?: "WON" | "LOST" | null;
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
