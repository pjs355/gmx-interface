import { useCallback, useMemo, useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// Link import removed — executionGateBanner no longer rendered
import { useSignerContext } from "context/SignerContext";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import {
	RegisterPrivyOpenFundAction,
	resolvePrivyEvmFundTarget,
} from "@/components/PrivyGatedFundWallet/PrivyGatedFundWallet";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
// import { ethers } from "ethers";
import type { TradeBoxProps, TradeExecutionParams } from "./types";
import { useMarketOrderHandler } from "./MarketOrderHandler";
// import { useLimitOrderHandler } from "./LimitOrderHandler";
import { useTradeExecutionService } from "./TradeExecutionService";
import PredictionMarketTradeBoxResponsiveContainer from "./PredictionMarketTradeBoxResponsiveContainer";
// Removed OrderbookContext import - using passed orderbook prop instead
import { useUSDCBalance, checkSufficientBalance, useYesNoBalances, checkSufficientShares } from "./checkBalances";
import { useUserData } from "context/UserDataContext";
import { useButtonState } from "./hooks/useButtonState";
import { useTradeState } from "./hooks/useTradeState";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import { getPrivateApiErrorMessage } from "@/services/privateApi";
import { calculateFeeMatchingBackend } from "./feeLevelUp";
import { getVenueConfig } from "@/config/venueConfig";
import { ensureLimitlessTradingApprovalsOnBase } from "@/trading/limitless/limitlessTradingApprovalsOnBase";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { usePolymarketExecutionGate } from "@/trading/hooks/usePolymarketExecutionGate";
import { usePolymarketClobTradingSession } from "@/trading/polymarket/usePolymarketClobTradingSession";
import {
	polyOrderbookForPosition,
	polyOutcomeTokenId,
} from "@/trading/polymarket/polyOutcomeTokenId";
import {
	dflowKalshiOrderbookForPosition,
	hasDflowKalshiMonitorLink,
	getDflowKalshiMonitorLink,
} from "@/trading/dflow/monitorDflowBooks";
import { startDflowProofRedirect } from "@/trading/dflow/startDflowProofRedirect";
import { monitorBookToOrderbookSnapshot } from "@/trading/polymarket/monitorOrderbookAdapter";
import { usePredictTradingSession } from "@/trading/predict/usePredictTradingSession";
import { usePredictEnsureExecutionReady } from "@/trading/predict/usePredictEnsureExecutionReady";
import { usePredictMarketDetail } from "@/trading/predict/usePredictMarketDetail";
import { usePredictOrderbook } from "@/trading/predict/usePredictOrderbook";
import { predictBookToOrderbookSnapshot } from "@/trading/predict/predictBookToOrderbookSnapshot";
import {
	predictMarketNumericId,
	predictOrderbookForPosition,
	predictOutcomeSide,
} from "@/trading/predict/predictOutcome";
import {
	predictOutcomeTokenId,
} from "@/trading/predict/predictMarketApi";
import { usePredictApprovalsStatus } from "@/trading/predict/usePredictApprovalsStatus";
import { usePredictOutcomeShareOnChain } from "@/trading/predict/usePredictBnbBalances";
import {
	bboFromSnapshot,
	logPolymarketTradePreflight,
} from "@/trading/polymarket/polymarketOrderDebug";
import { getPrivateApiAbsoluteUrl } from "@/config/privateApiBase";
import { Side, type TickSize } from "@polymarket/clob-client";
import { getYesNoTeamLabels } from "./teamLabels";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useDflowMintResolver } from "@/trading/dflow/useDflowMintResolver";
import { SOLANA_USDC_MINT } from "@/config/addresses";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import {
	useBridgeFundingBalances,
	BRIDGE_FUNDING_BALANCES_QUERY_KEY,
} from "@/trading/hooks/useBridgeFundingBalances";
import {
	useSignAndSendTransaction as useSolanaSignAndSendTransaction,
	useSignMessage as useSolanaSignMessage,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { sendPrivySponsoredSolanaTransaction } from "@/trading/solana/privySponsoredSolana";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import type { SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";
import {
	buildChainBalances,
	useSorRoute,
	useSorExecution,
	parseLimitPriceCents,
	probabilityToLimitPriceCentsString,
	SOR_MIN_MARKET_BUY_USD,
	SOR_MIN_LIMIT_ORDER_USD,
	SOR_MIN_MARKET_SELL_SHARES,
	type SorExecutionPhase,
} from "@/trading/sor";
import { useSorLegExecutor } from "@/trading/sor/useSorLegExecutor";
import type {
	ChainBalance,
	VenuePositionEntry,
	SorOutcome,
	RoutePlan,
} from "@/trading/sor";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import { maxAllMarketsSellBidForOutcome } from "@/hooks/useTradingPagePrices";
import { useTradeBoxShareBalances } from "./hooks/useTradeBoxShareBalances";
import { mergeMonitorLimitlessFromUmbrella } from "@/utils/mergeMonitorLimitlessFromUmbrella";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/trading/queryKeys";
import { LIMITLESS_QUERY_ROOT } from "@/trading/limitless/limitlessQueryKeys";
import {
	limitlessOrderbookForPosition,
	limitlessOutcomeTokenId,
} from "@/trading/limitless/limitlessOrderbook";
import {
	useLimitlessPositions,
	limitlessSharesForToken,
} from "@/trading/limitless/useLimitlessPositions";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "./feeLimitless";
import {
	getLimitlessEnsureTradeGate,
	limitlessEnsureNotReadyCodeToWhy,
	limitlessEnsureWarrantsAccountOverviewRefresh,
} from "@/trading/limitless/limitlessEnsureTradeGate";
export interface PredictionMarketTradeBoxProps extends TradeBoxProps {
	umbrellaDisplayName?: string;
}

// Exposed methods for testing
export interface PredictionMarketTradeBoxHandle {
  setPosition: (position: 'yes' | 'no') => void;
  setAmount: (amount: string) => void;
  setPrice: (price: string) => void;
  setOrderType: (orderType: 'market' | 'limit') => void;
  setSide: (side: 'buy' | 'sell') => void;
  executeTrade: () => Promise<void>;
  getState: () => any;
}

const PredictionMarketTradeBox = forwardRef<PredictionMarketTradeBoxHandle, PredictionMarketTradeBoxProps>(
  ({ market, orderbook: propOrderbook, pandascoreMatchId, umbrellaId: propUmbrellaId, limitlessMappingFromUmbrella, umbrellaDisplayName, initialPosition, onPositionChange, onSideChange: onSideChangeCallback, venueOverride, crossBuyYes: propCrossBuyYes, crossBuyNo: propCrossBuyNo, venueRowsForSellStrip: propVenueRowsForSellStrip }, ref) => {

  const pandaId = pandascoreMatchId?.trim() ?? "";
  const multiVenueEnabled = Boolean(pandaId);
  const initialVenue = multiVenueEnabled ? "all" as const : "levelup" as const;

  const { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, handleTradingVenueChange } = useTradeState(initialPosition, initialVenue);
  const { getClientForChain } = useSmartWallets();
  const { account, ready: signerReady } = useSignerContext();
  const { login, authenticated } = usePrivy();

  // Use global approval state from UserDataContext
  const { approvalState, checkApproval, approveToken, refresh, refreshViaRpc } = useUserData();

  // Lazy approval check: deferred from startup, runs when trade box mounts
  useEffect(() => {
    if (account) checkApproval();
  }, [account, checkApproval]);

  const { wallets: privyWallets } = usePrivyWallets();
  const funding = useFundingAddresses();
  const addFundsFromPrivyRef = useRef<(() => void | Promise<void>) | null>(null);
  const fundEvmForPrivy = useMemo(
  	() => resolvePrivyEvmFundTarget(funding.baseSmartWallet, account),
  	[funding.baseSmartWallet, account]
  );
  /** LevelUp REST orderbook (signing + execution always uses this for LevelUp venue). */
  const levelUpOrderbook = propOrderbook ?? null;

  // Ref to hold the latest SOR route for use in handleTrade (defined before useSorRoute)
  const sorRouteRef = useRef<any>(null);
  const sorRouteExpiredRef = useRef(false);
  // Late-bound SOR executor — `handleSorExecute` is defined later in the
  // render, but the imperative test handle (useImperativeHandle below) needs
  // a stable reference it can forward into. Updated via an effect right after
  // handleSorExecute is created so the imperative `executeTrade` always kicks
  // the unified SOR/LI.FI pipeline instead of the deprecated `handleTrade`.
  const handleSorExecuteRef = useRef<(() => void) | null>(null);

  // Handle deposit - opens Privy's fund wallet modal (actual `useFundWallet` is gated; see `RegisterPrivyOpenFundAction`)
  const handleAddFunds = useCallback(async () => {
  	const f = addFundsFromPrivyRef.current;
  	if (f) await f();
  }, []);

  const dflowProof = useDflowProofStatus();
  const privateApi = usePrivateApiClient();
  const profileQuery = useCurrentProfile({ enabled: authenticated });
  const profileId = profileQuery.data?._id;
  const limitlessEnsureQuery = useQuery({
    queryKey: profileId
      ? tradingQueryKeys.limitlessEnsureAccount(profileId)
      : ["trading", "limitlessEnsure", "__disabled__"],
    enabled: Boolean(authenticated && profileId),
    queryFn: () => privateApi.postLimitlessEnsureAccount(),
    staleTime: 1000 * 60 * 30,
    retry: 1,
  });
  const limitlessEnsureGate = useMemo(
    () => getLimitlessEnsureTradeGate(limitlessEnsureQuery.data ?? null),
    [limitlessEnsureQuery.data],
  );
  const limitlessReady = Boolean(
    limitlessEnsureQuery.isSuccess &&
      limitlessEnsureQuery.data != null &&
      limitlessEnsureGate.ready,
  );
  const relay = usePolymarketRelay();
  const { signAndSendTransaction: privySolanaSignAndSend } = useSolanaSignAndSendTransaction();
  const { wallets: solanaWallets } = useSolanaWallets();
  const embeddedSolanaWallet = useMemo(
    () => solanaWallets.find((w) => w.address === funding.solanaAddress) ?? solanaWallets[0] ?? null,
    [solanaWallets, funding.solanaAddress]
  );

  const solanaSigner = useMemo<SolanaSignerCapable | null>(
    () =>
      embeddedSolanaWallet
        ? {
            signAndSendTransaction: (serializedTx: Uint8Array) =>
              sendPrivySponsoredSolanaTransaction(
                privySolanaSignAndSend,
                embeddedSolanaWallet,
                serializedTx
              ),
          }
        : null,
    [privySolanaSignAndSend, embeddedSolanaWallet]
  );

  const fundingBalances = useBridgeFundingBalances({
    baseSmartWallet: funding.baseSmartWallet,
    limitlessMakerBase: funding.limitlessMakerBase,
    polymarketSafe: funding.polymarketSafe,
    embeddedEoa: funding.embeddedEoa,
    solanaAddress: funding.solanaAddress,
    enabled: !funding.isLoading && multiVenueEnabled,
  });

  const tradeExecutionService = useTradeExecutionService();
  const executionGate = usePolymarketExecutionGate();
  const {
    enabled: oddsMonitorEnabled,
    connected: oddsMonitorConnected,
    appState: oddsAppState,
  } = useOddsMonitor();
  const matchedMonitor = useMemo(() => {
    const base = findOddsMatchedMarket(
      oddsAppState?.markets,
      pandaId || null,
      propUmbrellaId,
    );
    return mergeMonitorLimitlessFromUmbrella(base, limitlessMappingFromUmbrella);
  }, [oddsAppState?.markets, pandaId, propUmbrellaId, limitlessMappingFromUmbrella]);

  const matchedVenues = useMemo(() => {
    const set = new Set<string>(["levelup"]);
    if (!matchedMonitor) return set;
    if (matchedMonitor.polyConditionId || matchedMonitor.polyTokenIdA) set.add("polymarket");
    if (matchedMonitor.dflow || matchedMonitor.kalshi) set.add("dflow");
    if (matchedMonitor.predictFun) set.add("predictfun");
    if (matchedMonitor.limitless) set.add("limitless");
    return set;
  }, [matchedMonitor]);

  useEffect(() => {
    if (!isPredictionPricingDebugEnabled()) return;
    const list = [...matchedVenues];
    priceDebugLog("PredictionMarketTradeBox tradeable venues (dropdown)", {
      pandaId: pandaId || null,
      hasMatchedMonitor: Boolean(matchedMonitor),
      matchedVenues: list,
      note:
        "Venue list is derived from OddsMonitor MatchedMarket (venue-prices WS / matched-markets), not from all-books-preview. LevelUp is always included.",
    });
  }, [pandaId, matchedMonitor, matchedVenues]);

  const dflowLink = useMemo(
    () => (matchedMonitor ? getDflowKalshiMonitorLink(matchedMonitor) : undefined),
    [matchedMonitor]
  );
  const dflowMintQuery = useDflowMintResolver(
    dflowLink?.eventTicker,
    (multiVenueEnabled || state.tradingVenue === "dflow") ? dflowLink?.tickerA : null
  );

  const queryClient = useQueryClient();
  const { signMessage: privySolanaSignMessage } = useSolanaSignMessage();

  const handleStartDflowProofForTrade = useCallback(async () => {
    if (!embeddedSolanaWallet) {
      console.warn("[DFlow] Solana embedded wallet unavailable — cannot start proof");
      return;
    }
    try {
      const returnUrl = new URL(window.location.href);
      returnUrl.searchParams.set("dflow_proof", "1");
      const out = await startDflowProofRedirect(
        privateApi,
        async ({ message }) => {
          const { signature } = await privySolanaSignMessage({
            message,
            wallet: embeddedSolanaWallet,
          });
          return signature;
        },
        returnUrl.toString(),
      );
      if (out === "already_verified") {
        await queryClient.invalidateQueries({ queryKey: ["dflow", "account"] });
      }
    } catch (e) {
      console.error(
        "[DFlow] Enable Kalshi trading — start proof redirect failed",
        e,
      );
    }
  }, [privateApi, privySolanaSignMessage, embeddedSolanaWallet, queryClient]);

  useEffect(() => {
    if (!profileId) return;
    if (limitlessEnsureQuery.status !== "success") return;
    if (!limitlessEnsureWarrantsAccountOverviewRefresh(limitlessEnsureQuery.data)) return;
    void queryClient.invalidateQueries({
      queryKey: tradingQueryKeys.accountOverview(profileId),
    });
  }, [profileId, limitlessEnsureQuery.status, limitlessEnsureQuery.dataUpdatedAt, queryClient]);

  const crossBuyPrices = useMemo(() => ({
    crossBuyYes: propCrossBuyYes ?? null,
    crossBuyNo: propCrossBuyNo ?? null,
  }), [propCrossBuyYes, propCrossBuyNo]);

  const { yesTeamLabel, noTeamLabel } = useMemo(
    () => getYesNoTeamLabels(market, umbrellaDisplayName),
    [market, umbrellaDisplayName]
  );

  const tradeBoxIsVsSingle = useMemo(() => {
    if (!market || (market as any)?.umbrellaChildrenCount !== 1) return false;
    const mt = (market?.displayName || (market as any)?.question || "").trim();
    if (mt.match(/^Over\s+/i)) return false;
    const raw =
      (umbrellaDisplayName || "")
        .replace(/\s*-\s*Match Winner$/i, "")
        .trim() || mt;
    const parts = raw
      .split(/\s*vs\.?\s*/i)
      .map((s: string) => s.trim())
      .filter(Boolean);
    return parts.length === 2;
  }, [market, umbrellaDisplayName]);

  const tradeBoxShareBalances = useTradeBoxShareBalances({
    umbrellaId: propUmbrellaId,
    market,
    tradingVenue: state.tradingVenue,
    yesTeamLabel,
    noTeamLabel,
    isVsSingle: tradeBoxIsVsSingle,
    selectedPosition: state.selectedPosition,
    matchedMonitor: matchedMonitor ?? null,
  });

  const allMarketsSellYesBid = useMemo(() => {
    if (state.tradingVenue !== "all" || !propVenueRowsForSellStrip?.length) return null;
    const m = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
    if (!m) return null;
    return maxAllMarketsSellBidForOutcome(propVenueRowsForSellStrip, "yes", m.yes);
  }, [
    state.tradingVenue,
    propVenueRowsForSellStrip,
    tradeBoxShareBalances.allMarketsOutcomeVenueShares,
  ]);

  const allMarketsSellNoBid = useMemo(() => {
    if (state.tradingVenue !== "all" || !propVenueRowsForSellStrip?.length) return null;
    const m = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
    if (!m) return null;
    return maxAllMarketsSellBidForOutcome(propVenueRowsForSellStrip, "no", m.no);
  }, [
    state.tradingVenue,
    propVenueRowsForSellStrip,
    tradeBoxShareBalances.allMarketsOutcomeVenueShares,
  ]);

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

  /**
   * On-chain USDT / CTF approvals for Predict are signed from the **Privy embedded EOA**
   * on BSC (`setApprovals`). `account` from SignerContext is often the Base **smart wallet**,
   * so using it here makes approval checks look failed even after txs succeeded.
   * If `VITE_PREDICT_ACCOUNT_ADDRESS` is set, use that as the token/allowance owner (Predict deposit).
   */
  const predictApprovalSubject = useMemo(() => {
    const fromEnv = import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS?.trim();
    if (fromEnv) return fromEnv;
    const embedded = (privyWallets || []).find(
      (w) =>
        (w as { walletClientType?: string }).walletClientType === "privy" ||
        (w as { connectorType?: string }).connectorType === "privy"
    ) as { address?: string } | undefined;
    if (embedded?.address) return embedded.address;
    return account ?? null;
  }, [privyWallets, account]);

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

  const predictShareQuery = usePredictOutcomeShareOnChain(
    predictApprovalSubject,
    predictTokenIdForPosition,
    predictMarketDetail?.isNegRisk ?? false,
    predictMarketDetail?.isYieldBearing ?? false,
    predictVenueActive &&
      authenticated &&
      Boolean(predictTokenIdForPosition)
  );
  const predictSellShareBalance = predictShareQuery.data ?? null;

  const limitlessTokenIdForSell = useMemo(() => {
    if (!limitlessVenueActive || !matchedMonitor || !state.selectedPosition) return null;
    return limitlessOutcomeTokenId(
      matchedMonitor,
      state.selectedPosition,
      yesTeamLabel,
      noTeamLabel,
    );
  }, [
    limitlessVenueActive,
    matchedMonitor,
    state.selectedPosition,
    yesTeamLabel,
    noTeamLabel,
  ]);

  const limitlessPositionsQuery = useLimitlessPositions(
    limitlessVenueActive && authenticated && Boolean(profileId),
  );
  const limitlessSellShareBalance = useMemo(
    () =>
      limitlessSharesForToken(limitlessPositionsQuery.data, limitlessTokenIdForSell),
    [limitlessPositionsQuery.data, limitlessTokenIdForSell],
  );

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

  /** LevelUp REST for LevelUp; Polymarket monitor; Predict REST for selected outcome market. */
  const effectiveOrderbook = useMemo(() => {
    if (state.tradingVenue === "all") {
      return levelUpOrderbook;
    }
    if (state.tradingVenue === "levelup") {
      return levelUpOrderbook;
    }
    if (state.tradingVenue === "predictfun") {
      // Prefer REST data when available (exact depth). Fall back to the
      // already-loaded monitor WebSocket data so the UI renders instantly
      // while the REST round-trip completes — same pattern as Poly/DFlow.
      const restSnap = predictBookToOrderbookSnapshot(
        predictOrderbookQuery.data ?? undefined
      );
      if (restSnap) return restSnap;
      if (isPredictSingleMarket && matchedMonitor) {
        // Single-market: the raw YES-native book lives under whichever
        // price field corresponds to the set market id (A or B).
        const pf = matchedMonitor.predictFun;
        const rawMonitorBook = pf?.marketIdA
          ? matchedMonitor.predictFunPriceA
          : matchedMonitor.predictFunPriceB;
        return monitorBookToOrderbookSnapshot(rawMonitorBook ?? null);
      }
      // Dual-market fallback: use the hint for the selected outcome.
      const pos = state.selectedPosition ?? "yes";
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
      return "Preparing Polymarket CLOB…";
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
      return "Preparing Predict wallet on BNB…";
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
        limitlessEnsureQuery.isLoading ||
        (authenticated && Boolean(profileId) && !limitlessEnsureQuery.isFetched),
      blockedReason: limitlessEnsureQuery.isError
        ? getPrivateApiErrorMessage(limitlessEnsureQuery.error)
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
    limitlessEnsureQuery.isLoading,
    limitlessEnsureQuery.isFetched,
    limitlessEnsureQuery.isError,
    limitlessEnsureQuery.error,
    limitlessEnsureQuery.data,
    authenticated,
    profileId,
  ]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (state.tradingVenue !== "limitless") return;

    const stillLoading =
      limitlessEnsureQuery.isLoading ||
      (authenticated &&
        Boolean(profileId) &&
        !limitlessEnsureQuery.isFetched);

    let whyNotTradeable: string;
    let httpError: string | null = null;

    if (!authenticated) {
      whyNotTradeable = "not_authenticated";
    } else if (authenticated && !profileId) {
      whyNotTradeable = "no_profile";
    } else if (limitlessEnsureQuery.isError) {
      whyNotTradeable = "ensure_account_error";
      httpError = getPrivateApiErrorMessage(limitlessEnsureQuery.error);
    } else if (stillLoading && !limitlessReady) {
      whyNotTradeable = "still_loading";
    } else if (limitlessReady) {
      whyNotTradeable = "tradeable";
    } else {
      whyNotTradeable =
        limitlessEnsureNotReadyCodeToWhy(limitlessEnsureGate.notReadyCode) ??
        "not_tradeable";
    }

    let venueRegistered: boolean | undefined;
    let venueStatus: string | undefined;
    let ownerId: unknown;
    let approvalComplete: unknown;
    let tradingEnabled: unknown;
    let lastErrorSnippet: string | null = null;
    const raw = limitlessEnsureQuery.data;
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      if (typeof o.venueRegistered === "boolean") {
        venueRegistered = o.venueRegistered;
      }
      if (typeof o.venueStatus === "string") venueStatus = o.venueStatus;
      const la = o.limitlessAccount;
      if (la && typeof la === "object") {
        const a = la as Record<string, unknown>;
        ownerId = a.ownerId;
        approvalComplete = a.approvalComplete;
        tradingEnabled = a.tradingEnabled;
        const le = a.lastError;
        if (typeof le === "string" && le.trim()) {
          const t = le.trim();
          lastErrorSnippet = t.length > 200 ? `${t.slice(0, 200)}…` : t;
        }
      }
    }

    console.info("[limitless/trade-ready]", {
      whyNotTradeable,
      ensureStatus: limitlessEnsureQuery.status,
      isFetching: limitlessEnsureQuery.isFetching,
      isLoading: limitlessEnsureQuery.isLoading,
      isFetched: limitlessEnsureQuery.isFetched,
      httpError,
      gateReady: limitlessEnsureGate.ready,
      notReadyCode: limitlessEnsureGate.notReadyCode,
      venueRegistered,
      venueStatus,
      ownerId,
      approvalComplete,
      tradingEnabled,
      lastErrorSnippet,
      limitlessReady,
    });
  }, [
    state.tradingVenue,
    authenticated,
    profileId,
    limitlessEnsureQuery.status,
    limitlessEnsureQuery.isFetching,
    limitlessEnsureQuery.isLoading,
    limitlessEnsureQuery.isFetched,
    limitlessEnsureQuery.isError,
    limitlessEnsureQuery.error,
    limitlessEnsureQuery.data,
    limitlessEnsureQuery.dataUpdatedAt,
    limitlessReady,
    limitlessEnsureGate.ready,
    limitlessEnsureGate.notReadyCode,
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

  const usdcBalance = useUSDCBalance();
  const { yesBalance, noBalance } = useYesNoBalances(market);

  // Notify parent when position changes; SOR ("all") buy: sync reference limit cents to cross-venue best
  const onPositionChangeWrapper = useCallback((position: "yes" | "no") => {
    handlePositionChange(position);
    onPositionChange?.(position);
    if (state.tradingVenue === "all") {
      const px = position === "yes" ? crossBuyPrices.crossBuyYes : crossBuyPrices.crossBuyNo;
      if (px != null) {
        const cents = probabilityToLimitPriceCentsString(px);
        if (cents != null) handlePriceChange(cents);
      }
    }
  }, [handlePositionChange, onPositionChange, state.tradingVenue, crossBuyPrices.crossBuyYes, crossBuyPrices.crossBuyNo, handlePriceChange]);

  useEffect(() => {
    if (state.tradingVenue !== "all" || !state.selectedPosition) return;
    const px =
      state.selectedPosition === "yes"
        ? crossBuyPrices.crossBuyYes
        : crossBuyPrices.crossBuyNo;
    if (px != null) {
      const cents = probabilityToLimitPriceCentsString(px);
      if (cents != null) handlePriceChange(cents);
    }
  }, [
    state.tradingVenue,
    state.selectedPosition,
    crossBuyPrices.crossBuyYes,
    crossBuyPrices.crossBuyNo,
    handlePriceChange,
  ]);

  // Notify parent when side changes (buy/sell)
  const onSideChangeWrapper = useCallback((side: "buy" | "sell") => {
    handleSideChange(side);
    onSideChangeCallback?.(side);
  }, [handleSideChange, onSideChangeCallback]);

  // Market-order sizing: walks effectiveOrderbook, applies venue-specific fees.
  const calculatedMarketOrderData = useMemo(() => {
    if (
      state.orderType === "market" &&
      state.amount &&
      state.selectedPosition &&
      effectiveOrderbook
    ) {
      const usdAmount = parseFloat(state.amount);
      if (!isNaN(usdAmount) && usdAmount > 0) {
        const sizingFeeBps =
          state.tradingVenue === "limitless"
            ? LIMITLESS_DEFAULT_FEE_RATE_BPS
            : predictMarketDetail?.feeRateBps;
        // Every venue reserves fees from the user's input so they never pay
        // more than they entered. effectiveBuyBudget returns the share-buying
        // portion; the remainder covers fees.
        const bestAskPrice = effectiveOrderbook.asks?.[0]?.price;
        const effectiveBudget =
          state.side === "buy"
            ? venueConfig.effectiveBuyBudget(usdAmount, {
                feeRateBps: sizingFeeBps,
                approxPrice: bestAskPrice,
              })
            : usdAmount;

        const result = marketOrderHandler.calculateContractsForMarketOrder(
          effectiveBudget,
          orderbookWalkPosition,
          state.side
        );
        const contracts = venueConfig.requiresWholeShares
          ? Math.floor(result.contracts)
          : result.contracts;

        if (state.side === "buy") {
          const spent = effectiveBudget - result.remainingUsd;
          const avgPrice = contracts > 0 ? spent / contracts : 0;
          const tradingFee = venueConfig.estimateFee({
            contracts,
            price: avgPrice,
            side: "buy",
            feeRateBps: sizingFeeBps,
          });
          const estimatedCost = spent + tradingFee;

          return {
            calculatedContracts: contracts,
            remainingUsd: result.remainingUsd,
            spent,
            tradingFee,
            estimatedCost,
            grossReceive: null,
            sellTradingFee: null,
            netReceive: null,
          };
        }

        const grossReceive = result.remainingUsd;
        const avgSellPrice = contracts > 0 ? grossReceive / contracts : 0;
        const sellTradingFee = venueConfig.estimateFee({
          contracts,
          price: avgSellPrice,
          side: "sell",
          feeRateBps: sizingFeeBps,
        });
        const netReceive = grossReceive - sellTradingFee;

        return {
          calculatedContracts: contracts,
          remainingUsd: result.remainingUsd,
          spent: null,
          tradingFee: null,
          estimatedCost: null,
          grossReceive,
          sellTradingFee,
          netReceive,
        };
      }
    }
    return {
      calculatedContracts: null,
      remainingUsd: null,
      spent: null,
      tradingFee: null,
      estimatedCost: null,
      grossReceive: null,
      sellTradingFee: null,
      netReceive: null,
    };
  }, [
    state.tradingVenue,
    state.amount,
    state.selectedPosition,
    state.orderType,
    state.side,
    effectiveOrderbook,
    marketOrderHandler,
    orderbookWalkPosition,
    venueConfig,
    predictMarketDetail?.feeRateBps,
  ]);

  // Note: calculatedMarketOrderData is passed directly to UI component, no need for useEffect

  const ensurePredictApprovalsForTrade = useCallback(async () => {
    if (predictApprovalsQuery.data === true) return;
    await predictSession.setApprovals();
    await queryClient.invalidateQueries({ queryKey: ["predict-approvals"] });
    const refreshed = await predictApprovalsQuery.refetch();
    if (!refreshed.data) {
      throw new Error(
        "Predict trading approvals did not complete. Check your wallet and try again.",
      );
    }
  }, [predictApprovalsQuery, predictSession, queryClient]);

  const ensureLevelUpApprovalsForTrade = useCallback(async () => {
    let ok = await checkApproval();
    if (ok) return;
    await approveToken();
    ok = await checkApproval();
    if (!ok) {
      throw new Error(
        "Trading approvals did not complete. Check your wallet and try again.",
      );
    }
  }, [checkApproval, approveToken]);

  /**
   * Just-in-time Polymarket approvals. Polymarket approvals are ungated from
   * SOR eligibility, so every trade path must satisfy them on the click:
   * probe the four USDC spenders + three CTF operators, batch-approve via
   * the Polymarket relayer if anything is missing, then re-probe. A loud
   * throw on failure is intentional — the SOR leg executor surfaces it as
   * a trade error instead of silently dropping the venue.
   */
  const ensurePolymarketApprovalsForTrade = useCallback(async () => {
    const safe = funding.polymarketSafe;
    if (!safe) {
      throw new Error(
        "Polymarket Safe not provisioned. Open the Polymarket tab to initialize it.",
      );
    }
    const { checkPolymarketApprovals } = await import(
      "@/trading/polymarket/approvalTxs"
    );
    const status = await checkPolymarketApprovals(safe);
    if (status.allApproved) return;

    const client = await relay.getRelayClient();
    if (!client) {
      throw new Error(
        "Polymarket relayer unavailable. Retry in a moment or refresh the page.",
      );
    }
    const { executePolymarketApprovalBatch } = await import(
      "@/trading/polymarket/safeActions"
    );
    await executePolymarketApprovalBatch(client, safe);

    const recheck = await checkPolymarketApprovals(safe);
    if (!recheck.allApproved) {
      throw new Error(
        "Polymarket approvals batch did not complete. Retry the trade.",
      );
    }
  }, [funding.polymarketSafe, relay]);

  /**
   * Just-in-time Limitless: `verify-allowance`, then on-chain approvals by side
   * (buy: USDC only; sell: CTF only), one `sendTransaction` + receipt per call,
   * partner USDC re-check for buys, then refetch `ensure-account` for gate state.
   */
  const ensureLimitlessApprovalsForTrade = useCallback(
    async (ctx: {
      marketSlug: string;
      limitlessOrderTokenId?: string;
      side: "buy" | "sell";
      getClientForChain: (opts: {
        id: number;
      }) => Promise<SendTransactionCapable | null | undefined>;
    }) => {
      const lxJit = "[Limitless/JIT]";
      const slug = ctx.marketSlug.trim();
      const orderTokenId = ctx.limitlessOrderTokenId?.trim();
      const verifyOpts = orderTokenId ? { tokenId: orderTokenId } : undefined;
      /** Venue slug used for partner allowance + market fetch (may differ from route slug for NegRisk). */
      let effectiveVenueSlug = slug;
      if (!slug) {
        throw new Error("Limitless market slug missing — cannot verify allowance.");
      }
      console.info(lxJit, "start", {
        routeSlug: slug,
        effectiveVenueSlug,
        side: ctx.side,
        tokenIdSent: Boolean(orderTokenId),
      });
      const ensureData = limitlessEnsureQuery.data;
      const makerFromEnsure =
        ensureData &&
        typeof ensureData === "object" &&
        (ensureData as { limitlessAccount?: { makerAddress?: string } }).limitlessAccount
          ?.makerAddress?.trim();
      const makerFromOverview = funding.limitlessMakerBase?.trim();
      const maker =
        (makerFromEnsure && makerFromEnsure.length > 0
          ? makerFromEnsure
          : makerFromOverview && makerFromOverview.length > 0
            ? makerFromOverview
            : "") ?? "";
      if (!maker) {
        throw new Error(
          "Limitless maker address missing — refresh ensure-account or wait for account overview.",
        );
      }

      /** User’s Privy Base funding identity (SCW or EOA) — for delegation checks only, not Limitless collateral. */
      const userBaseFunding =
        resolvePrivyEvmFundTarget(funding.baseSmartWallet, account)?.trim() ?? "";
      const allowanceOwner = userBaseFunding.length > 0 ? userBaseFunding : maker;
      const clipAddr = (addr: string) => {
        const t = addr.trim();
        if (t.length <= 22) return t;
        return `${t.slice(0, 10)}…${t.slice(-6)}`;
      };
      console.info(lxJit, "phase", {
        step: "verify_allowance",
        routeSlug: slug,
        effectiveVenueSlug,
        maker: `${maker.slice(0, 10)}…`,
        userBaseFunding: userBaseFunding
          ? `${userBaseFunding.slice(0, 10)}…`
          : "(none)",
        allowanceOwnerForNonDelegatedPath: `${allowanceOwner.slice(0, 10)}…`,
      });
      let allowance = await privateApi.postLimitlessVerifyAllowance(slug, verifyOpts);
      effectiveVenueSlug = allowance.marketSlug?.trim() || effectiveVenueSlug;
      console.info(lxJit, "phase", {
        step: "verify_allowance_done",
        routeSlug: slug,
        effectiveVenueSlug,
        effectiveMarketSlug: allowance.effectiveMarketSlug,
        declaredMarketSlug: allowance.declaredMarketSlug,
        hasMinimumAllowance: allowance.hasMinimumAllowance,
        spender: `${allowance.spender.slice(0, 12)}…`,
        partnerAllowanceOwnerId: allowance.partnerAllowanceOwnerId,
        limitlessPartnerAllowanceType: allowance.limitlessPartnerAllowanceType,
        limitlessCheckedAddress:
          typeof allowance.limitlessCheckedAddress === "string"
            ? clipAddr(allowance.limitlessCheckedAddress)
            : undefined,
      });

      /**
       * Partner delegated + `createServerWallet: true` — Limitless managed wallet (`maker`)
       * differs from the user's Privy Base fund target. Approvals are provisioned by
       * Limitless on the sub-account; browser USDC/CTF txs from the user's wallet are
       * the wrong identity (see programmatic API server-wallet section).
       */
      const makerLower = maker.trim().toLowerCase();
      const userBaseLower = userBaseFunding.trim().toLowerCase();
      /** Partner server-wallet: maker is never the user’s Base smart wallet / EOA fund target. */
      const isDelegatedServerWalletSubAccount =
        makerLower.length > 0 &&
        (userBaseLower.length === 0 || makerLower !== userBaseLower);

      const buyPartnerUsdcOk = ctx.side === "buy" && allowance.hasMinimumAllowance;
      console.info(lxJit, "phase", {
        step: "sub_account_mode",
        routeSlug: slug,
        effectiveVenueSlug,
        isDelegatedServerWalletSubAccount,
        hasMinimumAllowance: allowance.hasMinimumAllowance,
      });

      console.info(lxJit, "phase", {
        step: "on_chain_approvals_if_needed",
        routeSlug: slug,
        effectiveVenueSlug,
      });
      let didSendTransactions = false;
      try {
        if (isDelegatedServerWalletSubAccount) {
          console.info(lxJit, "phase", {
            step: "on_chain_approvals_skipped",
            routeSlug: slug,
            effectiveVenueSlug,
            reason: "delegated_server_wallet_sub_account",
            note: "Limitless provisions approvals on managed wallet; skip Privy Base JIT",
          });
        } else if (!buyPartnerUsdcOk || ctx.side === "sell") {
          const r = await ensureLimitlessTradingApprovalsOnBase({
            getClientForChain: ctx.getClientForChain,
            maker,
            allowanceOwner,
            verify: allowance,
            side: ctx.side,
          });
          didSendTransactions = r.didSendTransactions;
        } else {
          console.info(lxJit, "phase", {
            step: "on_chain_approvals_skipped",
            routeSlug: slug,
            effectiveVenueSlug,
            reason: "buy_partner_usdc_ok",
          });
        }
      } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        console.error(lxJit, "blocked at on_chain_approvals", {
          routeSlug: slug,
          effectiveVenueSlug,
          message: m,
        });
        throw e;
      }
      console.info(lxJit, "phase", {
        step: "on_chain_approvals_done",
        routeSlug: slug,
        effectiveVenueSlug,
      });

      if (isDelegatedServerWalletSubAccount && ctx.side === "buy") {
        const refreshed = await fundingBalances.refetch();
        const row = refreshed.data;
        const makerUsd = row?.baseLimitlessUsdcHuman
          ? Number(row.baseLimitlessUsdcHuman)
          : 0;
        if (!Number.isFinite(makerUsd) || makerUsd < 0.01) {
          throw new Error(
            "Add USDC to your Limitless balance before buying. Open Transfers and move funds from your Base wallet.",
          );
        }
      }

      if (
        ctx.side === "buy" &&
        !allowance.hasMinimumAllowance &&
        !isDelegatedServerWalletSubAccount
      ) {
        console.info(lxJit, "phase", {
          step: "partner_usdc_recheck",
          routeSlug: slug,
          effectiveVenueSlug,
          didSendTransactions,
        });
        allowance = await privateApi.postLimitlessVerifyAllowance(slug, verifyOpts);
        effectiveVenueSlug = allowance.marketSlug?.trim() || effectiveVenueSlug;
        if (!allowance.hasMinimumAllowance && didSendTransactions) {
          await new Promise((r) => setTimeout(r, 2000));
          allowance = await privateApi.postLimitlessVerifyAllowance(slug, verifyOpts);
          effectiveVenueSlug = allowance.marketSlug?.trim() || effectiveVenueSlug;
        }
        if (!allowance.hasMinimumAllowance) {
          const detail = [
            `maker=${clipAddr(maker)}`,
            `userBaseFunding=${clipAddr(userBaseFunding || "(none)")}`,
            `spender=${clipAddr(allowance.spender)}`,
          ];
          if (allowance.limitlessCheckedAddress?.trim()) {
            detail.push(`partnerChecked=${clipAddr(allowance.limitlessCheckedAddress)}`);
          }
          console.error(lxJit, "blocked after partner USDC recheck", {
            routeSlug: slug,
            effectiveVenueSlug,
            hasMinimumAllowance: allowance.hasMinimumAllowance,
            detail,
          });
          throw new Error(
            `Limitless still reports insufficient USDC allowance after Base setup (${detail.join(", ")}). ` +
              `If you just approved on-chain, wait a minute and retry, or finish setup in the Limitless app.`,
          );
        }
        console.info(lxJit, "partner USDC OK", { routeSlug: slug, effectiveVenueSlug });
      }
      console.info(lxJit, "phase", {
        step: "ensure_account_refetch",
        routeSlug: slug,
        effectiveVenueSlug,
      });
      const refetchResult = await limitlessEnsureQuery.refetch();
      const gatePayload =
        (refetchResult != null && typeof refetchResult === "object"
          ? (refetchResult as { data?: unknown }).data
          : undefined) ??
        limitlessEnsureQuery.data ??
        null;
      const gate = getLimitlessEnsureTradeGate(gatePayload);
      console.info(lxJit, "phase", {
        step: "trade_gate",
        routeSlug: slug,
        effectiveVenueSlug,
        ready: gate.ready,
        notReadyCode: gate.notReadyCode,
        blockedReason: gate.blockedReason,
      });
      if (!gate.ready) {
        const msg =
          gate.blockedReason?.trim() ||
          (gate.notReadyCode != null
            ? `Limitless not ready (${gate.notReadyCode})`
            : "Limitless not ready.");
        console.error(lxJit, "blocked at trade_gate", {
          routeSlug: slug,
          effectiveVenueSlug,
          msg,
        });
        throw new Error(msg);
      }
      console.info(lxJit, "complete", {
        routeSlug: slug,
        effectiveVenueSlug,
        side: ctx.side,
      });
    },
    [
      account,
      funding.baseSmartWallet,
      funding.limitlessMakerBase,
      fundingBalances,
      limitlessEnsureQuery,
      privateApi,
    ],
  );

  /**
   * Just-in-time DFlow/Proof KYC refresh. KYC remains the one SOR-level
   * blocker for DFlow, but we re-fetch on the click so a user who verified
   * mid-session isn't falsely rejected from a stale cache. If the refresh
   * confirms unverified, we launch the Proof redirect to route the user
   * into verification instead of silently rejecting them.
   */
  const ensureDflowProofVerifiedForTrade = useCallback(async (): Promise<boolean> => {
    const verified = await dflowProof.refetchIsVerified();
    if (!verified) {
      try {
        await handleStartDflowProofForTrade();
      } catch {
        /* best-effort: do not mask the original "unverified" error */
      }
    }
    return verified;
  }, [dflowProof, handleStartDflowProofForTrade]);

  // DEPRECATED: All single-market and multi-market trades now flow through
  // `handleSorExecute`, which first runs LI.FI prefunding via the SOR execution
  // pipeline and then signs the venue order. This stub only exists so the
  // `onTrade` prop wiring on the UI components keeps its non-optional signature
  // while the last legacy callers are removed. It MUST stay a no-op — kicking
  // off a venue order directly here would bypass the unified LI.FI prefund and
  // land us back in "Insufficient collateral" territory.
  const handleTrade = useCallback(async () => {
    if (import.meta.env.DEV) {
      console.warn(
        "[handleTrade] deprecated entrypoint invoked — single-market trades must dispatch via handleSorExecute",
      );
    }
    if (state.tradingVenue === "all") {
      return;
    }

  }, [state.tradingVenue]);

  // Auto-dismiss order result after 4 seconds
  useEffect(() => {
    if (state.orderResult) {
      const timer = setTimeout(() => {
        setState((prev) => ({ ...prev, orderResult: null }));
      }, 4000); // Dismiss after 4 seconds
      return () => clearTimeout(timer);
    }
  }, [state.orderResult]);

  // Expose methods for testing via ref
  useImperativeHandle(ref, () => ({
    setPosition: (position: 'yes' | 'no') => {
      handlePositionChange(position);
    },
    setAmount: (amount: string) => {
      handleAmountChange(amount);
    },
    setPrice: (price: string) => {
      handlePriceChange(price);
    },
    setOrderType: (orderType: 'market' | 'limit') => {
      handleOrderTypeChange(orderType);
    },
    setSide: (side: 'buy' | 'sell') => {
      handleSideChange(side);
    },
    executeTrade: async () => {
      if (!authenticated) {
        throw new Error("Not authenticated - please log in with Privy");
      }
      if (!account) {
        throw new Error("No wallet connected - account not available");
      }
      if (state.isLoading) {
        throw new Error("Already processing a trade");
      }
      if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) {
        throw new Error("Missing required fields: position, amount, or price");
      }

      // Sell-side sanity: SOR will also enforce this server-side, but failing
      // fast here keeps the imperative test surface behaving predictably.
      if (state.side === "sell") {
        const sharesCheck = checkSufficientShares(
          state.amount,
          state.orderType,
          state.side,
          state.selectedPosition,
          yesBalance,
          noBalance,
          null,
        );
        if (!sharesCheck.hasSufficientShares) {
          throw new Error(
            `Insufficient ${state.selectedPosition.toUpperCase()} shares. Required: ${sharesCheck.requiredShares}, Available: ${state.selectedPosition === "yes" ? yesBalance : noBalance}`,
          );
        }
      }

      // Everything — LevelUp, Polymarket, Predict, Limitless, Dflow — now
      // dispatches through the unified SOR + LI.FI prefund pipeline. The
      // imperative handle cannot block on completion (it kicks off a mutation
      // whose progress is reported on `state.isLoading` / `state.orderResult`).
      const runSor = handleSorExecuteRef.current;
      if (!runSor) {
        throw new Error("SOR executor not ready - route has not been generated yet.");
      }
      runSor();
    },
    getState: () => state,
  }), [handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, state, authenticated, account, yesBalance, noBalance, checkSufficientShares]);

  // SOR execution wiring: executor callbacks + multi-chain wallet balances
  const sorReportExecutionPhaseRef = useRef<
    ((phase: SorExecutionPhase) => void) | undefined
  >(undefined);

  const sorExecutor = useSorLegExecutor({
    tradeExecutionService,
    polyClob,
    predictSession,
    privateApi,
    market,
    matchedMonitor,
    predictNumericId,
    predictMarketDetail,
    account,
    getClientForChain,
    fundingAddresses: {
      baseSmartWallet: funding.baseSmartWallet,
      limitlessMakerBase: funding.limitlessMakerBase,
      polymarketSafe: funding.polymarketSafe,
      embeddedEoa: funding.embeddedEoa,
      solanaAddress: funding.solanaAddress,
    },
    solanaSigner,
    getRelayClient: relay.getRelayClient,
    dflowProofVerified: dflowProof.isVerified,
    predictApprovalsOk: predictApprovalsQuery.data === true,
    predictTokenId: predictTokenIdForPosition,
    ensureLevelUpApprovals: ensureLevelUpApprovalsForTrade,
    ensurePredictApprovals: ensurePredictApprovalsForTrade,
    ensurePolymarketApprovals: ensurePolymarketApprovalsForTrade,
    ensureLimitlessApprovals: ensureLimitlessApprovalsForTrade,
    ensureDflowProofVerified: ensureDflowProofVerifiedForTrade,
    reportExecutionPhaseRef: sorReportExecutionPhaseRef,
  });

  const limitlessMakerCashForSor = fundingBalances.data?.baseLimitlessUsdcHuman
    ? Number(fundingBalances.data.baseLimitlessUsdcHuman)
    : 0;

  const sorWalletBalances: ChainBalance[] = useMemo(
    () =>
      buildChainBalances({
        baseUsdcBalance: usdcBalance ?? 0,
        baseWalletAddress: account ?? "",
        polygonUsdcBalance: fundingBalances.data?.polygonUsdcEHuman
          ? Number(fundingBalances.data.polygonUsdcEHuman)
          : undefined,
        polygonWalletAddress: funding.polymarketSafe,
        solanaUsdcBalance: fundingBalances.data?.solanaUsdcHuman
          ? Number(fundingBalances.data.solanaUsdcHuman)
          : undefined,
        solanaWalletAddress: funding.solanaAddress,
        bnbUsdtBalance: fundingBalances.data?.bscUsdtHuman
          ? Number(fundingBalances.data.bscUsdtHuman)
          : undefined,
        bnbWalletAddress: funding.embeddedEoa,
        /** SOR API expects per-chain rows when addresses exist, not only chains with positive balance. */
        includeZeroBalanceChainsWithAddress: true,
      }),
    [
      usdcBalance,
      account,
      fundingBalances.data,
      funding.polymarketSafe,
      funding.solanaAddress,
      funding.embeddedEoa,
    ],
  );

  // --- SOR sell: per-venue share positions ---
  const polyPositionsQuery = usePolymarketPositions(
    multiVenueEnabled ? funding.polymarketSafe : undefined,
  );

  const sorVenuePositions: VenuePositionEntry[] = useMemo(() => {
    if (!state.selectedPosition) return [];
    const entries: VenuePositionEntry[] = [];

    const luBal = state.selectedPosition === "yes" ? yesBalance : noBalance;
    if (luBal > 0) entries.push({ venue: "levelup", shares: luBal });

    if (polyPositionsQuery.data && matchedMonitor) {
      try {
        const { yesTeamLabel, noTeamLabel } = getYesNoTeamLabels(market, umbrellaDisplayName);
        const tokenId = polyOutcomeTokenId(matchedMonitor, state.selectedPosition, yesTeamLabel, noTeamLabel);
        const pos = polyPositionsQuery.data.find((p) => p.tokenId === tokenId);
        if (pos && pos.shares > 0) entries.push({ venue: "polymarket", shares: pos.shares });
      } catch { /* skip */ }
    }

    const pfBal = predictSellShareBalance;
    if (typeof pfBal === "number" && pfBal > 0) {
      entries.push({ venue: "predictfun", shares: pfBal });
    }

    // DFlow: use the same pipeline as the sell breakdown (`useTradeBoxShareBalances` →
    // `useDflowPositions`), not a single-mint RPC read (mint / A-B mapping can disagree).
    const byOutcome = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
    let dfBal: number | undefined;
    if (byOutcome) {
      const sideMap =
        state.selectedPosition === "yes" ? byOutcome.yes : byOutcome.no;
      const v = sideMap.dflow;
      dfBal = typeof v === "number" && Number.isFinite(v) ? v : undefined;
    } else {
      const row = tradeBoxShareBalances.sellVenueBreakdown.find((r) => r.key === "dflow");
      dfBal =
        row && Number.isFinite(row.shares) && row.shares > 0 ? row.shares : undefined;
    }
    if (dfBal != null && dfBal > 0) {
      entries.push({ venue: "dflow", shares: dfBal });
    }

    const lxBal = limitlessSellShareBalance;
    if (typeof lxBal === "number" && lxBal > 0) {
      entries.push({ venue: "limitless", shares: lxBal });
    }

    return entries;
  }, [
    state.selectedPosition,
    yesBalance,
    noBalance,
    polyPositionsQuery.data,
    matchedMonitor,
    market,
    predictSellShareBalance,
    tradeBoxShareBalances.allMarketsOutcomeVenueShares,
    tradeBoxShareBalances.sellVenueBreakdown,
    limitlessSellShareBalance,
    umbrellaDisplayName,
  ]);

  /** Sell routing + button state: single-venue tabs only include that venue’s shares. */
  const sorVenuePositionsForActiveTab = useMemo(() => {
    if (state.tradingVenue === "all") return sorVenuePositions;
    return sorVenuePositions.filter((e) => e.venue === state.tradingVenue);
  }, [sorVenuePositions, state.tradingVenue]);

  const maxScopedSellShares = useMemo(
    () =>
      sorVenuePositionsForActiveTab.reduce((sum, p) => sum + (p.shares > 0 ? p.shares : 0), 0),
    [sorVenuePositionsForActiveTab],
  );

  /**
   * Pooled stable for SOR buy gates + deposit CTA — same basis everywhere (LevelUp, Limitless, etc.):
   * Base SCW + Polygon + Solana + BNB rows from `sorWalletBalances`, plus Limitless maker Base USDC.
   * Prefund / Li.FI moves funds before signing; the gate must not pretend off-Base stables do not exist.
   */
  const totalAvailableCash = useMemo(() => {
    const makerUsd = Number.isFinite(limitlessMakerCashForSor)
      ? Math.max(0, limitlessMakerCashForSor)
      : 0;
    return (
      sorWalletBalances.reduce((sum, b) => sum + b.balance, 0) + makerUsd
    );
  }, [sorWalletBalances, limitlessMakerCashForSor]);

  // --- SOR route computation + execution (active for ALL venues, not just "all") ---
  const sorLimitPriceCents: number | undefined =
    state.orderType === "limit" ? parseLimitPriceCents(state.price) : undefined;

  // For market orders the amount field is USD. For limit orders the amount
  // field is shares and the price field is cents — SOR always expects USD, so
  // convert limit amounts to USD notional (shares * price).
  const sorAmountUsd = (() => {
    const raw = parseFloat(state.amount);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (state.orderType === "limit") {
      if (sorLimitPriceCents == null) return 0;
      return raw * (sorLimitPriceCents / 100);
    }
    return raw;
  })();

  // Respect the product-wide SOR floors so we never call the route API below
  // a minimum — avoids stale/broken previews and keeps the button on the
  // "Trade minimum is $5" / "$5 minimum limit order value" / "Minimum sell is
  // 1 share" disabled state until the user types a valid amount.
  const sorAmountMeetsFloor = (() => {
    if (sorAmountUsd <= 0) return false;
    if (state.orderType === "limit") {
      return sorAmountUsd + 1e-9 >= SOR_MIN_LIMIT_ORDER_USD;
    }
    if (state.side === "buy") {
      return sorAmountUsd + 1e-9 >= SOR_MIN_MARKET_BUY_USD;
    }
    // Market sell: `state.amount` is in shares.
    const sharesIn = parseFloat(state.amount);
    return (
      Number.isFinite(sharesIn) && sharesIn + 1e-9 >= SOR_MIN_MARKET_SELL_SHARES
    );
  })();

  const sorRouteEnabled = !!state.selectedPosition
    && sorAmountMeetsFloor
    && (state.orderType !== "limit" ||
      (state.tradingVenue !== "all" &&
        state.tradingVenue !== "dflow" &&
        sorLimitPriceCents != null))
    && (state.side === "buy"
      ? true
      : sorVenuePositionsForActiveTab.length > 0);

  const sorRouteOutcome: SorOutcome | undefined = state.selectedPosition
    ? (state.selectedPosition === "yes" ? "A" : "B")
    : undefined;

  const sorTargetVenue = state.tradingVenue !== "all" ? state.tradingVenue : undefined;

  const sorRoute = useSorRoute({
    questionId: market?._id || (market as any)?.questionId,
    outcome: sorRouteOutcome,
    side: state.side,
    amount: sorAmountUsd,
    /**
     * Per-chain balances for predictions SOR. When omitted or empty, the server still
     * walks full books but sets `route.sufficientFunds === false` (execute blocked until
     * balances cover legs and bridges). Prefer non-empty `buildChainBalances` rows.
     */
    walletBalances: sorWalletBalances.length > 0 ? sorWalletBalances : undefined,
    ...(state.side === "buy" && Number.isFinite(limitlessMakerCashForSor)
      ? { limitlessMakerBaseUsdc: Math.max(0, limitlessMakerCashForSor) }
      : {}),
    ...(state.side === "buy"
      ? { limitlessFeeRateBps: LIMITLESS_DEFAULT_FEE_RATE_BPS }
      : {}),
    venuePositions: state.side === "sell" ? sorVenuePositionsForActiveTab : undefined,
    enabled: sorRouteEnabled,
    polyFeeRate: 0.03,
    predictFunFeeRateBps: predictMarketDetail?.feeRateBps,
    targetVenue: sorTargetVenue,
    orderType: state.orderType,
    limitPriceCents: sorLimitPriceCents,
  });

  // Keep ref in sync so handleTrade (defined above) can access latest SOR data
  sorRouteRef.current = sorRoute.route;

  const sorExecution = useSorExecution({
    executeLeg: sorExecutor.executeLeg,
    executeBridge: sorExecutor.executeBridge,
    reportExecutionPhaseRef: sorReportExecutionPhaseRef,
  });

  const [sorRouteExpired, setSorRouteExpired] = useState(false);
  useEffect(() => {
    if (!sorRoute.route) { setSorRouteExpired(false); return; }
    const check = () => {
      if (sorRoute.route) {
        setSorRouteExpired(Date.now() > sorRoute.route.expiresAt);
      }
    };
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [sorRoute.route]);

  useEffect(() => {
    sorRouteExpiredRef.current = sorRouteExpired;
  }, [sorRouteExpired]);

  const handleSorExecute = useCallback(() => {
    if (sorRoute.route && !sorRouteExpired) {
      console.log("[SOR] Trade button → execute", sorRoute.route.routeId);
      void sorExecution
        .execute(sorRoute.route)
        .then((res) => {
          console.log("[SOR] execute settled", res?.status ?? res);
        })
        .catch((err: unknown) => {
          console.error("[SOR] execute rejected", err);
          setState((prev) => ({
            ...prev,
            orderResult: {
              success: false,
              error:
                err instanceof Error
                  ? err.message
                  : typeof err === "string"
                    ? err
                    : "Smart route failed to run.",
            },
          }));
        });
      return;
    }
    setState((prev) => ({
      ...prev,
      orderResult: {
        success: false,
        error: sorRouteExpired
          ? "Odds expired. Wait for refresh, then try again."
          : sorRoute.routeErrorCode === "EXECUTION_NOT_READY"
            ? "Complete setup for this venue before trading."
            : sorRoute.error?.trim()
              ? sorRoute.error
              : sorRoute.isLoading
                ? "Still finding the best route…"
                : "No route available. Try a different amount or venue.",
      },
    }));
  }, [
    sorRoute.route,
    sorRouteExpired,
    sorRoute.error,
    sorRoute.isLoading,
    sorRoute.routeErrorCode,
    sorExecution.execute,
    setState,
  ]);

  // Forward the freshly-rebound `handleSorExecute` into the late-bound ref
  // consumed by `useImperativeHandle.executeTrade` above. Must live *below*
  // `handleSorExecute`'s declaration so we never hit its TDZ.
  useEffect(() => {
    handleSorExecuteRef.current = handleSorExecute;
    return () => {
      if (handleSorExecuteRef.current === handleSorExecute) {
        handleSorExecuteRef.current = null;
      }
    };
  }, [handleSorExecute]);

  const prevSorExecutingRef = useRef(false);
  useEffect(() => {
    const wasExecuting = prevSorExecutingRef.current;
    prevSorExecutingRef.current = sorExecution.isExecuting;
    if (wasExecuting && !sorExecution.isExecuting && sorExecution.execution) {
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] }),
        queryClient.invalidateQueries({ queryKey: ["predict-positions"] }),
        queryClient.invalidateQueries({ queryKey: ["predict-outcome-shares"] }),
        queryClient.invalidateQueries({ queryKey: ["predict-usdt-balance"] }),
        queryClient.invalidateQueries({ queryKey: ["dflow-positions"] }),
        queryClient.invalidateQueries({ queryKey: ["dflow-outcome-balance"] }),
        queryClient.invalidateQueries({ queryKey: [...LIMITLESS_QUERY_ROOT] }),
        queryClient.invalidateQueries({ queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY] }),
        refreshViaRpc(),
      ]).catch(() => {});
      const { status, legs } = sorExecution.execution;
      if (status === "complete") {
        setState((s) => ({ ...s, amount: "", orderResult: { success: true } }));
      } else if (status === "failed" || status === "partial") {
        const failedLeg = legs.find((l) => l.status === "failed");
        setState((s) => ({
          ...s,
          orderResult: {
            success: false,
            error:
              failedLeg?.error ??
              (status === "partial"
                ? "Part of the smart route did not fill. Check balances and positions."
                : "Smart route did not complete."),
          },
        }));
      }
    }
  }, [sorExecution.isExecuting, sorExecution.execution, queryClient, setState, refreshViaRpc]);

  useEffect(() => {
    if (pandaId && state.tradingVenue !== "all") {
      handleTradingVenueChange("all");
    } else if (!pandaId && state.tradingVenue === "all") {
      handleTradingVenueChange("levelup");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pandaId]);

  useEffect(() => {
    if (venueOverride && venueOverride !== state.tradingVenue) {
      handleTradingVenueChange(venueOverride);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueOverride]);

  // Button state logic
  const buttonState = useButtonState({
    authenticated,
    account,
    state,
    login,
    marketOrderHandler,
    usdcBalance,
    yesBalance,
    noBalance,
    checkSufficientBalance,
    checkSufficientShares,
    market,
    handleAddFunds,
    polymarketTrading,
    orderbookWalkPosition,
    predictTrading,
    predictSellShareBalance,
    limitlessTrading,
    limitlessSellShareBalance,
    dflowProofVerified: dflowProof.isVerified,
    dflowProofLoading: dflowProof.isLoading,
    dflowStartProofFlow: handleStartDflowProofForTrade,
    sorMatchedVenues: matchedVenues,
    sorState: {
      route: sorRoute.route,
      isLoading: sorRoute.isLoading,
      isStale: sorRoute.isStale,
      error: sorRoute.error,
      routeErrorCode: sorRoute.routeErrorCode,
      isExecuting: sorExecution.isExecuting,
      executionPhase: sorExecution.executionPhase,
      prefundLegProgress: sorExecution.prefundLegProgress,
      routeExpired: sorRouteExpired,
      handleExecute: handleSorExecute,
      venuePositions: sorVenuePositionsForActiveTab,
      totalAvailableCash,
      handleAddFunds,
    },
  });

  const buttonStateForUi = useMemo(() => {
    if (state.tradingVenue === "levelup" && executionGate.blocked) {
      return {
        ...buttonState,
        text: "Complete trading setup",
        disabled: true,
        onClick: () => {},
        depositShortfallUsd: undefined,
      };
    }
    return buttonState;
  }, [executionGate.blocked, buttonState, state.tradingVenue]);

  // executionGateBanner removed — internal plumbing not shown to users
  const executionGateBanner = null;

  return (
		<>
		<RegisterPrivyOpenFundAction
			fundTarget={fundEvmForPrivy}
			ready={signerReady}
			onAfterFund={refresh}
			fundActionRef={addFundsFromPrivyRef}
		/>
    <PredictionMarketTradeBoxResponsiveContainer
      market={market}
      orderbook={effectiveOrderbook}
      pandascoreMatchId={pandascoreMatchId}
      umbrellaId={propUmbrellaId}
      umbrellaDisplayName={umbrellaDisplayName}
      crossBuyYes={crossBuyPrices.crossBuyYes}
      crossBuyNo={crossBuyPrices.crossBuyNo}
      state={(() => {
        // When SOR route is available for single-venue trades, overlay its data — only if this
        // response matches the current amount and is not stale (otherwise show local book walk).
        const sr = sorRoute.route;
        const inputAmount = parseFloat(state.amount) || 0;
        const sorMatchesInput =
          sr &&
          sr.legs.length > 0 &&
          Math.abs(sr.requestedAmount - inputAmount) < 0.0001;
        const hasSorData =
          sorMatchesInput &&
          !sorRoute.isStale &&
          state.tradingVenue !== "all";
        const bookData = calculatedMarketOrderData;

        if (hasSorData && state.orderType === "market") {
          const leg = sr.legs[0];
          const shareVenueCfg = getVenueConfig(state.tradingVenue);
          const sorContracts = shareVenueCfg.requiresWholeShares
            ? Math.floor(sr.totalShares)
            : sr.totalShares;
          const sorCost = sr.totalCost;
          const sorFee = sr.totalFees;

          if (state.side === "buy") {
            return {
              ...state,
              calculatedContracts: sorContracts || bookData.calculatedContracts,
              remainingUsd: bookData.remainingUsd,
              spent: sorCost > 0 ? sorCost - sorFee : bookData.spent,
              tradingFee: sorFee || bookData.tradingFee,
              estimatedCost: sorCost || bookData.estimatedCost,
              grossReceive: null,
              sellTradingFee: null,
              netReceive: null,
            };
          }
          // Sell
          const legProceedsUsd =
            typeof leg.executionAmountUsd === "number" &&
            Number.isFinite(leg.executionAmountUsd) &&
            leg.executionAmountUsd > 0
              ? leg.executionAmountUsd
              : null;
          return {
            ...state,
            calculatedContracts: sorContracts || bookData.calculatedContracts,
            remainingUsd: bookData.remainingUsd,
            spent: null,
            tradingFee: null,
            estimatedCost: null,
            grossReceive: legProceedsUsd ?? bookData.grossReceive,
            sellTradingFee: sorFee || bookData.sellTradingFee,
            netReceive:
              legProceedsUsd != null
                ? legProceedsUsd - sorFee
                : bookData.netReceive,
          };
        }

        return {
          ...state,
          calculatedContracts: bookData.calculatedContracts,
          remainingUsd: bookData.remainingUsd,
          spent: bookData.spent,
          tradingFee: bookData.tradingFee,
          estimatedCost: bookData.estimatedCost,
          grossReceive: bookData.grossReceive,
          sellTradingFee: bookData.sellTradingFee,
          netReceive: bookData.netReceive,
        };
      })()}
      onPositionChange={onPositionChangeWrapper}
      onAmountChange={handleAmountChange}
      onPriceChange={handlePriceChange}
      onTradingVenueChange={handleTradingVenueChange}
      onOrderTypeChange={handleOrderTypeChange}
      onSideChange={onSideChangeWrapper}
      polymarketVenueHint={polymarketVenueHint}
      predictVenueHint={predictVenueHint}
      predictVenueBookHints={predictVenueBookHints}
      dflowVenueHint={dflowVenueHint}
      matchedVenues={matchedVenues}
      onTrade={handleTrade}
      buttonState={buttonStateForUi}
      approvalState={approvalState}
      executionGateBanner={executionGateBanner}
      walletAddress={account ?? undefined}
      usdcBalance={usdcBalance}
      calculateContractsForMarketOrder={calculateContractsForMarketOrderUi}
      getEffectivePrice={marketOrderHandler.getEffectivePrice}
      sorRoute={sorRoute}
      sorExecution={sorExecution}
      sorRouteExpired={sorRouteExpired}
      handleSorExecute={handleSorExecute}
      maxScopedSellShares={maxScopedSellShares}
      matchedMonitor={matchedMonitor}
      allMarketsSellYesBid={allMarketsSellYesBid}
      allMarketsSellNoBid={allMarketsSellNoBid}
      shareBalances={tradeBoxShareBalances}
    />
		</>
  );
});

PredictionMarketTradeBox.displayName = "PredictionMarketTradeBox";

export default PredictionMarketTradeBox;


