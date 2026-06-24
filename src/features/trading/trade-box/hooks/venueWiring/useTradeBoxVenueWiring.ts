/**
 * Venue wiring orchestrator — composes sessions, orderbook, and trading gates.
 *
 * Public API for `PredictionMarketTradeBox`. Do not add logic here; extend one of:
 * - `useTradeBoxVenueSessions` (Predict/Poly/Limitless sessions + approvals queries)
 * - `useTradeBoxEffectiveOrderbook` (book selection + market-order math)
 * - `useTradeBoxVenueTradingGates` (button `*Trading` snapshots + venue hints)
 */
import { useTradeBoxVenueSessions } from "./useTradeBoxVenueSessions";
import { useTradeBoxEffectiveOrderbook } from "./useTradeBoxEffectiveOrderbook";
import { useTradeBoxVenueTradingGates } from "./useTradeBoxVenueTradingGates";
import type { UseTradeBoxVenueWiringParams } from "./types";

export type { UseTradeBoxVenueWiringParams } from "./types";

export function useTradeBoxVenueWiring(params: UseTradeBoxVenueWiringParams) {
	const sessions = useTradeBoxVenueSessions(params);
	const orderbook = useTradeBoxEffectiveOrderbook({
		...params,
		predictVenueActive: sessions.predictVenueActive,
		isPredictSingleMarket: sessions.isPredictSingleMarket,
		predictOrderbookQuery: sessions.predictOrderbookQuery,
		moneylineLeg: params.moneylineLeg,
	});
	const tradingGates = useTradeBoxVenueTradingGates({
		...params,
		predictHasMarketIds: sessions.predictHasMarketIds,
		predictNumericId: sessions.predictNumericId,
		predictMarketQuery: sessions.predictMarketQuery,
		predictOrderbookQuery: sessions.predictOrderbookQuery,
		predictMarketDetail: sessions.predictMarketDetail,
		predictSession: sessions.predictSession,
		predictEnsureReady: sessions.predictEnsureReady,
		predictApprovalsQuery: sessions.predictApprovalsQuery,
		limitlessApprovalsQuery: sessions.limitlessApprovalsQuery,
		polyClob: sessions.polyClob,
	});

	return {
		...sessions,
		...orderbook,
		...tradingGates,
	};
}
