import { useCallback, useMemo, useEffect, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { toast } from "react-toastify";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// Link import removed — executionGateBanner no longer rendered
import { useSignerContext } from "context/SignerContext";
import { usePrivy, useWallets as usePrivyWallets, useSendTransaction } from "@privy-io/react-auth";
import {
	RegisterPrivyOpenFundAction,
	resolvePrivyEvmFundTarget,
} from "@/components/PrivyGatedFundWallet/PrivyGatedFundWallet";
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
import { useButtonState } from "./hooks/useButtonState";
import { useTradeState } from "./hooks/useTradeState";
import { predictionMarketDataService } from "@/services/api/predictionMarketDataService";
import { getPrivateApiErrorMessage } from "@/services/privateApi";
import { calculateFeeMatchingBackend } from "./feeLevelUp";
import { getVenueConfig } from "@/config/venueConfig";
import {
	ensureLimitlessTradingApprovalsOnBase,
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
import { useDflowOrderQuote } from "@/trading/dflow/useDflowOrderQuote";
import { SOLANA_USDC_MINT } from "@/config/addresses";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
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
	buildChainBalances,
	useSorRoute,
	useSorExecution,
	parseLimitPriceCents,
	probabilityToLimitPriceCentsString,
	shareAmountMatchesRoute,
	usdAmountMatchesRoute,
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
	SorVenue,
	RoutePlan,
} from "@/trading/sor";
import { usePostTradeBalanceSync } from "@/trading/sor/usePostTradeBalanceSync";
import { capturePostTradeBaseline, type PostTradeBaseline } from "@/trading/sor/postTradeBaseline";
import { registerPendingDflowOutcomeMints } from "@/trading/dflow/pendingDflowOutcomeMints";
import { dflowOutcomeMintForRouteLeg } from "@/trading/dflow/dflowRouteOutcomeMint";
import { isPredictionPricingDebugEnabled, priceDebugLog } from "@/utils/debugPredictionPricing";
import { findOddsMatchedMarket } from "@/utils/findOddsMatchedMarket";
import { getMarketId } from "@/pages/PredictionMarket/utils";
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
	limitlessEnsureNotReadyCodeToWhy,
	limitlessEnsureWarrantsAccountOverviewRefresh,
} from "@/trading/limitless/limitlessEnsureTradeGate";
import { buildLimitlessEoaEnsureBodyFromSigner } from "@/trading/limitless/limitlessEnsureEoaBody";
import {
	buildLimitlessSignedOrderFromMarket,
	type BuildLimitlessSorOrderInput,
} from "@/trading/limitless/limitlessSignedClobOrder";
import { classifyLimitlessClientMaker } from "@/trading/limitless/limitlessClientMakerIdentity";
import { hasLevelUpCrossVenueOrderbook } from "@/trading/levelUp/levelUpCrossVenueBookPresence";

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

/** Venue keys when reading `allMarketsOutcomeVenueShares` into SOR sell legs. */
const SOR_VENUE_POSITION_KEYS: readonly SorVenue[] = [
	"levelup",
	"polymarket",
	"predictfun",
	"dflow",
	"limitless",
];

const PredictionMarketTradeBox = forwardRef<PredictionMarketTradeBoxHandle, PredictionMarketTradeBoxProps>(
  ({ market, orderbook: propOrderbook, pandascoreMatchId, umbrellaId: propUmbrellaId, limitlessMappingFromUmbrella, umbrellaDisplayName, initialPosition, onPositionChange, onSideChange: onSideChangeCallback, venueOverride, crossBuyYes: propCrossBuyYes, crossBuyNo: propCrossBuyNo, venueRowsForSellStrip: propVenueRowsForSellStrip, mobilePeekBar = "default", tradeRouteIsolationKey }, ref) => {

  const pandaId = pandascoreMatchId?.trim() ?? "";
  const multiVenueEnabled = Boolean(pandaId);
  const initialVenue = multiVenueEnabled ? "all" as const : "levelup" as const;

  const { state, setState, handlePositionChange, handleAmountChange, handlePriceChange, handleOrderTypeChange, handleSideChange, handleTradingVenueChange } = useTradeState(initialPosition, initialVenue, tradeRouteIsolationKey);

  useEffect(() => {
    if (!pandaId) return;
    if (state.orderType !== "market") {
      handleOrderTypeChange("market");
    }
  }, [pandaId, state.orderType, handleOrderTypeChange]);
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
    getTokenBalance,
  } = useUserData();
  const collateralTokens = useCollateralTokens();
  const postTradeSync = usePostTradeBalanceSync();

  // Lazy approval check: deferred from startup, runs when trade box mounts
  useEffect(() => {
    if (account) checkApproval();
  }, [account, checkApproval]);

  const { wallets: privyWallets } = usePrivyWallets();
  const funding = useFundingAddresses();
  const { sendTransaction: privyEvmSendTransaction } = useSendTransaction();
  const getLimitlessTxClientForAddress = useCallback(
    (addr: string) =>
      getLimitlessBaseTxClientForAddress({
        address: addr,
        getClientForChain,
        baseSmartWallet: funding.baseSmartWallet,
        embeddedEoa: funding.embeddedEoa,
        privyEvmSendTransaction,
      }),
    [
      getClientForChain,
      funding.baseSmartWallet,
      funding.embeddedEoa,
      privyEvmSendTransaction,
    ],
  );
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
    enabled: Boolean(authenticated && profileId && signerReady),
    queryFn: async () => {
      let body: Record<string, unknown> | undefined;
      if (signer) {
        try {
          body = await buildLimitlessEoaEnsureBodyFromSigner({
            getPlainSigningMessage: () => privateApi.getLimitlessAuthSigningMessage(),
            signer,
          });
        } catch (e) {
          console.warn("[Limitless/Warmup] ensure-account EOA body failed", e);
        }
      }
      return privateApi.postLimitlessEnsureAccount(body);
    },
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
  const { signTransaction: privySolanaSignTransaction } = useSolanaSignTransaction();
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

  const matchedVenues = useMemo(() => {
    const set = new Set<string>();
    if (
      !multiVenueEnabled ||
      hasLevelUpCrossVenueOrderbook(matchedMonitor ?? null, levelUpOrderbook)
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
    priceDebugLog("PredictionMarketTradeBox tradeable venues (dropdown)", {
      pandaId: pandaId || null,
      hasMatchedMonitor: Boolean(matchedMonitor),
      matchedVenues: list,
      note:
        "Venue list: OddsMonitor MatchedMarket + REST orderbook prop. On pandascore pages LevelUp is included only when cross-venue book presence matches VenueOrderbooksPanel (resting depth / REST ladder rule).",
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

  // SOR routes a "yes" leg as outcome A → buy YES on tickerA (`yesMintA`), and
  // a "no" leg as outcome B → buy YES on tickerB (`yesMintB`). Mirror that
  // here so `/order/quote` uses the same mint the executor will sign with.
  // PDAs from `MatchedMarketsDflowWire` are deterministic and exist before
  // the on-chain market is tokenized — so the quote works for uninit markets.
  const dflowQuote = useDflowOrderQuote({
    yesMint: dflowLink?.yesMintA ?? undefined,
    noMint: dflowLink?.yesMintB ?? undefined,
    position: state.selectedPosition ?? null,
    side: state.side,
    amount: state.amount,
    enabled:
      state.tradingVenue === "dflow" &&
      state.orderType === "market" &&
      Boolean(dflowLink),
  });

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
    pandaId,
    propUmbrellaId,
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
      /**
       * On-chain CTF + USDT approvals snapshot. When `true`, the trade-box
       * "Preparing Predict…" gate is bypassed for buys — `useButtonState`
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

  /** Latest venue/tab lock — `onSideChangeWrapper` is declared before `useSorExecution`
   *  so it reads this ref, which we sync right after computing `venueSelectionLocked`. */
  const venueSelectionLockedRef = useRef(false);

  // Notify parent when side changes (buy/sell)
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
    ],
  );

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
    await predictSession.setApprovals({
      isNegRisk: predictMarketDetail?.isNegRisk ?? false,
      isYieldBearing: predictMarketDetail?.isYieldBearing ?? false,
    });
    await queryClient.invalidateQueries({ queryKey: ["predict-approvals"] });
    const refreshed = await predictApprovalsQuery.refetch();
    if (!refreshed.data) {
      throw new Error(
        "Predict trading approvals did not complete. Check your wallet and try again.",
      );
    }
  }, [predictApprovalsQuery, predictSession, predictMarketDetail, queryClient]);

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
   * Polymarket approval gate for the trade hot path.
   *
   * Fast path (default): trust the persisted venue-state flags from the
   * polymarket-account query. Onboarding's relay batch sets all approvals at
   * once and `verify-on-chain` flips the booleans, so once a user is fully
   * onboarded every subsequent trade can skip the on-chain
   * `checkPolymarketApprovals` multicall entirely (~150-300ms saved per
   * trade). Pass `{ force: true }` to bypass the fast path — the SOR leg
   * executor's order-error recovery branch uses this to repair an
   * externally-revoked allowance.
   *
   * `onApprovalWorkStart` is fired by the callback **only** right before
   * `executePolymarketApprovalBatch` actually submits the relay batch. The
   * SOR executor uses it to flip the trade-button label to "Approving
   * trades..." just for that window — so the common fast-path case never
   * shows an "Approving" flash when no approvals are running.
   */
  const ensurePolymarketApprovalsForTrade = useCallback(
    async (opts?: {
      force?: boolean;
      onApprovalWorkStart?: () => void;
    }) => {
      const safe = funding.polymarketSafe;
      if (!safe) {
        throw new Error(
          "Polymarket Safe not provisioned. Open the Polymarket tab to initialize it.",
        );
      }

      const force = opts?.force === true;
      if (!force) {
        const state = funding.polymarketAccount?.polymarketAccount;
        const flagsAllSet =
          !!state &&
          state.safeDeployed === true &&
          state.usdcApprovalComplete === true &&
          state.ctfApprovalComplete === true &&
          state.collateralOnrampUsdceApprovalComplete === true &&
          state.collateralOfframpPusdApprovalComplete === true;
        if (flagsAllSet) return;
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
      opts?.onApprovalWorkStart?.();
      await executePolymarketApprovalBatch(client, safe);

      const recheck = await checkPolymarketApprovals(safe);
      if (!recheck.allApproved) {
        throw new Error(
          "Polymarket approvals batch did not complete. Retry the trade.",
        );
      }

      // Refresh the polymarket-account query so the next trade's fast path
      // sees the freshly-set on-chain allowances reflected in the persisted
      // flags. Best-effort — the recovery path is rare (external revoke) and
      // we already re-approved on-chain, so failure here doesn't block.
      // `verifyOnChain.onSuccess` already invalidates the polymarket-account
      // query, so a separate invalidate is only needed if the mutation
      // itself fails.
      try {
        await funding.verifyOnChain.mutateAsync({});
      } catch (e) {
        console.warn(
          "[Polymarket] verify-on-chain after approval recovery failed",
          e,
        );
        await queryClient.invalidateQueries({
          queryKey: tradingQueryKeys.polymarketAccount,
        });
      }
    },
    [
      funding.polymarketSafe,
      funding.polymarketAccount,
      funding.verifyOnChain,
      queryClient,
      relay,
    ],
  );

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
      const venueMaker =
        (makerFromEnsure && makerFromEnsure.length > 0
          ? makerFromEnsure
          : makerFromOverview && makerFromOverview.length > 0
            ? makerFromOverview
            : "") ?? "";
      if (!venueMaker) {
        throw new Error(
          "Limitless maker address missing — refresh ensure-account or wait for account overview.",
        );
      }
      const fundTarget =
        resolvePrivyEvmFundTarget(funding.baseSmartWallet, account)?.trim() ?? "";
      const {
        effectiveMaker: maker,
        isDelegatedServerWalletSubAccount,
      } = classifyLimitlessClientMaker({
        venueMakerFromApi: venueMaker,
        fundTarget,
        signerAddress,
        account,
        embeddedEoa: funding.embeddedEoa,
      });
      if (
        import.meta.env.DEV &&
        venueMaker.trim().toLowerCase() !== maker.trim().toLowerCase()
      ) {
        console.warn(lxJit, "effective maker differs from venue API (stale row — align POST ensure-account)", {
          venueMaker: `${venueMaker.slice(0, 10)}…`,
          effectiveMaker: `${maker.slice(0, 10)}…`,
        });
      }

      /** User’s Privy Base funding identity (SCW or EOA) — for logs / sweeps; on-chain Limitless approvals use `maker`. */
      const userBaseFunding = fundTarget;
      const clipAddr = (addr: string) => {
        const t = addr.trim();
        if (t.length <= 22) return t;
        return `${t.slice(0, 10)}…${t.slice(-6)}`;
      };
      console.info(lxJit, "phase", {
        step: "verify_allowance",
        routeSlug: slug,
        effectiveVenueSlug,
        venueMaker: `${venueMaker.slice(0, 10)}…`,
        effectiveMaker: `${maker.slice(0, 10)}…`,
        userBaseFunding: userBaseFunding
          ? `${userBaseFunding.slice(0, 10)}…`
          : "(none)",
        note: "USDC/CTF approvals are sent as Limitless maker (embedded when SCW is fund target)",
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
        venueAdapterPresent:
          typeof allowance.venueAdapter === "string" &&
          allowance.venueAdapter.trim() !== "",
        ctfAddressFromApi:
          typeof allowance.ctfAddress === "string" && allowance.ctfAddress.trim() !== "",
        limitlessCheckedAddress:
          typeof allowance.limitlessCheckedAddress === "string"
            ? clipAddr(allowance.limitlessCheckedAddress)
            : undefined,
      });

      /**
       * Buys: private `verify-allowance` sets `hasMinimumAllowance: true` optimistically (no
       * on-chain USDC probe). When true, we skip `ensureLimitlessTradingApprovalsOnBase`, so a
       * successful buy does not prove the embedded wallet ran a sponsored USDC `approve`.
       * Sells still run CTF `setApprovalForAll` when `sellCtfReadsOk` is false.
       *
       * Partner delegated + `createServerWallet: true`: `isDelegatedServerWalletSubAccount`
       * skips Privy Base JIT (Limitless provisions the managed maker).
       */
      const buyPartnerUsdcOk = ctx.side === "buy" && allowance.hasMinimumAllowance;
      const sellCtfReadsOk =
        ctx.side === "sell" && !isDelegatedServerWalletSubAccount
          ? await readLimitlessSellCtfApprovalsSufficientOnBase({
              maker,
              verify: allowance,
            })
          : false;
      console.info(lxJit, "phase", {
        step: "sub_account_mode",
        routeSlug: slug,
        effectiveVenueSlug,
        isDelegatedServerWalletSubAccount,
        hasMinimumAllowance: allowance.hasMinimumAllowance,
        sellCtfReadsOk: ctx.side === "sell" ? sellCtfReadsOk : undefined,
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
        } else if (ctx.side === "buy" && buyPartnerUsdcOk) {
          console.info(lxJit, "phase", {
            step: "on_chain_approvals_skipped",
            routeSlug: slug,
            effectiveVenueSlug,
            reason: "buy_partner_usdc_ok",
          });
        } else if (ctx.side === "sell" && sellCtfReadsOk) {
          console.info(lxJit, "phase", {
            step: "on_chain_approvals_skipped",
            routeSlug: slug,
            effectiveVenueSlug,
            reason: "sell_ctf_on_chain_ok",
          });
        } else {
          const r = await ensureLimitlessTradingApprovalsOnBase({
            maker,
            getTxClientForAddress: getLimitlessTxClientForAddress,
            verify: allowance,
            side: ctx.side,
          });
          didSendTransactions = r.didSendTransactions;
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
        const fresh = await collateralTokens.refetch();
        const makerUsd =
          typeof fresh?.limitlessMakerBase === "number" &&
          Number.isFinite(fresh.limitlessMakerBase)
            ? Math.max(0, fresh.limitlessMakerBase)
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
        willRefetch: didSendTransactions,
      });
      let gatePayload: unknown =
        limitlessEnsureQuery.data ?? null;
      if (didSendTransactions) {
        const refetchResult = await limitlessEnsureQuery.refetch();
        gatePayload =
          (refetchResult != null && typeof refetchResult === "object"
            ? (refetchResult as { data?: unknown }).data
            : undefined) ??
          limitlessEnsureQuery.data ??
          null;
      }
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
      signerAddress,
      getLimitlessTxClientForAddress,
      funding.baseSmartWallet,
      funding.limitlessMakerBase,
      funding.embeddedEoa,
      collateralTokens,
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

  // Whether the DFlow market was uninitialized at the moment Submit was
  // pressed. The DFlow `/order` endpoint silently injects market tokenization
  // when needed, so first-mint trades take longer than a normal swap. Snapshot
  // the flag at submit so a fast post-trade umbrella refresh that flips
  // `accountsInitialized*` to `true` doesn't hide the notice immediately.
  const [dflowUninitAtSubmit, setDflowUninitAtSubmit] = useState(false);

  /**
   * First-mint DFlow nudge: when a trade tokenizes a Kalshi market for the
   * first time, the freshly-minted YES/NO mints + `accountsInitialized*` flags
   * only land in `exchangeMatching.dflow` after the predictions-API cron
   * re-scrapes DFlow (~5 min). Until then the umbrella has no token ids and
   * the user's balance can't be located. We re-call the same `fetchMappings`
   * that the cron uses (exposed as `sendGetState`) on a short backoff so the
   * umbrella picks up the new mints as soon as the server has them — without
   * introducing any new endpoint or replacing the existing refresh path.
   *
   * Schedule deliberately overlaps the typical first-mint settlement window
   * (~30-90s). Extra calls past convergence are harmless: each one is the
   * exact same GET the cron fires every 5 minutes anyway.
   */
  const DFLOW_FIRST_MINT_REFRESH_DELAYS_MS = useMemo(
    () => [0, 5_000, 15_000, 30_000, 60_000, 120_000],
    [],
  );
  const dflowFirstMintRefreshTimersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cancelDflowFirstMintRefresh = useCallback(() => {
    for (const t of dflowFirstMintRefreshTimersRef.current) {
      clearTimeout(t);
    }
    dflowFirstMintRefreshTimersRef.current = [];
  }, []);
  const scheduleDflowFirstMintRefresh = useCallback(() => {
    cancelDflowFirstMintRefresh();
    for (const delay of DFLOW_FIRST_MINT_REFRESH_DELAYS_MS) {
      const handle = setTimeout(() => {
        refetchMatchedMarkets();
      }, delay);
      dflowFirstMintRefreshTimersRef.current.push(handle);
    }
  }, [
    DFLOW_FIRST_MINT_REFRESH_DELAYS_MS,
    cancelDflowFirstMintRefresh,
    refetchMatchedMarkets,
  ]);
  useEffect(() => () => cancelDflowFirstMintRefresh(), [cancelDflowFirstMintRefresh]);

  /**
   * Auto-dismiss the order result. Default 4s; extended to 12s when the Kalshi
   * market-init notice is shown so the user can read it.
   */
  useEffect(() => {
    if (!state.orderResult) return;
    const dismissAfterMs = dflowUninitAtSubmit ? 12_000 : 4_000;
    const timer = setTimeout(() => {
      setState((prev) => ({ ...prev, orderResult: null }));
      setDflowUninitAtSubmit(false);
    }, dismissAfterMs);
    return () => clearTimeout(timer);
  }, [state.orderResult, dflowUninitAtSubmit]);

  /**
   * Same toast on umbrella page and home inline dock (`ToastContainer` in AppRoutes).
   *
   * Dismissal is enforced two ways: (1) `autoClose: TOAST_AUTO_CLOSE_TIME` on the
   * toast, and (2) a hard `toast.dismiss(toastId)` scheduled `TOAST_AUTO_CLOSE_TIME`
   * later. The hard dismiss is a belt-and-suspenders guarantee — if anything (a
   * re-render, a duplicate `setState` from the SOR effect, a frozen animation
   * timer) keeps the toast around past its autoClose, this still yanks it.
   */
  const orderResultToastSigRef = useRef<string | null>(null);
  const orderResultToastDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!state.orderResult) {
      orderResultToastSigRef.current = null;
      return;
    }
    const r = state.orderResult;
    const sig = [
      r.success ? "ok" : "fail",
      r.error ?? "",
      r.transactionHash ?? "",
      r.orderId ?? "",
    ].join("|");
    if (orderResultToastSigRef.current === sig) {
      return;
    }
    orderResultToastSigRef.current = sig;

    const toastId = r.success
      ? "prediction-trade-result-ok"
      : "prediction-trade-result-fail";

    toast.dismiss();

    const toastOpts = {
      toastId,
      autoClose: TOAST_AUTO_CLOSE_TIME,
      pauseOnHover: false,
      pauseOnFocusLoss: false,
      closeOnClick: true,
    } as const;

    if (r.success) {
      toast.success("Order confirmed!", toastOpts);
    } else {
      toast.error(
        r.error?.trim() ||
          "Order could not be completed. Check your wallet and try again.",
        toastOpts,
      );
    }

    if (orderResultToastDismissTimerRef.current) {
      clearTimeout(orderResultToastDismissTimerRef.current);
    }
    orderResultToastDismissTimerRef.current = setTimeout(() => {
      toast.dismiss(toastId);
      orderResultToastDismissTimerRef.current = null;
    }, TOAST_AUTO_CLOSE_TIME);
  }, [state.orderResult]);

  useEffect(() => {
    return () => {
      if (orderResultToastDismissTimerRef.current) {
        clearTimeout(orderResultToastDismissTimerRef.current);
        orderResultToastDismissTimerRef.current = null;
      }
      toast.dismiss("prediction-trade-result-ok");
      toast.dismiss("prediction-trade-result-fail");
    };
  }, []);

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

  // SOR execution wiring: executor callbacks + multi-chain wallet balances
  const sorReportExecutionPhaseRef = useRef<
    ((phase: SorExecutionPhase) => void) | undefined
  >(undefined);

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
    let venueMaker: string | undefined;
    const raw = limitlessEnsureQuery.data;
    if (raw && typeof raw === "object") {
      const o = raw as Record<string, unknown>;
      const inner =
        o.data != null && typeof o.data === "object"
          ? (o.data as Record<string, unknown>)
          : o;
      const la = inner.limitlessAccount;
      if (la && typeof la === "object") {
        const m = (la as Record<string, unknown>).makerAddress;
        if (typeof m === "string" && m.trim()) venueMaker = m.trim();
      }
    }
    if (!venueMaker?.trim()) {
      venueMaker = funding.limitlessMakerBase?.trim() || undefined;
    }
    if (!venueMaker?.trim()) return undefined;
    try {
      const fundTarget = resolvePrivyEvmFundTarget(
        funding.baseSmartWallet,
        account,
      )?.trim();
      const { effectiveMaker } = classifyLimitlessClientMaker({
        venueMakerFromApi: venueMaker,
        fundTarget,
        signerAddress,
        account,
        embeddedEoa: funding.embeddedEoa,
      });
      return effectiveMaker;
    } catch {
      return venueMaker.trim();
    }
  }, [
    limitlessEnsureQuery.data,
    funding.limitlessMakerBase,
    funding.baseSmartWallet,
    funding.embeddedEoa,
    account,
    signerAddress,
  ]);

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

  const sorExecutor = useSorLegExecutor({
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
    getLimitlessOwnerId,
    getLimitlessMakerAddress,
    buildLimitlessSignedOrderFromMarket: buildLimitlessSignedOrderFromMarketCb,
  });

  const sorExecution = useSorExecution({
    executeLeg: sorExecutor.executeLeg,
    executeBridge: sorExecutor.executeBridge,
    reportExecutionPhaseRef: sorReportExecutionPhaseRef,
  });

  /**
   * Single source with `CollateralTokenContext` — do not use `useBridgeFundingBalances`
   * gated on `multiVenueEnabled` here. Predict (and other single-tab) flows still need
   * Polygon / BNB / Solana rows for SOR + Li.FI prefund when Base USDC is low.
   */
  const sorWalletBalances: ChainBalance[] = useMemo(
    () =>
      buildChainBalances({
        baseUsdcBalance: collateralTokens.baseUsdc,
        baseWalletAddress: account ?? "",
        limitlessMakerUsdcBalance: Math.max(0, limitlessMakerCashForSor ?? 0),
        limitlessMakerWalletAddress: funding.limitlessMakerBase ?? "",
        polygonUsdcBalance: collateralTokens.polygonStable,
        polygonWalletAddress: funding.polymarketSafe,
        solanaUsdcBalance: collateralTokens.solanaUsdc,
        solanaWalletAddress: funding.solanaAddress,
        bnbUsdtBalance: collateralTokens.bscUsdt,
        bnbWalletAddress: funding.embeddedEoa,
        /** SOR API expects per-chain rows when addresses exist, not only chains with positive balance. */
        includeZeroBalanceChainsWithAddress: true,
      }),
    [
      collateralTokens.baseUsdc,
      collateralTokens.polygonStable,
      collateralTokens.solanaUsdc,
      collateralTokens.bscUsdt,
      account,
      funding.polymarketSafe,
      funding.solanaAddress,
      funding.embeddedEoa,
      funding.limitlessMakerBase,
      limitlessMakerCashForSor,
    ],
  );

  // --- SOR sell: per-venue share positions ---
  // Single source of truth = `tradeBoxShareBalances.allMarketsOutcomeVenueShares`
  // (same as MyPositionsRow / smart-routing sell breakdown).
  //
  // Do not mix in `useYesNoBalances` here: it keys off `market._id` only, while
  // UserData token balances may live under `questionId`. That drift dropped LevelUp
  // from `sorVenuePositions` (0 YES/NO from the hook) while Kalshi still showed from
  // venue portfolios — `maxScopedSellShares` looked like "Kalshi only" (e.g. 5) and
  // the sell input clamped there even though LevelUp + Kalshi = 9.
  const sorVenuePositions: VenuePositionEntry[] = useMemo(() => {
    if (!state.selectedPosition) return [];
    const byOutcome = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
    const sideMap =
      state.selectedPosition === "yes" ? byOutcome.yes : byOutcome.no;

    const entries: VenuePositionEntry[] = [];
    for (const venue of SOR_VENUE_POSITION_KEYS) {
      const sh = sideMap[venue];
      if (typeof sh === "number" && Number.isFinite(sh) && sh > 0) {
        entries.push({ venue, shares: sh });
      }
    }
    return entries;
  }, [state.selectedPosition, tradeBoxShareBalances.allMarketsOutcomeVenueShares]);

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
   * Pooled stable for SOR buy gates + deposit CTA — `sorWalletBalances` includes Base SCW
   * and Limitless maker rows plus other funding chains.
   * Prefund / Li.FI moves funds before signing; the gate must not pretend off-Base stables do not exist.
   */
  const totalAvailableCash = useMemo(
    () =>
      sorWalletBalances.reduce((sum, b) => sum + b.balance, 0),
    [sorWalletBalances],
  );

  // --- SOR route computation + execution (active for ALL venues, not just "all") ---
  const sorLimitPriceCents: number | undefined =
    state.orderType === "limit" ? parseLimitPriceCents(state.price) : undefined;

  // For market orders the amount field is USD. For limit orders the amount
  // field is shares and the price field is cents — SOR always expects USD, so
  // convert limit amounts to USD notional (shares * price).
  //
  // Sell-all clamp (market and limit): when the user types within
  // SHARE_SELL_COMPARE_EPS (0.01 share) of scoped holdings for the active tab,
  // substitute the exact held total before SOR. MyPositions / hints show
  // shares floored to 2 dp, so the typed cap is often slightly below on-chain
  // precision; this closes the gap for Limitless, Predict, Polymarket, etc.
  const sorAmountUsd = (() => {
    const raw = parseFloat(state.amount);
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (state.orderType === "limit") {
      if (sorLimitPriceCents == null) return 0;
      let sharesForNotional = raw;
      if (
        state.side === "sell" &&
        maxScopedSellShares > 0 &&
        Math.abs(raw - maxScopedSellShares) <= SHARE_SELL_COMPARE_EPS
      ) {
        sharesForNotional = maxScopedSellShares;
      }
      return sharesForNotional * (sorLimitPriceCents / 100);
    }
    if (
      state.side === "sell" &&
      maxScopedSellShares > 0 &&
      Math.abs(raw - maxScopedSellShares) <= SHARE_SELL_COMPARE_EPS
    ) {
      return maxScopedSellShares;
    }
    return raw;
  })();

  // Respect the product-wide SOR floors so we never call the route API below
  // a minimum — avoids stale/broken previews and keeps the button on the
  // "Trade minimum is $2." / "$2 minimum limit order value." / "Minimum sell is
  // 1 share." disabled state until the user types a valid amount.
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

  const debouncedSorRoutePreviewAllowed = useDebouncedValue(
    sorAmountMeetsFloor,
    350,
  );

  /** Same identity as orderbook keys / umbrella pills (`marketId` fallback, not only `_id`). */
  const smartRoutingMarketKey = useMemo(() => getMarketId(market).trim(), [market]);

  const sorQuestionId = useMemo(
    () => getMarketId(market) || undefined,
    [market],
  );

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
    questionId: sorQuestionId,
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
    /**
     * Sells: pass FULL position list (not the per-tab slice) so the omnibus channel can
     * legitimately split across venues. The hook only adds `targetVenue` to the execution
     * channel; the server filters per channel.
     */
    venuePositions: state.side === "sell" ? sorVenuePositions : undefined,
    enabled: sorRouteEnabled,
    polyFeeRate: 0.03,
    predictFunFeeRateBps: predictMarketDetail?.feeRateBps,
    targetVenue: sorTargetVenue,
    orderType: state.orderType,
    limitPriceCents: sorLimitPriceCents,
    suspendBackgroundRefetch:
      sorExecution.isExecuting || state.isLoading,
  });

  /**
   * Resolved executable plan + status for the active tab:
   * - "all" → omnibus (`displayRoute` / display channel).
   * - specific venue → **only** the targeted `executionRoute` with legs. Never use omnibus here:
   *   executing `displayRoute` while a venue tab is selected sent orders to the wrong venue.
   */
  const executableRoute = useMemo(() => {
    if (state.tradingVenue === "all") {
      return sorRoute.displayRoute;
    }
    const exec = sorRoute.executionRoute;
    if (exec && exec.legs.length > 0) {
      return exec;
    }
    return null;
  }, [state.tradingVenue, sorRoute.displayRoute, sorRoute.executionRoute]);
  const executableLoading =
    state.tradingVenue === "all" ? sorRoute.displayLoading : sorRoute.executionLoading;
  const executableStale =
    state.tradingVenue === "all" ? sorRoute.displayStale : sorRoute.executionStale;
  const executableError =
    state.tradingVenue === "all" ? sorRoute.displayError : sorRoute.executionError;
  const executableErrorCode =
    state.tradingVenue === "all"
      ? sorRoute.displayErrorCode
      : sorRoute.executionErrorCode;

  // Keep ref in sync so handleTrade (defined above) can access latest SOR data.
  sorRouteRef.current = executableRoute;

  const venueSelectionLocked =
    sorExecution.isExecuting || state.isLoading;
  venueSelectionLockedRef.current = venueSelectionLocked;

  const handleTradingVenueChangeGuarded = useCallback(
    (next: TradingVenue) => {
      if (sorExecution.isExecuting || state.isLoading) return;
      handleTradingVenueChange(next);
    },
    [sorExecution.isExecuting, state.isLoading, handleTradingVenueChange],
  );

  useEffect(() => {
    if (venueSelectionLocked) return;
    const v = state.tradingVenue;
    if (v === "all") return;
    if (matchedVenues.has(v)) return;
    handleTradingVenueChangeGuarded(pandaId ? "all" : "levelup");
  }, [
    venueSelectionLocked,
    matchedVenues,
    state.tradingVenue,
    pandaId,
    handleTradingVenueChangeGuarded,
  ]);

  useEffect(() => {
    if (venueSelectionLocked) return;
    if (state.side !== "sell" || !propUmbrellaId || !account) return;
    if (tradeBoxShareBalances.loading) return;
    if (!(tradeBoxShareBalances.sellTotalShares > 0)) return;
    if (maxScopedSellShares > 0) return;

    if (multiVenueEnabled) {
      handleTradingVenueChangeGuarded("all");
      return;
    }
    const first = sorVenuePositions[0]?.venue;
    if (first) {
      handleTradingVenueChangeGuarded(first);
    }
  }, [
    venueSelectionLocked,
    state.side,
    propUmbrellaId,
    account,
    tradeBoxShareBalances.loading,
    tradeBoxShareBalances.sellTotalShares,
    maxScopedSellShares,
    multiVenueEnabled,
    sorVenuePositions,
    handleTradingVenueChangeGuarded,
  ]);

  const prevSmartRoutingMarketKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const key = smartRoutingMarketKey;
    if (!key) return;
    const prev = prevSmartRoutingMarketKeyRef.current;
    prevSmartRoutingMarketKeyRef.current = key;
    if (prev !== null && prev !== key && state.side === "buy") {
      sorExecution.resetExecution();
      setState((s) => ({ ...s, orderResult: null }));
    }
  }, [
    smartRoutingMarketKey,
    state.side,
    sorExecution.resetExecution,
    setState,
  ]);

  const [sorRouteExpired, setSorRouteExpired] = useState(false);
  useEffect(() => {
    if (!executableRoute) { setSorRouteExpired(false); return; }
    const check = () => {
      if (executableRoute) {
        setSorRouteExpired(Date.now() > executableRoute.expiresAt);
      }
    };
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [executableRoute]);

  useEffect(() => {
    sorRouteExpiredRef.current = sorRouteExpired;
  }, [sorRouteExpired]);

  const latestBaselineRef = useRef<{
    routeId: string;
    baseline: PostTradeBaseline;
    route: RoutePlan;
  } | null>(null);

  const handleSorExecute = useCallback(() => {
    if (executableRoute && !sorRouteExpired) {
      const tv = state.tradingVenue;
      const legsMatchVenueTab =
        tv === "all" ||
        executableRoute.legs.every((l) => l.venue === tv);
      if (!legsMatchVenueTab) {
        console.error("[SOR] execute blocked: route legs do not match selected venue tab", {
          tradingVenue: tv,
          legVenues: executableRoute.legs.map((l) => l.venue),
          routeId: executableRoute.routeId,
        });
        setState((prev) => ({
          ...prev,
          orderResult: {
            success: false,
            error:
              "Venue mismatch — wait for the quote to refresh, then try again.",
          },
        }));
        return;
      }
      console.log("[SOR] Trade button → execute", executableRoute.routeId);
      // Kalshi/DFlow: each outcome has its own `accountsInitialized*` flag. Only show
      // the "creating this market" notice when the leg(s) we execute still report
      // `false` for that outcome — not when the other team's leg is uninitialized.
      const dflowLink = matchedMonitor?.dflow;
      const dflowExecutedLegNeedsMarketInit =
        Boolean(dflowLink) &&
        executableRoute.legs.some((leg) => {
          if (leg.venue !== "dflow" || !dflowLink) return false;
          const initialized =
            leg.outcome === "A"
              ? dflowLink.accountsInitializedA
              : dflowLink.accountsInitializedB;
          return initialized === false;
        });
      setDflowUninitAtSubmit(dflowExecutedLegNeedsMarketInit);
      const marketId = sorQuestionId as string | undefined;
      const baseline = capturePostTradeBaseline({
        queryClient,
        route: executableRoute,
        addresses: {
          polymarketSafe: funding.polymarketSafe,
          predictWallet: account,
          solanaAddress: funding.solanaAddress,
        },
        levelUp: marketId
          ? {
              marketId,
              yesBalance,
              noBalance,
            }
          : null,
      });
      latestBaselineRef.current = {
        routeId: executableRoute.routeId,
        baseline,
        route: executableRoute,
      };
      void sorExecution
        .execute(executableRoute)
        .then((res) => {
          if (res == null) {
            console.error("[SOR] execute settled: null result (execute ignored or bug)");
            return;
          }
          const summary = {
            routeId: res.routeId,
            status: res.status,
            totalFilledShares: res.totalFilledShares,
            totalSpent: res.totalSpent,
            remainingBudget: res.remainingBudget,
            legs: res.legs.map((l) => ({
              venue: l.venue,
              legStatus: l.status,
              shares: l.shares,
              filledShares: l.filledShares,
              error: l.error ?? null,
              txHash: l.txHash ?? null,
              bridgeTxHash: l.bridgeTxHash ?? null,
            })),
          };
          // Always use console.log for the object — some console filters hide console.warn.
          console.log("[SOR] execute settled", summary);
          if (res.status !== "complete") {
            const legLine = res.legs
              .map(
                (l) =>
                  `${l.venue}(${l.status}${l.error ? `: ${l.error}` : ""})`,
              )
              .join(" | ");
            console.error(
              `[SOR] execute not complete — status=${res.status} | ${legLine}`,
            );
          }
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
          : executableErrorCode === "EXECUTION_NOT_READY"
            ? "Complete setup for this venue before trading."
            : executableError?.trim()
              ? executableError
              : executableLoading
                ? "Still finding the best route…"
                : "No route available. Try a different amount or venue.",
      },
    }));
  }, [
    executableRoute,
    sorRouteExpired,
    executableError,
    executableLoading,
    executableErrorCode,
    sorExecution.execute,
    setState,
    queryClient,
    funding.polymarketSafe,
    funding.solanaAddress,
    account,
    market,
    yesBalance,
    noBalance,
    matchedMonitor,
    state.tradingVenue,
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

    if (!(wasExecuting && !sorExecution.isExecuting && sorExecution.execution)) {
      return;
    }

    const { status, legs, routeId } = sorExecution.execution;

    // Defensive guard: `status === "complete"` already implies every leg is
    // `filled` (see `buildLocalExecution`'s `allFilled` derivation), but a
    // future refactor that decouples the two would silently regress this
    // hook into firing the success toast on a partially-failed route. Re-derive
    // from the leg array and demote anything that doesn't pass to the
    // failed-or-partial branch so a rejected venue can never look "confirmed"
    // in the UI.
    const everyLegFilled =
      legs.length > 0 && legs.every((l) => l.status === "filled");

    if (status === "complete" && everyLegFilled) {
      const hasDflowFilledLeg = legs.some(
        (l) =>
          l.venue === "dflow" &&
          l.status === "filled" &&
          l.filledShares > 0,
      );
      if (hasDflowFilledLeg) {
        void queryClient.invalidateQueries({ queryKey: ["dflow-positions"] });
        void queryClient.invalidateQueries({
          queryKey: ["dflow-outcome-balance"],
        });
      }

      const cached = latestBaselineRef.current;
      if (cached && cached.routeId === routeId) {
        const syncUiKey =
          String(
            (market as { _id?: string })?._id ??
              (market as { questionId?: string })?.questionId ??
              "",
          ).trim() || null;
        for (let i = 0; i < legs.length; i++) {
          const rl = cached.route.legs[i];
          const el = legs[i];
          if (
            rl?.venue === "dflow" &&
            el?.status === "filled" &&
            el.filledShares > 0
          ) {
            const m = dflowOutcomeMintForRouteLeg(rl);
            if (m) registerPendingDflowOutcomeMints([m]);
          }
        }
        postTradeSync.start({
          queryClient,
          route: cached.route,
          execution: sorExecution.execution,
          baseline: cached.baseline,
          addresses: {
            polymarketSafe: funding.polymarketSafe,
            predictWallet: account,
            solanaAddress: funding.solanaAddress,
          },
          refreshLevelUpPositions: refreshTokenPositions,
          refetchCollateral: collateralTokens.refetch,
          readLevelUpSide: (mid, side) => {
            const tb = getTokenBalance(mid);
            if (!tb) return 0;
            const raw = side === "yes" ? tb.yesBalance : tb.noBalance;
            const n = parseFloat(raw);
            return Number.isFinite(n) ? n : 0;
          },
          syncUiKey,
        });
      } else if (import.meta.env.DEV) {
        console.warn(
          "[PostTradeSync] missing baseline for routeId — skipping optimistic + sync",
          { routeId, cachedRouteId: cached?.routeId },
        );
      }

      // First-mint DFlow trades only: nudge the matched-markets refresh so the
      // umbrella picks up the freshly-tokenized YES/NO mints + `accountsInitialized*`
      // flags as soon as the predictions-API cron has them, instead of waiting up to
      // 5 minutes for the next cron tick. Reuses `sendGetState` (== `fetchMappings`).
      if (dflowUninitAtSubmit) {
        scheduleDflowFirstMintRefresh();
      }

      latestBaselineRef.current = null;
      setState((s) => ({ ...s, amount: "", orderResult: { success: true } }));
      sorExecution.resetExecution();
    } else if (status === "failed" || status === "partial" || !everyLegFilled) {
      latestBaselineRef.current = null;
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
  }, [
    sorExecution.isExecuting,
    sorExecution.execution,
    sorExecution.resetExecution,
    queryClient,
    setState,
    refreshTokenPositions,
    collateralTokens,
    funding.polymarketSafe,
    funding.solanaAddress,
    account,
    market,
    postTradeSync,
    getTokenBalance,
    dflowUninitAtSubmit,
    scheduleDflowFirstMintRefresh,
  ]);

  useEffect(() => {
    if (venueSelectionLocked) return;
    if (pandaId && state.tradingVenue !== "all") {
      handleTradingVenueChangeGuarded("all");
    } else if (!pandaId && state.tradingVenue === "all") {
      handleTradingVenueChangeGuarded("levelup");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pandaId]);

  useEffect(() => {
    if (venueSelectionLocked) return;
    if (venueOverride && venueOverride !== state.tradingVenue) {
      handleTradingVenueChangeGuarded(venueOverride);
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
    limitlessTrading,
    dflowProofVerified: dflowProof.isVerified,
    dflowProofLoading: dflowProof.isLoading,
    dflowStartProofFlow: handleStartDflowProofForTrade,
    sorMatchedVenues: matchedVenues,
    sorState: {
      // Omnibus route on "all"; single-venue execution route only on a venue tab (never omnibus).
      route: executableRoute,
      isLoading: executableLoading,
      isStale: executableStale,
      error: executableError,
      routeErrorCode: executableErrorCode,
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

  /**
   * Unlock sell UX whenever aggregate holdings are already known (`sellTotalShares`),
   * even if some venue queries are still catching up — same numbers as MyPositionsRow.
   */
  const sharesLoadingForActiveTab = useMemo(() => {
    if (!authenticated || !propUmbrellaId) return false;
    if (tradeBoxShareBalances.sellTotalShares > 0) return false;
    return tradeBoxShareBalances.loading;
  }, [
    authenticated,
    propUmbrellaId,
    tradeBoxShareBalances.sellTotalShares,
    tradeBoxShareBalances.loading,
  ]);

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
        // Single-venue tab: overlay the executable (targeted) plan onto the trade-box
        // numbers when it matches the typed amount. "all" tab falls through to the
        // local book walk (calculatedMarketOrderData) — same behavior as before.
        //
        // We deliberately do NOT gate on `executionStale` — staleness flipping on a
        // background poll would otherwise flip the To Win between SOR and bookData
        // numbers (the "requote" feel). As long as the executionRoute matches the
        // typed amount, it's the freshest authoritative plan and is what Submit signs.
        const sr = sorRoute.executionRoute;
        const inputAmount = parseFloat(state.amount) || 0;
        // Buys: cent-rounded USD match. Sells: share tolerance (same as
        // `shareAmountMatchesRoute` / sell-all clamp) so 2dp-typed size still
        // overlays when `requestedAmount` carries full precision.
        const sorMatchesInput =
          sr &&
          sr.legs.length > 0 &&
          inputAmount > 0 &&
          (state.side === "buy"
            ? usdAmountMatchesRoute(sr.requestedAmount, inputAmount)
            : shareAmountMatchesRoute(sr.requestedAmount, inputAmount));
        const hasSorData = sorMatchesInput && state.tradingVenue !== "all";
        const bookData = calculatedMarketOrderData;

        if (hasSorData && state.orderType === "market") {
          const leg = sr.legs[0];
          const shareVenueCfg = getVenueConfig(state.tradingVenue);
          const sorContractsRaw = shareVenueCfg.requiresWholeShares
            ? Math.floor(sr.totalShares)
            : sr.totalShares;
          const sorContracts = Number.isFinite(sorContractsRaw)
            ? sorContractsRaw
            : undefined;
          const sorCost = Number.isFinite(sr.totalCost) ? sr.totalCost : undefined;
          const sorFee = Number.isFinite(sr.totalFees) ? sr.totalFees : undefined;

          if (state.side === "buy") {
            return {
              ...state,
              calculatedContracts: sorContracts ?? bookData.calculatedContracts,
              remainingUsd: bookData.remainingUsd,
              spent:
                sorCost !== undefined && sorFee !== undefined
                  ? sorCost - sorFee
                  : bookData.spent,
              tradingFee: sorFee ?? bookData.tradingFee,
              estimatedCost: sorCost ?? bookData.estimatedCost,
              grossReceive: null,
              sellTradingFee: null,
              netReceive: null,
            };
          }
          // Sell — leg.executionAmountUsd is net proceeds (matches chain settlement target).
          const legProceedsUsd =
            typeof leg.executionAmountUsd === "number" &&
            Number.isFinite(leg.executionAmountUsd) &&
            leg.executionAmountUsd > 0
              ? leg.executionAmountUsd
              : null;
          return {
            ...state,
            calculatedContracts: sorContracts ?? bookData.calculatedContracts,
            remainingUsd: bookData.remainingUsd,
            spent: null,
            tradingFee: null,
            estimatedCost: null,
            grossReceive: legProceedsUsd ?? bookData.grossReceive,
            sellTradingFee: sorFee ?? bookData.sellTradingFee,
            netReceive: legProceedsUsd ?? bookData.netReceive,
          };
        }

        // DFlow `/order/quote` overlay: when on the DFlow tab, the SOR route
        // hasn't returned (or the user just typed), and the orderbook walk
        // would mis-price an uninit market (single BBO level seeded from
        // metadata), prefer the upstream quote which already accounts for
        // any market-tokenization cost.
        const dflowQuoteData = dflowQuote.data;
        if (
          state.tradingVenue === "dflow" &&
          state.orderType === "market" &&
          dflowQuoteData &&
          Number.isFinite(dflowQuoteData.contracts) &&
          dflowQuoteData.contracts > 0
        ) {
          if (state.side === "buy") {
            return {
              ...state,
              calculatedContracts: dflowQuoteData.contracts,
              remainingUsd: bookData.remainingUsd,
              spent: dflowQuoteData.usd,
              tradingFee: 0,
              estimatedCost: dflowQuoteData.usd,
              grossReceive: null,
              sellTradingFee: null,
              netReceive: null,
            };
          }
          return {
            ...state,
            calculatedContracts: dflowQuoteData.contracts,
            remainingUsd: bookData.remainingUsd,
            spent: null,
            tradingFee: null,
            estimatedCost: null,
            grossReceive: dflowQuoteData.usd,
            sellTradingFee: 0,
            netReceive: dflowQuoteData.usd,
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
      onTradingVenueChange={handleTradingVenueChangeGuarded}
      onOrderTypeChange={handleOrderTypeChange}
      onSideChange={onSideChangeWrapper}
      polymarketVenueHint={polymarketVenueHint}
      predictVenueHint={predictVenueHint}
      predictVenueBookHints={predictVenueBookHints}
      levelUpVenueBookHints={levelUpVenueBookHints}
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
      sharesLoadingForActiveTab={sharesLoadingForActiveTab}
      matchedMonitor={matchedMonitor}
      allMarketsSellYesBid={allMarketsSellYesBid}
      allMarketsSellNoBid={allMarketsSellNoBid}
      shareBalances={tradeBoxShareBalances}
      mobilePeekBar={mobilePeekBar}
      dflowUninitAtSubmit={dflowUninitAtSubmit}
      routePreviewAllowed={debouncedSorRoutePreviewAllowed}
      smartRoutingMarketKey={smartRoutingMarketKey}
    />
		</>
  );
});

PredictionMarketTradeBox.displayName = "PredictionMarketTradeBox";

export default PredictionMarketTradeBox;


