import { useEffect, useMemo, useRef } from "react";
import type { MatchedMarket } from "@/types/odds-monitor";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/features/markets/odds-monitor/findOddsMatchedMarket";
import { mergeMonitorLimitlessFromUmbrella } from "@/features/markets/odds-monitor/mergeMonitorLimitlessFromUmbrella";
import { isLimitlessConsoleDebugEnabled } from "@/features/trading/venues/limitless/trade/limitlessConsoleDebug";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";
import {
	buildVenuePriceRows,
	computeBestVenueAskIndices,
} from "@/features/markets/pricing/buildVenuePriceRows";
import { isValidProbPrice } from "@/features/markets/pricing/orderbookBbo";
import type {
	FifaThreeWayColumns,
	FifaVenueRowModel,
} from "@/features/markets/pricing/fifaVenueRowModel";
import type { VenueRowModel } from "@/features/markets/pricing/venueRowModel";

export type { VenueRowModel } from "@/features/markets/pricing/venueRowModel";
export type {
	FifaVenueRowModel,
	FifaThreeWayColumns,
} from "@/features/markets/pricing/fifaVenueRowModel";

export type TradingPagePricesLayout = "binary" | "threeWay";

export interface TradingPagePrices {
	layout: TradingPagePricesLayout;
	venueRows: VenueRowModel[];
	/** FIFA 3-way rows when `layout === "threeWay"`. */
	fifaVenueRows?: FifaVenueRowModel[];
	fifaColumns?: FifaThreeWayColumns;
	bestAIdx: number;
	bestBIdx: number;
	/** Best draw column index when `layout === "threeWay"`. */
	bestDrawIdx?: number;
	bestYesPrice: number | null;
	bestNoPrice: number | null;
	teamA: string;
	teamB: string;
	source: "ws" | "none";
	wsConnected: boolean;
	wsEnabled: boolean;
	isLoading: boolean;
	restError: boolean;
	matched: MatchedMarket | null;
	appState: ReturnType<typeof useOddsMonitor>["appState"];
}

/** Map venue price row id → `VenuePosition.venue` key used in portfolio hooks. */
const PRICE_ROW_TO_VENUE_SHARE_KEY: Record<string, string> = {
	levelup: "levelup",
	poly: "polymarket",
	polymarket: "polymarket",
	predictFun: "predictfun",
	predictfun: "predictfun",
	dflow: "dflow",
	limitless: "limitless",
};

/**
 * Best sell (highest bid) for an outcome among venues where the user holds shares.
 * Used for All Markets sell tab position buttons only.
 */
export function maxAllMarketsSellBidForOutcome(
	rows: VenueRowModel[],
	outcome: "yes" | "no",
	venueShares: Record<string, number>,
): number | null {
	const bidKey = outcome === "yes" ? "bidA" : "bidB";
	let best: number | null = null;
	for (const r of rows) {
		const vKey = PRICE_ROW_TO_VENUE_SHARE_KEY[r.id] ?? r.id;
		const held = venueShares[vKey] ?? 0;
		if (!(held > 0)) continue;
		const bid = r[bidKey];
		if (bid === null || !isValidProbPrice(bid)) continue;
		if (best === null || bid > best) best = bid;
	}
	return best;
}

/**
 * Single source of truth for venue prices on the trading page.
 * Uses OddsMonitor (`/ws/venue-prices` → `MatchedMarket`) only — no direct venue sockets or REST merge.
 */
export function useTradingPagePrices(
	pandascoreMatchId: string,
	umbrellaId?: string | null,
	/** When `/matched-markets` omits limitless but the umbrella has it (env skew). */
	limitlessFromUmbrella?: UmbrellaExchangeMatchingLimitless | null,
): TradingPagePrices {
	const { enabled: wsEnabled, connected, appState } = useOddsMonitor();
	const limitlessStripSigRef = useRef("");

	const matched = useMemo((): MatchedMarket | null => {
		const base = findOddsMatchedMarket(appState?.markets, pandascoreMatchId, umbrellaId);
		return mergeMonitorLimitlessFromUmbrella(base, limitlessFromUmbrella);
	}, [appState?.markets, pandascoreMatchId, umbrellaId, limitlessFromUmbrella]);

	const result = useMemo((): TradingPagePrices => {
		const base = { wsConnected: connected, wsEnabled, restError: false, matched, appState };

		if (connected && matched) {
			const rows = buildVenuePriceRows(matched);
			const { bestAIdx, bestBIdx } = computeBestVenueAskIndices(rows);
			const bestYes = bestAIdx >= 0 ? rows[bestAIdx].askA : null;
			const bestNo = bestBIdx >= 0 ? rows[bestBIdx].askB : null;
			return {
				layout: "binary",
				venueRows: rows,
				bestAIdx,
				bestBIdx,
				bestYesPrice: bestYes,
				bestNoPrice: bestNo,
				teamA: matched.pandaTeamA,
				teamB: matched.pandaTeamB,
				source: "ws",
				...base,
				isLoading: false,
			};
		}

		const pandaReady = pandascoreMatchId.trim().length > 0;
		const isLoading = Boolean(wsEnabled && pandaReady && connected && !matched);

		return {
			layout: "binary",
			venueRows: [],
			bestAIdx: -1,
			bestBIdx: -1,
			bestYesPrice: null,
			bestNoPrice: null,
			teamA: "",
			teamB: "",
			source: "none",
			...base,
			isLoading,
		};
	}, [connected, matched, wsEnabled, appState, pandascoreMatchId]);

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		const rowSummary = result.venueRows.map((r) => ({
			id: r.id,
			linked: r.linked,
			askA: r.askA,
			askB: r.askB,
		}));
		priceDebugLog("useTradingPagePrices (trading strip / Basic tab)", {
			pandascoreMatchId,
			source: result.source,
			wsConnected: result.wsConnected,
			wsEnabled: result.wsEnabled,
			matchedPandaId: result.matched?.pandaMatchId ?? null,
			bestAIdx: result.bestAIdx,
			bestBIdx: result.bestBIdx,
			bestYesPrice: result.bestYesPrice,
			bestNoPrice: result.bestNoPrice,
			venueRows: rowSummary,
			isLoading: result.isLoading,
			restError: result.restError,
			note: "Strip prices: venue-prices WS MatchedMarket only (no direct venue WS or metadata BBO fallbacks).",
		});
	}, [
		pandascoreMatchId,
		result.source,
		result.wsConnected,
		result.wsEnabled,
		result.matched,
		result.bestAIdx,
		result.bestBIdx,
		result.bestYesPrice,
		result.bestNoPrice,
		result.venueRows,
		result.isLoading,
		result.restError,
	]);

	useEffect(() => {
		if (!isLimitlessConsoleDebugEnabled()) return;
		const m = result.matched;
		if (!m?.limitless) return;
		const row = result.venueRows.find((r) => r.id === "limitless");
		const sig = [
			pandascoreMatchId,
			String(umbrellaId ?? ""),
			result.source,
			row?.askA ?? "",
			row?.askB ?? "",
			m.limitlessPriceA?.bestAsk ?? "",
			m.limitlessPriceB?.bestAsk ?? "",
			row?.statusA ?? "",
			row?.statusB ?? "",
		].join("|");
		if (limitlessStripSigRef.current === sig) return;
		limitlessStripSigRef.current = sig;
		console.info("[limitless/trading-strip-prices]", {
			pandascoreMatchId: pandascoreMatchId || null,
			umbrellaId: umbrellaId ?? null,
			source: result.source,
			wsConnected: result.wsConnected,
			slug: m.limitless.slug,
			orderbookSlugA: m.limitless.orderbookSlugA ?? null,
			orderbookSlugB: m.limitless.orderbookSlugB ?? null,
			venueRowAskProbA: row?.askA ?? null,
			venueRowAskProbB: row?.askB ?? null,
			venueRowStatusA: row?.statusA ?? null,
			venueRowStatusB: row?.statusB ?? null,
			wsBookBestAskA: m.limitlessPriceA?.bestAsk ?? null,
			wsBookBestBidA: m.limitlessPriceA?.bestBid ?? null,
			wsBookBestAskB: m.limitlessPriceB?.bestAsk ?? null,
			wsBookBestBidB: m.limitlessPriceB?.bestBid ?? null,
			wsBookSnapshotStatusA: m.limitlessPriceA?.snapshotStatus ?? null,
			wsBookSnapshotStatusB: m.limitlessPriceB?.snapshotStatus ?? null,
			wsBookAskLevelsA: m.limitlessPriceA?.asks?.length ?? 0,
			wsBookAskLevelsB: m.limitlessPriceB?.asks?.length ?? 0,
		});
	}, [
		pandascoreMatchId,
		umbrellaId,
		result.matched,
		result.venueRows,
		result.source,
		result.wsConnected,
	]);

	return result;
}
