/**
 * Exchange Price History Service
 *
 * Fetches price history from Polymarket, Kalshi, and Predict.fun public APIs.
 * Each function returns normalized { timestamp, price }[] arrays.
 */

export interface PricePoint {
	timestamp: number; // unix seconds
	price: number; // 0-1
}

export type TimeRange = "1h" | "6h" | "1d" | "1w" | "all";

const POLYMARKET_CLOB = "https://clob.polymarket.com";

/**
 * Polymarket: GET /prices-history?market={tokenId}&interval={interval}&fidelity={fidelity}
 * Returns { history: [{ t: number, p: number }] }
 */
export async function fetchPolymarketPriceHistory(
	tokenId: string,
	range: TimeRange = "all",
): Promise<PricePoint[]> {
	const intervalMap: Record<TimeRange, string> = {
		"1h": "1h",
		"6h": "6h",
		"1d": "1d",
		"1w": "1w",
		all: "max",
	};
	const fidelityMap: Record<TimeRange, number> = {
		"1h": 1,
		"6h": 5,
		"1d": 10,
		"1w": 60,
		all: 60,
	};

	const interval = intervalMap[range];
	const fidelity = fidelityMap[range];

	const url = `${POLYMARKET_CLOB}/prices-history?market=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`;
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Polymarket prices-history returned ${res.status}`);
	}

	const data = await res.json();
	const history: Array<{ t: number; p: number }> = data.history ?? data ?? [];
	return history.map((h) => ({
		timestamp: h.t,
		price: h.p,
	}));
}

/**
 * Kalshi: GET /trade-api/v2/markets/{ticker}/candlesticks
 * Requires series_ticker which we derive from the event ticker.
 *
 * Falls back to the historical endpoint if the live one returns 404.
 */
export async function fetchKalshiPriceHistory(
	eventTicker: string,
	tickerA: string,
	range: TimeRange = "all",
): Promise<PricePoint[]> {
	const now = Math.floor(Date.now() / 1000);
	const rangeSeconds: Record<TimeRange, number> = {
		"1h": 3600,
		"6h": 21600,
		"1d": 86400,
		"1w": 604800,
		all: 86400 * 90,
	};
	const periodMap: Record<TimeRange, number> = {
		"1h": 1,
		"6h": 60,
		"1d": 60,
		"1w": 1440,
		all: 1440,
	};

	const startTs = now - rangeSeconds[range];
	const period = periodMap[range];

	const baseUrl = "https://api.elections.kalshi.com/trade-api/v2";
	const url = `${baseUrl}/series/${encodeURIComponent(eventTicker)}/markets/${encodeURIComponent(tickerA)}/candlesticks?start_ts=${startTs}&end_ts=${now}&period_interval=${period}`;

	try {
		const res = await fetch(url);
		if (!res.ok) {
			console.error("error", new Error(`Kalshi candlesticks returned ${res.status}`));
			return [];
		}

		const data = await res.json();
		const candles: Array<{
			end_period_ts: number;
			yes_price?: { open?: number; close?: number };
			price?: number;
		}> = data.candlesticks ?? [];

		return candles
			.filter((c) => {
				const p = c.yes_price?.close ?? c.price;
				return p != null;
			})
			.map((c) => ({
				timestamp: c.end_period_ts,
				price: (c.yes_price?.close ?? c.price ?? 0) / 100,
			}));
	} catch (err) {
		console.error("error", err);
		return [];
	}
}

/**
 * Predict.fun: GET /api/v1/markets/{marketId}/activity
 * Derives price from executed trades. Not a true price history endpoint
 * but the best available.
 */
export async function fetchPredictFunPriceHistory(
	marketId: string,
	_range: TimeRange = "all",
): Promise<PricePoint[]> {
	const url = `https://api.predict.fun/api/v1/markets/${encodeURIComponent(marketId)}/activity?limit=500`;

	try {
		const res = await fetch(url);
		if (!res.ok) {
			console.error("error", new Error(`Predict.fun activity returned ${res.status}`));
			return [];
		}

		const data = await res.json();
		const activities: Array<{
			createdAt?: string;
			priceExecuted?: number;
			outcome?: string;
		}> = data.data ?? data.activities ?? data ?? [];

		return activities
			.filter((a) => a.priceExecuted != null && a.createdAt)
			.map((a) => ({
				timestamp: Math.floor(new Date(a.createdAt!).getTime() / 1000),
				price: (a.priceExecuted ?? 0) / 100,
			}))
			.sort((a, b) => a.timestamp - b.timestamp);
	} catch (err) {
		console.error("error", err);
		return [];
	}
}
