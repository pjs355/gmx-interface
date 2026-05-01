/** Venue price types for live cross-venue best bid/ask from predictions-api. */

export interface VenuePriceTeam {
	bestBid: number | null;
	bestAsk: number | null;
	bids?: { price: number; size: number }[];
	asks?: { price: number; size: number }[];
	bidLevels?: number;
	askLevels?: number;
	/** Contracts at the best bid only (touch), not cumulative depth. */
	totalBidLiquidity?: number;
	/** Contracts at the best ask only (touch), not cumulative depth. */
	totalAskLiquidity?: number;
}

export interface VenuePriceSnapshot {
	pandaMatchId: string;
	venue: string;
	teamA: VenuePriceTeam;
	teamB: VenuePriceTeam;
	timestamp: number;
}

export interface VenuePriceState {
	connected: boolean;
	prices: Map<string, VenuePriceSnapshot[]>;
}
