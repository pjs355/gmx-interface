import { useCallback, useMemo, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// Link import removed — executionGateBanner no longer rendered
import { useSignerContext } from "context/SignerContext";
import { usePrivy, useWallets as usePrivyWallets, useSendTransaction } from "@privy-io/react-auth";
import { RegisterPrivyOpenFundAction } from "@/components/PrivyGatedFundWallet/PrivyGatedFundWallet";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import { ethers } from "ethers";
import type { TradeBoxProps, TradeExecutionParams, TradingVenue } from "./types";
import { useMarketOrderHandler } from "./MarketOrderHandler";
// import { useLimitOrderHandler } from "./LimitOrderHandler";
import { useTradeExecutionService } from "./TradeExecutionService";
import PredictionMarketTradeBoxResponsiveContainer from "./PredictionMarketTradeBoxResponsiveContainer";
// Removed OrderbookContext import - using passed orderbook prop instead
import { checkSufficientBalance, useYesNoBalances, checkSufficientShares, SHARE_SELL_COMPARE_EPS } from "./checkBalances";
import { useUserData } from "context/UserDataContext";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useTradeState } from "./hooks/useTradeState";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import {
	formatErrorForUser,
	formatLimitlessDelegatedOrderError,
	userMessage,
	TRADE_ALREADY_PROCESSING,
	TRADE_INSUFFICIENT_SHARES,
	TRADE_LEVELUP_APPROVALS_INCOMPLETE,
	TRADE_LIMITLESS_MAKER_MISSING,
	TRADE_LIMITLESS_NOT_READY,
	TRADE_LIMITLESS_SLUG_MISSING,
	TRADE_LIMITLESS_USDC_ALLOWANCE,
	TRADE_LIMITLESS_USDC_FUNDS,
	TRADE_MISSING_FIELDS,
	TRADE_NOT_AUTHENTICATED,
	TRADE_NO_WALLET,
	TRADE_POLY_APPROVALS_INCOMPLETE,
	TRADE_POLY_RELAYER_UNAVAILABLE,
	TRADE_POLY_SAFE_NOT_PROVISIONED,
	TRADE_PREDICT_APPROVALS_INCOMPLETE,
	TRADE_SOR_NOT_READY,
} from "@/errors";
import { calculateFeeMatchingBackend } from "./feeLevelUp";
import { getVenueConfig } from "@/config/venueConfig";
import {
	ensureLimitlessTradingApprovalsOnBase,
	readLimitlessBuyUsdcAllowancesSufficientOnBase,
	readLimitlessSellCtfApprovalsSufficientOnBase,
} from "@/trading/limitless/limitlessTradingApprovalsOnBase";
import { getLimitlessBaseTxClientForAddress } from "@/trading/limitless/limitlessBaseTxClientForAddress";
import type { SendTransactionCapable } from "@/trading/lifi/sendTransactionTypes";
import { useOddsMonitor } from "@/context/OddsMonitorContext";
import { usePolymarketExecutionGate } from "@/trading/hooks/usePolymarketExecutionGate";
import { usePolymarketClobTradingSession } from "@/trading/polymarket/usePolymarketClobTradingSession";
import {
	levelUpMonitorBookForPosition,
	polyOrderbookForPosition,
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
import {
	bboFromSnapshot,
	logPolymarketTradePreflight,
} from "@/trading/polymarket/polymarketOrderDebug";
import { getPrivateApiAbsoluteUrl } from "@/config/privateApiBase";
import { TOAST_AUTO_CLOSE_TIME } from "config/ui";
import { Side, type TickSize } from "@polymarket/clob-client-v2";
import { getYesNoTeamLabels } from "./teamLabels";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useDflowMintResolver } from "@/trading/dflow/useDflowMintResolver";
import { useTradeBoxController } from "./hooks/useTradeBoxController";
import { useTradeBoxVenueWiring } from "./hooks/useTradeBoxVenueWiring";
import { useTradeBoxVenueApprovals } from "./hooks/useTradeBoxVenueApprovals";
import { useTradeBoxOrderResultToasts } from "./hooks/useTradeBoxOrderResultToasts";
import { useCalculatedMarketOrderData } from "./tradeQuote/useCalculatedMarketOrderData";
import { SOLANA_USDC_MINT } from "@/config/addresses";
import { sorExecutorWalletRoles } from "@/context/accountWallets";
import {
	useSignAndSendTransaction as useSolanaSignAndSendTransaction,
	useSignTransaction as useSolanaSignTransaction,
	useSignMessage as useSolanaSignMessage,
	useWallets as useSolanaWallets,
} from "@privy-io/react-auth/solana";
import { sendPrivySponsoredSolanaTransaction } from "@/trading/solana/privySponsoredSolana";
import { usePolymarketRelay } from "@/trading/polymarket/usePolymarketRelay";
import type { SolanaSignerCapable } from "@/trading/lifi/sendTransactionTypes";
import {
	parseLimitPriceCents,
	probabilityToLimitPriceCentsString,
} from "@/trading/sor";
import type { UseSorLegExecutorDeps } from "@/trading/sor/useSorLegExecutor";
import { useAccountData } from "@/context/AccountDataContext";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import { maxAllMarketsSellBidForOutcome } from "@/hooks/useTradingPagePrices";
import { useTradeBoxShareBalances } from "./hooks/useTradeBoxShareBalances";
import { mergeMonitorLimitlessFromUmbrella } from "@/utils/mergeMonitorLimitlessFromUmbrella";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/trading/queryKeys";
import {
	limitlessOrderbookForPosition,
	limitlessOutcomeTokenId,
} from "@/trading/limitless/limitlessOrderbook";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "./feeLimitless";
import {
	getLimitlessEnsureTradeGate,
	isLimitlessProfileExistsNotLinkedApiError,
	limitlessEnsureWarrantsAccountOverviewRefresh,
} from "@/trading/limitless/limitlessEnsureTradeGate";
import { buildLimitlessEoaEnsureBodyFromSigner } from "@/trading/limitless/limitlessEnsureEoaBody";
import { postLimitlessEnsureAccountWhenNeeded } from "@/trading/limitless/limitlessEnsureAccountRequest";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import {
	buildLimitlessSignedOrderFromMarket,
	type BuildLimitlessSorOrderInput,
} from "@/trading/limitless/limitlessSignedClobOrder";
import {
	levelUpCrossVenueBooksHaveTradeableWholeShareLiquidity,
	orderbookSnapshotHasWholeShareRestingLiquidity,
} from "@/trading/levelUp/levelUpCrossVenueBookPresence";

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
  ({ market, orderbook: propOrderbook, pandascoreMatchId, umbrellaId: propUmbrellaId, limitlessMappingFromUmbrella, predictFunMappingFromUmbrella, umbrellaDisplayName, initialPosition, onPositionChange, onSideChange: onSideChangeCallback, venueOverride, crossBuyYes: propCrossBuyYes, crossBuyNo: propCrossBuyNo, venueRowsForSellStrip: propVenueRowsForSellStrip, mobilePeekBar = "default", tradeRouteIsolationKey }, ref) => {

  const pandaId = pandascoreMatchId?.trim() ?? "";
  const multiVenueEnabled = Boolean(pandaId);
  const initialVenue = multiVenueEnabled ? "all" as const : "levelup" as const;

  const { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, handleTradingVenueChange } = useTradeState(initialPosition, initialVenue, tradeRouteIsolationKey);

  useEffect(() => {
    if (state.orderType !== "market") {
      handleOrderTypeChange("market");
    }
  }, [state.orderType, handleOrderTypeChange]);
  const { getClientForChain } = useSmartWallets();
  const { account, ready: signerReady, signer, signerAddress } = useSignerContext();
  const { login, authenticated } = usePrivy();

  // Use global approval state from UserDataContext
  const {
    approvalState,
    checkApproval,
    approveToken,
    refresh,
    refreshTokenPositions,
    refreshOrders,
    getTokenBalance,
  } = useUserData();
  const collateralTokens = useCollateralTokens();
  const accountData = useAccountData();
  const venueAddressChainMap = accountData.venueAddressChainMap;
  const fundingGate = accountData.walletGate;

  // Lazy approval check: deferred from startup, runs when trade box mounts
  useEffect(() => {
    if (account) checkApproval();
  }, [account, checkApproval]);

  const { wallets: privyWallets } = usePrivyWallets();
  const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
  const getLimitlessTxClientForAddress = useCallback(
    (addr: string) =>
      getLimitlessBaseTxClientForAddress({
        address: addr,
        getClientForChain,
        baseSmartWallet:
          venueAddressChainMap?.levelup.walletAddress ?? undefined,
        embeddedEoa:
          venueAddressChainMap?.predictfun.walletAddress ?? undefined,
        privyEvmSendTransaction,
      }),
    [
      getClientForChain,
      venueAddressChainMap?.levelup.walletAddress,
      venueAddressChainMap?.predictfun.walletAddress,
      privyEvmSendTransaction,
    ],
  );
  const addFundsFromPrivyRef = useRef<(() => void | Promise<void>) | null>(null);
  const fundEvmForPrivy = venueAddressChainMap?.levelup.walletAddress;
  /** LevelUp REST orderbook (signing + execution always uses this for LevelUp venue). */
  const levelUpOrderbook = propOrderbook ?? null;

  // Late-bound SOR executor — `handleSorExecute` is defined later in the
  // render, but the imperative test handle (useImperativeHandle below) needs
  // a stable reference it can forward into. Updated via an effect right after
  // handleSorExecute is created so the imperative `executeTrade` always kicks
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
  const queryClient = useQueryClient();
  const setupActivation = useSetupActivationOptional();
  const limitlessEnsureQueryKey = profileId
    ? tradingQueryKeys.limitlessEnsureAccount(profileId)
    : ["trading", "limitlessEnsure", "__disabled__"];
  /** LimitlessBackgroundActivation owns the initial ensure-account; trade box reads cache and refetches only after JIT approvals. */
  const limitlessEnsureQuery = useQuery({
    queryKey: limitlessEnsureQueryKey,
    enabled: false,
    queryFn: async () => {
      return postLimitlessEnsureAccountWhenNeeded(
        queryClient,
        limitlessEnsureQueryKey,
        queryClient.getQueryData(limitlessEnsureQueryKey),
        async () => {
          if (!signer) return undefined;
          return buildLimitlessEoaEnsureBodyFromSigner({
            getPlainSigningMessage: () => privateApi.getLimitlessAuthSigningMessage(),
            signer,
          });
        },
        (body) => privateApi.postLimitlessEnsureAccount(body),
      );
    },
    staleTime: 1000 * 60 * 30,
    retry: (failureCount, err) => {
      if (isLimitlessProfileExistsNotLinkedApiError(err)) return false;
      return failureCount < 1;
    },
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
  const { signTransaction: privySolanaSignTransaction } = useSolanaSignTransaction();
  const { wallets: solanaWallets } = useSolanaWallets();
  const embeddedSolanaWallet = useMemo(() => {
    const dflowAddr = venueAddressChainMap?.dflow.walletAddress?.trim();
    if (!dflowAddr) return null;
    return (
      solanaWallets.find((w) => w.address === dflowAddr) ?? null
    );
  }, [solanaWallets, venueAddressChainMap?.dflow.walletAddress]);

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
            signTransactionOnly: async (serializedTx: Uint8Array) => {
              const out = await privySolanaSignTransaction({
                transaction: serializedTx,
                wallet: embeddedSolanaWallet,
              });
              return out.signedTransaction;
            },
          }
        : null,
    [privySolanaSignAndSend, privySolanaSignTransaction, embeddedSolanaWallet]
  );

  const tradeExecutionService = useTradeExecutionService();
  const executionGate = usePolymarketExecutionGate();
  const {
    enabled: oddsMonitorEnabled,
    connected: oddsMonitorConnected,
    appState: oddsAppState,
    sendGetState: refetchMatchedMarkets,
  } = useOddsMonitor();
  const matchedMonitor = useMemo(() => {
    const base = findOddsMatchedMarket(
      oddsAppState?.markets,
      pandaId || null,
      propUmbrellaId,
    );
    return mergeMonitorLimitlessFromUmbrella(base, limitlessMappingFromUmbrella);
  }, [oddsAppState?.markets, pandaId, propUmbrellaId, limitlessMappingFromUmbrella]);

  /** Same wallet as `usePredictPositions` / VACM (`predict-positions` cache key). */
  const predictPostTradeWallet =
    venueAddressChainMap?.predictfun.walletAddress ?? null;
  /** Post-trade share identity: umbrella `exchangeMatching.predictFun` only (single source). */
  const predictShareIdentityCtx = useMemo(() => {
    const umb = predictFunMappingFromUmbrella;
    if (!umb) return null;
    const tokenIdA = String(umb.tokenIdA ?? "").trim();
    const tokenIdB = String(umb.tokenIdB ?? "").trim();
    if (!tokenIdA && !tokenIdB) return null;
    return {
      predictFun: {
        ...(tokenIdA ? { tokenIdA } : {}),
        ...(tokenIdB ? { tokenIdB } : {}),
      },
    };
  }, [predictFunMappingFromUmbrella]);

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
    if (matchedMonitor.dflow || matchedMonitor.kalshi) set.add("dflow");
    if (matchedMonitor.predictFun) set.add("predictfun");
    if (matchedMonitor.limitless) set.add("limitless");
    return set;
  }, [multiVenueEnabled, matchedMonitor, levelUpOrderbook]);

  /** Mirrors `PredictionMarketTradeBoxUI` smart-routing strip: pandascore link + 2+ tradeable venues → "All Markets" row. */
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
      note:
        "Venue list: OddsMonitor MatchedMarket + REST orderbook prop. LevelUp is included only when the chosen LevelUp ladder (cross-venue selection or REST while loading) has at least one whole-share resting bid or ask.",
    });
  }, [pandaId, matchedMonitor, matchedVenues, levelUpOrderbook]);

  const dflowLink = useMemo(
    () => (matchedMonitor ? getDflowKalshiMonitorLink(matchedMonitor) : undefined),
    [matchedMonitor]
  );
  const dflowMintQuery = useDflowMintResolver(
    dflowLink?.eventTicker,
    (multiVenueEnabled || state.tradingVenue === "dflow") ? dflowLink?.tickerA : null
  );

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
    if (!market) return false;
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

  // Highest bid among venues where the user holds shares — surfaced on the YES/NO
  // sell buttons on every tab, not just All Markets. `maxAllMarketsSellBidForOutcome`
  // already returns null when no held venue has a valid bid.
  const allMarketsSellYesBid = useMemo(() => {
    if (!propVenueRowsForSellStrip?.length) return null;
    const m = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
    return maxAllMarketsSellBidForOutcome(propVenueRowsForSellStrip, "yes", m.yes);
  }, [
    propVenueRowsForSellStrip,
    tradeBoxShareBalances.allMarketsOutcomeVenueShares,
  ]);

  const allMarketsSellNoBid = useMemo(() => {
    if (!propVenueRowsForSellStrip?.length) return null;
    const m = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
    return maxAllMarketsSellBidForOutcome(propVenueRowsForSellStrip, "no", m.no);
  }, [
    propVenueRowsForSellStrip,
    tradeBoxShareBalances.allMarketsOutcomeVenueShares,
  ]);

  const venueWiring = useTradeBoxVenueWiring({
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
  });
  const {
    predictNumericId,
    predictMarketQuery,
    predictOrderbookQuery,
    predictMarketDetail,
    predictSession,
    predictApprovalsQuery,
    predictEnsureReady,
    predictTokenIdForPosition,
    predictVenueBookHints,
    effectiveOrderbook,
    levelUpVenueBookHints,
    marketOrderHandler,
    orderbookWalkPosition,
    calculateContractsForMarketOrderUi,
    polyClob,
    polymarketVenueHint,
    predictVenueHint,
    dflowVenueHint,
    limitlessTrading,
    predictTrading,
    polymarketTrading,
  } = venueWiring;

  const usdcBalance = collateralTokens.baseUsdc;
  const { yesBalance, noBalance } = useYesNoBalances(market);

  // Notify parent when position changes; SOR ("all") buy: sync reference limit cents to cross-venue best
  const onPositionChangeWrapper = useCallback((position: "yes" | "no") => {
    if (state.side === "sell") {
      handleAmountChange("");
    }
    handlePositionChange(position);
    onPositionChange?.(position);
    if (state.tradingVenue === "all") {
      const px = position === "yes" ? crossBuyPrices.crossBuyYes : crossBuyPrices.crossBuyNo;
      if (px != null) {
        const cents = probabilityToLimitPriceCentsString(px);
        if (cents != null) handlePriceChange(cents);
      }
    }
  }, [
    handleAmountChange,
    handlePositionChange,
    onPositionChange,
    state.side,
    state.tradingVenue,
    crossBuyPrices.crossBuyYes,
    crossBuyPrices.crossBuyNo,
    handlePriceChange,
  ]);

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

  const bookPreview = useCalculatedMarketOrderData({
    orderType: state.orderType,
    amount: state.amount,
    selectedPosition: state.selectedPosition,
    side: state.side,
    tradingVenue: state.tradingVenue,
    effectiveOrderbook,
    marketOrderHandler,
    orderbookWalkPosition,
    predictFunFeeRateBps: predictMarketDetail?.feeRateBps,
  });

  const {
    ensurePredictApprovalsForTrade,
    ensureLevelUpApprovalsForTrade,
    ensurePolymarketApprovalsForTrade,
    ensureLimitlessApprovalsForTrade,
    ensureDflowProofVerifiedForTrade,
  } = useTradeBoxVenueApprovals({
    checkApproval,
    approveToken,
    predictApprovalsQuery,
    predictSession,
    predictMarketDetail: predictMarketDetail ?? undefined,
    queryClient,
    venueAddressChainMap: accountData.venueAddressChainMap,
    walletGate: accountData.walletGate,
    polyAccount: accountData.polyAccount,
    relay,
    account,
    signerAddress,
    fundEvmForPrivy,
    getLimitlessTxClientForAddress,
    collateralTokens,
    limitlessEnsureQuery,
    dflowProof,
    handleStartDflowProofForTrade,
  });

  useTradeBoxOrderResultToasts(state.orderResult);

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
      if (side === "sell" && smartRoutingSurfaceActive) {
        handleTradingVenueChange("all");
      }
    },
    executeTrade: async () => {
      if (!authenticated) {
        throw new Error(userMessage(TRADE_NOT_AUTHENTICATED));
      }
      if (!account) {
        throw new Error(userMessage(TRADE_NO_WALLET));
      }
      if (state.isLoading) {
        throw new Error(userMessage(TRADE_ALREADY_PROCESSING));
      }
      if (!state.selectedPosition || !state.amount || (state.orderType === "limit" && !state.price)) {
        throw new Error(userMessage(TRADE_MISSING_FIELDS));
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
          throw new Error(userMessage(TRADE_INSUFFICIENT_SHARES));
        }
      }

      // Everything — LevelUp, Polymarket, Predict, Limitless, Dflow — now
      // dispatches through the unified SOR + LI.FI prefund pipeline. The
      // imperative handle cannot block on completion (it kicks off a mutation
      // whose progress is reported on `state.isLoading` / `state.orderResult`).
      const runSor = handleSorExecuteRef.current;
      if (!runSor) {
        throw new Error(userMessage(TRADE_SOR_NOT_READY));
      }
      runSor();
    },
    getState: () => state,
  }), [
    handlePositionChange,
    handleAmountChange,
    handlePriceChange,
    handleOrderTypeChange,
    handleSideChange,
    handleTradingVenueChange,
    smartRoutingSurfaceActive,
    state,
    authenticated,
    account,
    yesBalance,
    noBalance,
    checkSufficientShares,
  ]);

  const limitlessMakerCashForSor = collateralTokens.limitlessMakerUsdc;

  const getLimitlessOwnerId = useCallback(() => {
    const raw = limitlessEnsureQuery.data;
    if (!raw || typeof raw !== "object") return undefined;
    const o = raw as Record<string, unknown>;
    const inner =
      o.data != null && typeof o.data === "object"
        ? (o.data as Record<string, unknown>)
        : o;
    const la = inner.limitlessAccount;
    if (!la || typeof la !== "object") return undefined;
    const oid = (la as Record<string, unknown>).ownerId;
    if (typeof oid === "number" && Number.isFinite(oid) && oid > 0) return oid;
    return undefined;
  }, [limitlessEnsureQuery.data]);

  const getLimitlessMakerAddress = useCallback(() => {
    return venueAddressChainMap?.limitless.walletAddress ?? undefined;
  }, [venueAddressChainMap]);

  const buildLimitlessSignedOrderFromMarketCb = useCallback(
    (input: BuildLimitlessSorOrderInput) => {
      if (!signer) {
        return Promise.reject(
          new Error("Wallet signer unavailable for Limitless orders."),
        );
      }
      return buildLimitlessSignedOrderFromMarket(
        privateApi,
        signer as ethers.Signer,
        input,
      );
    },
    [privateApi, signer],
  );

  const sorLegExecutorDeps: UseSorLegExecutorDeps = {
    tradeExecutionService,
    polyClob,
    predictSession,
    privateApi,
    market,
    matchedMonitor,
    umbrellaId: propUmbrellaId ?? null,
    predictNumericId,
    predictMarketDetail,
    account,
    getClientForChain,
    fundingAddresses: sorExecutorWalletRoles(accountData),
    venueAddressChainMap,
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
    getLimitlessOwnerId,
    getLimitlessMakerAddress,
    buildLimitlessSignedOrderFromMarket: buildLimitlessSignedOrderFromMarketCb,
  };

  const ctrl = useTradeBoxController({
    state,
    setState,
    market,
    bookPreview,
    dflowLink,
    venueAddressChainMap: accountData.venueAddressChainMap,
    walletGate: accountData.walletGate,
    collateralTokens,
    limitlessMakerCashForSor,
    predictFunFeeRateBps: predictMarketDetail?.feeRateBps,
    tradeBoxShareBalances,
    sorLegExecutorDeps,
    fundingGate,
    matchedMonitor,
    handleTradingVenueChange,
    matchedVenues,
    pandaId,
    venueOverride,
    multiVenueEnabled,
    propUmbrellaId,
    account,
    refetchMatchedMarkets: refetchMatchedMarkets,
    handleSorExecuteRef,
    accountData,
    predictPostTradeWallet,
    predictShareIdentityCtx,
    yesBalance,
    noBalance,
    getTokenBalance,
    refreshTokenPositions,
    refreshOrders,
    tradeButton: {
      authenticated,
      account,
      fundingGate,
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
      limitlessTrading,
      dflowProofVerified: dflowProof.isVerified,
      dflowProofLoading: dflowProof.isLoading,
      dflowStartProofFlow: handleStartDflowProofForTrade,
      sorMatchedVenues: matchedVenues,
      executionGateBlocked: executionGate.blocked,
      propUmbrellaId,
      tradeBoxShareBalancesSellTotal: tradeBoxShareBalances.sellTotalShares,
      tradeBoxShareBalancesLoading: tradeBoxShareBalances.loading,
    },
  });

  const {
    tradeQuote,
    sorRoute,
    sorExecution,
    sorRouteExpired,
    handleSorExecute,
    debouncedSorRoutePreviewAllowed,
    smartRoutingMarketKey,
    dflowOrderQuoteForSentinel,
    maxScopedSellShares,
    handleTradingVenueChangeGuarded,
    venueSelectionLockedRef,
    buttonStateForUi,
    sharesLoadingForActiveTab,
    dflowUninitAtSubmit,
  } = ctrl;

  const onSideChangeWrapper = useCallback(
    (side: "buy" | "sell") => {
      handleSideChange(side);
      if (
        side === "sell" &&
        smartRoutingSurfaceActive &&
        !venueSelectionLockedRef.current
      ) {
        handleTradingVenueChange("all");
      }
      onSideChangeCallback?.(side);
    },
    [
      handleSideChange,
      smartRoutingSurfaceActive,
      handleTradingVenueChange,
      onSideChangeCallback,
      venueSelectionLockedRef,
    ],
  );

  /**
   * Auto-dismiss the order result. Default 4s; extended to 12s when the Kalshi
   * market-init notice is shown so the user can read it.
   */
  useEffect(() => {
    if (!state.orderResult) return;
    const dismissAfterMs = dflowUninitAtSubmit ? 12_000 : 4_000;
    const timer = setTimeout(() => {
      setState((prev) => ({ ...prev, orderResult: null }));
    }, dismissAfterMs);
    return () => clearTimeout(timer);
  }, [state.orderResult, dflowUninitAtSubmit, setState]);


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
      state={state}
      tradeQuote={tradeQuote}
      onPositionChange={onPositionChangeWrapper}
      onAmountChange={handleAmountChange}
      onPriceChange={handlePriceChange}
      onTradingVenueChange={handleTradingVenueChangeGuarded}
      onOrderTypeChange={handleOrderTypeChange}
      onSideChange={onSideChangeWrapper}
      polymarketVenueHint={polymarketVenueHint}
      predictVenueHint={predictVenueHint}
      predictVenueBookHints={predictVenueBookHints}
      levelUpVenueBookHints={levelUpVenueBookHints}
      dflowVenueHint={dflowVenueHint}
      matchedVenues={matchedVenues}
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
      sharesLoadingForActiveTab={sharesLoadingForActiveTab}
      matchedMonitor={matchedMonitor}
      allMarketsSellYesBid={allMarketsSellYesBid}
      allMarketsSellNoBid={allMarketsSellNoBid}
      shareBalances={tradeBoxShareBalances}
      mobilePeekBar={mobilePeekBar}
      dflowUninitAtSubmit={dflowUninitAtSubmit}
      routePreviewAllowed={debouncedSorRoutePreviewAllowed}
      smartRoutingMarketKey={smartRoutingMarketKey}
      predictFunFeeRateBps={predictMarketDetail?.feeRateBps}
      dflowOrderQuoteForSentinel={dflowOrderQuoteForSentinel}
    />
		</>
  );
});

PredictionMarketTradeBox.displayName = "PredictionMarketTradeBox";

export default PredictionMarketTradeBox;


