import { useMemo } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type {
	ChainBalance,
	RoutePlan,
	SorOutcome,
	SorVenue,
	VenuePositionEntry,
} from "@/trading/sor";
import { parseLimitPriceCents } from "@/trading/sor";
import type { UseSorRouteResult } from "@/trading/sor/core/useSorRoute";
import {
	SOR_MIN_LIMIT_ORDER_USD,
	SOR_MIN_MARKET_BUY_USD,
	SOR_MIN_MARKET_SELL_SHARES,
} from "@/trading/sor";
import { getMarketId } from "@/pages/PredictionMarket/utils";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MarketOrderBookPreview, TradeQuote } from "../../tradeQuote/types";
import { useTradeQuote } from "../../tradeQuote/useTradeQuote";
import type { TradeBoxHookState } from "../useTradeState";
import { LIMITLESS_DEFAULT_FEE_RATE_BPS } from "../../feeLimitless";
import { deriveSorRouteAmountFromInput } from "../deriveSorRouteAmount";
import { useTradeBoxQuotes } from "../useTradeBoxQuotes";

export type UseTradeBoxQuotesLayerArgs = {
	state: TradeBoxHookState;
	market: PredictionMarket;
	bookPreview: MarketOrderBookPreview;
	dflowLink: { yesMintA?: string; yesMintB?: string } | undefined;
	sorWalletBalances: ChainBalance[];
	sorVenuePositions: VenuePositionEntry[] | undefined;
	sorVenuePositionsForActiveTab: VenuePositionEntry[];
	limitlessMakerCashForSor: number | undefined;
	predictFunFeeRateBps: number | undefined;
	maxScopedSellShares: number;
	sorExecutionBusy: boolean;
	tradeBoxLoading: boolean;
};

export type UseTradeBoxQuotesLayerResult = {
	tradeQuote: TradeQuote;
	bookPreview: MarketOrderBookPreview;
	sorRoute: UseSorRouteResult;
	sorQuestionId: string | undefined;
	executableRoute: RoutePlan | null;
	executableLoading: boolean;
	executableStale: boolean;
	executableError: string | null;
	executableErrorCode: UseSorRouteResult["displayErrorCode"];
	debouncedSorRoutePreviewAllowed: boolean;
	smartRoutingMarketKey: string;
	debouncedQuoteAmount: string;
};

/** Debounced SOR quotes and merged `TradeQuote` for display. */
export function useTradeBoxQuotesLayer(
	args: UseTradeBoxQuotesLayerArgs,
): UseTradeBoxQuotesLayerResult {
	const {
		state,
		market,
		bookPreview,
		dflowLink,
		sorWalletBalances,
		sorVenuePositions,
		sorVenuePositionsForActiveTab,
		limitlessMakerCashForSor,
		predictFunFeeRateBps,
		maxScopedSellShares,
		sorExecutionBusy,
		tradeBoxLoading,
	} = args;

	const sorLimitPriceCents: number | undefined =
		state.orderType === "limit" ? parseLimitPriceCents(state.price) : undefined;

	const sorAmountUsd = useMemo(
		() =>
			deriveSorRouteAmountFromInput({
				amount: state.amount,
				side: state.side,
				orderType: state.orderType,
				limitPriceCents: sorLimitPriceCents,
				maxScopedSellShares,
			}),
		[
			state.amount,
			state.side,
			state.orderType,
			sorLimitPriceCents,
			maxScopedSellShares,
		],
	);

	const sorAmountMeetsFloor = useMemo(() => {
		if (sorAmountUsd <= 0) return false;
		if (state.orderType === "limit") {
			return sorAmountUsd + 1e-9 >= SOR_MIN_LIMIT_ORDER_USD;
		}
		if (state.side === "buy") {
			return sorAmountUsd + 1e-9 >= SOR_MIN_MARKET_BUY_USD;
		}
		const sharesIn = Number.parseFloat(state.amount);
		return (
			Number.isFinite(sharesIn) &&
			sharesIn + 1e-9 >= SOR_MIN_MARKET_SELL_SHARES
		);
	}, [sorAmountUsd, state.orderType, state.side, state.amount]);

	const debouncedSorRoutePreviewAllowed = useDebouncedValue(
		sorAmountMeetsFloor,
		350,
	);

	const smartRoutingMarketKey = useMemo(
		() => getMarketId(market).trim(),
		[market],
	);

	const sorQuestionId = useMemo(
		() => getMarketId(market) || undefined,
		[market],
	);

	const sorRouteEnabled =
		!!state.selectedPosition &&
		sorAmountMeetsFloor &&
		(state.orderType !== "limit" ||
			(state.tradingVenue !== "all" &&
				state.tradingVenue !== "dflow" &&
				sorLimitPriceCents != null)) &&
		(state.side === "buy" ? true : sorVenuePositionsForActiveTab.length > 0);

	const sorRouteOutcome: SorOutcome | undefined = state.selectedPosition
		? state.selectedPosition === "yes"
			? "A"
			: "B"
		: undefined;

	const sorTargetVenue: SorVenue | undefined =
		state.tradingVenue !== "all" ? state.tradingVenue : undefined;

	const tradeBoxQuotes = useTradeBoxQuotes({
		amount: state.amount,
		side: state.side,
		orderType: state.orderType,
		limitPriceCents: sorLimitPriceCents,
		maxScopedSellShares,
		sorRoute: {
			questionId: sorQuestionId,
			outcome: sorRouteOutcome,
			side: state.side,
			walletBalances:
				sorWalletBalances.length > 0 ? sorWalletBalances : undefined,
			...(state.side === "buy" &&
			limitlessMakerCashForSor != null &&
			Number.isFinite(limitlessMakerCashForSor)
				? { limitlessMakerBaseUsdc: Math.max(0, limitlessMakerCashForSor) }
				: {}),
			...(state.side === "buy"
				? { limitlessFeeRateBps: LIMITLESS_DEFAULT_FEE_RATE_BPS }
				: {}),
			venuePositions: state.side === "sell" ? sorVenuePositions : undefined,
			enabled: sorRouteEnabled,
			polyFeeRate: 0.03,
			predictFunFeeRateBps,
			targetVenue: sorTargetVenue,
			orderType: state.orderType,
			limitPriceCents: sorLimitPriceCents,
			suspendBackgroundRefetch: sorExecutionBusy || tradeBoxLoading,
		},
		includeDflowPondQuote:
			state.orderType === "market" &&
			Boolean(dflowLink) &&
			(state.tradingVenue === "dflow" || state.tradingVenue === "all"),
	});

	const { sorRoute, debouncedAmount: debouncedQuoteAmount } = tradeBoxQuotes;

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
		state.tradingVenue === "all"
			? sorRoute.displayLoading
			: sorRoute.executionLoading;
	const executableStale =
		state.tradingVenue === "all"
			? sorRoute.displayStale
			: sorRoute.executionStale;
	const executableError =
		state.tradingVenue === "all"
			? sorRoute.displayError
			: sorRoute.executionError;
	const executableErrorCode =
		state.tradingVenue === "all"
			? sorRoute.displayErrorCode
			: sorRoute.executionErrorCode;

	const tradeQuoteBase = useTradeQuote({
		tradingVenue: state.tradingVenue,
		side: state.side,
		orderType: state.orderType,
		amount: state.amount,
		executionRoute: executableRoute,
		bookPreview,
		predictFunFeeRateBps,
	});

	const tradeQuote = tradeQuoteBase;

	return {
		tradeQuote,
		bookPreview,
		sorRoute,
		sorQuestionId,
		executableRoute,
		executableLoading,
		executableStale,
		executableError,
		executableErrorCode,
		debouncedSorRoutePreviewAllowed,
		smartRoutingMarketKey,
		debouncedQuoteAmount,
	};
}
