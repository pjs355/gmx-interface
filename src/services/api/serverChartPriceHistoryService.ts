/**
 * Server-side chart history (POST batch on predictions API).
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
	limitless: PricePoint[];
	limitlessB: PricePoint[];
}

export const EMPTY_CHART_VENUE_BUNDLE: ChartHistoryVenueBundle = {
	poly: [],
	polyB: [],
	kalshi: [],
	kalshiB: [],
	predict: [],
	predictB: [],
	limitless: [],
	limitlessB: [],
};

export type ChartPriceHistoryBatchResult =
	| { ok: true; data: ChartHistoryVenueBundle }
	| { ok: false; kind: "http"; status: number }
	| { ok: false; kind: "not_found" }
	| { ok: false; kind: "malformed" }
	| { ok: false; kind: "network" };

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
	if (root.success === false) return null;
	const data = root.data;
	if (!data || typeof data !== "object") return null;

	const d = data as Record<string, unknown>;
	const poly = normalizePointArray(d.poly ?? d.polyA);
	const polyB = normalizePointArray(d.polyB);
	const kalshi = normalizePointArray(d.kalshi ?? d.kalshiA ?? d.dflowA);
	const kalshiB = normalizePointArray(d.kalshiB ?? d.dflowB);
	const predict = normalizePointArray(d.predict ?? d.predictFun ?? d.predictA);
	const predictB = normalizePointArray(d.predictB ?? d.predictFunB);
	const limitless = normalizePointArray(d.limitless ?? d.limitlessA);
	const limitlessB = normalizePointArray(d.limitlessB);

	return { poly, polyB, kalshi, kalshiB, predict, predictB, limitless, limitlessB };
}

/**
 * One round-trip historical chart load.
 * On HTTP success with a valid payload shape, returns `ok: true` even when every series is empty.
 */
export async function fetchChartPriceHistoryBatch(
	mm: MatchedMarketExchange | null,
	range: TimeRange,
	authToken: string | null,
	signal?: AbortSignal,
): Promise<ChartPriceHistoryBatchResult> {
	if (!mm) {
		return { ok: true, data: { ...EMPTY_CHART_VENUE_BUNDLE } };
	}
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
		predictFun: mm.predictFun,
		/** Required for chart batch to fetch Limitless REST history without extra inference latency. */
		limitless: mm.limitless,
	};

	try {
		const res = await fetch(url, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
			signal,
		});
		if (res.status === 404) return { ok: false, kind: "not_found" };
		if (!res.ok) return { ok: false, kind: "http", status: res.status };
		const json: unknown = await res.json();
		const parsed = parseBatchPayload(json);
		if (!parsed) return { ok: false, kind: "malformed" };
		return { ok: true, data: parsed };
	} catch (err) {
		if (err instanceof DOMException && err.name === "AbortError") {
			return { ok: false, kind: "network" };
		}
		return { ok: false, kind: "network" };
	}
}
