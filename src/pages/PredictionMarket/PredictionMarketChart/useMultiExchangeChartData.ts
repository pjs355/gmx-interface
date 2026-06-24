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
	resolveMatchedMarketFromCatalog,
	matchedMarketsApiItemsToExchange,
} from "@/services/api/matchDataService";
import { useMatchedMarketsQuery } from "@/features/markets/queries/matchedMarketsQuery";
import { mergeExchangeTimeSeries } from "@/features/markets/chart/mergeExchangeTimeSeries";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import {
	findOddsMatchedMarket,
	findOddsMatchedMarketByConditionId,
} from "@/features/markets/odds-monitor/findOddsMatchedMarket";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import { isLimitlessConsoleDebugEnabled } from "@/features/trading/venues/limitless/trade/limitlessConsoleDebug";
import { impliedProbToChartDisplayPct, isValidChartDisplayPct } from "@/features/markets/chart/chartDisplayPrice";
import { bestAskProbKalshiDflow } from "@/features/markets/pricing/orderbookBbo";
import { kalshiLegYesBookFromMarket } from "@/features/markets/pricing/kalshiLegYesBook";

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
/** Client-side cap — backend upstream fetches use 15s each; batch can lag on cold Limitless. */
const CHART_BATCH_FETCH_MS = 22_000;
const CHART_AUTH_TOKEN_MS = 3_000;

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

function applyTeamAFromHomeRow(
	pt: MergedExchangePoint,
	m: MatchedMarket,
	includeLevelUp: boolean,
): void {
	const pa = bestAskDisplay100(m.polyPriceA as OrderbookData);
	if (pa != null) pt.polymarket = pa;

	const da = bestAskDisplay100(m.dflowPriceA as OrderbookData, true);
	if (da != null) pt.kalshi = da;

	const pra = bestAskDisplay100(m.predictFunPriceA as OrderbookData);
	if (pra != null) pt.predictFun = pra;

	const lxa = bestAskDisplay100(m.limitlessPriceA as OrderbookData);
	if (lxa != null) pt.limitless = lxa;

	if (includeLevelUp) {
		const lua = bestAskDisplay100(m.levelUpPriceA as OrderbookData);
		if (lua != null) pt.levelUp = lua;
	}
}

/** 2-way home market: team-B series is the home row's B / NO side. */
function applyTeamBFromHomeRow(
	pt: MergedExchangePoint,
	m: MatchedMarket,
	includeLevelUp: boolean,
): void {
	const pb = bestAskDisplay100(m.polyPriceB as OrderbookData);
	if (pb != null) pt.polymarketB = pb;

	const db = bestAskDisplay100(m.dflowPriceB as OrderbookData, true);
	if (db != null) pt.kalshiB = db;

	const prb = bestAskDisplay100(m.predictFunPriceB as OrderbookData);
	if (prb != null) pt.predictFunB = prb;

	const lxb = bestAskDisplay100(m.limitlessPriceB as OrderbookData);
	if (lxb != null) pt.limitlessB = lxb;

	if (includeLevelUp) {
		const lub = bestAskDisplay100(m.levelUpPriceB as OrderbookData);
		if (lub != null) pt.levelUpB = lub;
	}
}

/** 3-way leg market: team-B chart series is this leg's YES (A side), not home NO. */
function applyTeamBFromAwayLegRow(
	pt: MergedExchangePoint,
	leg: MatchedMarket,
	includeLevelUp: boolean,
): void {
	const pa = bestAskDisplay100(leg.polyPriceA as OrderbookData);
	if (pa != null) pt.polymarketB = pa;

	const kalshiAwayBook = kalshiLegYesBookFromMarket({
		...leg,
		moneylineLeg: leg.moneylineLeg ?? "away",
	});
	const da = bestAskDisplay100(kalshiAwayBook, true);
	if (da != null) pt.kalshiB = da;

	const pra = bestAskDisplay100(leg.predictFunPriceA as OrderbookData);
	if (pra != null) pt.predictFunB = pra;

	const lxa = bestAskDisplay100(leg.limitlessPriceA as OrderbookData);
	if (lxa != null) pt.limitlessB = lxa;

	if (includeLevelUp) {
		const lua = bestAskDisplay100(leg.levelUpPriceA as OrderbookData);
		if (lua != null) pt.levelUpB = lua;
	}
}

function bestAskDisplay100(book: OrderbookData | null | undefined, kalshiDflow = false): number | undefined {
	if (!book) return undefined;
	let x: number | undefined;
	if (kalshiDflow) {
		x = bestAskProbKalshiDflow(book) ?? undefined;
	} else {
		const asks = book.asks?.filter((l) => Number(l.size) > 0) ?? [];
		if (asks.length > 0) {
			const prices = asks.map((l) => Number(l.price)).filter((p) => Number.isFinite(p));
			if (prices.length > 0) x = Math.min(...prices);
		}
		if (x == null && book.bestAsk != null) {
			const b = Number(book.bestAsk);
			if (Number.isFinite(b)) x = b;
		}
	}
	return impliedProbToChartDisplayPct(x ?? Number.NaN) ?? undefined;
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
		if (typeof v === "number" && isValidChartDisplayPct(v)) teamA.push(v);
	}
	const teamB: number[] = [];
	for (const k of bKeys) {
		const v = point[k];
		if (typeof v === "number" && isValidChartDisplayPct(v)) teamB.push(v);
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

function matchedMarketIdentity(market: MatchedMarketExchange | null | undefined): string {
	if (!market) return "";
	return [
		market.umbrellaId,
		market.pandaMatchId,
		market.polyConditionId,
		market.polyTokenIdA,
		market.polyTokenIdB,
	]
		.map((v) => String(v ?? "").trim())
		.filter(Boolean)
		.join("|");
}

function clamp01(p: number): number {
	return Math.min(1, Math.max(0, p));
}

function complementPricePoints(points: PricePoint[]): PricePoint[] {
	return points.map((pt) => ({
		timestamp: pt.timestamp,
		price: clamp01(1 - pt.price),
	}));
}

async function authTokenWithTimeout(
	getToken: () => Promise<string | null>,
	ms: number,
): Promise<string | null> {
	try {
		return await Promise.race([
			getToken(),
			new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
		]);
	} catch {
		return null;
	}
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

	const hasLookupKeys = Boolean(
		String(umbrellaId ?? "").trim() ||
			String(conditionId ?? "").trim() ||
			String(pandaMatchId ?? "").trim(),
	);
	const { data: catalogItems } = useMatchedMarketsQuery(hasLookupKeys);
	const catalogMarkets = useMemo(
		() => (catalogItems?.length ? matchedMarketsApiItemsToExchange(catalogItems) : []),
		[catalogItems],
	);

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
	const isThreeWayChart = Boolean(String(awayConditionId ?? "").trim());
	const matchedLive = useMemo(() => {
		if (!appState?.markets?.length) return null;
		if (isThreeWayChart) {
			const homeCid = String(conditionId ?? "").trim();
			if (homeCid) {
				const byHomeLeg = findOddsMatchedMarketByConditionId(appState.markets, homeCid);
				if (byHomeLeg) return byHomeLeg;
			}
		}
		return findOddsMatchedMarket(appState.markets, pandaMatchId, umbrellaId);
	}, [
		appState?.markets,
		appState?.timestamp,
		pandaMatchId,
		umbrellaId,
		conditionId,
		isThreeWayChart,
		liveTick,
	]);
	const matchedLiveAway = useMemo(() => {
		if (!isThreeWayChart || !appState?.markets?.length) return null;
		const awayCid = String(awayConditionId ?? "").trim();
		if (awayCid) {
			const byAwayLeg = findOddsMatchedMarketByConditionId(appState.markets, awayCid);
			if (byAwayLeg) return byAwayLeg;
		}
		const awayPanda = String(state.matchedMarketAway?.pandaMatchId ?? "").trim();
		if (awayPanda) return findOddsMatchedMarket(appState.markets, awayPanda, null);
		return null;
	}, [
		isThreeWayChart,
		awayConditionId,
		state.matchedMarketAway?.pandaMatchId,
		appState?.markets,
		appState?.timestamp,
		liveTick,
	]);

	useEffect(() => {
		// Aggregator sub-question cards pass only a pandaMatchId (their own
		// pandascore_marketId) — no umbrellaId/conditionId — and resolve history
		// off that key. Moneyline keeps resolving by umbrellaId/conditionId.
		const subPandaId = String(pandaMatchId ?? "").trim();
		const awayId = String(awayConditionId ?? "").trim();

		const resolveAway = (): MatchedMarketExchange | null => {
			if (!awayId) return null;
			if (catalogMarkets.length > 0) {
				return resolveMatchedMarketFromCatalog(catalogMarkets, { conditionId: awayId }) ?? null;
			}
			return null;
		};

		if (!umbrellaId && !conditionId && !subPandaId) {
			dispatch({ type: "MATCH_RESOLVED", market: null, away: null });
			return;
		}

		if (catalogMarkets.length > 0) {
			const match =
				resolveMatchedMarketFromCatalog(catalogMarkets, {
					umbrellaId,
					conditionId,
					pandaMatchId: subPandaId,
				}) ?? null;
			if (match) {
				dispatch({ type: "MATCH_RESOLVED", market: match, away: resolveAway() });
				return;
			}
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
				const away = awayId ? ((await findMatchedMarketByConditionId(awayId)) ?? null) : null;
				if (!cancelled) dispatch({ type: "MATCH_RESOLVED", market: match ?? null, away });
			} catch {
				if (!cancelled) dispatch({ type: "MATCH_RESOLVED", market: null, away: null });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [umbrellaId, conditionId, pandaMatchId, awayConditionId, catalogMarkets]);

	const matchedMarketKey = useMemo(
		() =>
			`${matchedMarketIdentity(state.matchedMarket)}::${matchedMarketIdentity(state.matchedMarketAway)}`,
		[state.matchedMarket, state.matchedMarketAway],
	);

	useEffect(() => {
		venueCacheRef.current.clear();
	}, [matchedMarketKey]);

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
		const batchAbort = new AbortController();
		const batchTimeoutId = setTimeout(() => batchAbort.abort(), CHART_BATCH_FETCH_MS);

		(async () => {
			try {
				const authToken = await authTokenWithTimeout(stableGetToken, CHART_AUTH_TOKEN_MS);

				if (cancelRef.current !== id) return;

				const batchResult = await fetchChartPriceHistoryBatch(
					mm,
					timeRange,
					authToken,
					batchAbort.signal,
				);
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
					const awayResult = await fetchChartPriceHistoryBatch(
						mmAway,
						timeRange,
						authToken,
						batchAbort.signal,
					);
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
			} finally {
				clearTimeout(batchTimeoutId);
			}
		})();
	}, [
		matchedMarketKey,
		state.matchResolved,
		timeRange,
		stableGetToken,
		pandaMatchId,
		umbrellaId,
	]);

	const levelUpData = useMemo(
		(): PricePoint[] =>
			levelUpChartData
				.filter(
					(d) =>
						d.percentage !== null &&
						isValidChartDisplayPct(d.percentage) &&
						d.timestamp > 0,
				)
				.map((d) => ({ timestamp: d.timestamp, price: d.percentage! / 100 })),
		[levelUpChartData],
	);

	const levelUpDataB = useMemo(
		(): PricePoint[] =>
			levelUpChartData
				.filter(
					(d) =>
						d.secondPercentage !== null &&
						isValidChartDisplayPct(d.secondPercentage) &&
						d.timestamp > 0,
				)
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
		const pt: MergedExchangePoint = { timestamp: t };

		applyTeamAFromHomeRow(pt, matchedLive, includeLevelUp);
		if (isThreeWayChart) {
			if (matchedLiveAway) {
				applyTeamBFromAwayLegRow(pt, matchedLiveAway, includeLevelUp);
			}
		} else {
			applyTeamBFromHomeRow(pt, matchedLive, includeLevelUp);
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
	}, [
		matchedLive,
		matchedLiveAway,
		isThreeWayChart,
		liveTick,
		appState?.timestamp,
		includeLevelUp,
	]);

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
				...(liveOverlayPoint.levelUp !== undefined ? { levelUp: liveOverlayPoint.levelUp } : {}),
				...(liveOverlayPoint.levelUpB !== undefined
					? { levelUpB: liveOverlayPoint.levelUpB }
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
