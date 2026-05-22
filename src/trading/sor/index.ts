export { useSorRoute } from "./core/useSorRoute";
export type { UseSorRouteInput, UseSorRouteResult } from "./core/useSorRoute";

export { useSorExecution } from "./core/useSorExecution";
export type {
	UseSorExecutionInput,
	UseSorExecutionResult,
	LegExecutor,
	BridgeExecutor,
	SorExecutionPhase,
	SorPrefundLegProgress,
	SorLegRouteContext,
} from "./core/useSorExecution";

export { useSorLegExecutor } from "./core/useSorLegExecutor";
export type { UseSorLegExecutorDeps } from "./core/useSorLegExecutor";

export { SorKalshiKycShortfallBanner } from "./core/SorKalshiKycShortfallBanner";
export { SorTransientRouteErrorText } from "./core/SorTransientRouteErrorText";

export { buildChainBalances } from "./core/buildChainBalances";

export { createSorApiClient } from "./core/sor-api";
export type { SorApiClient } from "./core/sor-api";

export type {
	SorVenue,
	SorChain,
	SorOutcome,
	SorSide,
	SorErrorCode,
	ChainBalance,
	VenuePositionEntry,
	RoutePlan,
	RouteLeg,
	RouteRequest,
	SorDflowPondQuote,
	RouteExecution,
	ExecutionLeg,
	ExecutionLegStatus,
	RouteExecutionStatus,
	VenueMarketIds,
	VenueRoutePreview,
	VenueRoutePreviewBuy,
	VenueRoutePreviewSellOk,
	VenueRoutePreviewSellFail,
	VenueRoutePreviewQuoteKind,
} from "./core/sor-types";

export {
	CHAIN_LIFI_IDS,
	VENUE_DISPLAY_NAMES,
	VENUE_COLORS,
	getKalshiKycShortfallBannerParts,
	PROFILE_DFLOW_KYC_HASH,
} from "./core/sor-types";
export type { KalshiKycShortfallBannerParts } from "./core/sor-types";

export {
	validateLegMinimum,
	routeFailsVenueMinimums,
	rawInputBelowVenueMinimum,
	checkRawInputAgainstVenueMinimum,
	aggregateMinThresholds,
	predictRawInputBelowProtocolMinimum,
	parseLimitPriceCents,
	probabilityToLimitPriceCentsString,
	PREDICT_MIN_BUY_USD,
	PREDICT_MIN_SHARES,
	SOR_MIN_MARKET_BUY_USD,
	SOR_MIN_LIMIT_ORDER_USD,
	SOR_MIN_MARKET_SELL_SHARES,
	SOR_FLOOR_MESSAGES,
} from "./route/sorPreflight";
export type { BelowMinReason } from "./route/sorPreflight";

export {
	sorChainDisplayName,
	formatSorUsd2,
	formatToWinUsdDisplay,
	formatSorDetailsSharesDisplay,
	formatSorFeeUsdDisplay,
	formatSorUsdRounded2,
	formatSorBuyCostUsdDisplay,
	formatSorSellProceedsUsdDisplay,
	formatSorLegAvgForDisplay,
	derivedBridgeUsdForDisplay,
	buildFundsTransferTooltip,
	getSorLifiTransferFeeRowState,
	getSorBuyCashShortfall,
} from "./route/sorUiUtils";
export type { SorBuyCashShortfall, SorCashGateInput } from "./route/sorUiUtils";

export {
	usdAmountMatchesRoute,
	shareAmountMatchesRoute,
	positionToSorOutcome,
	routeMatchesTradeContext,
	isOmnibusDisplayMetricsTrusted,
	isExecutionOverlayRowTrusted,
	venueBuyPreviewMatchesContext,
	venueSellPreviewMatchesContext,
	executionRouteTrustedForSingleVenueMarketBuy,
	executionRoutePendingForToWinOverlay,
	executionRouteTrustedForSingleVenueMarketSell,
} from "./route/sorQuoteTrust";
export type { SorTradeTrustContext } from "./route/sorQuoteTrust";

export {
	sorBuyPredictLegNetHeldShares,
	sorBuyNetHeldTotalSharesFromLegs,
} from "./core/sorPredictNetHeldDisplay";
