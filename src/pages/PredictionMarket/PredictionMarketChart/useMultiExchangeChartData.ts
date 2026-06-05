import { useEffect, useMemo, useReducer, useRef, useCallback, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import type { TimeRange, MergedExchangePoint, ChartDataPoint } from "./types";
import type { PricePoint } from "@/services/api/exchangePriceHistoryService";
import {
	EMPTY_CHART_VENUE_BUNDLE,
	fetchChartPriceHistoryBatch,
} from "@/services/api/serverChartPriceHistoryService";
import {
	type MatchedMarketExchange,
	findMatchedMarketByConditionId,
	findMatchedMarketByUmbrellaId,
	findMatchedMarketByPandaMatchId,
} from "@/services/api/matchDataService";
import { mergeExchangeTimeSeries } from "@/features/markets/chart/mergeExchangeTimeSeries";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/features/markets/odds-monitor/findOddsMatchedMarket";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import type { OrderbookData } from "@/types/odds-monitor";
import { isLimitlessConsoleDebugEnabled } from "@/features/trading/venues/limitless/trade/limitlessConsoleDebug";

export interface MultiExchangeChartResult {
	data: MergedExchangePoint[];
	loading: boolean;
	error: string | null;
	hasLevelUp: boolean;
	hasPolymarket: boolean;
	hasKalshi: boolean;
	hasPredictFun: boolean;
	hasLimitless: boolean;
}

interface Args {
	conditionId?: string;
	umbrellaId?: string;
	pandaMatchId?: string;
	levelUpChartData: ChartDataPoint[];
	timeRange: TimeRange;
	/** When false, LevelUp history/live/Best Odds omit REST-backed LevelUp (empty book). */
	includeLevelUp: boolean;
	/**
	 * 3-way moneyline (FIFA): the away leg's Polymarket `conditionId`. When set, the
	 * team-B series is sourced from the away leg's OWN best-YES across venues (a second
	 * matched-market batch) instead of the home market's NO side. For a 3-way market
	 * P(away) ≠ 1 − P(home) (the draw absorbs probability), so the NO complement is wrong.
	 */
	awayConditionId?: string;
}

const LIVE_BUCKET_SEC = 3;

/** Dedupe chart batch logs (Strict Mode / re-renders). */
let lastLimitlessChartBatchLogSig = "";

function logLimitlessChartBatchIfNew(sig: string, payload: Record<string, unknown>): void {
	if (!isLimitlessConsoleDebugEnabled()) return;
	if (lastLimitlessChartBatchLogSig === sig) return;
	lastLimitlessChartBatchLogSig = sig;
	console.info("[limitless/chart-batch]", payload);
}

function limitlessMetaForLog(
	mm: MatchedMarketExchange | null | undefined,
): Record<string, unknown> | null {
	const lx = mm?.limitless;
	if (!lx) return null;
	return {
		slug: lx.slug,
		orderbookSlugA: lx.orderbookSlugA ?? null,
		orderbookSlugB: lx.orderbookSlugB ?? null,
		tokenIdA: lx.tokenIdA,
		tokenIdB: lx.tokenIdB,
	};
}

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

/** Recompute bestOdds / bestOddsB; when includeLevelUp is false, LevelUp is excluded from the min (and from stale rows). */
export function attachBestOddsToMergedPoint(
	point: MergedExchangePoint,
	includeLevelUp: boolean,
): MergedExchangePoint {
	const aKeys = includeLevelUp
		? (["levelUp", "polymarket", "kalshi", "predictFun", "limitless"] as const)
		: (["polymarket", "kalshi", "predictFun", "limitless"] as const);
	const bKeys = includeLevelUp
		? (["levelUpB", "polymarketB", "kalshiB", "predictFunB", "limitlessB"] as const)
		: (["polymarketB", "kalshiB", "predictFunB", "limitlessB"] as const);
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
	limitless: PricePoint[];
	limitlessB: PricePoint[];
}

interface State {
	matchedMarket: MatchedMarketExchange | null;
	/** Away-leg matched market for 3-way (FIFA) team-B series; null for 2-way markets. */
	matchedMarketAway: MatchedMarketExchange | null;
	matchResolved: boolean;
	venueData: VenueData;
	loading: boolean;
	error: string | null;
}

type Action =
	| { type: "MATCH_START" }
	| {
			type: "MATCH_RESOLVED";
			market: MatchedMarketExchange | null;
			away: MatchedMarketExchange | null;
	  }
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
	limitless: [],
	limitlessB: [],
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
			return {
				...state,
				matchedMarket: action.market,
				matchedMarketAway: action.away,
				matchResolved: true,
			};
		case "FETCH_START":
			return { ...state, venueData: EMPTY_VENUE, loading: true, error: null };
		case "FETCH_DONE":
			return { ...state, venueData: action.data, loading: false, error: null };
		case "FETCH_CACHED":
			return { ...state, venueData: action.data, loading: false, error: null };
		case "FETCH_ERROR":
			return {
				...state,
				venueData: EMPTY_VENUE,
				loading: false,
				error: action.error,
			};
		default:
			return state;
	}
}

const initialState: State = {
	matchedMarket: null,
	matchedMarketAway: null,
	matchResolved: false,
	venueData: EMPTY_VENUE,
	loading: true,
	error: null,
};

type VenueCache = Map<TimeRange, VenueData>;

export function useMultiExchangeChartData({
	conditionId,
	umbrellaId,
	pandaMatchId,
	levelUpChartData,
	timeRange,
	includeLevelUp,
	awayConditionId,
}: Args): MultiExchangeChartResult {
	const { getAccessToken } = usePrivy();
	const [state, dispatch] = useReducer(reducer, initialState);
	const cancelRef = useRef(0);
	const venueCacheRef = useRef<VenueCache>(new Map());
	const limitlessChartLiveSigRef = useRef("");
	const getAccessTokenRef = useRef(getAccessToken);
	getAccessTokenRef.current = getAccessToken;

	const stableGetToken = useCallback(() => getAccessTokenRef.current().catch(() => null), []);

	const [liveTick, setLiveTick] = useState(0);
	useEffect(() => {
		const id = String(pandaMatchId ?? "").trim();
		const uid = String(umbrellaId ?? "").trim();
		if (!id && !uid) return;
		const h = window.setInterval(() => setLiveTick((n) => n + 1), LIVE_BUCKET_SEC * 1000);
		return () => window.clearInterval(h);
	}, [pandaMatchId, umbrellaId]);

	const { appState } = useOddsMonitor();
	const matchedLive = useMemo(() => {
		if (!appState?.markets?.length) return null;
		return findOddsMatchedMarket(appState.markets, pandaMatchId, umbrellaId);
	}, [appState?.markets, appState?.timestamp, pandaMatchId, umbrellaId, liveTick]);

	useEffect(() => {
		// Aggregator sub-question cards pass only a pandaMatchId (their own
		// pandascore_marketId) — no umbrellaId/conditionId — and resolve history
		// off that key. Moneyline keeps resolving by umbrellaId/conditionId.
		const subPandaId = String(pandaMatchId ?? "").trim();
		if (!umbrellaId && !conditionId && !subPandaId) {
			dispatch({ type: "MATCH_RESOLVED", market: null, away: null });
			return;
		}
		dispatch({ type: "MATCH_START" });
		let cancelled = false;

		(async () => {
			try {
				let match: MatchedMarketExchange | undefined;
				if (umbrellaId) match = await findMatchedMarketByUmbrellaId(umbrellaId);
				if (!match && conditionId) match = await findMatchedMarketByConditionId(conditionId);
				if (!match && !umbrellaId && !conditionId && subPandaId) {
					match = await findMatchedMarketByPandaMatchId(subPandaId);
				}
				// 3-way (FIFA): resolve the away leg's own matched market so team-B uses
				// the away YES series rather than the home market's NO complement.
				const awayId = String(awayConditionId ?? "").trim();
				const away = awayId ? ((await findMatchedMarketByConditionId(awayId)) ?? null) : null;
				if (!cancelled) dispatch({ type: "MATCH_RESOLVED", market: match ?? null, away });
			} catch {
				if (!cancelled) dispatch({ type: "MATCH_RESOLVED", market: null, away: null });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [umbrellaId, conditionId, pandaMatchId, awayConditionId]);

	useEffect(() => {
		venueCacheRef.current.clear();
	}, [state.matchedMarket, state.matchedMarketAway]);

	useEffect(() => {
		if (!state.matchResolved) return;

		const id = ++cancelRef.current;
		const cached = venueCacheRef.current.get(timeRange);

		if (cached) {
			const lxMeta = limitlessMetaForLog(state.matchedMarket);
			if (lxMeta) {
				const pid = String(pandaMatchId ?? "").trim();
				const uid = String(umbrellaId ?? "").trim();
				const sig = `batch|${timeRange}|${pid}|${uid}|cache|${cached.limitless.length}|${cached.limitlessB.length}`;
				logLimitlessChartBatchIfNew(sig, {
					source: "cache",
					timeRange,
					pandaMatchId: pid || null,
					umbrellaId: uid || null,
					limitlessMeta: lxMeta,
					limitlessPoints: cached.limitless.length,
					limitlessBPoints: cached.limitlessB.length,
				});
			}
			dispatch({ type: "FETCH_CACHED", data: cached });
			return;
		}

		dispatch({ type: "FETCH_START" });
		const mm = state.matchedMarket;
		const mmAway = state.matchedMarketAway;

		(async () => {
			try {
				const authToken = await stableGetToken();

				if (cancelRef.current !== id) return;

				const batchResult = await fetchChartPriceHistoryBatch(mm, timeRange, authToken);
				if (cancelRef.current !== id) return;

				if (!batchResult.ok) {
					const msg =
						batchResult.kind === "http"
							? `Chart data failed (${batchResult.status})`
							: batchResult.kind === "not_found"
								? "Chart data unavailable"
								: "Failed to fetch chart data";
					dispatch({ type: "FETCH_ERROR", error: msg });
					return;
				}

				const batch = batchResult.data;

				let data: VenueData;
				if (mmAway) {
					// 3-way (FIFA): team-B is the away leg's OWN best-YES. Fetch the away
					// leg's batch and use its A-side as the B-series. No NO-complement
					// fallback — P(away) ≠ 1 − P(home) when a draw outcome exists.
					const awayResult = await fetchChartPriceHistoryBatch(mmAway, timeRange, authToken);
					if (cancelRef.current !== id) return;
					const awayBatch = awayResult.ok ? awayResult.data : EMPTY_CHART_VENUE_BUNDLE;
					data = {
						poly: batch.poly,
						polyB: awayBatch.poly,
						kalshi: batch.kalshi,
						kalshiB: awayBatch.kalshi,
						predict: batch.predict,
						predictB: awayBatch.predict,
						limitless: batch.limitless,
						limitlessB: awayBatch.limitless,
					};
				} else {
					let predictB = batch.predictB;
					const pf = mm?.predictFun;
					if (
						batch.predict.length > 0 &&
						predictB.length === 0 &&
						pf &&
						(pf.singleMarket === true || !pf.marketIdB || pf.marketIdB === pf.marketIdA)
					) {
						predictB = complementPricePoints(batch.predict);
					}
					let limitlessB = batch.limitlessB;
					const lx = mm?.limitless;
					if (
						batch.limitless.length > 0 &&
						limitlessB.length === 0 &&
						lx &&
						(!lx.tokenIdB || lx.tokenIdB === lx.tokenIdA)
					) {
						limitlessB = complementPricePoints(batch.limitless);
					}
					data = {
						poly: batch.poly,
						polyB: batch.polyB,
						kalshi: batch.kalshi,
						kalshiB: batch.kalshiB,
						predict: batch.predict,
						predictB,
						limitless: batch.limitless,
						limitlessB,
					};
				}
				venueCacheRef.current.set(timeRange, data);
				const lxMeta = limitlessMetaForLog(mm);
				if (lxMeta) {
					const pid = String(pandaMatchId ?? "").trim();
					const uid = String(umbrellaId ?? "").trim();
					const sig = `batch|${timeRange}|${pid}|${uid}|network|${data.limitless.length}|${data.limitlessB.length}`;
					logLimitlessChartBatchIfNew(sig, {
						source: "network",
						timeRange,
						pandaMatchId: pid || null,
						umbrellaId: uid || null,
						limitlessMeta: lxMeta,
						limitlessPoints: data.limitless.length,
						limitlessBPoints: data.limitlessB.length,
					});
				}
				dispatch({ type: "FETCH_DONE", data });
			} catch {
				if (cancelRef.current === id) {
					dispatch({ type: "FETCH_ERROR", error: "Failed to fetch exchange data" });
				}
			}
		})();
	}, [
		state.matchedMarket,
		state.matchedMarketAway,
		state.matchResolved,
		timeRange,
		stableGetToken,
		pandaMatchId,
		umbrellaId,
	]);

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
		const { poly, polyB, kalshi, kalshiB, predict, predictB, limitless, limitlessB } =
			state.venueData;
		type Venue = "levelUp" | "polymarket" | "kalshi" | "predictFun" | "limitless";
		const series: { venue: Venue; points: PricePoint[] }[] = [];
		const seriesB: { venue: Venue; points: PricePoint[] }[] = [];

		if (includeLevelUp && levelUpData.length > 0)
			series.push({ venue: "levelUp", points: levelUpData });
		if (poly.length > 0) series.push({ venue: "polymarket", points: poly });
		if (kalshi.length > 0) series.push({ venue: "kalshi", points: kalshi });
		if (predict.length > 0) series.push({ venue: "predictFun", points: predict });
		if (limitless.length > 0) series.push({ venue: "limitless", points: limitless });

		if (polyB.length > 0) seriesB.push({ venue: "polymarket", points: polyB });
		if (kalshiB.length > 0) seriesB.push({ venue: "kalshi", points: kalshiB });
		if (predictB.length > 0) seriesB.push({ venue: "predictFun", points: predictB });
		if (limitlessB.length > 0) seriesB.push({ venue: "limitless", points: limitlessB });
		if (includeLevelUp && levelUpDataB.length > 0)
			seriesB.push({ venue: "levelUp", points: levelUpDataB });

		if (series.length === 0 && (!seriesB || seriesB.length === 0)) return [];
		return mergeExchangeTimeSeries(series, timeRange, seriesB.length > 0 ? seriesB : undefined);
	}, [levelUpData, levelUpDataB, state.venueData, timeRange, includeLevelUp]);

	const liveOverlayPoint = useMemo((): MergedExchangePoint | null => {
		if (!matchedLive) return null;
		const t = Math.floor(Date.now() / 1000 / LIVE_BUCKET_SEC) * LIVE_BUCKET_SEC;
		const m = matchedLive;
		const pt: MergedExchangePoint = { timestamp: t };

		const pa = bestAskDisplay100(m.polyPriceA as OrderbookData);
		const pb = bestAskDisplay100(m.polyPriceB as OrderbookData);
		if (pa != null) pt.polymarket = pa;
		if (pb != null) pt.polymarketB = pb;

		const da = bestAskDisplay100(m.dflowPriceA as OrderbookData);
		const db = bestAskDisplay100(m.dflowPriceB as OrderbookData);
		if (da != null) pt.kalshi = da;
		if (db != null) pt.kalshiB = db;

		const pra = bestAskDisplay100(m.predictFunPriceA as OrderbookData);
		const prb = bestAskDisplay100(m.predictFunPriceB as OrderbookData);
		if (pra != null) pt.predictFun = pra;
		if (prb != null) pt.predictFunB = prb;

		const lxa = bestAskDisplay100(m.limitlessPriceA as OrderbookData);
		const lxb = bestAskDisplay100(m.limitlessPriceB as OrderbookData);
		if (lxa != null) pt.limitless = lxa;
		if (lxb != null) pt.limitlessB = lxb;

		if (includeLevelUp) {
			const lua = bestAskDisplay100(m.levelUpPriceA as OrderbookData);
			const lub = bestAskDisplay100(m.levelUpPriceB as OrderbookData);
			if (lua != null) pt.levelUp = lua;
			if (lub != null) pt.levelUpB = lub;
		}

		if (
			pt.polymarket === undefined &&
			pt.polymarketB === undefined &&
			pt.kalshi === undefined &&
			pt.kalshiB === undefined &&
			pt.predictFun === undefined &&
			pt.predictFunB === undefined &&
			pt.limitless === undefined &&
			pt.limitlessB === undefined &&
			pt.levelUp === undefined &&
			pt.levelUpB === undefined
		) {
			return null;
		}
		return attachBestOddsToMergedPoint(pt, includeLevelUp);
	}, [matchedLive, liveTick, appState?.timestamp, includeLevelUp]);

	const mergedWithLive = useMemo(() => {
		const id = String(pandaMatchId ?? "").trim();
		if (!liveOverlayPoint) return merged;

		const blendLiveOntoBase = (base: MergedExchangePoint): MergedExchangePoint => {
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
				...(liveOverlayPoint.limitless !== undefined
					? { limitless: liveOverlayPoint.limitless }
					: {}),
				...(liveOverlayPoint.limitlessB !== undefined
					? { limitlessB: liveOverlayPoint.limitlessB }
					: {}),
			};
			return attachBestOddsToMergedPoint(blended, includeLevelUp);
		};

		if (merged.length === 0) {
			if (!id) return merged;
			return [attachBestOddsToMergedPoint({ ...liveOverlayPoint }, includeLevelUp)];
		}

		if (!id) return merged;

		const t = liveOverlayPoint.timestamp;
		const lastIdx = merged.length - 1;
		const lastTs = merged[lastIdx].timestamp;

		if (t < lastTs) {
			return merged.map((p, i) => (i === lastIdx ? blendLiveOntoBase(p) : p));
		}

		const idx = merged.findIndex((p) => p.timestamp === t);
		if (idx >= 0) {
			return merged.map((p, i) => (i === idx ? blendLiveOntoBase(p) : p));
		}

		const base = merged[lastIdx];
		const extended: MergedExchangePoint = includeLevelUp
			? {
					...base,
					polymarket: liveOverlayPoint.polymarket ?? base.polymarket,
					polymarketB: liveOverlayPoint.polymarketB ?? base.polymarketB,
					kalshi: liveOverlayPoint.kalshi ?? base.kalshi,
					kalshiB: liveOverlayPoint.kalshiB ?? base.kalshiB,
					predictFun: liveOverlayPoint.predictFun ?? base.predictFun,
					predictFunB: liveOverlayPoint.predictFunB ?? base.predictFunB,
					limitless: liveOverlayPoint.limitless ?? base.limitless,
					limitlessB: liveOverlayPoint.limitlessB ?? base.limitlessB,
					levelUp: liveOverlayPoint.levelUp ?? base.levelUp,
					levelUpB: liveOverlayPoint.levelUpB ?? base.levelUpB,
					timestamp: t,
				}
			: {
					...base,
					polymarket: liveOverlayPoint.polymarket ?? base.polymarket,
					polymarketB: liveOverlayPoint.polymarketB ?? base.polymarketB,
					kalshi: liveOverlayPoint.kalshi ?? base.kalshi,
					kalshiB: liveOverlayPoint.kalshiB ?? base.kalshiB,
					predictFun: liveOverlayPoint.predictFun ?? base.predictFun,
					predictFunB: liveOverlayPoint.predictFunB ?? base.predictFunB,
					limitless: liveOverlayPoint.limitless ?? base.limitless,
					limitlessB: liveOverlayPoint.limitlessB ?? base.limitlessB,
					timestamp: t,
				};
		return [...merged, attachBestOddsToMergedPoint(extended, includeLevelUp)];
	}, [merged, liveOverlayPoint, pandaMatchId, includeLevelUp]);

	useEffect(() => {
		if (!isLimitlessConsoleDebugEnabled()) return;
		const id = String(pandaMatchId ?? "").trim();
		if (!id || !matchedLive?.limitless) return;
		const lxa = bestAskDisplay100(matchedLive.limitlessPriceA as OrderbookData);
		const lxb = bestAskDisplay100(matchedLive.limitlessPriceB as OrderbookData);
		const sig = `${id}|live|${lxa ?? "∅"}|${lxb ?? "∅"}|${matchedLive.limitlessPriceA?.snapshotStatus ?? ""}|${matchedLive.limitlessPriceB?.snapshotStatus ?? ""}`;
		if (limitlessChartLiveSigRef.current === sig) return;
		limitlessChartLiveSigRef.current = sig;
		console.info("[limitless/chart-live-prices]", {
			pandaMatchId: id,
			slug: matchedLive.limitless.slug,
			rawBestAskA: matchedLive.limitlessPriceA?.bestAsk ?? null,
			rawBestAskB: matchedLive.limitlessPriceB?.bestAsk ?? null,
			chartDisplayPctA: lxa ?? null,
			chartDisplayPctB: lxb ?? null,
			snapshotStatusA: matchedLive.limitlessPriceA?.snapshotStatus ?? null,
			snapshotStatusB: matchedLive.limitlessPriceB?.snapshotStatus ?? null,
			askLevelsA: matchedLive.limitlessPriceA?.asks?.length ?? 0,
			askLevelsB: matchedLive.limitlessPriceB?.asks?.length ?? 0,
		});
	}, [matchedLive, pandaMatchId]);

	const noData = !state.loading && mergedWithLive.length === 0;

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		const { poly, polyB, kalshi, kalshiB, predict, predictB, limitless, limitlessB } =
			state.venueData;
		priceDebugLog("useMultiExchangeChartData (price comparison series)", {
			umbrellaId: umbrellaId ?? null,
			conditionId: conditionId ?? null,
			pandaMatchId: pandaMatchId ?? null,
			timeRange,
			matchResolved: state.matchResolved,
			loading: state.loading,
			error: state.error,
			venuePointCounts: {
				poly: poly.length,
				polyB: polyB.length,
				kalshi: kalshi.length,
				kalshiB: kalshiB.length,
				predict: predict.length,
				predictB: predictB.length,
				limitless: limitless.length,
				limitlessB: limitlessB.length,
			},
			levelUpChartPoints: levelUpChartData.length,
			mergedPoints: mergedWithLive.length,
			hasLiveOverlay: liveOverlayPoint != null,
			note: "History: predictions API POST /api/chart-price-history/batch only; live bucket from OddsMonitor MatchedMarket (same WS as venue-prices).",
		});
	}, [
		umbrellaId,
		conditionId,
		pandaMatchId,
		timeRange,
		state.matchResolved,
		state.loading,
		state.error,
		state.venueData.poly.length,
		state.venueData.polyB.length,
		state.venueData.kalshi.length,
		state.venueData.kalshiB.length,
		state.venueData.predict.length,
		state.venueData.predictB.length,
		state.venueData.limitless.length,
		state.venueData.limitlessB.length,
		levelUpChartData.length,
		mergedWithLive.length,
		liveOverlayPoint,
	]);

	return {
		data: mergedWithLive,
		loading: state.loading,
		error: state.error ?? (noData ? "No price data available from any exchange" : null),
		hasLevelUp: includeLevelUp && (levelUpData.length > 0 || levelUpDataB.length > 0),
		hasPolymarket: state.venueData.poly.length > 0,
		hasKalshi: state.venueData.kalshi.length > 0,
		hasPredictFun: state.venueData.predict.length > 0 || state.venueData.predictB.length > 0,
		hasLimitless: state.venueData.limitless.length > 0 || state.venueData.limitlessB.length > 0,
	};
}
