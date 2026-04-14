import { useEffect, useMemo, useRef } from "react";
import type { MatchedMarket, OrderbookData, SnapshotStatus } from "@/types/odds-monitor";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { DirectVenueBooks } from "@/trading/venue-books";
import type { VenueBboResponse } from "@/hooks/useVenueBbo";
import { useVenueBbo } from "@/hooks/useVenueBbo";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { getDflowKalshiMonitorLink } from "@/trading/dflow/monitorDflowBooks";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import { isLimitlessConsoleDebugEnabled } from "@/trading/limitless/limitlessConsoleDebug";

const MIN_VALID_PRICE = 0.005;
const MAX_VALID_PRICE = 0.995;

function isValidPrice(p: number): boolean {
	return p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE;
}

export type VenueRowModel = {
	id: string;
	label: string;
	linked: boolean;
	askA: number | null;
	askB: number | null;
	statusA?: SnapshotStatus;
	statusB?: SnapshotStatus;
};

export interface TradingPagePrices {
	venueRows: VenueRowModel[];
	bestAIdx: number;
	bestBIdx: number;
	bestYesPrice: number | null;
	bestNoPrice: number | null;
	teamA: string;
	teamB: string;
	source: "ws" | "rest" | "none";
	wsConnected: boolean;
	wsEnabled: boolean;
	isLoading: boolean;
	restError: boolean;
	matched: MatchedMarket | null;
	appState: ReturnType<typeof useOddsMonitor>["appState"];
}

function bestAskProb(book: OrderbookData | null | undefined): number | null {
	if (!book) return null;
	if (book.bestAsk !== null && book.bestAsk !== undefined) {
		const p = typeof book.bestAsk === "number" ? book.bestAsk : Number(book.bestAsk);
		if (Number.isFinite(p) && p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE) return p;
	}
	if (book.asks?.length) {
		let min = Infinity;
		for (const a of book.asks) {
			if ((a.size ?? 0) > 0 && a.price >= MIN_VALID_PRICE && a.price <= MAX_VALID_PRICE && a.price < min) min = a.price;
		}
		if (min !== Infinity) return min;
	}
	return null;
}

function bestAskFromSnapshot(snap: OrderbookSnapshot | null | undefined): number | null {
	if (!snap?.asks?.length) return null;
	let min = Infinity;
	for (const a of snap.asks) {
		if ((a.size ?? 0) > 0 && a.price >= MIN_VALID_PRICE && a.price <= MAX_VALID_PRICE && a.price < min) min = a.price;
	}
	return min === Infinity ? null : min;
}

function bookStatus(book: OrderbookData | null | undefined): SnapshotStatus | undefined {
	return book?.snapshotStatus;
}

function computeLevelUpRow(orderbook: OrderbookSnapshot | null | undefined): { askA: number | null; askB: number | null } {
	if (!orderbook) return { askA: null, askB: null };
	const posAsks = orderbook.asks?.filter((a) => (a.size ?? 0) > 0 && isValidPrice(a.price)) ?? [];
	const bestAsk = posAsks.length > 0 ? Math.min(...posAsks.map((a) => a.price)) : null;
	const posBids = orderbook.bids?.filter((b) => (b.size ?? 0) > 0 && isValidPrice(b.price)) ?? [];
	const bestBid = posBids.length > 0 ? Math.max(...posBids.map((b) => b.price)) : null;
	const askB = bestBid !== null ? 1 - bestBid : null;
	return {
		askA: bestAsk,
		askB: askB !== null && isValidPrice(askB) ? askB : null,
	};
}

function buildVenueRowsFromWs(
	m: MatchedMarket,
	directBooks: DirectVenueBooks | null | undefined,
	levelUpOrderbook: OrderbookSnapshot | null | undefined,
): VenueRowModel[] {
	const polyAskA = bestAskProb(m.polyPriceA) ?? bestAskFromSnapshot(directBooks?.polyBookA);
	const polyAskB = bestAskProb(m.polyPriceB) ?? bestAskFromSnapshot(directBooks?.polyBookB);

	const dflowLinked = Boolean(getDflowKalshiMonitorLink(m));
	const dflowAskA = dflowLinked
		? (bestAskProb(m.dflowPriceA ?? m.kalshiPriceA) ?? bestAskFromSnapshot(directBooks?.dflowBookA))
		: null;
	const dflowAskB = dflowLinked
		? (bestAskProb(m.dflowPriceB ?? m.kalshiPriceB) ?? bestAskFromSnapshot(directBooks?.dflowBookB))
		: null;

	const externalRows: VenueRowModel[] = [
		{
			id: "poly",
			label: "Polymarket",
			linked: Boolean(m.polyConditionId || m.polyTokenIdA),
			askA: polyAskA,
			askB: polyAskB,
			statusA: bookStatus(m.polyPriceA),
			statusB: bookStatus(m.polyPriceB),
		},
		{
			id: "dflow",
			label: "Kalshi",
			linked: dflowLinked,
			askA: dflowAskA,
			askB: dflowAskB,
			statusA: bookStatus(m.dflowPriceA ?? m.kalshiPriceA),
			statusB: bookStatus(m.dflowPriceB ?? m.kalshiPriceB),
		},
		{
			id: "limitless",
			label: "Limitless",
			linked: Boolean(m.limitless),
			askA: m.limitless ? bestAskProb(m.limitlessPriceA) : null,
			askB: m.limitless ? bestAskProb(m.limitlessPriceB) : null,
			statusA: bookStatus(m.limitlessPriceA),
			statusB: bookStatus(m.limitlessPriceB),
		},
		{
			id: "predictFun",
			label: "Predict",
			linked: Boolean(m.predictFun),
			askA: m.predictFun ? bestAskProb(m.predictFunPriceA) : null,
			askB: m.predictFun ? bestAskProb(m.predictFunPriceB) : null,
			statusA: bookStatus(m.predictFunPriceA),
			statusB: bookStatus(m.predictFunPriceB),
		},
	].filter((r) => r.linked);

	const wsAskA = bestAskProb(m.levelUpPriceA);
	const wsAskB = bestAskProb(m.levelUpPriceB);
	const localLu = computeLevelUpRow(levelUpOrderbook);
	const askA = wsAskA ?? localLu.askA;
	const askB = wsAskB ?? localLu.askB;
	const luRow: VenueRowModel = {
		id: "levelup",
		label: "LevelUp",
		linked: askA !== null || askB !== null,
		askA,
		askB,
		statusA: bookStatus(m.levelUpPriceA),
		statusB: bookStatus(m.levelUpPriceB),
	};

	return luRow.linked ? [luRow, ...externalRows] : externalRows;
}

const VENUE_LABEL_MAP: Record<string, string> = {
	levelup: "LevelUp",
	polymarket: "Polymarket",
	dflow: "Kalshi",
	predictfun: "Predict",
	limitless: "Limitless",
};

function buildVenueRowsFromRest(
	bbo: VenueBboResponse,
	levelUpOrderbook: OrderbookSnapshot | null | undefined,
): VenueRowModel[] {
	const luFromVenues = bbo.venues.find(
		(v) => v.linked && String(v.venue).toLowerCase() === "levelup",
	);
	const luVenueA = luFromVenues?.bestAskA && isValidPrice(luFromVenues.bestAskA) ? luFromVenues.bestAskA : null;
	const luVenueB = luFromVenues?.bestAskB && isValidPrice(luFromVenues.bestAskB) ? luFromVenues.bestAskB : null;
	const luPrices = computeLevelUpRow(levelUpOrderbook);
	const luRestA = bbo.levelup.bestAskA && isValidPrice(bbo.levelup.bestAskA) ? bbo.levelup.bestAskA : null;
	const luRestB = bbo.levelup.bestAskB && isValidPrice(bbo.levelup.bestAskB) ? bbo.levelup.bestAskB : null;

	const askA = luVenueA ?? luPrices.askA ?? luRestA;
	const askB = luVenueB ?? luPrices.askB ?? luRestB;
	const luStatusA = luFromVenues?.status === "no_liquidity" ? ("no_liquidity" as SnapshotStatus) : undefined;
	const luStatusB = luFromVenues?.status === "no_liquidity" ? ("no_liquidity" as SnapshotStatus) : undefined;

	const luRow: VenueRowModel = {
		id: "levelup",
		label: "LevelUp",
		linked: askA !== null || askB !== null,
		askA,
		askB,
		statusA: luStatusA,
		statusB: luStatusB,
	};

	const venueRows: VenueRowModel[] = bbo.venues
		.filter((v) => v.linked && String(v.venue).toLowerCase() !== "levelup")
		.map((v) => ({
			id: v.venue,
			label: VENUE_LABEL_MAP[v.venue] ?? v.venue,
			linked: true,
			askA: v.bestAskA && isValidPrice(v.bestAskA) ? v.bestAskA : null,
			askB: v.bestAskB && isValidPrice(v.bestAskB) ? v.bestAskB : null,
			statusA: v.status === "no_liquidity" ? ("no_liquidity" as SnapshotStatus) : undefined,
			statusB: v.status === "no_liquidity" ? ("no_liquidity" as SnapshotStatus) : undefined,
		}));

	return luRow.linked ? [luRow, ...venueRows] : venueRows;
}

function computeBestIndices(rows: VenueRowModel[]): { bestAIdx: number; bestBIdx: number } {
	let bestA = Infinity;
	let bestAIdx = -1;
	let bestB = Infinity;
	let bestBIdx = -1;
	rows.forEach((r, i) => {
		if (r.askA !== null && isValidPrice(r.askA) && r.askA < bestA) { bestA = r.askA; bestAIdx = i; }
		if (r.askB !== null && isValidPrice(r.askB) && r.askB < bestB) { bestB = r.askB; bestBIdx = i; }
	});
	return { bestAIdx, bestBIdx };
}

/**
 * Single source of truth for venue prices on the trading page.
 * Prioritises live WS data over REST, and computes cross-venue best prices
 * that both the Basic table and Trading module consume.
 */
export function useTradingPagePrices(
	pandascoreMatchId: string,
	levelUpOrderbook: OrderbookSnapshot | null | undefined,
	directBooks: DirectVenueBooks | null | undefined,
	umbrellaId?: string | null,
): TradingPagePrices {
	const { enabled: wsEnabled, connected, appState } = useOddsMonitor();
	const limitlessStripSigRef = useRef("");

	const matched = useMemo((): MatchedMarket | null => {
		return findOddsMatchedMarket(
			appState?.markets,
			pandascoreMatchId,
			umbrellaId,
		);
	}, [appState?.markets, pandascoreMatchId, umbrellaId]);

	const hasDirectBookPrices = Boolean(
		directBooks?.polyBookA?.asks?.length || directBooks?.polyBookB?.asks?.length
		|| directBooks?.dflowBookA?.asks?.length || directBooks?.dflowBookB?.asks?.length
	);
	const wsHasVenuePrices = connected && matched != null && (
		matched.polyPriceA !== null || matched.dflowPriceA !== null
		|| matched.predictFunPriceA !== null || matched.limitlessPriceA !== null
		|| matched.levelUpPriceA !== null || matched.levelUpPriceB !== null
		|| hasDirectBookPrices
	);

	const restBbo = useVenueBbo(pandascoreMatchId, !wsHasVenuePrices);

	const result = useMemo((): TradingPagePrices => {
		const base = { wsConnected: connected, wsEnabled, isLoading: false, restError: false, matched, appState };

		if (wsHasVenuePrices && matched) {
			const rows = buildVenueRowsFromWs(matched, directBooks, levelUpOrderbook);
			const { bestAIdx, bestBIdx } = computeBestIndices(rows);
			const bestYes = bestAIdx >= 0 ? rows[bestAIdx].askA : null;
			const bestNo = bestBIdx >= 0 ? rows[bestBIdx].askB : null;
			return {
				venueRows: rows, bestAIdx, bestBIdx,
				bestYesPrice: bestYes, bestNoPrice: bestNo,
				teamA: matched.pandaTeamA, teamB: matched.pandaTeamB,
				source: "ws", ...base,
			};
		}

		if (restBbo.data) {
			const rows = buildVenueRowsFromRest(restBbo.data, levelUpOrderbook);
			const { bestAIdx, bestBIdx } = computeBestIndices(rows);
			const bestYes = bestAIdx >= 0 ? rows[bestAIdx].askA : null;
			const bestNo = bestBIdx >= 0 ? rows[bestBIdx].askB : null;
			return {
				venueRows: rows, bestAIdx, bestBIdx,
				bestYesPrice: bestYes, bestNoPrice: bestNo,
				teamA: restBbo.data.pandaTeamA, teamB: restBbo.data.pandaTeamB,
				source: "rest", ...base, isLoading: false,
			};
		}

		if (connected && matched) {
			const rows = buildVenueRowsFromWs(matched, directBooks, levelUpOrderbook);
			const { bestAIdx, bestBIdx } = computeBestIndices(rows);
			const bestYes = bestAIdx >= 0 ? rows[bestAIdx].askA : null;
			const bestNo = bestBIdx >= 0 ? rows[bestBIdx].askB : null;
			return {
				venueRows: rows, bestAIdx, bestBIdx,
				bestYesPrice: bestYes, bestNoPrice: bestNo,
				teamA: matched.pandaTeamA, teamB: matched.pandaTeamB,
				source: "ws", ...base,
			};
		}

		return {
			venueRows: [], bestAIdx: -1, bestBIdx: -1,
			bestYesPrice: null, bestNoPrice: null,
			teamA: "", teamB: "",
			source: "none", ...base,
			isLoading: restBbo.isLoading,
			restError: Boolean(restBbo.error),
		};
	}, [wsHasVenuePrices, connected, matched, levelUpOrderbook, restBbo.data, restBbo.isLoading, restBbo.error, directBooks, wsEnabled, appState]);

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
			note:
				"Primary: venue-prices WS + direct browser books when linked; fallback REST useVenueBbo when WS has no venue snapshots.",
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
