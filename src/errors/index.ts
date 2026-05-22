export type { ErrorDef } from "./types";
export { defineError } from "./types";
export { AppError, isAppError } from "./AppError";

export * from "./catalog/trade-box";
export * from "./catalog/venues";
export * from "./catalog/sor";
export * from "./catalog/lifi";
export * from "./catalog/trade-execution";
export * from "./catalog/admin";

export {
	blockingReasonToMessage,
	blockingReasonsToMessages,
	collectBlockingReasonsFromVenueRequirements,
	executionNotReadyButtonLabel,
	formatExecutionNotReadyUserMessage,
} from "./readinessMessages";

export {
	formatAdminImageUploadFailed,
	formatLifiWithdrawStepFailed,
	formatPolymarketApprovalRepairFailed,
	formatSorNoOrderBookForVenue,
	formatUnknownSorVenue,
	userMessage,
} from "./messages";
export {
	formatErrorForUser,
	formatLifiErrorForUser,
	formatLimitlessDelegatedOrderError,
	formatSorRouteFailureMessage,
	mapDflowOrderError,
	mapPolymarketClobError,
	mapSorApiHttpError,
	throwAppError,
} from "./normalize";
