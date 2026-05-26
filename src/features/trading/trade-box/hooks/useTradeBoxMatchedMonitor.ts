/**
 * Odds-monitor match row + tradeable venue set for smart routing.
 *
 * Resolves `matchedMonitor` (PandaScore + umbrella Limitless merge), computes which
 * venues appear in the All Markets strip (`matchedVenues`), `smartRoutingSurfaceActive`,
 * and DFlow Kalshi link metadata. Runs optional pricing debug logs when enabled.
 *
 * Side effect: `useDflowMintResolver` prefetch when multi-venue or DFlow tab is active.
 *
 * Used by: `PredictionMarketTradeBox`, `useTradeBoxVenueWiring`, controller/SOR layer.
 */
import { useEffect, useMemo } from "react";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";
import type { TradingVenue } from "../types";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { getDflowKalshiMonitorLink } from "@/features/trading/venues/dflow/catalog/monitorDflowBooks";
import { useDflowMintResolver } from "@/features/trading/venues/dflow/catalog/useDflowMintResolver";
import {
	levelUpCrossVenueBooksHaveTradeableWholeShareLiquidity,
	orderbookSnapshotHasWholeShareRestingLiquidity,
} from "@/features/trading/venues/levelup/levelUpCrossVenueBookPresence";
import {
	isPredictionPricingDebugEnabled,
	priceDebugLog,
} from "@/features/markets/odds-monitor/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/features/markets/odds-monitor/findOddsMatchedMarket";
import { mergeMonitorLimitlessFromUmbrella } from "@/features/markets/odds-monitor/mergeMonitorLimitlessFromUmbrella";

export function useTradeBoxMatchedMonitor(args: {
	pandaId: string;
	multiVenueEnabled: boolean;
	propUmbrellaId?: string;
	limitlessMappingFromUmbrella?: UmbrellaExchangeMatchingLimitless | null;
	levelUpOrderbook: OrderbookSnapshot | null;
	tradingVenue: TradingVenue;
}) {
	const {
		pandaId,
		multiVenueEnabled,
		propUmbrellaId,
		limitlessMappingFromUmbrella,
		levelUpOrderbook,
		tradingVenue,
	} = args;

	const {
		enabled: oddsMonitorEnabled,
		connected: oddsMonitorConnected,
		appState: oddsAppState,
		sendGetState: refetchMatchedMarkets,
	} = useOddsMonitor();

	const matchedMonitor = useMemo(() => {
		const base = findOddsMatchedMarket(oddsAppState?.markets, pandaId || null, propUmbrellaId);
		return mergeMonitorLimitlessFromUmbrella(base, limitlessMappingFromUmbrella);
	}, [oddsAppState?.markets, pandaId, propUmbrellaId, limitlessMappingFromUmbrella]);

	const matchedVenues = useMemo(() => {
		const set = new Set<string>();
		if (
			(!multiVenueEnabled &&
				(levelUpOrderbook == null ||
					orderbookSnapshotHasWholeShareRestingLiquidity(levelUpOrderbook))) ||
			(multiVenueEnabled &&
				levelUpCrossVenueBooksHaveTradeableWholeShareLiquidity(
					matchedMonitor ?? null,
					levelUpOrderbook,
				))
		) {
			set.add("levelup");
		}
		if (!matchedMonitor) return set;
		if (matchedMonitor.polyConditionId || matchedMonitor.polyTokenIdA) set.add("polymarket");
		if (matchedMonitor.dflow) set.add("dflow");
		if (matchedMonitor.predictFun) set.add("predictfun");
		if (matchedMonitor.limitless) set.add("limitless");
		return set;
	}, [multiVenueEnabled, matchedMonitor, levelUpOrderbook]);

	/** Mirrors smart-routing strip: pandascore link + 2+ tradeable venues → "All Markets" row. */
	const smartRoutingSurfaceActive = useMemo(
		() => Boolean(pandaId && matchedVenues.size > 1),
		[pandaId, matchedVenues],
	);

	useEffect(() => {
		if (!isPredictionPricingDebugEnabled()) return;
		const list = [...matchedVenues];
		priceDebugLog("PredictionMarketTradeBox tradeable venues", {
			pandaId: pandaId || null,
			hasMatchedMonitor: Boolean(matchedMonitor),
			matchedVenues: list,
			note: "Venue list: OddsMonitor MatchedMarket + REST orderbook prop. LevelUp is included only when the chosen LevelUp ladder (cross-venue selection or REST while loading) has at least one whole-share resting bid or ask.",
		});
	}, [pandaId, matchedMonitor, matchedVenues, levelUpOrderbook]);

	const dflowLink = useMemo(
		() => (matchedMonitor ? getDflowKalshiMonitorLink(matchedMonitor) : undefined),
		[matchedMonitor],
	);

	const dflowMintQuery = useDflowMintResolver(
		dflowLink?.eventTicker,
		multiVenueEnabled || tradingVenue === "dflow" ? dflowLink?.tickerA : null,
	);

	return {
		oddsMonitorEnabled,
		oddsMonitorConnected,
		matchedMonitor,
		matchedVenues,
		smartRoutingSurfaceActive,
		dflowLink,
		dflowMintQuery,
		refetchMatchedMarkets,
	};
}
