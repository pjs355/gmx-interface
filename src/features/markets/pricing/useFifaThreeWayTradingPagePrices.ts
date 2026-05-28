import { useEffect, useMemo, useRef } from "react";
import type { FifaThreeWayOddsContext } from "@/features/markets/odds-monitor/resolveFifaThreeWayOddsContext";
import { findOddsMatchedMarket } from "@/features/markets/odds-monitor/findOddsMatchedMarket";
import { mergeMonitorLimitlessFromUmbrella } from "@/features/markets/odds-monitor/mergeMonitorLimitlessFromUmbrella";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { buildFifaThreeWayVenuePriceRows } from "@/features/markets/pricing/buildFifaThreeWayVenuePriceRows";
import type { FifaVenueRowModel } from "@/features/markets/pricing/fifaVenueRowModel";
import { isValidProbPrice } from "@/features/markets/pricing/orderbookBbo";
import type { TradingPagePrices } from "@/features/markets/pricing/useTradingPagePrices";
import { useOddsMonitor } from "@/context/OddsMonitorContext";

function computeBestFifaAskIndices(rows: FifaVenueRowModel[]): {
	bestHomeIdx: number;
	bestDrawIdx: number;
	bestAwayIdx: number;
} {
	let bestHome = Infinity;
	let bestHomeIdx = -1;
	let bestDraw = Infinity;
	let bestDrawIdx = -1;
	let bestAway = Infinity;
	let bestAwayIdx = -1;

	rows.forEach((r, i) => {
		if (r.askHome !== null && isValidProbPrice(r.askHome) && r.askHome < bestHome) {
			bestHome = r.askHome;
			bestHomeIdx = i;
		}
		if (r.askDraw !== null && isValidProbPrice(r.askDraw) && r.askDraw < bestDraw) {
			bestDraw = r.askDraw;
			bestDrawIdx = i;
		}
		if (r.askAway !== null && isValidProbPrice(r.askAway) && r.askAway < bestAway) {
			bestAway = r.askAway;
			bestAwayIdx = i;
		}
	});

	return { bestHomeIdx, bestDrawIdx, bestAwayIdx };
}

/** Aggregated 3-way cross-venue prices for FIFA polymarket umbrellas. Returns null when ctx is absent. */
export function useFifaThreeWayTradingPagePrices(
	ctx: FifaThreeWayOddsContext | null,
	umbrellaId?: string | null,
): TradingPagePrices | null {
	const { enabled: wsEnabled, connected, appState } = useOddsMonitor();
	const debugSigRef = useRef("");

	const matchedLegs = useMemo(() => {
		if (!ctx) {
			return { home: null, draw: null, away: null };
		}
		const markets = appState?.markets;
		const uid = umbrellaId ?? undefined;
		return {
			home: mergeMonitorLimitlessFromUmbrella(
				findOddsMatchedMarket(markets, ctx.homeKey, uid),
				ctx.limitlessByLeg.home,
			),
			draw: mergeMonitorLimitlessFromUmbrella(
				findOddsMatchedMarket(markets, ctx.drawKey, uid),
				ctx.limitlessByLeg.draw,
			),
			away: mergeMonitorLimitlessFromUmbrella(
				findOddsMatchedMarket(markets, ctx.awayKey, uid),
				ctx.limitlessByLeg.away,
			),
		};
	}, [appState?.markets, ctx, umbrellaId]);

	const result = useMemo((): TradingPagePrices | null => {
		if (!ctx) return null;

		const base = {
			wsConnected: connected,
			wsEnabled,
			restError: false,
			appState,
			layout: "threeWay" as const,
			matched: matchedLegs.home ?? matchedLegs.draw ?? matchedLegs.away,
		};

		const anyMatched = matchedLegs.home ?? matchedLegs.draw ?? matchedLegs.away;
		if (connected && anyMatched) {
			const fifaVenueRows = buildFifaThreeWayVenuePriceRows(matchedLegs);
			const { bestHomeIdx, bestDrawIdx, bestAwayIdx } = computeBestFifaAskIndices(fifaVenueRows);
			return {
				...base,
				venueRows: [],
				fifaVenueRows,
				fifaColumns: ctx.columns,
				bestAIdx: bestHomeIdx,
				bestBIdx: bestAwayIdx,
				bestDrawIdx,
				bestYesPrice: bestHomeIdx >= 0 ? fifaVenueRows[bestHomeIdx].askHome : null,
				bestNoPrice: bestAwayIdx >= 0 ? fifaVenueRows[bestAwayIdx].askAway : null,
				teamA: ctx.columns.home,
				teamB: ctx.columns.away,
				source: "ws",
				isLoading: false,
			};
		}

		const keysReady = ctx.subscriptionKeys.every((k) => k.trim().length > 0);
		const isLoading = Boolean(wsEnabled && keysReady && connected && !anyMatched);

		return {
			...base,
			venueRows: [],
			fifaVenueRows: [],
			fifaColumns: ctx.columns,
			bestAIdx: -1,
			bestBIdx: -1,
			bestDrawIdx: -1,
			bestYesPrice: null,
			bestNoPrice: null,
			teamA: ctx.columns.home,
			teamB: ctx.columns.away,
			source: "none",
			isLoading,
			matched: null,
		};
	}, [connected, matchedLegs, wsEnabled, appState, ctx]);

	useEffect(() => {
		if (!ctx || !result || !isPredictionPricingDebugEnabled()) return;
		const sig = [
			ctx.homeKey,
			ctx.drawKey,
			ctx.awayKey,
			result.source,
			result.fifaVenueRows
				?.map((r) => `${r.id}:${r.askHome}:${r.askDraw}:${r.askAway}`)
				.join("|") ?? "",
		].join(";");
		if (debugSigRef.current === sig) return;
		debugSigRef.current = sig;
		priceDebugLog("useFifaThreeWayTradingPagePrices (FIFA Basic tab)", {
			homeKey: ctx.homeKey,
			drawKey: ctx.drawKey,
			awayKey: ctx.awayKey,
			source: result.source,
			fifaVenueRows: result.fifaVenueRows,
			columns: ctx.columns,
		});
	}, [ctx, result]);

	return result;
}
