import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import OrderbookDisplay from "@/components/OrderbookDisplay/OrderbookDisplay";
import MarketLogo from "@/components/MarketLogo/MarketLogo";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { TradingVenue } from "@/pages/PredictionMarket/PredictionMarketTradeBox/types";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";
import { mergeMonitorLimitlessFromUmbrella } from "@/utils/mergeMonitorLimitlessFromUmbrella";
import { getDflowKalshiMonitorLink } from "@/trading/venues/dflow/catalog/monitorDflowBooks";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import {
	computeLevelUpCrossVenueBooks,
	monitorOrderbookDataToRestingSnapshot,
} from "@/trading/venues/levelup/levelUpCrossVenueBookPresence";

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
): VenueEntry[] {
	const entries: VenueEntry[] = [];

	const { hasLevelUp, luBookA, luBookB } = computeLevelUpCrossVenueBooks(
		matched,
		levelUpOrderbook,
	);

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
		entries.push({
			id: "poly",
			label: "Polymarket",
			bookA: monitorOrderbookDataToRestingSnapshot(matched.polyPriceA),
			bookB: monitorOrderbookDataToRestingSnapshot(matched.polyPriceB),
			restricted: false,
		});
	}

	if (getDflowKalshiMonitorLink(matched)) {
		entries.push({
			id: "dflow",
			label: "Kalshi",
			bookA: monitorOrderbookDataToRestingSnapshot(
				matched.dflowPriceA ?? matched.kalshiPriceA,
			),
			bookB: monitorOrderbookDataToRestingSnapshot(
				matched.dflowPriceB ?? matched.kalshiPriceB,
			),
			restricted: false,
		});
	}

	if (matched.limitless) {
		entries.push({
			id: "limitless",
			label: "Limitless",
			bookA: monitorOrderbookDataToRestingSnapshot(matched.limitlessPriceA),
			bookB: monitorOrderbookDataToRestingSnapshot(matched.limitlessPriceB),
			restricted: false,
		});
	}

	if (matched.predictFun) {
		const singleMarket = matched.predictFun.singleMarket === true;
		entries.push({
			id: "predictFun",
			label: "Predict",
			bookA: monitorOrderbookDataToRestingSnapshot(matched.predictFunPriceA),
			// One CLOB: second tab inverts team A ladder (same model as trade box), not a separate B stream.
			bookB: singleMarket
				? null
				: monitorOrderbookDataToRestingSnapshot(matched.predictFunPriceB),
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
		return buildVenueEntries(matched, levelUpOrderbook);
	}, [matched, levelUpOrderbook]);

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
			note: "Books from MatchedMarket (venue-prices WS) + multiplex LevelUp orderbook snapshot.",
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
						wholeContractRestingBook={
							selectedVenue.id === "dflow" ||
							selectedVenue.id === "levelup"
						}
					/>
				)}
			</div>
		</div>
	);
}
