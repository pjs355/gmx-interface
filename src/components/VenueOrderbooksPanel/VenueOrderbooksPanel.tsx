import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import OrderbookDisplay from "@/components/OrderbookDisplay/OrderbookDisplay";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { TradingVenue } from "@/pages/PredictionMarket/PredictionMarketTradeBox/types";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { DirectVenueBooks } from "@/trading/venue-books";
import { getDflowKalshiMonitorLink } from "@/trading/dflow/monitorDflowBooks";

function monitorBookToSnapshot(book: OrderbookData | null | undefined): OrderbookSnapshot | null {
	if (!book) return null;
	const asks = (book.asks ?? []).map((l, i) => ({ price: l.price, size: l.size, id: `a-${i}` }));
	const bids = (book.bids ?? []).map((l, i) => ({ price: l.price, size: l.size, id: `b-${i}` }));
	if (asks.length === 0 && bids.length === 0 && book.bestAsk == null && book.bestBid == null) {
		return null;
	}
	if (asks.length === 0 && book.bestAsk != null) {
		asks.push({ price: book.bestAsk, size: 0, id: "synth-a" });
	}
	if (bids.length === 0 && book.bestBid != null) {
		bids.push({ price: book.bestBid, size: 0, id: "synth-b" });
	}
	return {
		asks,
		bids,
		stopBook: { asks: [], bids: [] },
		ts: book.lastUpdated ?? Date.now(),
		lastOp: 0,
	};
}

type VenueEntry = {
	id: string;
	label: string;
	bookA: OrderbookSnapshot | null;
	bookB: OrderbookSnapshot | null;
	restricted: boolean;
};

function buildVenueEntries(
	matched: MatchedMarket,
	levelUpOrderbook: OrderbookSnapshot | null,
	directBooks?: DirectVenueBooks | null,
): VenueEntry[] {
	const entries: VenueEntry[] = [];

	const wsBookA = monitorBookToSnapshot(matched.levelUpPriceA);
	const wsBookB = monitorBookToSnapshot(matched.levelUpPriceB);

	const restHasDepth = levelUpOrderbook &&
		((levelUpOrderbook.asks?.length ?? 0) + (levelUpOrderbook.bids?.length ?? 0)) > 2;
	const luBookA = restHasDepth ? levelUpOrderbook : (wsBookA ?? levelUpOrderbook);
	const luBookB = restHasDepth ? null : wsBookB;
	const hasLevelUp = Boolean(luBookA || luBookB);

	if (hasLevelUp) {
		entries.push({
			id: "levelup",
			label: "LevelUp",
			bookA: luBookA,
			bookB: luBookB,
			restricted: false,
		});
	}

	if (matched.polyConditionId || matched.polyTokenIdA) {
		const polyRestricted = directBooks !== undefined
			&& directBooks !== null
			&& directBooks.polyFailed
			&& !directBooks.polyBookA;
		entries.push({
			id: "poly",
			label: "Polymarket",
			bookA: directBooks?.polyBookA ?? monitorBookToSnapshot(matched.polyPriceA),
			bookB: directBooks?.polyBookB ?? monitorBookToSnapshot(matched.polyPriceB),
			restricted: polyRestricted,
		});
	}

	if (getDflowKalshiMonitorLink(matched)) {
		const useDirect = directBooks && !directBooks.dflowFallback;
		const dflowRestricted = directBooks?.dflowFallback === true
			&& !matched.dflowPriceA;
		entries.push({
			id: "dflow",
			label: "Kalshi",
			bookA: (useDirect ? directBooks.dflowBookA : null) ?? monitorBookToSnapshot(matched.dflowPriceA ?? matched.kalshiPriceA),
			bookB: (useDirect ? directBooks.dflowBookB : null) ?? monitorBookToSnapshot(matched.dflowPriceB ?? matched.kalshiPriceB),
			restricted: dflowRestricted,
		});
	}

	if (matched.limitless) {
		entries.push({
			id: "limitless",
			label: "Limitless",
			bookA: monitorBookToSnapshot(matched.limitlessPriceA),
			bookB: monitorBookToSnapshot(matched.limitlessPriceB),
			restricted: false,
		});
	}

	if (matched.predictFun) {
		entries.push({
			id: "predictFun",
			label: "Predict",
			bookA: monitorBookToSnapshot(matched.predictFunPriceA),
			bookB: monitorBookToSnapshot(matched.predictFunPriceB),
			restricted: false,
		});
	}

	return entries;
}

function venueIdToTradingVenue(id: string): TradingVenue | null {
	switch (id) {
		case "levelup": return "levelup";
		case "poly": return "polymarket";
		case "dflow": return "dflow";
		case "predictFun": return "predictfun";
		default: return null;
	}
}

type Props = {
	pandascoreMatchId: string;
	levelUpOrderbook: OrderbookSnapshot | null;
	market?: PredictionMarket;
	umbrellaDisplayName?: string;
	onMarketSwitch?: (market: PredictionMarket, position: "yes" | "no") => void;
	onVenueSelect?: (venue: TradingVenue) => void;
	activePosition?: "yes" | "no";
	side?: "buy" | "sell";
	directBooks?: DirectVenueBooks | null;
};

export function VenueOrderbooksPanel({
	pandascoreMatchId,
	levelUpOrderbook,
	market,
	umbrellaDisplayName,
	onMarketSwitch,
	onVenueSelect,
	activePosition,
	side = "buy",
	directBooks,
}: Props) {
	const { appState } = useOddsMonitor();
	const [openVenueId, setOpenVenueId] = useState<string | null>(null);
	const hasDefaultedRef = useRef(false);
	const hasLiquidityDefaultedRef = useRef(false);
	const marketSwitchFiredRef = useRef(false);

	const matched = useMemo((): MatchedMarket | null => {
		if (!appState?.markets?.length) return null;
		const id = String(pandascoreMatchId);
		return appState.markets.find((m) => String(m.pandaMatchId) === id) ?? null;
	}, [appState?.markets, pandascoreMatchId]);

	const venues = useMemo(() => {
		if (!matched) return [];
		return buildVenueEntries(matched, levelUpOrderbook, directBooks);
	}, [matched, levelUpOrderbook, directBooks]);

	useEffect(() => {
		if (venues.length === 0) return;

		if (!hasDefaultedRef.current) {
			setOpenVenueId(venues[0].id);
			hasDefaultedRef.current = true;
		}

		if (!hasLiquidityDefaultedRef.current) {
			const sorted = [...venues].sort((a, b) => a.label.localeCompare(b.label));
			const withLiquidity = sorted.find((v) => {
				if (!v.bookA) return false;
				const asks = v.bookA.asks ?? [];
				const bids = v.bookA.bids ?? [];
				return asks.some((e) => (e.size ?? 0) > 0) || bids.some((e) => (e.size ?? 0) > 0);
			});
			if (withLiquidity) {
				setOpenVenueId(withLiquidity.id);
				hasLiquidityDefaultedRef.current = true;
			}
		}
	}, [venues]);

	const handleToggle = useCallback((venueId: string) => {
		if (marketSwitchFiredRef.current) {
			marketSwitchFiredRef.current = false;
			return;
		}
		setOpenVenueId((prev) => {
			const opening = prev !== venueId;
			if (opening && onVenueSelect) {
				const tv = venueIdToTradingVenue(venueId);
				if (tv) onVenueSelect(tv);
			}
			return opening ? venueId : null;
		});
	}, [onVenueSelect]);

	const makeMarketSwitchHandler = useCallback((venueId: string) => {
		return (m: PredictionMarket, position: "yes" | "no") => {
			if (onMarketSwitch) onMarketSwitch(m, position);
			const tv = venueIdToTradingVenue(venueId);
			if (tv && onVenueSelect) onVenueSelect(tv);
			setOpenVenueId(venueId);
			marketSwitchFiredRef.current = true;
			Promise.resolve().then(() => { marketSwitchFiredRef.current = false; });
		};
	}, [onMarketSwitch, onVenueSelect]);

	if (venues.length === 0) return null;

	return (
		<div className="venue-orderbooks-panel">
			{venues.map((venue) => {
				const isLevelUp = venue.id === "levelup";

				if (venue.restricted) {
					return (
						<div key={venue.id} className="question-orderbook">
							<div
								style={{
									padding: "12px 16px",
									background: "rgba(251, 191, 36, 0.08)",
									border: "1px solid rgba(251, 191, 36, 0.25)",
									borderRadius: 6,
									color: "rgba(253, 224, 71, 0.9)",
									fontSize: "0.88rem",
									display: "flex",
									alignItems: "center",
									gap: 8,
								}}
							>
								<span style={{ fontSize: "1.1rem" }}>&#9888;</span>
								<span>{venue.label} orderbook is unavailable from your region</span>
							</div>
						</div>
					);
				}

				return (
					<div key={venue.id} className="question-orderbook">
						<OrderbookDisplay
							orderbook={venue.bookA}
							noSideOrderbook={isLevelUp ? undefined : venue.bookB}
							loading={!venue.bookA}
							error={null}
							customTitle={venue.label}
							market={market}
							umbrellaDisplayName={umbrellaDisplayName}
							onMarketSwitch={makeMarketSwitchHandler(venue.id)}
							onOrderbookToggle={() => handleToggle(venue.id)}
							isActiveMarket={false}
							activePosition={activePosition}
							isCollapsed={openVenueId !== venue.id}
							side={side}
						/>
					</div>
				);
			})}
		</div>
	);
}
