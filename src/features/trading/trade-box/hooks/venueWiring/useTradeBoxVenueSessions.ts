/**
 * Per-venue trading sessions and approval queries for the active market.
 *
 * Owns Predict market/orderbook queries, Predict ensure-ready, Poly CLOB session,
 * Limitless on-chain approval snapshot, and outcome token id resolution.
 *
 * Does not pick which orderbook the UI walks — see `useTradeBoxEffectiveOrderbook`.
 */
import { useMemo } from "react";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { usePolymarketClobTradingSession } from "@/features/trading/venues/polymarket/session/usePolymarketClobTradingSession";
import { usePredictTradingSession } from "@/features/trading/venues/predict/session/usePredictTradingSession";
import { usePredictEnsureExecutionReady } from "@/features/trading/venues/predict/session/usePredictEnsureExecutionReady";
import { usePredictMarketDetail } from "@/features/trading/venues/predict/portfolio/usePredictMarketDetail";
import { usePredictOrderbook } from "@/features/trading/venues/predict/book/usePredictOrderbook";
import { pandaOutcomeSide } from "@/features/markets/odds-monitor/pandaOutcomeSide";
import { predictMarketNumericId } from "@/features/trading/venues/predict/trade/predictOutcome";
import { predictOutcomeTokenId } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import { usePredictApprovalsStatus } from "@/features/trading/venues/predict/wallet/usePredictApprovalsStatus";
import { useLimitlessApprovalsStatus } from "@/features/trading/venues/limitless/approvals/useLimitlessApprovalsStatus";
import { pickWarmupMarketSlugFromEnsureData } from "@/features/trading/venues/limitless/session/limitlessEnsurePayload";
import type { UseTradeBoxVenueWiringParams } from "./types";

export function useTradeBoxVenueSessions({
	state,
	multiVenueEnabled,
	authenticated,
	pandaId,
	matchedMonitor,
	yesTeamLabel,
	noTeamLabel,
	limitlessEnsureQuery,
}: UseTradeBoxVenueWiringParams) {
	const venueAddressChainMap = useVenueAddressChainMap();

	const predictVenueActive = state.tradingVenue === "predictfun";
	const limitlessVenueActive = state.tradingVenue === "limitless";
	const isPredictSingleMarket =
		predictVenueActive && matchedMonitor?.predictFun?.singleMarket === true;

	const predictNumericId = useMemo(() => {
		if ((!multiVenueEnabled && !predictVenueActive) || !matchedMonitor || !state.selectedPosition) {
			return null;
		}
		return predictMarketNumericId(
			matchedMonitor,
			state.selectedPosition,
			yesTeamLabel,
			noTeamLabel,
		);
	}, [
		multiVenueEnabled,
		predictVenueActive,
		matchedMonitor,
		state.selectedPosition,
		yesTeamLabel,
		noTeamLabel,
	]);

	const predictMarketQuery = usePredictMarketDetail(
		predictNumericId,
		multiVenueEnabled || predictVenueActive,
	);
	const predictOrderbookQuery = usePredictOrderbook(
		predictNumericId,
		multiVenueEnabled || predictVenueActive,
	);
	const predictMarketDetail = predictMarketQuery.data ?? null;

	const predictSession = usePredictTradingSession(
		(multiVenueEnabled || predictVenueActive) &&
			authenticated &&
			Boolean(pandaId) &&
			Boolean(predictNumericId),
	);

	const predictApprovalSubject = venueAddressChainMap?.predictfun.walletAddress ?? null;

	const predictApprovalsQuery = usePredictApprovalsStatus(
		predictApprovalSubject,
		predictMarketDetail?.isNegRisk ?? false,
		predictMarketDetail?.isYieldBearing ?? false,
		(multiVenueEnabled || predictVenueActive) &&
			Boolean(predictApprovalSubject) &&
			Boolean(predictMarketDetail),
	);

	const limitlessMaker = venueAddressChainMap?.limitless.walletAddress ?? null;
	const limitlessWarmupSlug = pickWarmupMarketSlugFromEnsureData(limitlessEnsureQuery.data);
	const limitlessApprovalsQuery = useLimitlessApprovalsStatus(
		limitlessMaker,
		limitlessWarmupSlug,
		(multiVenueEnabled || limitlessVenueActive) &&
			Boolean(limitlessMaker) &&
			Boolean(limitlessWarmupSlug),
	);

	const predictEnsureReady = usePredictEnsureExecutionReady({
		enabled:
			(multiVenueEnabled || predictVenueActive) &&
			authenticated &&
			Boolean(pandaId) &&
			Boolean(predictNumericId) &&
			Boolean(predictMarketDetail) &&
			Boolean(predictApprovalSubject),
		predictSession,
		approvalSubject: predictApprovalSubject,
		isNegRisk: predictMarketDetail?.isNegRisk ?? false,
		isYieldBearing: predictMarketDetail?.isYieldBearing ?? false,
	});

	const predictTokenIdForPosition = useMemo(() => {
		if (!state.selectedPosition) return null;
		if (matchedMonitor?.predictFun) {
			const ab = pandaOutcomeSide(
				matchedMonitor,
				state.selectedPosition,
				yesTeamLabel,
				noTeamLabel,
			);
			const pf = matchedMonitor.predictFun;
			const fromMonitor = ab === "A" ? pf.tokenIdA : (pf.tokenIdB ?? pf.tokenIdA);
			if (fromMonitor) return fromMonitor;
		}
		if (!predictMarketDetail) return null;
		try {
			return predictOutcomeTokenId(
				predictMarketDetail,
				state.selectedPosition,
				yesTeamLabel,
				noTeamLabel,
			);
		} catch {
			return null;
		}
	}, [matchedMonitor, predictMarketDetail, state.selectedPosition, yesTeamLabel, noTeamLabel]);

	const predictHasMarketIds = useMemo(() => {
		if (!matchedMonitor?.predictFun) return false;
		const a = matchedMonitor.predictFun.marketIdA;
		const b = matchedMonitor.predictFun.marketIdB ?? a;
		return (a != null && a !== "") || (b != null && b !== "");
	}, [matchedMonitor]);

	const polyClob = usePolymarketClobTradingSession({
		enabled:
			authenticated &&
			Boolean(pandaId) &&
			(multiVenueEnabled || state.tradingVenue === "polymarket"),
	});

	return {
		predictVenueActive,
		limitlessVenueActive,
		isPredictSingleMarket,
		predictNumericId,
		predictMarketQuery,
		predictOrderbookQuery,
		predictMarketDetail,
		predictSession,
		predictApprovalsQuery,
		predictEnsureReady,
		predictApprovalSubject,
		predictTokenIdForPosition,
		predictHasMarketIds,
		limitlessApprovalsQuery,
		polyClob,
	};
}
