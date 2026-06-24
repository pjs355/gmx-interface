import { useCallback, useMemo, useEffect, useRef, forwardRef } from "react";
import { useSignerContext } from "context/SignerContext";
import { usePrivy } from "@privy-io/react-auth";
import { RegisterDepositAction } from "@/features/funding/RegisterDepositAction";
import { useAfterDepositRefresh } from "@/features/funding/useAfterDepositRefresh";
import { useSmartWallets } from "@privy-io/react-auth/smart-wallets";
import type { TradeBoxProps } from "@/features/trading/trade-box/types";
import type { PredictionMarketTradeBoxHandle } from "@/features/trading/trade-box/types";
export type { PredictionMarketTradeBoxHandle } from "@/features/trading/trade-box/types";
import { useTradeExecutionService } from "./TradeExecutionService";
import PredictionMarketTradeBoxResponsiveContainer from "./PredictionMarketTradeBoxResponsiveContainer";
import {
	checkSufficientBalance,
	useYesNoBalances,
	checkSufficientShares,
} from "@/features/trading/trade-box/checkBalances";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useTradeState } from "@/features/trading/trade-box/hooks/useTradeState";
import { usePolymarketExecutionGate } from "@/features/trading/hooks/usePolymarketExecutionGate";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { useTradeBoxController } from "@/features/trading/trade-box/hooks/useTradeBoxController";
import { useTradeBoxVenueWiring } from "@/features/trading/trade-box/hooks/useTradeBoxVenueWiring";
import { useTradeBoxOrderResultToasts } from "@/features/trading/trade-box/hooks/useTradeBoxOrderResultToasts";
import { useCalculatedMarketOrderData } from "@/features/trading/trade-preview/useCalculatedMarketOrderData";
import { usePolymarketRelay } from "@/features/trading/venues/polymarket/session/usePolymarketRelay";
import { probabilityToLimitPriceCentsString } from "@/features/trading/sor";
import { useAccountData } from "@/context/AccountDataContext";
import { maxAllMarketsSellBidForOutcome } from "@/features/markets/pricing/useTradingPagePrices";
import { useTradeBoxShareBalances } from "@/features/trading/trade-box/hooks/useTradeBoxShareBalances";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { useSetupActivationOptional } from "@/features/onboarding/SetupActivationContext";
import { getYesNoTeamLabels } from "@/features/trading/trade-box/teamLabels";
import { useTradeBoxLimitlessEnsure } from "@/features/trading/trade-box/hooks/useTradeBoxLimitlessEnsure";
import { useTradeBoxSolanaSigner } from "@/features/trading/trade-box/hooks/useTradeBoxSolanaSigner";
import { useTradeBoxDflowProof } from "@/features/trading/trade-box/hooks/useTradeBoxDflowProof";
import { useTradeBoxMatchedMonitor } from "@/features/trading/trade-box/hooks/useTradeBoxMatchedMonitor";
import { useTradeBoxImperativeHandle } from "@/features/trading/trade-box/hooks/useTradeBoxImperativeHandle";
import { useTradeBoxApprovals } from "@/features/trading/trade-box/hooks/useTradeBoxApprovals";
import { buildTradeBoxSorLegExecutorDeps } from "@/features/trading/trade-box/buildTradeBoxSorLegExecutorDeps";

export interface PredictionMarketTradeBoxProps extends TradeBoxProps {
	umbrellaDisplayName?: string;
}

const PredictionMarketTradeBox = forwardRef<
	PredictionMarketTradeBoxHandle,
	PredictionMarketTradeBoxProps
>(
	(
		{
			market,
			orderbook: propOrderbook,
			pandascoreMatchId,
			umbrellaId: propUmbrellaId,
			limitlessMappingFromUmbrella,
			predictFunMappingFromUmbrella,
			umbrellaDisplayName,
			umbrellaTeamMappings,
			selectionTitleOverride,
			initialPosition,
			onPositionChange,
			onSideChange: onSideChangeCallback,
			venueOverride,
			crossBuyYes: propCrossBuyYes,
			crossBuyNo: propCrossBuyNo,
			venueRowsForSellStrip: propVenueRowsForSellStrip,
			mobilePeekBar = "default",
			tradeRouteIsolationKey,
		},
		ref,
	) => {
		const pandaId = pandascoreMatchId?.trim() ?? "";
		const multiVenueEnabled = Boolean(pandaId);
		const initialVenue = multiVenueEnabled ? ("all" as const) : ("levelup" as const);

		const {
			state,
			setState,
			handlePositionChange,
			handleAmountChange,
			handlePriceChange,
			handleOrderTypeChange,
			handleSideChange,
			handleTradingVenueChange,
		} = useTradeState(initialPosition, initialVenue, tradeRouteIsolationKey);

		useEffect(() => {
			if (state.orderType !== "market") {
				handleOrderTypeChange("market");
			}
		}, [state.orderType, handleOrderTypeChange]);
		const { getClientForChain } = useSmartWallets();
		const { account, ready: signerReady, signer } = useSignerContext();
		const { login, authenticated } = usePrivy();

		const refreshAfterDeposit = useAfterDepositRefresh();
		const collateralTokens = useCollateralTokens();
		const accountData = useAccountData();
		const addFundsFromPrivyRef = useRef<(() => Promise<void>) | null>(null);
		/** LevelUp REST orderbook (signing + execution always uses this for LevelUp venue). */
		const levelUpOrderbook = propOrderbook ?? null;

		const handleSorExecuteRef = useRef<(() => void) | null>(null);

		const handleAddFunds = useCallback(async () => {
			const f = addFundsFromPrivyRef.current;
			if (f) await f();
		}, []);

		const privateApi = usePrivateApiClient();
		const profileQuery = useCurrentProfile({ enabled: authenticated });
		const profileId = profileQuery.data?._id;
		const setupActivation = useSetupActivationOptional();

		const { limitlessEnsureQuery, limitlessEnsureGate, limitlessReady, getLimitlessOwnerId } =
			useTradeBoxLimitlessEnsure({ profileId, signer, privateApi });

		const relay = usePolymarketRelay();
		const { embeddedSolanaWallet, solanaSigner } = useTradeBoxSolanaSigner(
			accountData.venueAddressChainMap?.dflow.walletAddress,
		);
		const { dflowProof, handleStartDflowProofForTrade } = useTradeBoxDflowProof({
			embeddedSolanaWallet,
			privateApi,
		});

		const tradeExecutionService = useTradeExecutionService();
		const executionGate = usePolymarketExecutionGate();

		const {
			oddsMonitorEnabled,
			oddsMonitorConnected,
			matchedMonitor,
			matchedVenues,
			smartRoutingSurfaceActive,
			dflowLink,
			refetchMatchedMarkets,
		} = useTradeBoxMatchedMonitor({
			pandaId,
			multiVenueEnabled,
			propUmbrellaId,
			limitlessMappingFromUmbrella,
			levelUpOrderbook,
			tradingVenue: state.tradingVenue,
		});

		const predictPostTradeWallet =
			accountData.venueAddressChainMap?.predictfun.walletAddress ?? null;
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

		const crossBuyPrices = useMemo(
			() => ({
				crossBuyYes: propCrossBuyYes ?? null,
				crossBuyNo: propCrossBuyNo ?? null,
			}),
			[propCrossBuyYes, propCrossBuyNo],
		);

		const { yesTeamLabel, noTeamLabel } = useMemo(
			() => getYesNoTeamLabels(market, umbrellaDisplayName, umbrellaTeamMappings),
			[market, umbrellaDisplayName, umbrellaTeamMappings],
		);

		const tradeBoxIsVsSingle = useMemo(() => {
			if (!market) return false;
			const mt = (market?.displayName || (market as any)?.question || "").trim();
			if (mt.match(/^Over\s+/i)) return false;
			const raw = (umbrellaDisplayName || "").replace(/\s*-\s*Match Winner$/i, "").trim() || mt;
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
			if (!propVenueRowsForSellStrip?.length) return null;
			const m = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
			return maxAllMarketsSellBidForOutcome(propVenueRowsForSellStrip, "yes", m.yes);
		}, [propVenueRowsForSellStrip, tradeBoxShareBalances.allMarketsOutcomeVenueShares]);

		const allMarketsSellNoBid = useMemo(() => {
			if (!propVenueRowsForSellStrip?.length) return null;
			const m = tradeBoxShareBalances.allMarketsOutcomeVenueShares;
			return maxAllMarketsSellBidForOutcome(propVenueRowsForSellStrip, "no", m.no);
		}, [propVenueRowsForSellStrip, tradeBoxShareBalances.allMarketsOutcomeVenueShares]);

		const venueWiring = useTradeBoxVenueWiring({
			state,
			multiVenueEnabled,
			authenticated,
			pandaId,
			matchedMonitor,
			moneylineLeg: market?.moneylineLeg ?? matchedMonitor?.moneylineLeg ?? null,
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

		const approvalGate = useTradeBoxApprovals({
			account,
			relay,
			dflowProof,
			handleStartDflowProofForTrade,
			limitlessEnsureQuery,
			venueWiring,
		});

		const {
			predictMarketDetail,
			effectiveOrderbook,
			levelUpVenueBookHints,
			marketOrderHandler,
			orderbookWalkPosition,
			calculateContractsForMarketOrderUi,
			predictVenueBookHints,
			predictTrading,
			polymarketTrading,
			limitlessTrading,
		} = venueWiring;

		const usdcBalance = collateralTokens.baseUsdc;
		const { yesBalance, noBalance } = useYesNoBalances(market);

		const onPositionChangeWrapper = useCallback(
			(position: "yes" | "no") => {
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
			},
			[
				handleAmountChange,
				handlePositionChange,
				onPositionChange,
				state.side,
				state.tradingVenue,
				crossBuyPrices.crossBuyYes,
				crossBuyPrices.crossBuyNo,
				handlePriceChange,
			],
		);

		useEffect(() => {
			if (state.tradingVenue !== "all" || !state.selectedPosition) return;
			const px =
				state.selectedPosition === "yes" ? crossBuyPrices.crossBuyYes : crossBuyPrices.crossBuyNo;
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
			orderbookWalkPosition,
			predictFunFeeRateBps: predictMarketDetail?.feeRateBps,
		});

		useTradeBoxOrderResultToasts(state.orderResult);

		const limitlessMakerCashForSor = collateralTokens.limitlessMakerUsdc;

		const sorLegExecutorDeps = buildTradeBoxSorLegExecutorDeps({
			tradeExecutionService,
			venueWiring,
			privateApi,
			market,
			matchedMonitor,
			propUmbrellaId,
			account,
			getClientForChain,
			venueAddressChainMap: accountData.venueAddressChainMap,
			walletGate: accountData.walletGate,
			solanaSigner,
			relay,
			dflowProof,
			approvalGate,
			getLimitlessOwnerId,
			signer,
		});

		const levelUpPositions = accountData.positions.levelup;
		const getMarketBalance = levelUpPositions.getMarketBalance;
		const readSideShares = levelUpPositions.readSideShares;
		const fundingGate = accountData.walletGate;

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
			getMarketBalance,
			readSideShares,
			levelUpWallet: accountData.venueAddressChainMap?.levelup.walletAddress ?? null,
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
			debouncedSorRoutePreviewAllowed,
			smartRoutingMarketKey,
			maxScopedSellShares,
			handleTradingVenueChangeGuarded,
			venueSelectionLockedRef,
			buttonStateForUi,
			sharesLoadingForActiveTab,
			dflowUninitAtSubmit,
		} = ctrl;

		useTradeBoxImperativeHandle(ref, {
			state,
			authenticated,
			account,
			yesBalance,
			noBalance,
			smartRoutingSurfaceActive,
			handlePositionChange,
			handleAmountChange,
			handlePriceChange,
			handleOrderTypeChange,
			handleSideChange,
			handleTradingVenueChange,
			handleSorExecuteRef,
		});

		const onSideChangeWrapper = useCallback(
			(side: "buy" | "sell") => {
				handleSideChange(side);
				if (side === "sell" && smartRoutingSurfaceActive && !venueSelectionLockedRef.current) {
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

		useEffect(() => {
			if (!state.orderResult) return;
			const dismissAfterMs = dflowUninitAtSubmit ? 12_000 : 4_000;
			const timer = setTimeout(() => {
				setState((prev) => ({ ...prev, orderResult: null }));
			}, dismissAfterMs);
			return () => clearTimeout(timer);
		}, [state.orderResult, dflowUninitAtSubmit, setState]);

		const executionGateBanner = null;

		return (
			<>
				<RegisterDepositAction
					ready={signerReady}
					onComplete={refreshAfterDeposit}
					depositActionRef={addFundsFromPrivyRef}
				/>
				<PredictionMarketTradeBoxResponsiveContainer
					market={market}
					orderbook={effectiveOrderbook}
					pandascoreMatchId={pandascoreMatchId}
					umbrellaId={propUmbrellaId}
					umbrellaDisplayName={umbrellaDisplayName}
					umbrellaTeamMappings={umbrellaTeamMappings}
					selectionTitleOverride={selectionTitleOverride}
					crossBuyYes={crossBuyPrices.crossBuyYes}
					crossBuyNo={crossBuyPrices.crossBuyNo}
					mobilePeekBar={mobilePeekBar}
					executionGateBanner={executionGateBanner}
					runtime={{
						state,
						tradeQuote,
						onPositionChange: onPositionChangeWrapper,
						onAmountChange: handleAmountChange,
						onTradingVenueChange: handleTradingVenueChangeGuarded,
						onSideChange: onSideChangeWrapper,
						buttonState: buttonStateForUi,
						calculateContractsForMarketOrder: calculateContractsForMarketOrderUi,
						getEffectivePrice: marketOrderHandler.getEffectivePrice,
						maxScopedSellShares,
						sharesLoadingForActiveTab,
						shareBalances: tradeBoxShareBalances,
						dflowUninitAtSubmit,
						predictFunFeeRateBps: predictMarketDetail?.feeRateBps,
					}}
					sorUi={{
						sorRoute,
						sorExecution,
						routePreviewAllowed: debouncedSorRoutePreviewAllowed,
						smartRoutingMarketKey,
						matchedVenues,
						predictVenueBookHints,
						levelUpVenueBookHints,
						matchedMonitor,
						allMarketsSellYesBid,
						allMarketsSellNoBid,
					}}
				/>
			</>
		);
	},
);

PredictionMarketTradeBox.displayName = "PredictionMarketTradeBox";

export default PredictionMarketTradeBox;
