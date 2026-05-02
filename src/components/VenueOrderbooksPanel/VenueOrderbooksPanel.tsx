import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import OrderbookDisplay from "@/components/OrderbookDisplay/OrderbookDisplay";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { TradingVenue } from "@/pages/PredictionMarket/PredictionMarketTradeBox/types";
import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";
import { mergeMonitorLimitlessFromUmbrella } from "@/utils/mergeMonitorLimitlessFromUmbrella";
import type { DirectVenueBooks } from "@/trading/venue-books";
import { getDflowKalshiMonitorLink } from "@/trading/dflow/monitorDflowBooks";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";

/** Only real resting depth (positive size). No BBO-only or zero-size synthetic rows. */
function monitorBookToSnapshot(book: OrderbookData | null | undefined): OrderbookSnapshot | null {
	if (!book) return null;
	const asks = (book.asks ?? [])
		.filter((l) => Number(l.size) > 0)
		.map((l, i) => ({ price: l.price, size: l.size, id: `a-${i}` }));
	const bids = (book.bids ?? [])
		.filter((l) => Number(l.size) > 0)
		.map((l, i) => ({ price: l.price, size: l.size, id: `b-${i}` }));
	if (asks.length === 0 && bids.length === 0) return null;
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
			bookA: directBooks?.limitlessBookA ?? monitorBookToSnapshot(matched.limitlessPriceA),
			bookB: directBooks?.limitlessBookB ?? monitorBookToSnapshot(matched.limitlessPriceB),
			restricted: false,
		});
	}

	if (matched.predictFun) {
		const singleMarket = matched.predictFun.singleMarket === true;
		entries.push({
			id: "predictFun",
			label: "Predict",
			bookA: monitorBookToSnapshot(matched.predictFunPriceA),
			// One CLOB: second tab inverts team A ladder (same model as trade box), not a separate B stream.
			bookB: singleMarket ? null : monitorBookToSnapshot(matched.predictFunPriceB),
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
		case "limitless": return "limitless";
		default: return null;
	}
}

export type VenueOrderbooksPanelProps = {
	pandascoreMatchId: string;
	umbrellaId?: string;
	/** Fallback when odds-monitor row omits limitless (prod /matched-markets skew). */
	limitlessFromUmbrella?: UmbrellaExchangeMatchingLimitless | null;
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
	umbrellaId,
	limitlessFromUmbrella,
	levelUpOrderbook,
	market,
	umbrellaDisplayName,
	onMarketSwitch,
	onVenueSelect,
	activePosition,
	side = "buy",
	directBooks,
}: VenueOrderbooksPanelProps) {
	const { appState } = useOddsMonitor();
	const [selectedVenueId, setSelectedVenueId] = useState("");
	const hasDefaultedRef = useRef(false);
	const hasLiquidityDefaultedRef = useRef(false);

	const matched = useMemo((): MatchedMarket | null => {
		const base = findOddsMatchedMarket(
			appState?.markets,
			pandascoreMatchId,
			umbrellaId,
		);
		return mergeMonitorLimitlessFromUmbrella(base, limitlessFromUmbrella);
	}, [appState?.markets, pandascoreMatchId, umbrellaId, limitlessFromUmbrella]);

	const venues = useMemo(() => {
		if (!matched) return [];
		return buildVenueEntries(matched, levelUpOrderbook, directBooks);
	}, [matched, levelUpOrderbook, directBooks]);

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		const depth = (snap: OrderbookSnapshot | null | undefined) => {
			if (!snap) return { asks: 0, bids: 0, hasSize: false };
			const asks = snap.asks?.filter((a) => (a.size ?? 0) > 0).length ?? 0;
			const bids = snap.bids?.filter((b) => (b.size ?? 0) > 0).length ?? 0;
			return {
				asks: snap.asks?.length ?? 0,
				bids: snap.bids?.length ?? 0,
				hasSize: asks > 0 || bids > 0,
			};
		};
		priceDebugLog("VenueOrderbooksPanel (Orderbooks tab)", {
			pandascoreMatchId,
			hasMatched: Boolean(matched),
			entryCount: venues.length,
			entries: venues.map((v) => ({
				id: v.id,
				label: v.label,
				restricted: v.restricted,
				bookA: depth(v.bookA),
				bookB: depth(v.bookB),
			})),
			note: "Books from MatchedMarket (venue-prices WS) + directBooks browser WS when enabled + LevelUp orderbook REST snapshot.",
		});
	}, [pandascoreMatchId, matched, venues]);

	useEffect(() => {
		if (venues.length === 0) return;

		if (!hasDefaultedRef.current) {
			setSelectedVenueId(venues[0].id);
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
				setSelectedVenueId(withLiquidity.id);
				hasLiquidityDefaultedRef.current = true;
			}
		}
	}, [venues]);

	useEffect(() => {
		if (venues.length === 0 || !selectedVenueId) return;
		if (!venues.some((v) => v.id === selectedVenueId)) {
			setSelectedVenueId(venues[0].id);
		}
	}, [venues, selectedVenueId]);

	const selectVenue = useCallback(
		(venueId: string) => {
			setSelectedVenueId(venueId);
			const tv = venueIdToTradingVenue(venueId);
			if (tv && onVenueSelect) onVenueSelect(tv);
		},
		[onVenueSelect],
	);

	const handleMarketSwitchOnly = useCallback(
		(m: PredictionMarket, position: "yes" | "no") => {
			if (onMarketSwitch) onMarketSwitch(m, position);
		},
		[onMarketSwitch],
	);

	if (venues.length === 0) return null;

	const activeVenueId = selectedVenueId || venues[0].id;
	const selectedVenue =
		venues.find((v) => v.id === activeVenueId) ?? venues[0];
	const isLevelUp = selectedVenue.id === "levelup";

	return (
		<div className="venue-orderbooks-panel">
			<div
				className="venue-orderbooks-pill-strip venue-tab-switcher"
				role="tablist"
				aria-label="Venue orderbooks"
			>
				{venues.map((venue) => (
					<button
						key={venue.id}
						type="button"
						role="tab"
						aria-selected={activeVenueId === venue.id}
						className={`venue-tab-btn${activeVenueId === venue.id ? " venue-tab-btn--active" : ""}${venue.restricted ? " venue-tab-btn--restricted" : ""}`}
						onClick={() => selectVenue(venue.id)}
					>
						<span className="venue-tab-btn__inner">
							<MarketLogo venue={venue.id} size={16} />
							<span>{venue.label}</span>
						</span>
					</button>
				))}
			</div>

			<div className="question-orderbook">
				{selectedVenue.restricted ? (
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
						<span>
							{selectedVenue.label} orderbook is unavailable from your region
						</span>
					</div>
				) : (
					<OrderbookDisplay
						layout="embedded"
						orderbook={selectedVenue.bookA}
						noSideOrderbook={isLevelUp ? undefined : selectedVenue.bookB}
						loading={!selectedVenue.bookA}
						error={null}
						market={market}
						umbrellaDisplayName={umbrellaDisplayName}
						onMarketSwitch={handleMarketSwitchOnly}
						isActiveMarket
						activePosition={activePosition}
						isCollapsed={false}
						side={side}
					/>
				)}
			</div>
		</div>
	);
}
