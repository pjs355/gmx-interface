/**
 * Server-side batch chart history (predictions API) — replaces parallel browser calls to CLOB/DFlow/Kalshi.
 */
import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";
import type { TimeRange } from "@/pages/PredictionMarket/PredictionMarketChart/types";
import type { MatchedMarketExchange } from "@/services/api/matchDataService";
import type { PricePoint } from "@/services/api/exchangePriceHistoryService";

export type { TimeRange };

export interface VenueDataBatch {
	poly: PricePoint[];
	polyB: PricePoint[];
	kalshi: PricePoint[];
	kalshiB: PricePoint[];
	predict: PricePoint[];
	predictB: PricePoint[];
}

export async function fetchChartPriceHistoryBatch(
	mm: MatchedMarketExchange | null,
	range: TimeRange,
	authToken?: string | null,
): Promise<VenueDataBatch> {
	const base = getPredictionApiBaseUrl().replace(/\/$/, "");
	const dflowKalshi =
		mm?.dflow != null
			? {
					dflow: {
						tickerA: mm.dflow.tickerA,
						tickerB: mm.dflow.tickerB,
					},
				}
			: mm?.kalshi != null
				? {
						kalshi: {
							eventTicker: mm.kalshi.eventTicker,
							tickerA: mm.kalshi.tickerA,
							tickerB: mm.kalshi.tickerB,
						},
					}
				: null;

	const body = {
		range,
		polymarket: {
			tokenIdA: mm?.polyTokenIdA,
			tokenIdB: mm?.polyTokenIdB,
		},
		dflowKalshi,
		predictFun: mm?.predictFun
			? {
					marketIdA: mm.predictFun.marketIdA,
					marketIdB: mm.predictFun.marketIdB,
					singleMarket: mm.predictFun.singleMarket,
				}
			: undefined,
	};

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
	};
	if (authToken) {
		headers.Authorization = `Bearer ${authToken}`;
	}

	const res = await fetch(`${base}/api/chart-price-history/batch`, {
		method: "POST",
		headers,
		body: JSON.stringify(body),
	});

	if (!res.ok) {
		throw new Error(`chart-price-history/batch: ${res.status}`);
	}

	const json = (await res.json()) as {
		success?: boolean;
		error?: string;
		data?: Partial<VenueDataBatch>;
	};

	if (!json.success || !json.data) {
		throw new Error(json.error ?? "chart batch failed");
	}

	const d = json.data;
	return {
		poly: d.poly ?? [],
		polyB: d.polyB ?? [],
		kalshi: d.kalshi ?? [],
		kalshiB: d.kalshiB ?? [],
		predict: d.predict ?? [],
		predictB: d.predictB ?? [],
	};
}
