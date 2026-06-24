import type { OrderbookData, SnapshotStatus } from "@/types/odds-monitor";
import { applyKalshiVenueSnapshotMerge } from "@/features/markets/pricing/kalshiSnapshotMerge";

/** Wire shape for venue-prices / venue_bbo WebSocket payloads. */
export interface VenuePriceTeam {
	bestBid: number | null;
	bestAsk: number | null;
	indicativeMid?: number | null;
	hasAskLiquidity?: boolean;
	/** Present on full `venue_prices` payloads only — omitted on `venue_bbo`. */
	bids?: { price: number; size: number }[];
	asks?: { price: number; size: number }[];
	bidLevels?: number;
	askLevels?: number;
	totalBidLiquidity?: number;
	totalAskLiquidity?: number;
}

export interface VenuePriceSnapshotWire {
	pandaMatchId: string;
	venue: string;
	teamA: VenuePriceTeam;
	teamB: VenuePriceTeam;
	timestamp: number;
	status?: SnapshotStatus;
}

export function teamToOrderbookData(
	team: VenuePriceTeam,
	snapshotStatus?: SnapshotStatus,
): OrderbookData {
	const data: OrderbookData = {
		bestBid: team.bestBid,
		bestAsk: team.bestAsk,
		lastUpdated: Date.now(),
		snapshotStatus,
	};
	if (team.bids != null) data.bids = team.bids;
	if (team.asks != null) data.asks = team.asks;
	if (team.bidLevels != null) data.bidLevels = team.bidLevels;
	if (team.askLevels != null) data.askLevels = team.askLevels;
	if (team.totalBidLiquidity != null) data.totalBidLiquidity = team.totalBidLiquidity;
	if (team.totalAskLiquidity != null) data.totalAskLiquidity = team.totalAskLiquidity;
	return data;
}

export function venueSnapshotsFromMessage(message: {
	type?: string;
	data?: unknown;
	pandaMatchId?: string;
	venue?: string;
	teamA?: VenuePriceTeam;
	teamB?: VenuePriceTeam;
	timestamp?: number;
	status?: SnapshotStatus;
}): VenuePriceSnapshotWire[] {
	if (message.type === "venue_prices" || message.type === "venue_bbo") {
		if (Array.isArray(message.data)) {
			return message.data as VenuePriceSnapshotWire[];
		}
		if (
			typeof message.pandaMatchId === "string" &&
			message.pandaMatchId &&
			typeof message.venue === "string" &&
			message.teamA &&
			message.teamB
		) {
			return [
				{
					pandaMatchId: message.pandaMatchId,
					venue: message.venue,
					teamA: message.teamA,
					teamB: message.teamB,
					timestamp: typeof message.timestamp === "number" ? message.timestamp : Date.now(),
					status: message.status,
				},
			];
		}
	}
	return [];
}

export type VenuePriceFieldPair = [string, string];

/**
 * Merge venue-prices WS snapshots into market rows using a venue → [fieldA, fieldB] map.
 */
export function applyVenueSnapshotsToMarkets<T extends Record<string, unknown>>(
	markets: Map<string, T>,
	snapshots: VenuePriceSnapshotWire[],
	resolveFieldPairs: (venueWire: string) => VenuePriceFieldPair | undefined,
): boolean {
	let changed = false;
	for (const snap of snapshots) {
		const pid = String(snap.pandaMatchId ?? "").trim();
		if (!pid) continue;
		const market = markets.get(pid);
		if (!market) continue;

		const fieldPairs = resolveFieldPairs(snap.venue);
		if (!fieldPairs) continue;

		const dataA = teamToOrderbookData(snap.teamA, snap.status);
		const dataB = teamToOrderbookData(snap.teamB, snap.status);
		const [fieldA, fieldB] = fieldPairs;
		const venueKey = snap.venue.toLowerCase();
		if (venueKey === "dflow" || venueKey === "kalshi") {
			const prevA = market[fieldA] as OrderbookData | null | undefined;
			const prevB = market[fieldB] as OrderbookData | null | undefined;
			const { assignA, assignB } = applyKalshiVenueSnapshotMerge(prevA, prevB, dataA, dataB);
			(market as Record<string, unknown>)[fieldA] = assignA;
			(market as Record<string, unknown>)[fieldB] = assignB;
		} else {
			(market as Record<string, unknown>)[fieldA] = dataA;
			(market as Record<string, unknown>)[fieldB] = dataB;
		}
		changed = true;
	}
	return changed;
}
