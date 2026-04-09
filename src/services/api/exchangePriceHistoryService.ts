/**
 * Exchange Price History Service
 *
 * Fetches price history from Polymarket, DFlow/Kalshi, and Predict.fun public APIs.
 * Each function returns normalized { timestamp, price }[] arrays where price is 0-1.
 * All functions return [] on error — never throw.
 */

import type { TimeRange } from "@/pages/PredictionMarket/PredictionMarketChart/types";
import { getPredictTimeseriesApiBaseUrl } from "@/config/oddsMonitorBase";

export type { TimeRange };

export interface PricePoint {
	timestamp: number; // unix seconds
	price: number; // 0-1
}

const POLYMARKET_CLOB = "https://clob.polymarket.com";
const DFLOW_API = "https://dev-prediction-markets-api.dflow.net";

const RANGE_SECONDS: Record<TimeRange, number> = {
	"1h": 3600,
	"1d": 86400,
	all: 86400 * 90,
};

const CANDLESTICK_PERIOD: Record<TimeRange, number> = {
	"1h": 1,
	"1d": 60,
	all: 1440,
};

export interface PricePointAB {
	a: PricePoint[];
	b: PricePoint[];
}

type RawCandle = {
	end_period_ts: number;
	yes_price?: { open?: number; close?: number };
	no_price?: { open?: number; close?: number };
	price?: number | { close?: number; open?: number };
	yes_ask?: { close?: number };
};

function extractCandlePrice(c: RawCandle): number | null {
	if (c.yes_price?.close != null) return c.yes_price.close;
	if (typeof c.price === "number") return c.price;
	if (typeof c.price === "object" && c.price?.close != null) return c.price.close;
	if (c.yes_ask?.close != null) return c.yes_ask.close;
	return null;
}

function extractCandlePriceB(c: RawCandle): number | null {
	if (c.no_price?.close != null) return c.no_price.close;
	return null;
}

function parseCandlesticks(candles: RawCandle[]): PricePoint[] {
	return candles
		.map((c) => {
			const raw = extractCandlePrice(c);
			if (raw == null || !c.end_period_ts) return null;
			return { timestamp: c.end_period_ts, price: raw / 100 };
		})
		.filter((p): p is PricePoint => p !== null);
}

function parseCandlesticksAB(candles: RawCandle[]): PricePointAB {
	const a: PricePoint[] = [];
	const b: PricePoint[] = [];
	for (const c of candles) {
		if (!c.end_period_ts) continue;
		const rawA = extractCandlePrice(c);
		if (rawA != null) a.push({ timestamp: c.end_period_ts, price: rawA / 100 });
		const rawB = extractCandlePriceB(c);
		if (rawB != null) b.push({ timestamp: c.end_period_ts, price: rawB / 100 });
	}
	return { a, b };
}

/**
 * Polymarket: GET /prices-history
 * Returns { history: [{ t, p }] } where p is 0-1.
 */
export async function fetchPolymarketPriceHistory(
	tokenId: string,
	range: TimeRange = "all",
): Promise<PricePoint[]> {
	const intervalMap: Record<TimeRange, string> = {
		"1h": "1h",
		"1d": "1d",
		all: "max",
	};
	const fidelityMap: Record<TimeRange, number> = {
		"1h": 1,
		"1d": 10,
		all: 60,
	};

	const url = `${POLYMARKET_CLOB}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${intervalMap[range]}&fidelity=${fidelityMap[range]}`;

	try {
		const res = await fetch(url);
		if (!res.ok) return [];

		const data = await res.json();
		const history: Array<{ t: number; p: number }> = data.history ?? data ?? [];
		return history.map((h) => ({ timestamp: h.t, price: h.p }));
	} catch {
		return [];
	}
}

/**
 * DFlow candlestick relay — passes through to Kalshi but resolves series_ticker
 * automatically. Returns both YES (a) and NO (b) prices from the same response.
 */
export async function fetchDFlowPriceHistory(
	ticker: string,
	range: TimeRange = "all",
): Promise<PricePointAB> {
	const now = Math.floor(Date.now() / 1000);
	const startTs = now - RANGE_SECONDS[range];
	const url = `${DFLOW_API}/api/v1/market/${encodeURIComponent(ticker)}/candlesticks?startTs=${startTs}&endTs=${now}&periodInterval=${CANDLESTICK_PERIOD[range]}`;

	try {
		const res = await fetch(url);
		if (!res.ok) return { a: [], b: [] };
		const data = await res.json();
		return parseCandlesticksAB(data.candlesticks ?? []);
	} catch {
		return { a: [], b: [] };
	}
}

/**
 * Kalshi direct (legacy fallback for markets not yet on DFlow).
 * Returns both YES (a) and NO (b) prices from the same response.
 */
export async function fetchKalshiPriceHistory(
	eventTicker: string,
	tickerA: string,
	range: TimeRange = "all",
): Promise<PricePointAB> {
	const now = Math.floor(Date.now() / 1000);
	const startTs = now - RANGE_SECONDS[range];
	const baseUrl = "https://api.elections.kalshi.com/trade-api/v2";
	const url = `${baseUrl}/series/${encodeURIComponent(eventTicker)}/markets/${encodeURIComponent(tickerA)}/candlesticks?start_ts=${startTs}&end_ts=${now}&period_interval=${CANDLESTICK_PERIOD[range]}`;

	try {
		const res = await fetch(url);
		if (!res.ok) return { a: [], b: [] };
		const data = await res.json();
		return parseCandlesticksAB(data.candlesticks ?? []);
	} catch {
		return { a: [], b: [] };
	}
}

export type KalshiDflowMatchSlice = {
	dflow?: { tickerA: string; tickerB?: string };
	kalshi?: { eventTicker: string; tickerA: string; tickerB?: string };
} | null;

/**
 * Team A = YES from primary ticker; team B = YES from tickerB when present, else NO from A-market candles.
 */
export async function fetchKalshiDflowPriceHistoryAB(
	mm: KalshiDflowMatchSlice,
	range: TimeRange,
): Promise<PricePointAB> {
	const empty: PricePointAB = { a: [], b: [] };
	if (!mm) return empty;

	if (mm.dflow) {
		const abA = await fetchDFlowPriceHistory(mm.dflow.tickerA, range);
		if (mm.dflow.tickerB) {
			const abB = await fetchDFlowPriceHistory(mm.dflow.tickerB, range);
			return { a: abA.a, b: abB.a.length > 0 ? abB.a : abA.b };
		}
		return abA;
	}

	if (mm.kalshi) {
		const { eventTicker, tickerA, tickerB } = mm.kalshi;
		const abA = await fetchKalshiPriceHistory(eventTicker, tickerA, range);
		if (tickerB) {
			const abB = await fetchKalshiPriceHistory(eventTicker, tickerB, range);
			return { a: abA.a, b: abB.a.length > 0 ? abB.a : abA.b };
		}
		return abA;
	}

	return empty;
}

const PREDICT_RESOLUTION: Record<TimeRange, string> = {
	"1h": "1m",
	"1d": "5m",
	all: "1d",
};

/**
 * Predict.fun timeseries via backend proxy (adds x-api-key server-side).
 *
 * API: GET /v1/markets/{id}/timeseries
 *   metric     = "chance" (only valid enum value)
 *   from       = unix seconds (required)
 *   to         = unix seconds (optional, defaults to now)
 *   resolution = 1m | 5m | 1h | 1d | 1w | 1M
 *   limit      = 1-1000 (default 150)
 * Response: { data: { series: [{ x: unixSec, y: value }] } }
 *
 * Empty series is a valid response (no trades in window), so no fallback is needed.
 */
export async function fetchPredictFunPriceHistory(
	marketId: string,
	range: TimeRange = "all",
	authToken?: string | null,
): Promise<PricePoint[]> {
	const base = getPredictTimeseriesApiBaseUrl();
	const now = Math.floor(Date.now() / 1000);
	const from = now - RANGE_SECONDS[range];
	const resolution = PREDICT_RESOLUTION[range];
	const params = new URLSearchParams({
		metric: "chance",
		from: String(from),
		to: String(now),
		resolution,
		limit: "1000",
	});
	const path = `/api/predict/markets/${encodeURIComponent(marketId)}/timeseries?${params}`;
	const url = base === "" && typeof window !== "undefined" ? path : `${base.replace(/\/$/, "")}${path}`;

	try {
		const headers: Record<string, string> = {};
		if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
		const res = await fetch(url, { headers });
		if (!res.ok) return [];

		const data = await res.json();
		const series: Array<{ x: number; y: number }> = data?.data?.series ?? [];
		if (!Array.isArray(series) || series.length === 0) return [];

		return series
			.map((pt) => {
				const price = pt.y > 1 ? pt.y / 100 : pt.y;
				return { timestamp: pt.x, price };
			})
			.filter((pt) => pt.timestamp > 0)
			.sort((a, b) => a.timestamp - b.timestamp);
	} catch {
		return [];
	}
}
