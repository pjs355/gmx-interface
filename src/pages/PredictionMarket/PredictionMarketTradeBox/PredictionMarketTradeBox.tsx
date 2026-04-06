import { useCallback, useMemo, useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useSignerContext } from "context/SignerContext";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useFundWallet } from "@privy-io/react-auth";
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
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { usePolymarketExecutionGate } from "@/trading/hooks/usePolymarketExecutionGate";
import { usePolymarketClobTradingSession } from "@/trading/polymarket/usePolymarketClobTradingSession";
import {
	polyOrderbookForPosition,
	polyOutcomeTokenId,
	polyOutcomeSide,
} from "@/trading/polymarket/polyOutcomeTokenId";
import {
	dflowKalshiOrderbookForPosition,
	hasDflowKalshiMonitorLink,
	getDflowKalshiMonitorLink,
} from "@/trading/dflow/monitorDflowBooks";
import { monitorBookToOrderbookSnapshot } from "@/trading/polymarket/monitorOrderbookAdapter";
import { usePredictTradingSession } from "@/trading/predict/usePredictTradingSession";
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
import { usePredictUsdtBalance, usePredictOutcomeShareOnChain } from "@/trading/predict/usePredictBnbBalances";
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
import { useSignTransaction } from "@privy-io/react-auth/solana";
import { Connection, VersionedTransaction } from "@solana/web3.js";
import { SOLANA_RPC_URL } from "@/config/rpc";
import { SOLANA_USDC_MINT } from "@/config/addresses";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { useBridgeFundingBalances } from "@/trading/hooks/useBridgeFundingBalances";
import { useSendTransaction as useSolanaSendTransaction } from "@privy-io/react-auth/solana";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import type { SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";
import { buildChainBalances, useSorRoute, useSorExecution } from "@/trading/sor";
import { useSorLegExecutor } from "@/trading/sor/useSorLegExecutor";
import type { ChainBalance, VenuePositionEntry, SorOutcome } from "@/trading/sor";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { useDflowOutcomeBalance } from "@/trading/dflow/useDflowOutcomeBalance";

interface PredictionMarketTradeBoxProps extends TradeBoxProps {}

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
  ({ market, orderbook: propOrderbook, pandascoreMatchId, initialPosition, onPositionChange, onSideChange: onSideChangeCallback }, ref) => {

  const pandaId = pandascoreMatchId?.trim() ?? "";
  const multiVenueEnabled = Boolean(pandaId);
  const initialVenue = multiVenueEnabled ? "all" as const : "levelup" as const;

  const { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, handleTradingVenueChange } = useTradeState(initialPosition, initialVenue);
  const { getClientForChain } = useSmartWallets();
  const { account } = useSignerContext();
  const { login, authenticated } = usePrivy();

  // Use global approval state from UserDataContext
  const { approvalState, /* checkApproval, */ approveToken, refresh, refreshViaRpc } = useUserData();

  const { wallets: privyWallets } = usePrivyWallets();
  const { fundWallet } = useFundWallet();
  const { signTransaction: privySolanaSign } = useSignTransaction();

  /** LevelUp REST orderbook (signing + execution always uses this for LevelUp venue). */
  const levelUpOrderbook = propOrderbook ?? null;

  // Handle deposit - opens Privy's fund wallet modal
  const handleAddFunds = useCallback(async () => {
    if (!account) return;
    try {
      await fundWallet(account, { chain: { id: 8453 } }); // Base mainnet
      // Refresh balances after deposit modal closes
      refresh();
    } catch (err) {
      console.error("Deposit error:", err);
      // User likely cancelled - no need to show error
    }
  }, [account, fundWallet, refresh]);

  const dflowProof = useDflowProofStatus();
  const privateApi = usePrivateApiClient();
  const funding = useFundingAddresses();
  const relay = usePolymarketRelay();
  const { sendTransaction: privySolanaSendTx } = useSolanaSendTransaction();

  const solanaSigner = useMemo<SolanaSignerCapable>(
    () => ({
      signAndSendTransaction: async (serializedTx: Uint8Array) => {
        const tx = VersionedTransaction.deserialize(serializedTx);
        const conn = new Connection(SOLANA_RPC_URL);
        const receipt = await privySolanaSendTx({ transaction: tx, connection: conn });
        return receipt.signature;
      },
    }),
    [privySolanaSendTx]
  );

  const fundingBalances = useBridgeFundingBalances({
    baseSmartWallet: funding.baseSmartWallet,
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
    if (!pandaId || !oddsAppState?.markets?.length) return null;
    return (
      oddsAppState.markets.find((m) => String(m.pandaMatchId) === pandaId) ??
      null
    );
  }, [oddsAppState?.markets, pandaId]);

  const matchedVenues = useMemo(() => {
    const set = new Set<string>(["levelup"]);
    if (!matchedMonitor) return set;
    if (matchedMonitor.polyConditionId || matchedMonitor.polyTokenIdA) set.add("polymarket");
    if (matchedMonitor.dflow || matchedMonitor.kalshi) set.add("dflow");
    if (matchedMonitor.predictFun) set.add("predictfun");
    return set;
  }, [matchedMonitor]);

  const dflowLink = useMemo(
    () => (matchedMonitor ? getDflowKalshiMonitorLink(matchedMonitor) : undefined),
    [matchedMonitor]
  );
  const dflowMintQuery = useDflowMintResolver(
    dflowLink?.eventTicker,
    (multiVenueEnabled || state.tradingVenue === "dflow") ? dflowLink?.tickerA : null
  );

  const queryClient = useQueryClient();

  const { yesTeamLabel, noTeamLabel } = useMemo(
    () => getYesNoTeamLabels(market),
    [market]
  );

  const predictVenueActive = state.tradingVenue === "predictfun";
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
   * On-chain USDT / CTF approvals for Predict.fun are signed from the **Privy embedded EOA**
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

  const predictUsdtQuery = usePredictUsdtBalance(
    predictApprovalSubject,
    (multiVenueEnabled || predictVenueActive) && authenticated && Boolean(predictApprovalSubject)
  );
  const predictUsdtBalance = predictUsdtQuery.data ?? 0;

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

  /** LevelUp REST for LevelUp; Polymarket monitor; Predict.fun REST for selected outcome market. */
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

  // LevelUp and single-market Predict.fun use a unified YES-native book where the
  // walker must invert for NO (walk bids, cost = 1 − bid_price).  Multi-market
  // Predict.fun, Polymarket, and DFlow each fetch an outcome-native book, so always
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
      return "Predict.fun needs a PandaScore match on this umbrella.";
    }
    if (!oddsMonitorEnabled) {
      return "Odds monitor is not configured (set VITE_ODDS_WS_BASE / token).";
    }
    if (!oddsMonitorConnected) {
      return "Connecting to odds monitor…";
    }
    if (!matchedMonitor) {
      return "No monitor row — Predict.fun ids may not be linked yet.";
    }
    if (!predictHasMarketIds) {
      return "This monitor row has no Predict.fun market ids.";
    }
    if (
      (predictMarketQuery.isLoading || predictOrderbookQuery.isLoading) &&
      !matchedMonitor?.predictFunPriceA &&
      !matchedMonitor?.predictFunPriceB
    ) {
      return "Loading Predict.fun market…";
    }
    if (!predictNumericId) {
      return "Could not resolve Predict.fun market id for this side.";
    }
    if (predictMarketQuery.isError) {
      return "Failed to load Predict.fun market from API.";
    }
    if (predictSession.loading) {
      return "Preparing Predict.fun wallet on BNB…";
    }
    if (!predictSession.ready) {
      return (
        predictSession.blockedReason ||
        predictSession.error ||
        "Complete Predict.fun setup (BNB, USDT, API key if mainnet)."
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
      return "No DFlow market linked for this match on the odds monitor.";
    }
    return null;
  }, [state.tradingVenue, matchedMonitor]);

  const predictTrading = useMemo(
    () => ({
      hasPandascoreLink: Boolean(pandaId),
      hasMonitorMatch: Boolean(matchedMonitor),
      hasPredictMarketIds: predictHasMarketIds,
      ready: predictSession.ready && Boolean(predictMarketDetail),
      loading:
        predictSession.loading ||
        predictMarketQuery.isLoading ||
        predictOrderbookQuery.isLoading,
      blockedReason:
        predictSession.blockedReason ||
        predictSession.error ||
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

  // Notify parent when position changes
  const onPositionChangeWrapper = useCallback((position: "yes" | "no") => {
    handlePositionChange(position);
    onPositionChange?.(position);
  }, [handlePositionChange, onPositionChange]);

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
        // Every venue reserves fees from the user's input so they never pay
        // more than they entered. effectiveBuyBudget returns the share-buying
        // portion; the remainder covers fees.
        const bestAskPrice = effectiveOrderbook.asks?.[0]?.price;
        const effectiveBudget =
          state.side === "buy"
            ? venueConfig.effectiveBuyBudget(usdAmount, {
                feeRateBps: predictMarketDetail?.feeRateBps,
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
            feeRateBps: predictMarketDetail?.feeRateBps,
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
          feeRateBps: predictMarketDetail?.feeRateBps,
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

  const handlePredictApprove = useCallback(async () => {
    try {
      await predictSession.setApprovals();
      await queryClient.invalidateQueries({ queryKey: ["predict-approvals"] });
    } catch (e) {
      console.error(e);
    }
  }, [predictSession, queryClient]);

  // Handle trade execution
  const handleTrade = useCallback(async () => {
    if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) return;

    if (state.tradingVenue === "all") {
      return;
    }

    if (state.tradingVenue === "dflow") {
      if (!hasDflowKalshiMonitorLink(matchedMonitor)) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: "No DFlow market linked for this match on the odds monitor.",
          },
        }));
        return;
      }

      if (!dflowProof.isVerified) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: "Proof KYC not verified. Complete verification on the Profile page, then refresh.",
          },
        }));
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, orderResult: null }));
      try {
        const link = matchedMonitor?.dflow ?? matchedMonitor?.kalshi;
        if (!link) throw new Error("DFlow monitor link missing");

        // Resolve Solana SPL mints: prefer monitor-provided, else metadata API lookup
        const monitorYes = link.yesMintA;
        const monitorNo = link.noMintA;
        const resolvedYes = monitorYes ?? dflowMintQuery.data?.yesMint;
        const resolvedNo = monitorNo ?? dflowMintQuery.data?.noMint;

        if (import.meta.env.DEV) {
          console.debug("[DFlow] mint resolution", {
            monitorYes, monitorNo,
            fallback: dflowMintQuery.data,
            resolvedYes, resolvedNo,
          });
        }

        if (!resolvedYes || !resolvedNo) {
          throw new Error(
            dflowMintQuery.isLoading
              ? "Resolving DFlow outcome mints… try again in a moment."
              : "Could not resolve DFlow outcome mints for this market. The market may not be active on DFlow."
          );
        }

        const outputMint =
          state.selectedPosition === "yes" ? resolvedYes : resolvedNo;

        const usdAmount = parseFloat(state.amount);
        if (isNaN(usdAmount) || usdAmount <= 0) throw new Error("Invalid amount");

        // DFlow amounts are in USDC base units (6 decimals)
        const amountBaseUnits = Math.round(usdAmount * 1_000_000).toString();

        const orderResult = await privateApi.getDflowOrder({
          inputMint: SOLANA_USDC_MINT,
          outputMint,
          amount: amountBaseUnits,
        });

        if (orderResult.code || orderResult.msg) {
          throw new Error(orderResult.msg ?? orderResult.code ?? "DFlow order failed");
        }

        if (!orderResult.transaction) {
          throw new Error("DFlow returned no transaction to sign. Check KYC or market status.");
        }

        const txBytes = Buffer.from(orderResult.transaction, "base64");
        const transaction = VersionedTransaction.deserialize(txBytes);
        const connection = new Connection(SOLANA_RPC_URL, "confirmed");

        // Sign via Privy (no simulation), then send ourselves with skipPreflight
        const signedTx = await privySolanaSign({
          transaction,
          connection,
        }) as VersionedTransaction;

        const sig = await connection.sendRawTransaction(
          signedTx.serialize(),
          { skipPreflight: true, maxRetries: 3 },
        );

        setState((prev) => ({
          ...prev,
          orderResult: {
            success: true,
            message: `DFlow order confirmed (${orderResult.outAmount ?? "?"} outcome tokens). Tx: ${sig.slice(0, 8)}…`,
          },
        }));
        if (import.meta.env.DEV) {
          console.log(`[DFlow] Solscan: https://solscan.io/tx/${sig}`);
        }
      } catch (error: unknown) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: getPrivateApiErrorMessage(error),
          },
        }));
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
      return;
    }

    if (state.tradingVenue === "predictfun") {
      if (!account) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: "No wallet connected. Please connect your wallet first.",
          },
        }));
        return;
      }
      if (!pandaId || !matchedMonitor) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error:
              "Predict.fun needs a linked esports match and odds monitor row.",
          },
        }));
        return;
      }
      if (!predictNumericId || !predictMarketDetail) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error:
              predictMarketQuery.isError || predictOrderbookQuery.isError
                ? "Could not load Predict.fun market or orderbook."
                : "Predict.fun market is not linked for this selection.",
          },
        }));
        return;
      }
      if (!predictSession.ready) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error:
              predictSession.blockedReason ||
              predictSession.error ||
              "Predict.fun session not ready.",
          },
        }));
        return;
      }
      if (predictApprovalsQuery.data !== true) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: "Approve Predict.fun contracts on BNB first.",
          },
        }));
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, orderResult: null }));

      try {
        const tokenId = predictTokenIdForPosition;
        if (!tokenId) {
          throw new Error("Could not resolve Predict.fun outcome token id.");
        }
        if (state.orderType === "limit") {
          const priceCents = parseFloat(state.price);
          if (!Number.isFinite(priceCents) || priceCents < 1 || priceCents > 99) {
            throw new Error("Limit price must be 1–99 cents.");
          }
          await predictSession.placeLimitOrder({
            market: predictMarketDetail,
            tokenId,
            side: state.side,
            priceCents,
            sizeShares: state.amount.trim(),
          });
        } else if (state.side === "buy") {
          const usd = parseFloat(state.amount);
          if (!Number.isFinite(usd) || usd <= 0) {
            throw new Error("Invalid USDT amount.");
          }
          await predictSession.placeMarketOrder({
            marketId: predictNumericId,
            market: predictMarketDetail,
            tokenId,
            side: state.side,
            amount: state.amount.trim(),
            book: predictOrderbookQuery.data ?? undefined,
          });
        } else {
          const shares = parseFloat(state.amount);
          if (!Number.isFinite(shares) || shares <= 0) {
            throw new Error("Invalid shares.");
          }
          await predictSession.placeMarketOrder({
            marketId: predictNumericId,
            market: predictMarketDetail,
            tokenId,
            side: state.side,
            amount: state.amount.trim(),
            book: predictOrderbookQuery.data ?? undefined,
          });
        }
        setState((prev) => ({
          ...prev,
          orderResult: { success: true },
          amount: "",
          price: "",
        }));
        await queryClient.invalidateQueries({
          queryKey: ["predict-outcome-shares"],
        });
        await queryClient.invalidateQueries({ queryKey: ["predict-usdt-balance"] });
      } catch (error: unknown) {
        if (import.meta.env.DEV) {
          console.error("[Predict.fun trade]", error);
        }
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: getPrivateApiErrorMessage(error),
          },
        }));
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
      return;
    }

    if (state.tradingVenue === "polymarket") {
      if (!account) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: "No wallet connected. Please connect your wallet first.",
          },
        }));
        return;
      }
      if (!pandaId || !matchedMonitor) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error:
              "Polymarket CLOB needs a linked esports match and odds monitor row.",
          },
        }));
        return;
      }
      if (!polyClob.ready) {
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error:
              polyClob.blockedReason ||
              polyClob.error ||
              "Polymarket CLOB is not ready.",
          },
        }));
        return;
      }

      setState((prev) => ({ ...prev, isLoading: true, orderResult: null }));

      try {
        const { yesTeamLabel, noTeamLabel } = getYesNoTeamLabels(market);
        const tokenId = polyOutcomeTokenId(
          matchedMonitor,
          state.selectedPosition,
          yesTeamLabel,
          noTeamLabel
        );
        if (!tokenId) {
          throw new Error("Could not resolve Polymarket outcome token.");
        }

        const tickStyle =
          matchedMonitor.polyTickSize != null
            ? (matchedMonitor.polyTickSize as TickSize)
            : undefined;
        const negRisk =
          matchedMonitor.polyNegRisk != null
            ? Boolean(matchedMonitor.polyNegRisk)
            : undefined;
        const side = state.side === "buy" ? Side.BUY : Side.SELL;

        const { bestAsk: dbgAsk, bestBid: dbgBid } =
          bboFromSnapshot(effectiveOrderbook);
        let derivedAvgPriceFromBookWalk: number | null = null;
        if (
          state.orderType === "market" &&
          calculatedMarketOrderData.calculatedContracts != null &&
          calculatedMarketOrderData.calculatedContracts > 0
        ) {
          if (state.side === "buy") {
            /* Polymarket branch: same budget as calculatedMarketOrderData (no LevelUp 1.02). */
            const walkUsd = parseFloat(state.amount);
            derivedAvgPriceFromBookWalk = marketOrderHandler.getEffectivePrice(
              walkUsd,
              calculatedMarketOrderData.calculatedContracts,
              calculatedMarketOrderData.remainingUsd ?? 0
            );
          } else {
            const gr = calculatedMarketOrderData.grossReceive;
            const cc = calculatedMarketOrderData.calculatedContracts;
            if (gr != null && cc > 0) {
              derivedAvgPriceFromBookWalk = gr / cc;
            }
          }
        }
        const limitPriceProbIfLimit =
          state.orderType === "limit"
            ? (() => {
                const c = parseFloat(state.price) / 100;
                return Number.isFinite(c) ? c : null;
              })()
            : null;

        logPolymarketTradePreflight({
          marketId: market?.marketId ?? market?._id ?? market?.questionId,
          marketName:
            market?.displayName ?? (market as { question?: string }).question,
          pandascoreMatchId: pandaId || undefined,
          orderType: state.orderType,
          side: state.side,
          selectedPosition: state.selectedPosition,
          inputAmount: state.amount,
          limitPriceCentsInput: state.price,
          limitPriceProbIfLimit,
          derivedAvgPriceFromBookWalk,
          volumeTokenId: tokenId,
          safeAddress: polyClob.safeAddress,
          eoaAddress: polyClob.eoaAddress,
          book: { bestAsk: dbgAsk, bestBid: dbgBid },
          sizing: {
            calculatedContracts: calculatedMarketOrderData.calculatedContracts,
            remainingUsd: calculatedMarketOrderData.remainingUsd,
            spent: calculatedMarketOrderData.spent,
            estimatedCost: calculatedMarketOrderData.estimatedCost,
            grossReceive: calculatedMarketOrderData.grossReceive,
            netReceive: calculatedMarketOrderData.netReceive,
          },
          builderSignUrl: getPrivateApiAbsoluteUrl("/polymarket/builder/sign"),
          clobHost: "https://clob.polymarket.com",
        });

        if (state.orderType === "limit") {
          const size = parseFloat(state.amount);
          const price = parseFloat(state.price) / 100;
          if (!Number.isFinite(size) || size <= 0) {
            throw new Error("Invalid size.");
          }
          if (!Number.isFinite(price) || price <= 0 || price >= 1) {
            throw new Error("Limit price must be between 0 and 1 (use cents in the box).");
          }
          await polyClob.placeLimitOrder({
            tokenId,
            price,
            size,
            side,
            tickStyle,
            negRisk,
          });
        } else if (state.side === "buy") {
          const usd = parseFloat(state.amount);
          if (!Number.isFinite(usd) || usd <= 0) {
            throw new Error("Invalid USDC amount.");
          }
          await polyClob.placeMarketOrder({
            tokenId,
            amount: usd,
            side,
            tickStyle,
            negRisk,
          });
        } else {
          const shares = parseFloat(state.amount);
          if (!Number.isFinite(shares) || shares <= 0) {
            throw new Error("Invalid shares.");
          }
          await polyClob.placeMarketOrder({
            tokenId,
            amount: shares,
            side,
            tickStyle,
            negRisk,
          });
        }

        setState((prev) => ({
          ...prev,
          orderResult: { success: true },
          amount: "",
          price: "",
        }));
      } catch (error: unknown) {
        if (import.meta.env.DEV) {
          console.error("[Polymarket trade] order failed — full error below", {
            orderType: state.orderType,
            side: state.side,
            selectedPosition: state.selectedPosition,
            amount: state.amount,
            price: state.price,
          });
          console.error(error);
        }
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error: getPrivateApiErrorMessage(error),
          },
        }));
      } finally {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
      return;
    }

    if (executionGate.blocked) {
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error:
            "Trading is blocked for your account. Complete setup on the Trading page.",
        },
      }));
      return;
    }

    // Check if wallet is connected
    if (!account) {
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: "No wallet connected. Please connect your wallet first.",
        },
      }));
      return;
    }

    // CRITICAL: Freeze the current state to prevent race conditions
    const frozenState = {
      selectedPosition: state.selectedPosition,
      amount: state.amount,
      price: state.price,
      orderType: state.orderType,
      side: state.side,
      calculatedContracts: state.calculatedContracts,
      remainingUsd: state.remainingUsd,
    };

    // Log the frozen state for debugging
    console.log("🔒 FROZEN STATE FOR TRADE EXECUTION:", frozenState);
    console.log("🔍 State validation:", {
      hasPosition: Boolean(frozenState.selectedPosition),
      hasAmount: Boolean(frozenState.amount),
      hasPrice: frozenState.orderType === "limit" ? Boolean(frozenState.price) : true,
      position: frozenState.selectedPosition,
      side: frozenState.side,
      orderType: frozenState.orderType,
    });

    // CRITICAL: Validate state before proceeding
    if (!frozenState.selectedPosition || !frozenState.amount) {
      console.error("❌ INVALID STATE: Missing required fields", frozenState);
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: "Invalid state: Missing required fields",
        },
      }));
      return;
    }

    if (frozenState.orderType === "limit" && !frozenState.price) {
      console.error("❌ INVALID STATE: Missing price for limit order", frozenState);
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: "Invalid state: Missing price for limit order",
        },
      }));
      return;
    }

    setState((prev) => ({ ...prev, isLoading: true, orderResult: null }));

    try {
      // Resolve embedded (smart) wallet from Privy if available
      const privyWallet: any = Array.isArray(privyWallets)
        ? (privyWallets as any[]).find((w) => w?.type === "smart_wallet") || (privyWallets as any[])[0]
        : undefined;

      // Determine order amount and price based on side and type
      // - MARKET BUY: amount input is USD; recompute contracts and effective price
      // - MARKET SELL: amount input is shares; calculate effective price
      // - LIMIT (buy/sell): amount input is shares; use provided price
      let orderAmount: number;
      let orderPrice: number;
      
      if (frozenState.orderType === "market") {
        // Helper: derive top-of-book prices (do not mutate orderbook)
        const bestAsk =
          levelUpOrderbook?.asks && levelUpOrderbook.asks.length > 0
            ? Math.min(...levelUpOrderbook.asks.map((a: any) => a.price))
            : null;
        const bestBid =
          levelUpOrderbook?.bids && levelUpOrderbook.bids.length > 0
            ? Math.max(...levelUpOrderbook.bids.map((b: any) => b.price))
            : null;

        if (frozenState.side === "buy") {
          const usdAmount = parseFloat(frozenState.amount);
          // CRITICAL: Use effective budget (amount / 1.02) to match UI calculation
          // This ensures the signed order matches what user saw in "Estimated Cost"
          const effectiveBudget = usdAmount / 1.02;
          
          const calc = marketOrderHandler.calculateContractsForMarketOrder(
            effectiveBudget,
            frozenState.selectedPosition,
            "buy"
          );
          // Ensure whole-share execution
          orderAmount = Math.floor(calc.contracts);

          if (!orderAmount || !isFinite(orderAmount) || orderAmount <= 0) {
            throw new Error("Unable to compute contracts for market buy order");
          }

          // For BUY market orders:
          // - calc.contracts = shares bought
          // - calc.remainingUsd = leftover USD that wasn't spent (relative to effectiveBudget)
          // - calc.maxPrice = HIGHEST price hit (worst case for signing)
          const sharesBought = orderAmount;
          const usdSpent = effectiveBudget - calc.remainingUsd;
          const effectiveAvgPrice = usdSpent / sharesBought;
          const maxPrice = (calc as any).maxPrice;
          
          // Use MAXIMUM price for signing (conservative/worst case)
          // Sign at highest price to guarantee we pay at most this much
          if (!maxPrice || !isFinite(maxPrice) || maxPrice <= 0) {
            throw new Error("Unable to determine maximum price for market buy order");
          }
          
          // Round to 2 decimal places to avoid floating point precision errors
          orderPrice = Math.round(maxPrice * 100) / 100;
          
          console.log("📊 Market BUY calculation:", {
            userInputAmount: usdAmount,
            effectiveBudget: effectiveBudget,
            sharesBought: sharesBought,
            usdSpent: usdSpent,
            remainingUsd: calc.remainingUsd,
            maxPrice: maxPrice,
            effectiveAvgPrice: effectiveAvgPrice,
            signingPrice: orderPrice
          });
        } else {
          // SELL market uses shares input directly
          orderAmount = parseFloat(frozenState.amount);
          if (!orderAmount || !isFinite(orderAmount) || orderAmount <= 0) {
            throw new Error("Invalid shares for market sell order");
          }

          // Calculate minimum price from all price levels for signing
          const sellCalc = marketOrderHandler.calculateContractsForMarketOrder(
            orderAmount,
            frozenState.selectedPosition,
            "sell"
          );
          
          // For SELL market orders:
          // - sellCalc.contracts = shares actually sold (may be less than requested!)
          // - sellCalc.remainingUsd = total USD received (NOT remaining!)
          // - sellCalc.minPrice = LOWEST price hit (conservative for signing)
          const sharesSold = sellCalc.contracts;
          const totalUsdReceived = sellCalc.remainingUsd;
          const minPrice = (sellCalc as any).minPrice;
          
          if (!sharesSold || sharesSold <= 0) {
            throw new Error("Unable to sell shares - insufficient orderbook liquidity");
          }
          
          // CRITICAL: Use actual shares sold, not requested amount
          // This handles cases where orderbook can't fill the full amount
          orderAmount = sharesSold;
          
          // Use MINIMUM price for signing (conservative/worst case)
          // Sign at lowest price to guarantee at least this much back
          // This allows fills at minPrice OR BETTER (higher prices)
          if (!minPrice || !isFinite(minPrice) || minPrice <= 0) {
            throw new Error("Unable to determine minimum price for market sell order");
          }
          
          // Round to 2 decimal places to avoid floating point precision errors
          orderPrice = Math.round(minPrice * 100) / 100;
          
          const effectiveAvgPrice = totalUsdReceived / sharesSold;
          
          console.log("📊 Market SELL calculation:", {
            sharesRequested: parseFloat(frozenState.amount),
            sharesSold: sharesSold,
            totalUsdReceived: totalUsdReceived,
            minPrice: minPrice,
            maxPrice: (sellCalc as any).maxPrice,
            effectiveAvgPrice: effectiveAvgPrice,
            signingPrice: orderPrice,
            finalOrderAmount: orderAmount,
            signatureAmount: orderAmount,
            signaturePrice: orderPrice,
            signatureTotalUSD: orderAmount * orderPrice,
            actualTotalUSD: totalUsdReceived
          });
        }
      } else {
        // LIMIT orders use shares input directly and provided price
        orderAmount = parseFloat(frozenState.amount);
        orderPrice = parseFloat(frozenState.price) / 100; // Convert cents to dollars
        
        if (!orderPrice || !isFinite(orderPrice) || orderPrice <= 0) {
          throw new Error("Invalid price for limit order");
        }
      }

      const tradeParams: TradeExecutionParams = {
        marketId: market._id,
        position: frozenState.selectedPosition,
        amount: orderAmount,
        price: orderPrice,
        orderType: frozenState.orderType,
        side: frozenState.side,
        userAddress: account,
        market,
      };

      // Log the final trade parameters being sent
      console.log("📤 TRADE PARAMETERS BEING SENT:", tradeParams);

      // Use smart wallet pattern from GMX for trade execution
      const result = await tradeExecutionService.executeTrade(tradeParams, privyWallet);

      setState((prev) => ({ ...prev, orderResult: result }));

      if (result.success) {
        // Clear form on success (but keep selected position)
        setState((prev) => ({
          ...prev,
          amount: "",
          price: "",
        }));
        
        // Refresh balances after successful trade
        // Use RPC for immediate updates (subgraph has indexing delay of 10-60 seconds)
        setTimeout(async () => {
          try {
            console.log("🔄 Starting balance refresh after 2 second delay...");
            
            // Use RPC refresh for immediate balance updates (bypasses slow subgraph)
            // NOTE: Do NOT call refreshBalances() after this - it would fetch stale subgraph data
            // and overwrite the fresh RPC data!
            await refreshViaRpc();
            console.log("✅ User data refreshed via RPC (immediate)");
            console.log("✅ All balances refreshed after successful trade");
          } catch (error) {
            console.error("❌ Error refreshing balances after trade:", error);
            // Don't fail the trade if balance refresh fails
          }
        }, 2000); // 2 second delay (reduced from 4s since RPC is faster)
        
        // Refresh historical price data for the chart after successful trade
        // This ensures the chart reflects the new trade price
        setTimeout(async () => {
          try {
            const marketId = market._id || market.questionId || market.marketId;
            if (marketId) {
              console.log("📊 Refreshing historical price data for chart...");
              await predictionMarketDataService.refreshHistoricalData(marketId);
              console.log("✅ Historical price data refreshed");
            }
          } catch (error) {
            console.error("❌ Error refreshing historical data:", error);
            // Don't fail if historical refresh fails - it's not critical
          }
        }, 3000); // 3 second delay to allow backend to process the trade
      }
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        orderResult: {
          success: false,
          error: error.message || "Order execution failed",
        },
      }));
    } finally {
      setState((prev) => ({ ...prev, isLoading: false }));
    }
  }, [
    state.selectedPosition,
    state.amount,
    state.price,
    state.orderType,
    state.side,
    state.tradingVenue,
    account,
    market,
    tradeExecutionService,
    executionGate.blocked,
    pandaId,
    matchedMonitor,
    polyClob.ready,
    polyClob.blockedReason,
    polyClob.error,
    polyClob.placeLimitOrder,
    polyClob.placeMarketOrder,
    polyClob.safeAddress,
    polyClob.eoaAddress,
    levelUpOrderbook,
    effectiveOrderbook,
    calculatedMarketOrderData,
    marketOrderHandler,
    privyWallets,
    refreshViaRpc,
    predictSession.ready,
    predictSession.blockedReason,
    predictSession.error,
    predictSession.placeLimitOrder,
    predictSession.placeMarketOrder,
    predictNumericId,
    predictMarketDetail,
    yesTeamLabel,
    noTeamLabel,
    predictApprovalsQuery.data,
    predictMarketQuery.isError,
    predictOrderbookQuery.isError,
    predictOrderbookQuery.data,
    queryClient,
    predictTokenIdForPosition,
    dflowProof.isVerified,
    dflowMintQuery.data,
    dflowMintQuery.isLoading,
    privateApi,
    privySolanaSign,
  ]);

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
      if (state.tradingVenue === "polymarket" || state.tradingVenue === "predictfun" || state.tradingVenue === "dflow") {
        if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) {
          throw new Error("Missing required fields: position, amount, or price");
        }
        await handleTrade();
        return;
      }
      if (executionGate.blocked) {
        throw new Error(
          "Trading is blocked - complete setup on the Trading page."
        );
      }
      if (!approvalState.isApproved) {
        throw new Error("Tokens not approved - please approve first");
      }
      if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) {
        throw new Error("Missing required fields: position, amount, or price");
      }
      
      // CRITICAL: Check for sufficient shares on SELL orders
      if (state.side === 'sell') {
        console.log("🔍 SELL order validation:", {
          side: state.side,
          position: state.selectedPosition,
          amount: state.amount,
          yesBalance: yesBalance,
          noBalance: noBalance,
          availableForThisPosition: state.selectedPosition === 'yes' ? yesBalance : noBalance
        });
        
        const sharesCheck = checkSufficientShares(
          state.amount, 
          state.orderType, 
          state.side, 
          state.selectedPosition, 
          yesBalance, 
          noBalance,
          null
        );
        
        console.log("🔍 Shares check result:", sharesCheck);
        
        if (!sharesCheck.hasSufficientShares) {
          throw new Error(`Insufficient ${state.selectedPosition.toUpperCase()} shares. Required: ${sharesCheck.requiredShares}, Available: ${state.selectedPosition === 'yes' ? yesBalance : noBalance}`);
        }
      }
      
      await handleTrade();
    },
    getState: () => state,
  }), [handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, handleTrade, state, authenticated, account, approvalState, yesBalance, noBalance, executionGate.blocked]);

  // SOR execution wiring: executor callbacks + multi-chain wallet balances
  const sorExecutor = useSorLegExecutor({
    tradeExecutionService,
    polyClob,
    predictSession,
    privateApi,
    privySolanaSign,
    market,
    matchedMonitor,
    predictNumericId,
    predictMarketDetail,
    account,
    getClientForChain,
    fundingAddresses: {
      baseSmartWallet: funding.baseSmartWallet,
      polymarketSafe: funding.polymarketSafe,
      embeddedEoa: funding.embeddedEoa,
      solanaAddress: funding.solanaAddress,
    },
    solanaSigner,
    getRelayClient: relay.getRelayClient,
    dflowProofVerified: dflowProof.isVerified,
    predictApprovalsOk: predictApprovalsQuery.data === true,
    predictTokenId: predictTokenIdForPosition,
  });

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

  const dflowOutcomeMintForPosition = useMemo(() => {
    if (!dflowLink || !state.selectedPosition || !matchedMonitor) return null;
    const yesMint = dflowLink.yesMintA ?? dflowMintQuery.data?.yesMint;
    const noMint = dflowLink.noMintA ?? dflowMintQuery.data?.noMint;
    if (!yesMint || !noMint) return null;
    try {
      const { yesTeamLabel, noTeamLabel } = getYesNoTeamLabels(market);
      const resolvedSide = polyOutcomeSide(matchedMonitor, state.selectedPosition, yesTeamLabel, noTeamLabel);
      return resolvedSide === "A" ? yesMint : noMint;
    } catch {
      return state.selectedPosition === "yes" ? yesMint : noMint;
    }
  }, [dflowLink, dflowMintQuery.data, state.selectedPosition, market, matchedMonitor]);

  const dflowOutcomeBalQuery = useDflowOutcomeBalance(
    multiVenueEnabled ? funding.solanaAddress : undefined,
    dflowOutcomeMintForPosition,
  );

  const sorVenuePositions: VenuePositionEntry[] = useMemo(() => {
    if (!state.selectedPosition) return [];
    const entries: VenuePositionEntry[] = [];

    const luBal = state.selectedPosition === "yes" ? yesBalance : noBalance;
    if (luBal > 0) entries.push({ venue: "levelup", shares: luBal });

    if (polyPositionsQuery.data && matchedMonitor) {
      try {
        const { yesTeamLabel, noTeamLabel } = getYesNoTeamLabels(market);
        const tokenId = polyOutcomeTokenId(matchedMonitor, state.selectedPosition, yesTeamLabel, noTeamLabel);
        const pos = polyPositionsQuery.data.find((p) => p.tokenId === tokenId);
        if (pos && pos.shares > 0) entries.push({ venue: "polymarket", shares: pos.shares });
      } catch { /* skip */ }
    }

    const pfBal = predictSellShareBalance;
    if (typeof pfBal === "number" && pfBal > 0) {
      entries.push({ venue: "predictfun", shares: pfBal });
    }

    const dfBal = dflowOutcomeBalQuery.data;
    if (typeof dfBal === "number" && dfBal > 0) {
      entries.push({ venue: "dflow", shares: dfBal });
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
    dflowOutcomeBalQuery.data,
  ]);

  // --- SOR route computation + execution (active when venue is "all") ---
  const sorRouteEnabled = state.tradingVenue === "all"
    && !!state.selectedPosition
    && parseFloat(state.amount) > 0
    && (state.side === "buy"
      ? sorWalletBalances.length > 0
      : sorVenuePositions.length > 0);

  const sorRouteOutcome: SorOutcome | undefined = state.selectedPosition
    ? (state.selectedPosition === "yes" ? "A" : "B")
    : undefined;

  const sorRoute = useSorRoute({
    questionId: market?._id || (market as any)?.questionId,
    outcome: sorRouteOutcome,
    side: state.side,
    amount: parseFloat(state.amount) || 0,
    walletBalances: state.side === "buy" ? sorWalletBalances : undefined,
    venuePositions: state.side === "sell" ? sorVenuePositions : undefined,
    enabled: sorRouteEnabled,
    polyFeeRate: 0.03,
  });

  const sorExecution = useSorExecution({
    executeLeg: sorExecutor.executeLeg,
    executeBridge: sorExecutor.executeBridge,
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

  const handleSorExecute = useCallback(() => {
    if (sorRoute.route && !sorRouteExpired) {
      sorExecution.execute(sorRoute.route);
    }
  }, [sorRoute.route, sorRouteExpired, sorExecution]);

  const prevSorExecutingRef = useRef(false);
  useEffect(() => {
    const wasExecuting = prevSorExecutingRef.current;
    prevSorExecutingRef.current = sorExecution.isExecuting;
    if (wasExecuting && !sorExecution.isExecuting && sorExecution.execution) {
      queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
      queryClient.invalidateQueries({ queryKey: ["predict-positions"] });
      queryClient.invalidateQueries({ queryKey: ["predict-outcome-shares"] });
      queryClient.invalidateQueries({ queryKey: ["predict-usdt-balance"] });
      queryClient.invalidateQueries({ queryKey: ["dflow-positions"] });
      queryClient.invalidateQueries({ queryKey: ["dflow-outcome-balance"] });
      if (sorExecution.execution.status === "complete") {
        setState((s) => ({ ...s, amount: "" }));
      }
    }
  }, [sorExecution.isExecuting, sorExecution.execution, queryClient]);

  useEffect(() => {
    if (pandaId && state.tradingVenue !== "all") {
      handleTradingVenueChange("all");
    } else if (!pandaId && state.tradingVenue === "all") {
      handleTradingVenueChange("levelup");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pandaId]);

  // Button state logic
  const buttonState = useButtonState({
    authenticated,
    account,
    state,
    login,
    approvalState,
    approveToken,
    marketOrderHandler,
    usdcBalance,
    yesBalance,
    noBalance,
    handleTrade,
    checkSufficientBalance,
    checkSufficientShares,
    market,
    handleAddFunds,
    polymarketTrading,
    orderbookWalkPosition,
    predictTrading,
    predictApproval: predictVenueActive
      ? {
          isApproved: predictApprovalsQuery.data === true,
          isChecking:
            Boolean(predictMarketDetail) &&
            (predictApprovalsQuery.isLoading || predictApprovalsQuery.isFetching),
          approve: handlePredictApprove,
          isApproving: predictSession.loading,
        }
      : undefined,
    predictUsdtBalance,
    predictSellShareBalance,
    dflowProofVerified: dflowProof.isVerified,
    dflowProofLoading: dflowProof.isLoading,
    sorState: {
      route: sorRoute.route,
      isLoading: sorRoute.isLoading,
      error: sorRoute.error,
      isExecuting: sorExecution.isExecuting,
      routeExpired: sorRouteExpired,
      handleExecute: handleSorExecute,
      venuePositions: sorVenuePositions,
    },
  });

  const buttonStateForUi = useMemo(() => {
    if (state.tradingVenue === "levelup" && executionGate.blocked) {
      return {
        ...buttonState,
        text: "Complete trading setup",
        disabled: true,
        onClick: () => {},
      };
    }
    return buttonState;
  }, [executionGate.blocked, buttonState, state.tradingVenue]);

  const executionGateBanner =
    state.tradingVenue === "levelup" &&
    executionGate.blocked &&
    executionGate.messages.length ? (
      <div className="execution-gate-banner">
        <div className="execution-gate-banner__heading">
          Polymarket trading is not enabled for your account yet.
        </div>
        <ul className="execution-gate-banner__reasons">
          {executionGate.messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <Link to="/trading" className="execution-gate-banner__link">
          Open Trading &amp; venues
        </Link>
      </div>
    ) : null;

  return (
    <PredictionMarketTradeBoxResponsiveContainer
      market={market}
      orderbook={effectiveOrderbook}
      state={{
        ...state,
        calculatedContracts: calculatedMarketOrderData.calculatedContracts,
        remainingUsd: calculatedMarketOrderData.remainingUsd,
        // BUY order fee fields
        spent: calculatedMarketOrderData.spent,
        tradingFee: calculatedMarketOrderData.tradingFee,
        estimatedCost: calculatedMarketOrderData.estimatedCost,
        // SELL order fee fields
        grossReceive: calculatedMarketOrderData.grossReceive,
        sellTradingFee: calculatedMarketOrderData.sellTradingFee,
        netReceive: calculatedMarketOrderData.netReceive,
      }}
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
    />
  );
});

PredictionMarketTradeBox.displayName = "PredictionMarketTradeBox";

export default PredictionMarketTradeBox;


