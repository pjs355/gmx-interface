/**
 * Server-side chart history (POST batch). Falls back to parallel public fetches when absent.
 */

import type { TimeRange } from "@/pages/PredictionMarket/PredictionMarketChart/types";
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import type { MatchedMarketExchange } from "@/services/api/matchDataService";
import type { PricePoint } from "@/services/api/exchangePriceHistoryService";

export interface ChartHistoryVenueBundle {
	poly: PricePoint[];
	polyB: PricePoint[];
	kalshi: PricePoint[];
	kalshiB: PricePoint[];
	predict: PricePoint[];
	predictB: PricePoint[];
}

function normalizePointArray(raw: unknown): PricePoint[] {
	if (!Array.isArray(raw)) return [];
	const out: PricePoint[] = [];
	for (const x of raw) {
		if (!x || typeof x !== "object") continue;
		const t = (x as { timestamp?: number }).timestamp;
		const p = (x as { price?: number }).price;
		if (typeof t !== "number" || typeof p !== "number") continue;
		out.push({ timestamp: t, price: p });
	}
	return out;
}

function parseBatchPayload(json: unknown): ChartHistoryVenueBundle | null {
	if (!json || typeof json !== "object") return null;
	const root = json as Record<string, unknown>;
	const data = (root.data ?? root) as Record<string, unknown>;
	if (!data || typeof data !== "object") return null;

	const poly = normalizePointArray(data.poly ?? data.polyA);
	const polyB = normalizePointArray(data.polyB);
	const kalshi = normalizePointArray(data.kalshi ?? data.kalshiA ?? data.dflowA);
	const kalshiB = normalizePointArray(data.kalshiB ?? data.dflowB);
	const predict = normalizePointArray(data.predict ?? data.predictFun ?? data.predictA);
	const predictB = normalizePointArray(data.predictB ?? data.predictFunB);

	const hasAny =
		poly.length > 0 ||
		polyB.length > 0 ||
		kalshi.length > 0 ||
		kalshiB.length > 0 ||
		predict.length > 0 ||
		predictB.length > 0;
	if (!hasAny) return null;

	return { poly, polyB, kalshi, kalshiB, predict, predictB };
}

/**
 * One round-trip historical chart load. Returns null if route missing, non-OK, or empty payload.
 */
export async function fetchChartPriceHistoryBatch(
	mm: MatchedMarketExchange | null,
	range: TimeRange,
	authToken: string | null,
): Promise<ChartHistoryVenueBundle | null> {
	if (!mm) return null;
	const base = getPredictionApiBaseUrl().replace(/\/$/, "");
	const url = `${base}/api/chart-price-history/batch`;

	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (authToken) headers.Authorization = `Bearer ${authToken}`;

	const body = {
		range,
		pandaMatchId: mm.pandaMatchId,
		umbrellaId: mm.umbrellaId,
		polyTokenIdA: mm.polyTokenIdA,
		polyTokenIdB: mm.polyTokenIdB,
		dflow: mm.dflow,
		kalshi: mm.kalshi,
		predictFun: mm.predictFun,
	};

	try {
		const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
		if (res.status === 404) return null;
		if (!res.ok) return null;
		const json: unknown = await res.json();
		return parseBatchPayload(json);
	} catch {
		return null;
	}
}
