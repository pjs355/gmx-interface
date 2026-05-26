/**
 * Primary trade button label, disabled state, and click handler.
 *
 * Delegates to `useButtonState` / `resolveButtonState` using venue `*Trading`
 * snapshots from wiring. Sub-hook of `useTradeBoxController`.
 */
import { useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { RoutePlan, SorExecutionPhase, SorPrefundLegProgress } from "@/features/trading/sor";
import type { resolveButtonState } from "../venueButtonState/resolveButtonState";
import type { AccountWalletGate } from "@/context/accountWallets";
import { useButtonState } from "../useButtonState";
import type { TradePreviewFields } from "@/features/trading/trade-preview/types";
import type { TradeBoxHookState } from "../useTradeState";

export type UseTradeBoxTradeButtonArgs = {
	authenticated: boolean;
	account: string | null | undefined;
	fundingGate: AccountWalletGate;
	state: TradeBoxHookState;
	tradePreview: TradePreviewFields;
	login: () => void;
	marketOrderHandler: Parameters<typeof useButtonState>[0]["marketOrderHandler"];
	usdcBalance: number;
	yesBalance: number;
	noBalance: number;
	checkSufficientBalance: Parameters<typeof resolveButtonState>[0]["checkSufficientBalance"];
	checkSufficientShares: Parameters<typeof resolveButtonState>[0]["checkSufficientShares"];
	market: PredictionMarket;
	handleAddFunds: () => void | Promise<void>;
	polymarketTrading: Parameters<typeof useButtonState>[0]["polymarketTrading"];
	orderbookWalkPosition: Parameters<typeof useButtonState>[0]["orderbookWalkPosition"];
	predictTrading: Parameters<typeof useButtonState>[0]["predictTrading"];
	limitlessTrading: Parameters<typeof useButtonState>[0]["limitlessTrading"];
	dflowProofVerified: boolean;
	dflowProofLoading: boolean;
	dflowStartProofFlow: () => void | Promise<void>;
	sorMatchedVenues: Set<string>;
	executableRoute: RoutePlan | null;
	executableLoading: boolean;
	executableStale: boolean;
	executableError: string | null;
	executableErrorCode: string | null | undefined;
	sorIsExecuting: boolean;
	sorExecutionPhase?: SorExecutionPhase;
	sorPrefundLegProgress?: SorPrefundLegProgress | null;
	sorRouteExpired: boolean;
	handleSorExecute: () => void;
	sorVenuePositionsForActiveTab?: { venue: string; shares: number }[];
	totalAvailableCash: number;
	executionGateBlocked: boolean;
	tradingVenue: TradeBoxHookState["tradingVenue"];
	propUmbrellaId: string | undefined;
	tradeBoxShareBalancesSellTotal: number;
	tradeBoxShareBalancesLoading: boolean;
};

export type UseTradeBoxTradeButtonResult = {
	buttonState: ReturnType<typeof useButtonState>;
	buttonStateForUi: ReturnType<typeof useButtonState>;
	sharesLoadingForActiveTab: boolean;
};

export function useTradeBoxTradeButton(
	args: UseTradeBoxTradeButtonArgs,
): UseTradeBoxTradeButtonResult {
	const {
		authenticated,
		account,
		fundingGate,
		state,
		tradePreview,
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
		dflowProofVerified,
		dflowProofLoading,
		dflowStartProofFlow,
		sorMatchedVenues,
		executableRoute,
		executableLoading,
		executableStale,
		executableError,
		executableErrorCode,
		sorIsExecuting,
		sorExecutionPhase,
		sorPrefundLegProgress,
		sorRouteExpired,
		handleSorExecute,
		sorVenuePositionsForActiveTab,
		totalAvailableCash,
		executionGateBlocked,
		tradingVenue,
		propUmbrellaId,
		tradeBoxShareBalancesSellTotal,
		tradeBoxShareBalancesLoading,
	} = args;

	const buttonState = useButtonState({
		authenticated,
		account,
		fundingGate,
		state,
		tradePreview,
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
		dflowProofVerified,
		dflowProofLoading,
		dflowStartProofFlow,
		sorMatchedVenues,
		sorState: {
			route: executableRoute,
			isLoading: executableLoading,
			isStale: executableStale,
			error: executableError,
			routeErrorCode: executableErrorCode,
			isExecuting: sorIsExecuting,
			executionPhase: sorExecutionPhase,
			prefundLegProgress: sorPrefundLegProgress,
			routeExpired: sorRouteExpired,
			handleExecute: handleSorExecute,
			venuePositions: sorVenuePositionsForActiveTab,
			totalAvailableCash,
			handleAddFunds,
		},
	});

	const buttonStateForUi = useMemo(() => {
		if (tradingVenue === "levelup" && executionGateBlocked) {
			return {
				...buttonState,
				text: "Complete trading setup",
				disabled: true,
				onClick: () => {},
				depositShortfallUsd: undefined,
			};
		}
		return buttonState;
	}, [executionGateBlocked, buttonState, tradingVenue]);

	const sharesLoadingForActiveTab = useMemo(() => {
		if (!authenticated || !propUmbrellaId) return false;
		if (tradeBoxShareBalancesSellTotal > 0) return false;
		return tradeBoxShareBalancesLoading;
	}, [authenticated, propUmbrellaId, tradeBoxShareBalancesSellTotal, tradeBoxShareBalancesLoading]);

	return {
		buttonState,
		buttonStateForUi,
		sharesLoadingForActiveTab,
	};
}
