import { useCallback, useMemo } from "react";
import { useVenueAddressChainMap } from "@/context/AccountDataContext";
import { getVenueConfig } from "@/config/venueConfig";
import { formatErrorForUser } from "@/errors";
import { useMarketOrderHandler } from "../MarketOrderHandler";
import { usePolymarketClobTradingSession } from "@/trading/polymarket/usePolymarketClobTradingSession";
import {
	levelUpMonitorBookForPosition,
	polyOrderbookForPosition,
} from "@/trading/polymarket/polyOutcomeTokenId";
import {
	dflowKalshiOrderbookForPosition,
	hasDflowKalshiMonitorLink,
} from "@/trading/dflow/monitorDflowBooks";
import { monitorBookToOrderbookSnapshot } from "@/trading/polymarket/monitorOrderbookAdapter";
import { usePredictTradingSession } from "@/trading/predict/usePredictTradingSession";
import { usePredictEnsureExecutionReady } from "@/trading/predict/usePredictEnsureExecutionReady";
import { usePredictMarketDetail } from "@/trading/predict/usePredictMarketDetail";
import { usePredictOrderbook } from "@/trading/predict/usePredictOrderbook";
import { predictBookToOrderbookSnapshot } from "@/trading/predict/predictBookToOrderbookSnapshot";
import {
	complementPredictOrderbook,
	predictBookNeedsComplementForPosition,
} from "@/trading/predict/predictSingleMarketBook";
import {
	predictMarketNumericId,
	predictOrderbookForPosition,
	predictOutcomeSide,
} from "@/trading/predict/predictOutcome";
import { predictOutcomeTokenId } from "@/trading/predict/predictMarketApi";
import { usePredictApprovalsStatus } from "@/trading/predict/usePredictApprovalsStatus";
import {
	limitlessOrderbookForPosition,
} from "@/trading/limitless/limitlessOrderbook";
import type { OrderbookSnapshot } from "@/services/api/orderbookService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { TradingVenue } from "../types";
import type { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import type { UseQueryResult } from "@tanstack/react-query";

export interface UseTradeBoxVenueWiringParams {
	state: {
		tradingVenue: TradingVenue;
		selectedPosition: "yes" | "no" | null;
	};
	multiVenueEnabled: boolean;
	authenticated: boolean;
	pandaId: string;
	matchedMonitor: MatchedMarket | null | undefined;
	yesTeamLabel: string;
	noTeamLabel: string;
	levelUpOrderbook: OrderbookSnapshot | null;
	oddsMonitorEnabled: boolean;
	oddsMonitorConnected: boolean;
	account: string | null | undefined;
	setupActivation: ReturnType<typeof useSetupActivationOptional>;
	profileId: string | undefined;
	limitlessEnsureQuery: UseQueryResult<unknown>;
	limitlessReady: boolean;
	limitlessEnsureGate: { ready: boolean; blockedReason: string | null };
}

export function useTradeBoxVenueWiring({
	state,
	multiVenueEnabled,
	authenticated,
	pandaId,
	matchedMonitor,
	yesTeamLabel,
	noTeamLabel,
	levelUpOrderbook,
	oddsMonitorEnabled,
	oddsMonitorConnected,
	account,
	setupActivation,
	profileId,
	limitlessEnsureQuery,
	limitlessReady,
	limitlessEnsureGate,
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
      noTeamLabel
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
    multiVenueEnabled || predictVenueActive
  );
  const predictOrderbookQuery = usePredictOrderbook(
    predictNumericId,
    multiVenueEnabled || predictVenueActive
  );
  const predictMarketDetail = predictMarketQuery.data ?? null;

  const predictSession = usePredictTradingSession(
    (multiVenueEnabled || predictVenueActive) && authenticated && Boolean(pandaId) && Boolean(predictNumericId)
  );

  /** Predict allowance owner — `venueAddressChainMap.predictfun.walletAddress` only. */
  const predictApprovalSubject =
    venueAddressChainMap?.predictfun.walletAddress ?? null;

  const predictApprovalsQuery = usePredictApprovalsStatus(
    predictApprovalSubject,
    predictMarketDetail?.isNegRisk ?? false,
    predictMarketDetail?.isYieldBearing ?? false,
    (multiVenueEnabled || predictVenueActive) && Boolean(predictApprovalSubject) && Boolean(predictMarketDetail)
  );

  /**
   * Auto-setup: JWT + on-chain approvals + server sync so Predict flips `executionReady: true`
   * on the backend. Users never see "Complete venue setup" because we run this headlessly the
   * moment the user is authenticated on a Predict-eligible market.
   */
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
      const ab = predictOutcomeSide(
        matchedMonitor,
        state.selectedPosition,
        yesTeamLabel,
        noTeamLabel
      );
      const pf = matchedMonitor.predictFun;
      const fromMonitor =
        ab === "A" ? pf.tokenIdA : pf.tokenIdB ?? pf.tokenIdA;
      if (fromMonitor) return fromMonitor;
    }
    if (!predictMarketDetail) return null;
    try {
      return predictOutcomeTokenId(
        predictMarketDetail,
        state.selectedPosition,
        yesTeamLabel,
        noTeamLabel
      );
    } catch {
      return null;
    }
  }, [
    matchedMonitor,
    predictMarketDetail,
    state.selectedPosition,
    yesTeamLabel,
    noTeamLabel,
  ]);

  const predictVenueBookHints = useMemo(() => {
    if (!predictVenueActive || !matchedMonitor) return null;
    return {
      yes: monitorBookToOrderbookSnapshot(
        predictOrderbookForPosition(
          matchedMonitor,
          "yes",
          yesTeamLabel,
          noTeamLabel
        )
      ),
      no: monitorBookToOrderbookSnapshot(
        predictOrderbookForPosition(
          matchedMonitor,
          "no",
          yesTeamLabel,
          noTeamLabel
        )
      ),
    };
  }, [
    predictVenueActive,
    matchedMonitor,
    yesTeamLabel,
    noTeamLabel,
  ]);

  /** LevelUp: OddsMonitor WS book when connected (matches strip); REST otherwise. Other venues: monitor / REST as before. */
  const effectiveOrderbook = useMemo(() => {
    if (state.tradingVenue === "all") {
      return levelUpOrderbook;
    }
    if (state.tradingVenue === "levelup") {
      if (
        oddsMonitorEnabled &&
        oddsMonitorConnected &&
        matchedMonitor
      ) {
        const raw = levelUpMonitorBookForPosition(
          matchedMonitor,
          state.selectedPosition ?? "yes",
          yesTeamLabel,
          noTeamLabel,
        );
        const wsSnap = monitorBookToOrderbookSnapshot(raw);
        if (wsSnap) return wsSnap;
      }
      return levelUpOrderbook;
    }
    if (state.tradingVenue === "predictfun") {
      const pos = state.selectedPosition ?? "yes";
      // Prefer REST when available. Single-market: REST is YES-native; complement
      // when the selected outcome is the non-native side (same as monitor WS B).
      let restBook = predictOrderbookQuery.data ?? undefined;
      if (
        restBook &&
        isPredictSingleMarket &&
        matchedMonitor &&
        predictBookNeedsComplementForPosition(
          matchedMonitor,
          pos,
          yesTeamLabel,
          noTeamLabel,
        )
      ) {
        restBook = complementPredictOrderbook(restBook);
      }
      const restSnap = predictBookToOrderbookSnapshot(restBook);
      if (restSnap) return restSnap;
      return predictVenueBookHints?.[pos] ?? null;
    }
    if (!matchedMonitor) return null;
    if (state.tradingVenue === "limitless") {
      const lxRaw = limitlessOrderbookForPosition(
        matchedMonitor,
        state.selectedPosition ?? "yes",
        yesTeamLabel,
        noTeamLabel,
      );
      return monitorBookToOrderbookSnapshot(lxRaw);
    }
    if (state.tradingVenue === "dflow") {
      /** Monitor `dflowPrice*` from venue-prices MatchedMarket only. */
      const dflowRaw = dflowKalshiOrderbookForPosition(
        matchedMonitor,
        state.selectedPosition ?? "yes",
        yesTeamLabel,
        noTeamLabel
      );
      return monitorBookToOrderbookSnapshot(dflowRaw);
    }
    const polyRaw = polyOrderbookForPosition(
      matchedMonitor,
      state.selectedPosition ?? "yes",
      yesTeamLabel,
      noTeamLabel
    );
    return monitorBookToOrderbookSnapshot(polyRaw);
  }, [
    state.tradingVenue,
    state.selectedPosition,
    levelUpOrderbook,
    matchedMonitor,
    yesTeamLabel,
    noTeamLabel,
    predictOrderbookQuery.data,
    isPredictSingleMarket,
    predictVenueBookHints,
    oddsMonitorEnabled,
    oddsMonitorConnected,
  ]);

  /** Dual WS snapshots so YES/NO buttons do not reuse the selected outcome's ladder for both teams. */
  const levelUpVenueBookHints = useMemo(() => {
    if (state.tradingVenue !== "levelup") return null;
    if (!oddsMonitorEnabled || !oddsMonitorConnected || !matchedMonitor) return null;
    const snapYes = monitorBookToOrderbookSnapshot(
      levelUpMonitorBookForPosition(
        matchedMonitor,
        "yes",
        yesTeamLabel,
        noTeamLabel,
      ),
    );
    const snapNo = monitorBookToOrderbookSnapshot(
      levelUpMonitorBookForPosition(
        matchedMonitor,
        "no",
        yesTeamLabel,
        noTeamLabel,
      ),
    );
    if (!snapYes || !snapNo) return null;
    return { yes: snapYes, no: snapNo };
  }, [
    state.tradingVenue,
    oddsMonitorEnabled,
    oddsMonitorConnected,
    matchedMonitor,
    yesTeamLabel,
    noTeamLabel,
  ]);

  const venueConfig = getVenueConfig(state.tradingVenue);
  const marketOrderHandler = useMarketOrderHandler(effectiveOrderbook, venueConfig.requiresWholeShares);

  // LevelUp and single-market Predict use a unified YES-native book where the
  // walker must invert for NO (walk bids, cost = 1 − bid_price).  Multi-market
  // Predict, Polymarket, and DFlow each fetch an outcome-native book, so always
  // walk as "yes".
  const orderbookWalkPosition =
    (state.tradingVenue === "levelup" || isPredictSingleMarket)
      ? state.selectedPosition ?? "yes"
      : "yes";

  const calculateContractsForMarketOrderUi = useCallback(
    (usdAmount: number, position: "yes" | "no", side: "buy" | "sell") => {
      const passPosition =
        state.tradingVenue === "levelup" || isPredictSingleMarket;
      return marketOrderHandler.calculateContractsForMarketOrder(
        usdAmount,
        passPosition ? position : "yes",
        side
      );
    },
    [marketOrderHandler, state.tradingVenue, isPredictSingleMarket]
  );

  const polyClob = usePolymarketClobTradingSession({
    enabled:
      authenticated &&
      Boolean(pandaId) &&
      (multiVenueEnabled || state.tradingVenue === "polymarket"),
  });

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

  const predictHasMarketIds = useMemo(() => {
    if (!matchedMonitor?.predictFun) return false;
    const a = matchedMonitor.predictFun.marketIdA;
    const b = matchedMonitor.predictFun.marketIdB ?? a;
    return (a != null && a !== "") || (b != null && b !== "");
  }, [matchedMonitor]);

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
    const raw = limitlessEnsureQuery.data;
    let approvalComplete: boolean | undefined;
    if (raw && typeof raw === "object") {
      const la = (raw as { limitlessAccount?: unknown }).limitlessAccount;
      if (la && typeof la === "object") {
        const ac = (la as { approvalComplete?: unknown }).approvalComplete;
        if (typeof ac === "boolean") {
          approvalComplete = ac;
        }
      }
    }
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
      approvalComplete,
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
  ]);

  const predictTrading = useMemo(
    () => ({
      hasPandascoreLink: Boolean(pandaId),
      hasMonitorMatch: Boolean(matchedMonitor),
      hasPredictMarketIds: predictHasMarketIds,
      ready:
        predictSession.ready &&
        Boolean(predictMarketDetail) &&
        !predictEnsureReady.setupInProgress,
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
      /**
       * On-chain CTF + USDT approvals snapshot. When `true`, the trade-box
       * Predict bootstrap gate is bypassed for buys — `useButtonState`
       * trusts the lazy `ensurePredictApprovalsForTrade` path at execute time
       * instead of blocking the UI on the redundant ensure roundtrip.
       */
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
    ]
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
    ]
  );

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
		predictVenueBookHints,
		effectiveOrderbook,
		levelUpVenueBookHints,
		venueConfig,
		marketOrderHandler,
		orderbookWalkPosition,
		calculateContractsForMarketOrderUi,
		polyClob,
		polymarketVenueHint,
		predictHasMarketIds,
		predictVenueHint,
		dflowVenueHint,
		limitlessTrading,
		predictTrading,
		polymarketTrading,
	};
}
