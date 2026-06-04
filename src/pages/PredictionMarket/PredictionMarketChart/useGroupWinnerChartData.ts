import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { PricePoint } from "@/services/api/exchangePriceHistoryService";
import { fetchChartPriceHistoryBatch } from "@/services/api/serverChartPriceHistoryService";
import { findMatchedMarketByConditionId } from "@/services/api/matchDataService";
import { mergeExchangeTimeSeries } from "@/features/markets/chart/mergeExchangeTimeSeries";
import { findOddsMatchedMarket } from "@/features/markets/odds-monitor/findOddsMatchedMarket";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import type { OrderbookData } from "@/types/odds-monitor";
import type { TimeRange } from "./types";

/** One team leg to chart (its own binary Polymarket market). */
export interface GroupWinnerLegInput {
	/** Stable identifier (the leg's polymarketMarketId). */
	key: string;
	conditionId?: string;
	polymarketMarketId?: string;
	label: string;
	color: string;
	flagUrl: string | null;
}

export interface GroupWinnerTeamSeries {
	/** Recharts dataKey for this team's line (`t0`, `t1`, …). */
	dataKey: string;
	label: string;
	color: string;
	flagUrl: string | null;
	/** Latest best-YES percentage (0–100) for the header. */
	latest: number | null;
}

export interface GroupWinnerChartPoint {
	timestamp: number;
	[teamKey: string]: number;
}

export interface GroupWinnerChartResult {
	data: GroupWinnerChartPoint[];
	teams: GroupWinnerTeamSeries[];
	loading: boolean;
	error: string | null;
}

const LIVE_BUCKET_SEC = 3;

/** Cheapest (best) YES ask across a venue book, as a 0–100 percentage. */
function bestAskDisplay100(book: OrderbookData | null | undefined): number | undefined {
	if (!book) return undefined;
	let x: number | undefined;
	const asks = book.asks?.filter((l) => Number(l.size) > 0) ?? [];
	if (asks.length > 0) {
		const prices = asks.map((l) => Number(l.price)).filter((p) => Number.isFinite(p));
		if (prices.length > 0) x = Math.min(...prices);
	}
	if (x == null && book.bestAsk != null) {
		const b = Number(book.bestAsk);
		if (Number.isFinite(b)) x = b;
	}
	if (x == null || !Number.isFinite(x) || x < 0.005 || x > 0.995) return undefined;
	return x * 100;
}

/** Per-leg best-YES history: min across venues per bucket (reuses the merge pipeline). */
function bestYesHistory(
	bundle: {
		poly: PricePoint[];
		kalshi: PricePoint[];
		predict: PricePoint[];
		limitless: PricePoint[];
	},
	range: TimeRange,
): Map<number, number> {
	const series: { venue: "polymarket" | "kalshi" | "predictFun" | "limitless"; points: PricePoint[] }[] = [];
	if (bundle.poly.length > 0) series.push({ venue: "polymarket", points: bundle.poly });
	if (bundle.kalshi.length > 0) series.push({ venue: "kalshi", points: bundle.kalshi });
	if (bundle.predict.length > 0) series.push({ venue: "predictFun", points: bundle.predict });
	if (bundle.limitless.length > 0) series.push({ venue: "limitless", points: bundle.limitless });
	const merged = series.length > 0 ? mergeExchangeTimeSeries(series, range) : [];
	const out = new Map<number, number>();
	for (const p of merged) {
		if (typeof p.bestOdds === "number" && Number.isFinite(p.bestOdds)) {
			out.set(p.timestamp, p.bestOdds);
		}
	}
	return out;
}

function legsSignature(legs: GroupWinnerLegInput[]): string {
	return legs.map((l) => `${l.key}:${l.conditionId ?? ""}`).join("|");
}

/**
 * N-line chart data for a FIFA "Group X Winner" prop. Each team leg is its own
 * binary Polymarket market, so we fetch each leg's cross-venue history, reduce it
 * to that team's best-YES line (cheapest ask across venues per bucket), and merge
 * all teams onto one forward-filled timeline. A live tail per leg is layered from
 * the OddsMonitor matched-market BBO (same WS as the moneyline chart).
 */
export function useGroupWinnerChartData(
	legs: GroupWinnerLegInput[],
	timeRange: TimeRange,
): GroupWinnerChartResult {
	const { getAccessToken } = usePrivy();
	const getAccessTokenRef = useRef(getAccessToken);
	getAccessTokenRef.current = getAccessToken;
	const stableGetToken = useCallback(() => getAccessTokenRef.current().catch(() => null), []);

	const sig = useMemo(() => legsSignature(legs), [legs]);
	const cancelRef = useRef(0);

	const [history, setHistory] = useState<Record<string, Map<number, number>>>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (legs.length === 0) {
			setHistory({});
			setLoading(false);
			return;
		}
		const id = ++cancelRef.current;
		setLoading(true);
		setError(null);

		(async () => {
			try {
				const token = await stableGetToken();
				if (cancelRef.current !== id) return;
				const next: Record<string, Map<number, number>> = {};
				await Promise.all(
					legs.map(async (leg) => {
						const cid = (leg.conditionId ?? "").trim();
						const mm = cid ? ((await findMatchedMarketByConditionId(cid)) ?? null) : null;
						const res = await fetchChartPriceHistoryBatch(mm, timeRange, token);
						if (!res.ok) {
							next[leg.key] = new Map();
							return;
						}
						next[leg.key] = bestYesHistory(res.data, timeRange);
					}),
				);
				if (cancelRef.current !== id) return;
				setHistory(next);
				setLoading(false);
			} catch {
				if (cancelRef.current === id) {
					setError("Failed to fetch chart data");
					setLoading(false);
				}
			}
		})();

		return () => {
			cancelRef.current += 1;
		};
	}, [sig, timeRange, stableGetToken]);

	// Live tail: best YES per leg from the OddsMonitor matched markets.
	const { appState } = useOddsMonitor();
	const [liveTick, setLiveTick] = useState(0);
	useEffect(() => {
		if (legs.length === 0) return;
		const h = window.setInterval(() => setLiveTick((n) => n + 1), LIVE_BUCKET_SEC * 1000);
		return () => window.clearInterval(h);
	}, [legs.length]);

	const liveByLeg = useMemo(() => {
		const out: Record<string, number> = {};
		if (!appState?.markets?.length) return out;
		for (const leg of legs) {
			const key = (leg.polymarketMarketId ?? leg.key).trim();
			if (!key) continue;
			const m = findOddsMatchedMarket(appState.markets, key, undefined);
			if (!m) continue;
			const candidates = [
				bestAskDisplay100(m.polyPriceA as OrderbookData),
				bestAskDisplay100(m.dflowPriceA as OrderbookData),
				bestAskDisplay100(m.predictFunPriceA as OrderbookData),
				bestAskDisplay100(m.limitlessPriceA as OrderbookData),
			].filter((v): v is number => typeof v === "number" && Number.isFinite(v));
			if (candidates.length > 0) out[leg.key] = Math.min(...candidates);
		}
		return out;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [appState?.markets, appState?.timestamp, liveTick, sig]);

	const { data, teams } = useMemo(() => {
		const teamSeries: GroupWinnerTeamSeries[] = legs.map((leg, index) => ({
			dataKey: `t${index}`,
			label: leg.label,
			color: leg.color,
			flagUrl: leg.flagUrl,
			latest: null,
		}));

		// Union of all bucket timestamps across legs.
		const allTs = new Set<number>();
		for (const leg of legs) {
			const m = history[leg.key];
			if (m) for (const t of m.keys()) allTs.add(t);
		}
		const liveTs = Math.floor(Date.now() / 1000 / LIVE_BUCKET_SEC) * LIVE_BUCKET_SEC;
		const hasLive = Object.keys(liveByLeg).length > 0;
		if (hasLive) allTs.add(liveTs);

		const sorted = Array.from(allTs).sort((a, b) => a - b);
		const lastSeen: number[] = legs.map(() => Number.NaN);
		const points: GroupWinnerChartPoint[] = [];

		for (const ts of sorted) {
			const point: GroupWinnerChartPoint = { timestamp: ts };
			legs.forEach((leg, index) => {
				const m = history[leg.key];
				const val = m?.get(ts);
				if (typeof val === "number" && Number.isFinite(val)) {
					lastSeen[index] = val;
				}
				if (hasLive && ts === liveTs && typeof liveByLeg[leg.key] === "number") {
					lastSeen[index] = liveByLeg[leg.key];
				}
				if (Number.isFinite(lastSeen[index])) {
					point[`t${index}`] = lastSeen[index];
				}
			});
			points.push(point);
		}

		// Latest value per team for the header.
		legs.forEach((_, index) => {
			for (let i = points.length - 1; i >= 0; i -= 1) {
				const v = points[i][`t${index}`];
				if (typeof v === "number" && Number.isFinite(v)) {
					teamSeries[index].latest = v;
					break;
				}
			}
		});

		return { data: points, teams: teamSeries };
	}, [legs, history, liveByLeg]);

	return {
		data,
		teams,
		loading,
		error: error ?? (!loading && data.length === 0 ? "No price data available yet" : null),
	};
}
