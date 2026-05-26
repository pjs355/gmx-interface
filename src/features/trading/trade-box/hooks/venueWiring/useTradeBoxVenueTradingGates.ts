/**
 * Venue readiness snapshots for the trade button and per-tab blocked hints.
 *
 * Produces `polymarketTrading`, `predictTrading`, `limitlessTrading` objects
 * consumed by `useTradeBoxTradeButton` / `resolveButtonState`, plus optional
 * `*VenueHint` strings when a single-venue tab cannot trade yet.
 *
 * Reads session state from `useTradeBoxVenueSessions`; does not fetch books.
 */
import { useMemo } from "react";
import { formatErrorForUser } from "@/errors";
import { hasDflowKalshiMonitorLink } from "@/features/trading/venues/dflow/catalog/monitorDflowBooks";
import type { usePolymarketClobTradingSession } from "@/features/trading/venues/polymarket/session/usePolymarketClobTradingSession";
import type { usePredictTradingSession } from "@/features/trading/venues/predict/session/usePredictTradingSession";
import type { usePredictEnsureExecutionReady } from "@/features/trading/venues/predict/session/usePredictEnsureExecutionReady";
import type { usePredictMarketDetail } from "@/features/trading/venues/predict/portfolio/usePredictMarketDetail";
import type { usePredictOrderbook } from "@/features/trading/venues/predict/book/usePredictOrderbook";
import type { usePredictApprovalsStatus } from "@/features/trading/venues/predict/wallet/usePredictApprovalsStatus";
import type { useLimitlessApprovalsStatus } from "@/features/trading/venues/limitless/approvals/useLimitlessApprovalsStatus";
import type { UseTradeBoxVenueWiringParams } from "./types";

export function useTradeBoxVenueTradingGates(
	params: UseTradeBoxVenueWiringParams & {
		predictHasMarketIds: boolean;
		predictNumericId: number | null;
		predictMarketQuery: ReturnType<typeof usePredictMarketDetail>;
		predictOrderbookQuery: ReturnType<typeof usePredictOrderbook>;
		predictMarketDetail: ReturnType<typeof usePredictMarketDetail>["data"] | null;
		predictSession: ReturnType<typeof usePredictTradingSession>;
		predictEnsureReady: ReturnType<typeof usePredictEnsureExecutionReady>;
		predictApprovalsQuery: ReturnType<typeof usePredictApprovalsStatus>;
		limitlessApprovalsQuery: ReturnType<typeof useLimitlessApprovalsStatus>;
		polyClob: ReturnType<typeof usePolymarketClobTradingSession>;
	},
) {
	const {
		state,
		pandaId,
		matchedMonitor,
		oddsMonitorEnabled,
		oddsMonitorConnected,
		authenticated,
		setupActivation,
		profileId,
		limitlessEnsureQuery,
		limitlessReady,
		limitlessEnsureGate,
		predictHasMarketIds,
		predictNumericId,
		predictMarketQuery,
		predictOrderbookQuery,
		predictMarketDetail,
		predictSession,
		predictEnsureReady,
		predictApprovalsQuery,
		limitlessApprovalsQuery,
		polyClob,
	} = params;

	const polymarketVenueHint = useMemo(() => {
		if (state.tradingVenue !== "polymarket") return null;
		if (!pandaId) {
			return "Polymarket CLOB needs a PandaScore match on this umbrella.";
		}
		if (!oddsMonitorEnabled) {
			return "Odds monitor is not configured (set VITE_ODDS_WS_BASE / token).";
		}
		if (!oddsMonitorConnected) {
			return "Connecting to odds monitor…";
		}
		if (!matchedMonitor) {
			return "No monitor row for this match — Poly books may not be linked yet.";
		}
		if (polyClob.loading || polyClob.polyAccountLoading) {
			return "Loading…";
		}
		if (!polyClob.ready) {
			return (
				polyClob.blockedReason ||
				polyClob.error ||
				"Complete Polymarket setup to trade (Safe, approvals, builder sign)."
			);
		}
		return null;
	}, [
		state.tradingVenue,
		pandaId,
		oddsMonitorEnabled,
		oddsMonitorConnected,
		matchedMonitor,
		polyClob.loading,
		polyClob.polyAccountLoading,
		polyClob.ready,
		polyClob.blockedReason,
		polyClob.error,
	]);

	const predictVenueHint = useMemo(() => {
		if (state.tradingVenue !== "predictfun") return null;
		if (!pandaId) {
			return "Predict needs a PandaScore match on this umbrella.";
		}
		if (!oddsMonitorEnabled) {
			return "Odds monitor is not configured (set VITE_ODDS_WS_BASE / token).";
		}
		if (!oddsMonitorConnected) {
			return "Connecting to odds monitor…";
		}
		if (!matchedMonitor) {
			return "No monitor row — Predict ids may not be linked yet.";
		}
		if (!predictHasMarketIds) {
			return "This monitor row has no Predict market ids.";
		}
		if (
			(predictMarketQuery.isLoading || predictOrderbookQuery.isLoading) &&
			!matchedMonitor?.predictFunPriceA &&
			!matchedMonitor?.predictFunPriceB
		) {
			return "Loading Predict market…";
		}
		if (!predictNumericId) {
			return "Could not resolve Predict market id for this side.";
		}
		if (predictMarketQuery.isError) {
			return "Failed to load Predict market from API.";
		}
		if (predictSession.loading) {
			return "Loading…";
		}
		if (!predictSession.ready) {
			return (
				predictSession.blockedReason ||
				predictSession.error ||
				"Complete Predict setup (BNB, USDT, API key if mainnet)."
			);
		}
		return null;
	}, [
		state.tradingVenue,
		pandaId,
		oddsMonitorEnabled,
		oddsMonitorConnected,
		matchedMonitor,
		predictHasMarketIds,
		predictNumericId,
		predictMarketQuery.isLoading,
		predictMarketQuery.isError,
		predictOrderbookQuery.isLoading,
		predictSession.loading,
		predictSession.ready,
		predictSession.blockedReason,
		predictSession.error,
	]);

	const dflowVenueHint = useMemo(() => {
		if (state.tradingVenue !== "dflow") return null;
		if (!hasDflowKalshiMonitorLink(matchedMonitor)) {
			return "No Kalshi market linked for this match on the odds monitor.";
		}
		return null;
	}, [state.tradingVenue, matchedMonitor]);

	const limitlessTrading = useMemo(() => {
		return {
			hasPandascoreLink: Boolean(pandaId),
			hasMonitorMatch: Boolean(matchedMonitor),
			hasLimitlessMapping: Boolean(matchedMonitor?.limitless),
			ready: limitlessReady,
			loading:
				Boolean(setupActivation?.venues.limitless.setupInProgress) ||
				(authenticated &&
					Boolean(profileId) &&
					limitlessEnsureQuery.data == null &&
					!limitlessEnsureQuery.isError),
			blockedReason: limitlessEnsureQuery.isError
				? formatErrorForUser(limitlessEnsureQuery.error)
				: limitlessEnsureGate.ready
					? null
					: limitlessEnsureGate.blockedReason,
			approvalsOk: limitlessApprovalsQuery.data?.ready === true,
		};
	}, [
		pandaId,
		matchedMonitor,
		limitlessReady,
		limitlessEnsureGate.ready,
		limitlessEnsureGate.blockedReason,
		setupActivation?.venues.limitless.setupInProgress,
		authenticated,
		profileId,
		limitlessEnsureQuery.data,
		limitlessEnsureQuery.isError,
		limitlessEnsureQuery.error,
		limitlessApprovalsQuery.data?.ready,
	]);

	const predictTrading = useMemo(
		() => ({
			hasPandascoreLink: Boolean(pandaId),
			hasMonitorMatch: Boolean(matchedMonitor),
			hasPredictMarketIds: predictHasMarketIds,
			ready:
				predictSession.ready && Boolean(predictMarketDetail) && !predictEnsureReady.setupInProgress,
			loading:
				predictSession.loading ||
				predictMarketQuery.isLoading ||
				predictOrderbookQuery.isLoading ||
				predictEnsureReady.setupInProgress,
			blockedReason:
				predictSession.blockedReason ||
				predictSession.error ||
				predictEnsureReady.error ||
				(predictMarketQuery.isError ? "Predict market API error" : null),
			approvalsOk: predictApprovalsQuery.data === true,
		}),
		[
			pandaId,
			matchedMonitor,
			predictHasMarketIds,
			predictSession.ready,
			predictSession.loading,
			predictSession.blockedReason,
			predictSession.error,
			predictEnsureReady.setupInProgress,
			predictEnsureReady.error,
			predictMarketDetail,
			predictMarketQuery.isLoading,
			predictMarketQuery.isError,
			predictOrderbookQuery.isLoading,
			predictApprovalsQuery.data,
		],
	);

	const polymarketTrading = useMemo(
		() => ({
			hasPandascoreLink: Boolean(pandaId),
			hasMonitorMatch: Boolean(matchedMonitor),
			ready: polyClob.ready,
			loading: polyClob.loading || polyClob.polyAccountLoading,
			blockedReason: polyClob.blockedReason || polyClob.error,
		}),
		[
			pandaId,
			matchedMonitor,
			polyClob.ready,
			polyClob.loading,
			polyClob.polyAccountLoading,
			polyClob.blockedReason,
			polyClob.error,
		],
	);

	return {
		polymarketVenueHint,
		predictVenueHint,
		dflowVenueHint,
		limitlessTrading,
		predictTrading,
		polymarketTrading,
	};
}
