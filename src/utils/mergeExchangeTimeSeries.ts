import type { PricePoint } from "@/services/api/exchangePriceHistoryService";
import type { TimeRange, MergedExchangePoint } from "@/pages/PredictionMarket/PredictionMarketChart/types";

type VenueKey = "levelUp" | "polymarket" | "kalshi" | "predictFun";

const TEAM_A_KEYS: readonly VenueKey[] = ["levelUp", "polymarket", "kalshi", "predictFun"];

interface VenueSeries {
	venue: VenueKey;
	points: PricePoint[];
}

function bucketSize(range: TimeRange): number {
	switch (range) {
		case "1h":
			return 60;
		case "1d":
			return 900;
		case "all":
			return 86400;
		default:
			return 900;
	}
}

function setVenueValue(point: MergedExchangePoint, venue: VenueKey, value: number): void {
	switch (venue) {
		case "levelUp":    point.levelUp = value; break;
		case "polymarket":  point.polymarket = value; break;
		case "kalshi":      point.kalshi = value; break;
		case "predictFun":  point.predictFun = value; break;
	}
}

function getVenueValue(point: MergedExchangePoint, venue: VenueKey): number | undefined {
	switch (venue) {
		case "levelUp":    return point.levelUp;
		case "polymarket":  return point.polymarket;
		case "kalshi":      return point.kalshi;
		case "predictFun":  return point.predictFun;
	}
}

function setVenueBValue(point: MergedExchangePoint, venue: VenueKey, value: number): void {
	switch (venue) {
		case "levelUp":    point.levelUpB = value; break;
		case "polymarket":  point.polymarketB = value; break;
		case "kalshi":      point.kalshiB = value; break;
		case "predictFun":  point.predictFunB = value; break;
	}
}

function getVenueBValue(point: MergedExchangePoint, venue: VenueKey): number | undefined {
	switch (venue) {
		case "levelUp":    return point.levelUpB;
		case "polymarket":  return point.polymarketB;
		case "kalshi":      return point.kalshiB;
		case "predictFun":  return point.predictFunB;
	}
}

/**
 * Merge price series from multiple venues onto aligned time buckets.
 * Each venue's raw PricePoint[] is bucketed, then forward-filled so
 * every bucket after the venue's first data point has a value.
 *
 * seriesB provides real Team B data fetched from exchanges.
 * Best Odds lines are the minimum (cheapest YES) across all venues.
 */
export function mergeExchangeTimeSeries(
	series: VenueSeries[],
	range: TimeRange,
	seriesB?: VenueSeries[],
): MergedExchangePoint[] {
	const bucket = bucketSize(range);
	const snapTo = (ts: number) => Math.floor(ts / bucket) * bucket;

	const allTimestamps = new Set<number>();

	// Bucket Team A data
	const venueMaps = new Map<VenueKey, Map<number, number>>();
	for (const { venue, points } of series) {
		const m = new Map<number, number>();
		for (const pt of points) {
			const v = pt.price * 100;
			if (!Number.isFinite(v)) continue;
			const t = snapTo(pt.timestamp);
			m.set(t, v);
			allTimestamps.add(t);
		}
		venueMaps.set(venue, m);
	}

	// Bucket Team B data
	const venueBMaps = new Map<VenueKey, Map<number, number>>();
	if (seriesB) {
		for (const { venue, points } of seriesB) {
			const m = new Map<number, number>();
			for (const pt of points) {
				const v = pt.price * 100;
				if (!Number.isFinite(v)) continue;
				const t = snapTo(pt.timestamp);
				m.set(t, v);
				allTimestamps.add(t);
			}
			venueBMaps.set(venue, m);
		}
	}

	const sortedTimes = Array.from(allTimestamps).sort((a, b) => a - b);
	if (sortedTimes.length === 0) return [];

	const result: MergedExchangePoint[] = [];
	const lastSeenA: Partial<Record<VenueKey, number>> = {};
	const lastSeenB: Partial<Record<VenueKey, number>> = {};

	for (const ts of sortedTimes) {
		const point: MergedExchangePoint = { timestamp: ts };

		// Team A: forward-fill
		for (const { venue } of series) {
			const val = venueMaps.get(venue)?.get(ts);
			if (val !== undefined && Number.isFinite(val)) {
				lastSeenA[venue] = val;
			}
			if (lastSeenA[venue] !== undefined && Number.isFinite(lastSeenA[venue]!)) {
				setVenueValue(point, venue, lastSeenA[venue]!);
			}
		}

		// Team B: forward-fill from real data
		if (seriesB) {
			for (const { venue } of seriesB) {
				const val = venueBMaps.get(venue)?.get(ts);
				if (val !== undefined && Number.isFinite(val)) {
					lastSeenB[venue] = val;
				}
				if (lastSeenB[venue] !== undefined && Number.isFinite(lastSeenB[venue]!)) {
					setVenueBValue(point, venue, lastSeenB[venue]!);
				}
			}
		}

		// Best Odds Team A: cheapest YES across all venues with data (ignore NaN so min() stays valid)
		const teamAValues: number[] = [];
		for (const v of TEAM_A_KEYS) {
			const a = getVenueValue(point, v);
			if (a !== undefined && Number.isFinite(a)) teamAValues.push(a);
		}
		if (teamAValues.length > 0) {
			point.bestOdds = Math.min(...teamAValues);
		}

		// Best Odds Team B: min across any venue B on this point (same as per-venue lines)
		const teamBValues: number[] = [];
		for (const v of TEAM_A_KEYS) {
			const b = getVenueBValue(point, v);
			if (b !== undefined && Number.isFinite(b)) teamBValues.push(b);
		}
		if (teamBValues.length > 0) {
			point.bestOddsB = Math.min(...teamBValues);
		}

		result.push(point);
	}

	return result;
}
