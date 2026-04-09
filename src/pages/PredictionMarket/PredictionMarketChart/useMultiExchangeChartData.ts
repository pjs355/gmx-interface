import { useEffect, useMemo, useReducer, useRef, useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { TimeRange, MergedExchangePoint, ChartDataPoint } from "./types";
import type { PricePoint } from "@/services/api/exchangePriceHistoryService";
import {
	fetchPolymarketPriceHistory,
	fetchKalshiDflowPriceHistoryAB,
	fetchPredictFunPriceHistory,
} from "@/services/api/exchangePriceHistoryService";
import { fetchChartPriceHistoryBatch } from "@/services/api/serverChartPriceHistoryService";
import {
	type MatchedMarketExchange,
	findMatchedMarketByConditionId,
	findMatchedMarketByUmbrellaId,
} from "@/services/api/matchDataService";
import { mergeExchangeTimeSeries } from "@/utils/mergeExchangeTimeSeries";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import type { OrderbookData } from "@/types/odds-monitor";

export interface MultiExchangeChartResult {
	data: MergedExchangePoint[];
	loading: boolean;
	error: string | null;
	hasLevelUp: boolean;
	hasPolymarket: boolean;
	hasKalshi: boolean;
	hasPredictFun: boolean;
}

interface Args {
	conditionId?: string;
	umbrellaId?: string;
	pandaMatchId?: string;
	levelUpChartData: ChartDataPoint[];
	timeRange: TimeRange;
}

const LIVE_BUCKET_SEC = 3;

function bestAskDisplay100(book: OrderbookData | null | undefined): number | undefined {
	if (!book || book.bestAsk == null) return undefined;
	const x = Number(book.bestAsk);
	if (!Number.isFinite(x) || x < 0.005 || x > 0.995) return undefined;
	return x * 100;
}

function attachBestOdds(point: MergedExchangePoint): MergedExchangePoint {
	const aKeys = ["levelUp", "polymarket", "kalshi", "predictFun"] as const;
	const bKeys = ["levelUpB", "polymarketB", "kalshiB", "predictFunB"] as const;
	const teamA: number[] = [];
	for (const k of aKeys) {
		const v = point[k];
		if (typeof v === "number" && Number.isFinite(v)) teamA.push(v);
	}
	const teamB: number[] = [];
	for (const k of bKeys) {
		const v = point[k];
		if (typeof v === "number" && Number.isFinite(v)) teamB.push(v);
	}
	return {
		...point,
		...(teamA.length ? { bestOdds: Math.min(...teamA) } : {}),
		...(teamB.length ? { bestOddsB: Math.min(...teamB) } : {}),
	};
}

// --- Reducer for single-batch state updates ---

interface VenueData {
	poly: PricePoint[];
	polyB: PricePoint[];
	kalshi: PricePoint[];
	kalshiB: PricePoint[];
	predict: PricePoint[];
	predictB: PricePoint[];
}

interface State {
	matchedMarket: MatchedMarketExchange | null;
	matchResolved: boolean;
	venueData: VenueData;
	loading: boolean;
	error: string | null;
}

type Action =
	| { type: "MATCH_START" }
	| { type: "MATCH_RESOLVED"; market: MatchedMarketExchange | null }
	| { type: "FETCH_START" }
	| { type: "FETCH_DONE"; data: VenueData }
	| { type: "FETCH_CACHED"; data: VenueData }
	| { type: "FETCH_ERROR"; error: string };

const EMPTY_VENUE: VenueData = {
	poly: [],
	polyB: [],
	kalshi: [],
	kalshiB: [],
	predict: [],
	predictB: [],
};

function clamp01(p: number): number {
	return Math.min(1, Math.max(0, p));
}

function complementPricePoints(points: PricePoint[]): PricePoint[] {
	return points.map((pt) => ({
		timestamp: pt.timestamp,
		price: clamp01(1 - pt.price),
	}));
}

function reducer(state: State, action: Action): State {
	switch (action.type) {
		case "MATCH_START":
			return { ...state, matchResolved: false };
		case "MATCH_RESOLVED":
			return { ...state, matchedMarket: action.market, matchResolved: true };
		case "FETCH_START":
			return { ...state, loading: true, error: null };
		case "FETCH_DONE":
			return { ...state, venueData: action.data, loading: false, error: null };
		case "FETCH_CACHED":
			return { ...state, venueData: action.data, loading: false, error: null };
		case "FETCH_ERROR":
			return { ...state, loading: false, error: action.error };
		default:
			return state;
	}
}

const initialState: State = {
	matchedMarket: null,
	matchResolved: false,
	venueData: EMPTY_VENUE,
	loading: true,
	error: null,
};

type VenueCache = Map<TimeRange, VenueData>;

function venueDataHasPoints(v: VenueData): boolean {
	return (
		v.poly.length > 0 ||
		v.polyB.length > 0 ||
		v.kalshi.length > 0 ||
		v.kalshiB.length > 0 ||
		v.predict.length > 0 ||
		v.predictB.length > 0
	);
}

export function useMultiExchangeChartData({
	conditionId,
	umbrellaId,
	pandaMatchId,
	levelUpChartData,
	timeRange,
}: Args): MultiExchangeChartResult {
	const { getAccessToken } = usePrivy();
	const [state, dispatch] = useReducer(reducer, initialState);
	const cancelRef = useRef(0);
	const venueCacheRef = useRef<VenueCache>(new Map());
	const getAccessTokenRef = useRef(getAccessToken);
	getAccessTokenRef.current = getAccessToken;

	const stableGetToken = useCallback(
		() => getAccessTokenRef.current().catch(() => null),
		[],
	);

	const [liveTick, setLiveTick] = useState(0);
	useEffect(() => {
		const id = String(pandaMatchId ?? "").trim();
		if (!id) return;
		const h = window.setInterval(
			() => setLiveTick((n) => n + 1),
			LIVE_BUCKET_SEC * 1000,
		);
		return () => window.clearInterval(h);
	}, [pandaMatchId]);

	const { appState } = useOddsMonitor();
	const matchedLive = useMemo(() => {
		const id = String(pandaMatchId ?? "").trim();
		if (!id || !appState?.markets?.length) return null;
		return appState.markets.find((m) => String(m.pandaMatchId) === id) ?? null;
	}, [appState?.markets, appState?.timestamp, pandaMatchId, liveTick]);

	useEffect(() => {
		if (!umbrellaId && !conditionId) {
			dispatch({ type: "MATCH_RESOLVED", market: null });
			return;
		}
		dispatch({ type: "MATCH_START" });
		let cancelled = false;

		(async () => {
			try {
				let match: MatchedMarketExchange | undefined;
				if (umbrellaId) match = await findMatchedMarketByUmbrellaId(umbrellaId);
				if (!match && conditionId) match = await findMatchedMarketByConditionId(conditionId);
				if (!cancelled) dispatch({ type: "MATCH_RESOLVED", market: match ?? null });
			} catch {
				if (!cancelled) dispatch({ type: "MATCH_RESOLVED", market: null });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [umbrellaId, conditionId]);

	useEffect(() => {
		venueCacheRef.current.clear();
	}, [state.matchedMarket]);

	useEffect(() => {
		if (!state.matchResolved) return;

		const id = ++cancelRef.current;
		const cached = venueCacheRef.current.get(timeRange);

		if (cached) {
			dispatch({ type: "FETCH_CACHED", data: cached });
			return;
		}

		dispatch({ type: "FETCH_START" });
		const mm = state.matchedMarket;

		(async () => {
			try {
				const authToken = await stableGetToken();

				if (cancelRef.current !== id) return;

				const batch = await fetchChartPriceHistoryBatch(mm, timeRange, authToken);
				if (cancelRef.current !== id) return;

				if (batch && venueDataHasPoints(batch)) {
					let predictB = batch.predictB;
					const pf = mm?.predictFun;
					if (
						batch.predict.length > 0 &&
						predictB.length === 0 &&
						pf &&
						(pf.singleMarket === true ||
							!pf.marketIdB ||
							pf.marketIdB === pf.marketIdA)
					) {
						predictB = complementPricePoints(batch.predict);
					}
					const data: VenueData = {
						poly: batch.poly,
						polyB: batch.polyB,
						kalshi: batch.kalshi,
						kalshiB: batch.kalshiB,
						predict: batch.predict,
						predictB,
					};
					venueCacheRef.current.set(timeRange, data);
					dispatch({ type: "FETCH_DONE", data });
					return;
				}

				const [polyResult, polyBResult, kalshiABResult] = await Promise.all([
					mm?.polyTokenIdA
						? fetchPolymarketPriceHistory(mm.polyTokenIdA, timeRange)
						: Promise.resolve([] as PricePoint[]),
					mm?.polyTokenIdB
						? fetchPolymarketPriceHistory(mm.polyTokenIdB, timeRange)
						: Promise.resolve([] as PricePoint[]),
					fetchKalshiDflowPriceHistoryAB(mm ?? null, timeRange),
				]);

				if (cancelRef.current !== id) return;

				const [predictResult, predictBResult] = await Promise.all([
					mm?.predictFun?.marketIdA
						? fetchPredictFunPriceHistory(mm.predictFun.marketIdA, timeRange, authToken)
						: Promise.resolve([] as PricePoint[]),
					mm?.predictFun?.marketIdB
						? fetchPredictFunPriceHistory(mm.predictFun.marketIdB, timeRange, authToken)
						: Promise.resolve([] as PricePoint[]),
				]);

				if (cancelRef.current !== id) return;

				let predictB = predictBResult;
				const pf = mm?.predictFun;
				if (
					predictResult.length > 0 &&
					predictB.length === 0 &&
					pf &&
					(pf.singleMarket === true ||
						!pf.marketIdB ||
						pf.marketIdB === pf.marketIdA)
				) {
					predictB = complementPricePoints(predictResult);
				}

				const data: VenueData = {
					poly: polyResult,
					polyB: polyBResult,
					kalshi: kalshiABResult.a,
					kalshiB: kalshiABResult.b,
					predict: predictResult,
					predictB,
				};

				venueCacheRef.current.set(timeRange, data);
				dispatch({ type: "FETCH_DONE", data });
			} catch {
				if (cancelRef.current === id) {
					dispatch({ type: "FETCH_ERROR", error: "Failed to fetch exchange data" });
				}
			}
		})();
	}, [state.matchedMarket, state.matchResolved, timeRange, stableGetToken]);

	const levelUpData = useMemo(
		(): PricePoint[] =>
			levelUpChartData
				.filter((d) => d.percentage !== null && d.timestamp > 0)
				.map((d) => ({ timestamp: d.timestamp, price: d.percentage! / 100 })),
		[levelUpChartData],
	);

	const levelUpDataB = useMemo(
		(): PricePoint[] =>
			levelUpChartData
				.filter((d) => d.secondPercentage !== null && d.timestamp > 0)
				.map((d) => ({ timestamp: d.timestamp, price: d.secondPercentage! / 100 })),
		[levelUpChartData],
	);

	const merged = useMemo((): MergedExchangePoint[] => {
		const { poly, polyB, kalshi, kalshiB, predict, predictB } = state.venueData;
		type Venue = "levelUp" | "polymarket" | "kalshi" | "predictFun";
		const series: { venue: Venue; points: PricePoint[] }[] = [];
		const seriesB: { venue: Venue; points: PricePoint[] }[] = [];

		if (levelUpData.length > 0) series.push({ venue: "levelUp", points: levelUpData });
		if (poly.length > 0) series.push({ venue: "polymarket", points: poly });
		if (kalshi.length > 0) series.push({ venue: "kalshi", points: kalshi });
		if (predict.length > 0) series.push({ venue: "predictFun", points: predict });

		if (polyB.length > 0) seriesB.push({ venue: "polymarket", points: polyB });
		if (kalshiB.length > 0) seriesB.push({ venue: "kalshi", points: kalshiB });
		if (predictB.length > 0) seriesB.push({ venue: "predictFun", points: predictB });
		if (levelUpDataB.length > 0) seriesB.push({ venue: "levelUp", points: levelUpDataB });

		if (series.length === 0) return [];
		return mergeExchangeTimeSeries(series, timeRange, seriesB.length > 0 ? seriesB : undefined);
	}, [levelUpData, levelUpDataB, state.venueData, timeRange]);

	const liveOverlayPoint = useMemo((): MergedExchangePoint | null => {
		if (!matchedLive) return null;
		const t = Math.floor(Date.now() / 1000 / LIVE_BUCKET_SEC) * LIVE_BUCKET_SEC;
		const m = matchedLive;
		const pt: MergedExchangePoint = { timestamp: t };

		const pa = bestAskDisplay100(m.polyPriceA as OrderbookData);
		const pb = bestAskDisplay100(m.polyPriceB as OrderbookData);
		if (pa != null) pt.polymarket = pa;
		if (pb != null) pt.polymarketB = pb;

		const da = bestAskDisplay100((m.dflowPriceA ?? m.kalshiPriceA) as OrderbookData);
		const db = bestAskDisplay100((m.dflowPriceB ?? m.kalshiPriceB) as OrderbookData);
		if (da != null) pt.kalshi = da;
		if (db != null) pt.kalshiB = db;

		const pra = bestAskDisplay100(m.predictFunPriceA as OrderbookData);
		const prb = bestAskDisplay100(m.predictFunPriceB as OrderbookData);
		if (pra != null) pt.predictFun = pra;
		if (prb != null) pt.predictFunB = prb;

		if (
			pt.polymarket === undefined &&
			pt.polymarketB === undefined &&
			pt.kalshi === undefined &&
			pt.kalshiB === undefined &&
			pt.predictFun === undefined &&
			pt.predictFunB === undefined
		) {
			return null;
		}
		return attachBestOdds(pt);
	}, [matchedLive, liveTick]);

	const mergedWithLive = useMemo(() => {
		const id = String(pandaMatchId ?? "").trim();
		if (!id || !liveOverlayPoint || merged.length === 0) return merged;
		const t = liveOverlayPoint.timestamp;
		const lastTs = merged[merged.length - 1].timestamp;
		if (t < lastTs) return merged;

		const idx = merged.findIndex((p) => p.timestamp === t);
		if (idx >= 0) {
			const base = merged[idx];
			const blended: MergedExchangePoint = {
				...base,
				...(liveOverlayPoint.polymarket !== undefined
					? { polymarket: liveOverlayPoint.polymarket }
					: {}),
				...(liveOverlayPoint.polymarketB !== undefined
					? { polymarketB: liveOverlayPoint.polymarketB }
					: {}),
				...(liveOverlayPoint.kalshi !== undefined ? { kalshi: liveOverlayPoint.kalshi } : {}),
				...(liveOverlayPoint.kalshiB !== undefined ? { kalshiB: liveOverlayPoint.kalshiB } : {}),
				...(liveOverlayPoint.predictFun !== undefined
					? { predictFun: liveOverlayPoint.predictFun }
					: {}),
				...(liveOverlayPoint.predictFunB !== undefined
					? { predictFunB: liveOverlayPoint.predictFunB }
					: {}),
			};
			return merged.map((p, i) => (i === idx ? attachBestOdds(blended) : p));
		}

		const base = merged[merged.length - 1];
		const extended: MergedExchangePoint = {
			...base,
			polymarket: liveOverlayPoint.polymarket ?? base.polymarket,
			polymarketB: liveOverlayPoint.polymarketB ?? base.polymarketB,
			kalshi: liveOverlayPoint.kalshi ?? base.kalshi,
			kalshiB: liveOverlayPoint.kalshiB ?? base.kalshiB,
			predictFun: liveOverlayPoint.predictFun ?? base.predictFun,
			predictFunB: liveOverlayPoint.predictFunB ?? base.predictFunB,
			timestamp: t,
		};
		return [...merged, attachBestOdds(extended)];
	}, [merged, liveOverlayPoint, pandaMatchId]);

	const noData = !state.loading && mergedWithLive.length === 0;

	return {
		data: mergedWithLive,
		loading: state.loading,
		error: noData ? "No price data available from any exchange" : state.error,
		hasLevelUp: levelUpData.length > 0 || levelUpDataB.length > 0,
		hasPolymarket: state.venueData.poly.length > 0,
		hasKalshi: state.venueData.kalshi.length > 0,
		hasPredictFun:
			state.venueData.predict.length > 0 || state.venueData.predictB.length > 0,
	};
}
