/**
 * Backward-compatible context that builds the old OddsMonitorAppState shape
 * from the new predictions-api data sources:
 *   - Market identifiers: matchDataService (REST poll to predictions-api /matched-markets)
 *   - Live prices: VenuePriceContext (WebSocket to predictions-api /ws/venue-prices)
 *
 * Consumers (PredictionMarketTradeBox, trading utilities) continue using
 * `useOddsMonitor()` with the same MatchedMarket type until a deeper refactor
 * of trading utilities to the VenuePriceContext directly.
 */
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useVenuePrices } from "./VenuePriceContext";
import { fetchMatchedMarkets } from "@/services/api/matchDataService";
import type { MatchedMarketExchange } from "@/services/api/matchDataService";
import type { MatchedMarket, OddsMonitorAppState, OrderbookData } from "@/types/odds-monitor";
import type { VenuePriceSnapshot, VenuePriceTeam } from "@/types/venue-prices";

const IDENTIFIER_POLL_MS = 30_000;

function teamToOrderbook(team: VenuePriceTeam | undefined): OrderbookData | null {
	if (!team) return null;
	return {
		bestBid: team.bestBid,
		bestAsk: team.bestAsk,
		bids: team.bids,
		asks: team.asks,
		bidLevels: team.bidLevels,
		askLevels: team.askLevels,
		totalBidLiquidity: team.totalBidLiquidity,
		totalAskLiquidity: team.totalAskLiquidity,
	};
}

function buildMatchedMarket(
	id: MatchedMarketExchange,
	snapshots: VenuePriceSnapshot[],
): MatchedMarket {
	const priceByVenue = new Map<string, VenuePriceSnapshot>();
	for (const s of snapshots) {
		priceByVenue.set(s.venue, s);
	}

	const polySnap = priceByVenue.get("polymarket");
	const kalshiSnap = priceByVenue.get("kalshi");
	const dflowSnap = priceByVenue.get("dflow");
	const predictSnap = priceByVenue.get("predictfun");
	const limitlessSnap = priceByVenue.get("limitless");

	return {
		pandaMatchId: id.pandaMatchId,
		polyConditionId: id.polyConditionId,
		pandaTeamA: id.pandaTeamA,
		pandaTeamB: id.pandaTeamB,
		polyTokenIdA: id.polyTokenIdA,
		polyTokenIdB: id.polyTokenIdB,
		sidesSwapped: false,
		startTime: id.startTime,
		status: id.status,
		game: id.game,
		polyTickSize: (id.polyTickSize as MatchedMarket["polyTickSize"]) ?? null,
		polyNegRisk: id.polyNegRisk ?? null,
		polyPriceA: teamToOrderbook(polySnap?.teamA),
		polyPriceB: teamToOrderbook(polySnap?.teamB),
		kalshi: id.kalshi,
		kalshiPriceA: teamToOrderbook(kalshiSnap?.teamA),
		kalshiPriceB: teamToOrderbook(kalshiSnap?.teamB),
		dflow: id.dflow,
		dflowPriceA: teamToOrderbook(dflowSnap?.teamA),
		dflowPriceB: teamToOrderbook(dflowSnap?.teamB),
		predictFun: id.predictFun,
		predictFunPriceA: teamToOrderbook(predictSnap?.teamA),
		predictFunPriceB: teamToOrderbook(predictSnap?.teamB),
		limitlessPriceA: teamToOrderbook(limitlessSnap?.teamA),
		limitlessPriceB: teamToOrderbook(limitlessSnap?.teamB),
	};
}

export type OddsMonitorContextValue = {
	enabled: boolean;
	connected: boolean;
	appState: OddsMonitorAppState | null;
	lastWsError: string | null;
	wsUrl: string | null;
	sendGetState: () => void;
};

const OddsMonitorContext = createContext<OddsMonitorContextValue | null>(null);

export function OddsMonitorProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { enabled, connected, prices, lastWsError } = useVenuePrices();
	const [identifiers, setIdentifiers] = useState<MatchedMarketExchange[]>([]);
	const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		let cancelled = false;

		const poll = async () => {
			try {
				const data = await fetchMatchedMarkets();
				if (!cancelled) setIdentifiers(data);
			} catch (err) {
				console.error("error", err);
			}
		};

		poll();
		timerRef.current = setInterval(poll, IDENTIFIER_POLL_MS);

		return () => {
			cancelled = true;
			if (timerRef.current) clearInterval(timerRef.current);
		};
	}, []);

	const appState = useMemo((): OddsMonitorAppState | null => {
		if (identifiers.length === 0) return null;
		const markets: MatchedMarket[] = identifiers.map((id) => {
			const snapshots = prices.get(id.pandaMatchId) ?? [];
			return buildMatchedMarket(id, snapshots);
		});
		return { timestamp: Date.now(), markets };
	}, [identifiers, prices]);

	const sendGetState = useMemo(() => () => {}, []);

	const value = useMemo(
		(): OddsMonitorContextValue => ({
			enabled,
			connected,
			appState,
			lastWsError,
			wsUrl: null,
			sendGetState,
		}),
		[enabled, connected, appState, lastWsError, sendGetState],
	);

	return (
		<OddsMonitorContext.Provider value={value}>
			{children}
		</OddsMonitorContext.Provider>
	);
}

export function useOddsMonitor(): OddsMonitorContextValue {
	const ctx = useContext(OddsMonitorContext);
	if (!ctx) {
		throw new Error("useOddsMonitor must be used within OddsMonitorProvider");
	}
	return ctx;
}
