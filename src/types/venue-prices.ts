/** Venue price types for live cross-venue best bid/ask from predictions-api. */

export interface VenuePriceTeam {
	bestBid: number | null;
	bestAsk: number | null;
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
