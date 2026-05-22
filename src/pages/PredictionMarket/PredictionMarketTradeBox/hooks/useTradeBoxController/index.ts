import type { MutableRefObject } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { UseSorLegExecutorDeps } from "@/trading/sor/useSorLegExecutor";
import type { AccountWalletGate } from "@/context/accountWallets";
import type { AccountDataVacmSlice } from "@/context/accountWallets";
import type { useAccountData } from "@/context/AccountDataContext";
import type { useCollateralTokens } from "context/CollateralTokenContext";
import type { useUserData } from "context/UserDataContext";
import type { MarketOrderBookPreview } from "../../tradeQuote/types";
import type { TradingVenue } from "../../types";
import type {
	TradeBoxHookSetState,
	TradeBoxHookState,
} from "../useTradeState";
import type { useTradeBoxShareBalances } from "../useTradeBoxShareBalances";
import { useTradeBoxSorFunding, type UseTradeBoxSorFundingArgs } from "./useTradeBoxSorFunding";
import {
	useTradeBoxQuotesLayer,
	type DflowOrderQuoteForSentinel,
	type UseTradeBoxQuotesLayerArgs,
} from "./useTradeBoxQuotesLayer";
import {
	useTradeBoxSorExecutionCore,
	useTradeBoxSorExecuteActions,
} from "./useTradeBoxSorExecution";
import { useTradeBoxVenueSelection } from "./useTradeBoxVenueSelection";
import {
	useTradeBoxTradeButton,
	type UseTradeBoxTradeButtonArgs,
} from "./useTradeBoxTradeButton";

export type { DflowOrderQuoteForSentinel };

export type UseTradeBoxControllerArgs = UseTradeBoxSorFundingArgs &
	Omit<
		UseTradeBoxQuotesLayerArgs,
		| "sorWalletBalances"
		| "sorVenuePositions"
		| "sorVenuePositionsForActiveTab"
		| "maxScopedSellShares"
		| "sorExecutionBusy"
		| "tradeBoxLoading"
	> & {
		setState: TradeBoxHookSetState;
		sorLegExecutorDeps: UseSorLegExecutorDeps;
		fundingGate: AccountWalletGate;
		matchedMonitor: MatchedMarket | null | undefined;
		handleTradingVenueChange: (venue: TradingVenue) => void;
		matchedVenues: Set<string>;
		pandaId: string;
		venueOverride: TradingVenue | undefined;
		multiVenueEnabled: boolean;
		propUmbrellaId: string | undefined;
		account: string | null | undefined;
		refetchMatchedMarkets: () => void;
		handleSorExecuteRef: MutableRefObject<(() => void) | null>;
		accountData: ReturnType<typeof useAccountData>;
		predictPostTradeWallet: string | null | undefined;
		predictShareIdentityCtx: {
			predictFun: { tokenIdA?: string; tokenIdB?: string };
		} | null;
		yesBalance: number;
		noBalance: number;
		getTokenBalance: ReturnType<typeof useUserData>["getTokenBalance"];
		refreshTokenPositions: ReturnType<typeof useUserData>["refreshTokenPositions"];
		refreshOrders: ReturnType<typeof useUserData>["refreshOrders"];
		tradeButton: Omit<
			UseTradeBoxTradeButtonArgs,
			| "tradePreview"
			| "executableRoute"
			| "executableLoading"
			| "executableStale"
			| "executableError"
			| "executableErrorCode"
			| "sorIsExecuting"
			| "sorExecutionPhase"
			| "sorPrefundLegProgress"
			| "sorRouteExpired"
			| "handleSorExecute"
			| "sorVenuePositionsForActiveTab"
			| "totalAvailableCash"
			| "tradingVenue"
		>;
	};

export type UseTradeBoxControllerResult = ReturnType<typeof useTradeBoxController>;

/**
 * Phase A orchestrator: SOR funding, quotes, execution, venue guards, and button state.
 * Venue session setup (Polymarket/Predict/Limitless CLOB) stays in TradeBox.
 */
export function useTradeBoxController(args: UseTradeBoxControllerArgs) {
	const {
		setState,
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
		refetchMatchedMarkets,
		handleSorExecuteRef,
		accountData,
		predictPostTradeWallet,
		predictShareIdentityCtx,
		yesBalance,
		noBalance,
		getTokenBalance,
		refreshTokenPositions,
		refreshOrders,
		tradeButton,
		...fundingAndQuotesArgs
	} = args;

	const sorFunding = useTradeBoxSorFunding({
		venueAddressChainMap: fundingAndQuotesArgs.venueAddressChainMap,
		walletGate: fundingAndQuotesArgs.walletGate,
		collateralTokens: fundingAndQuotesArgs.collateralTokens,
		limitlessMakerCashForSor: fundingAndQuotesArgs.limitlessMakerCashForSor,
		state: fundingAndQuotesArgs.state,
		tradeBoxShareBalances: fundingAndQuotesArgs.tradeBoxShareBalances,
	});

	const { sorExecution } = useTradeBoxSorExecutionCore({ sorLegExecutorDeps });

	const quotes = useTradeBoxQuotesLayer({
		...fundingAndQuotesArgs,
		...sorFunding,
		sorExecutionBusy: sorExecution.isExecuting,
		tradeBoxLoading: fundingAndQuotesArgs.state.isLoading,
	});

	const executeActions = useTradeBoxSorExecuteActions({
		state: fundingAndQuotesArgs.state,
		setState,
		market: fundingAndQuotesArgs.market,
		matchedMonitor,
		sorQuestionId: quotes.sorQuestionId,
		sorExecution,
		executableRoute: quotes.executableRoute,
		executableLoading: quotes.executableLoading,
		executableError: quotes.executableError,
		executableErrorCode: quotes.executableErrorCode,
		venueAddressChainMap: fundingAndQuotesArgs.venueAddressChainMap,
		walletGate: fundingAndQuotesArgs.walletGate,
		accountData,
		collateralTokens: fundingAndQuotesArgs.collateralTokens,
		predictPostTradeWallet,
		predictShareIdentityCtx,
		yesBalance,
		noBalance,
		getTokenBalance,
		refreshTokenPositions,
		refreshOrders,
		refetchMatchedMarkets,
		handleSorExecuteRef,
	});

	const venueSelection = useTradeBoxVenueSelection({
		state: fundingAndQuotesArgs.state,
		setState,
		sorExecutionBusy: sorExecution.isExecuting,
		tradeBoxLoading: fundingAndQuotesArgs.state.isLoading,
		handleTradingVenueChange,
		matchedVenues,
		pandaId,
		venueOverride,
		multiVenueEnabled,
		propUmbrellaId,
		account,
		tradeBoxShareBalances: fundingAndQuotesArgs.tradeBoxShareBalances,
		maxScopedSellShares: sorFunding.maxScopedSellShares,
		sorVenuePositions: sorFunding.sorVenuePositions,
		smartRoutingMarketKey: quotes.smartRoutingMarketKey,
		resetSorExecution: sorExecution.resetExecution,
	});

	const tradeBtn = useTradeBoxTradeButton({
		...tradeButton,
		fundingGate,
		state: fundingAndQuotesArgs.state,
		tradePreview: quotes.tradeQuote.preview,
		executableRoute: quotes.executableRoute,
		executableLoading: quotes.executableLoading,
		executableStale: quotes.executableStale,
		executableError: quotes.executableError,
		executableErrorCode: quotes.executableErrorCode,
		sorIsExecuting: sorExecution.isExecuting,
		sorExecutionPhase: sorExecution.executionPhase,
		sorPrefundLegProgress: sorExecution.prefundLegProgress,
		sorRouteExpired: executeActions.sorRouteExpired,
		handleSorExecute: executeActions.handleSorExecute,
		sorVenuePositionsForActiveTab: sorFunding.sorVenuePositionsForActiveTab,
		totalAvailableCash: sorFunding.totalAvailableCash,
		tradingVenue: fundingAndQuotesArgs.state.tradingVenue,
	});

	return {
		...sorFunding,
		...quotes,
		sorExecution,
		...executeActions,
		...venueSelection,
		buttonState: tradeBtn.buttonState,
		buttonStateForUi: tradeBtn.buttonStateForUi,
		sharesLoadingForActiveTab: tradeBtn.sharesLoadingForActiveTab,
	};
}
