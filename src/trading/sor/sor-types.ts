export type SorVenue = "levelup" | "polymarket" | "dflow" | "predictfun";
export type SorChain = "base" | "polygon" | "solana" | "bnb";
export type SorOutcome = "A" | "B";
export type SorSide = "buy" | "sell";

export interface ChainBalance {
	chain: SorChain;
	lifiChainId: number;
	balance: number;
	walletAddress: string;
}

export interface VenuePositionEntry {
	venue: SorVenue;
	shares: number;
}

export interface RouteLegBridge {
	fromChain: SorChain;
	toChain: SorChain;
	amount: number;
	estimatedCost: number;
	estimatedTimeSeconds: number;
}

export interface VenueMarketIds {
	venue: SorVenue;
	polyConditionId?: string;
	polyTokenIdA?: string;
	polyTokenIdB?: string;
	polyNegRisk?: boolean;
	polyTickSize?: string;
	dflowTickerA?: string;
	dflowTickerB?: string;
	dflowEventTicker?: string;
	dflowYesMintA?: string;
	dflowYesMintB?: string;
	dflowNoMintA?: string;
	dflowNoMintB?: string;
	predictFunMarketIdA?: string;
	predictFunMarketIdB?: string;
	predictFunDecimalPrecision?: 2 | 3;
	predictFunSingleMarket?: boolean;
	levelUpQuestionId?: string;
}

export interface RouteLeg {
	venue: SorVenue;
	chain: SorChain;
	outcome: SorOutcome;
	shares: number;
	avgPrice: number;
	executionAmountUsd: number;
	fee: number;
	priceImpact: number;
	estimatedTimeSeconds: number;
	bridge: RouteLegBridge | null;
	minSharesAtSlippage: number;
	venueMarketIds: VenueMarketIds;
}

export interface SingleVenueBest {
	venue: SorVenue;
	shares: number;
	totalCost: number;
	effectivePrice: number;
}

export interface VenueRequirements {
	needsClobSession?: boolean;
	needsPredictAuth?: boolean;
	needsProxyWallet?: boolean;
}

export interface RoutePlan {
	routeId: string;
	pandaMatchId: string;
	outcome: SorOutcome;
	side: SorSide;
	requestedAmount: number;
	legs: RouteLeg[];
	totalShares: number;
	totalCost: number;
	totalFees: number;
	totalBridgeCost: number;
	remainder: number;
	singleVenueBest: SingleVenueBest;
	savingsVsSingleVenue: {
		extraShares: number;
		percentImprovement: number;
	};
	estimatedExecutionTimeSeconds: number;
	degraded: boolean;
	insufficientLiquidity: boolean;
	venuesConsidered: SorVenue[];
	venuesExcluded: SorVenue[];
	venueRequirements: Partial<Record<SorVenue, VenueRequirements>>;
	hmac: string;
	expiresAt: number;
	computedInMs: number;
}

export interface RouteRequest {
	questionId: string;
	outcome: SorOutcome;
	side: SorSide;
	amount: number;
	walletBalances?: ChainBalance[];
	venuePositions?: VenuePositionEntry[];
	slippageTolerance?: number;
	polyFeeRate?: number;
	predictFunFeeRateBps?: number;
	targetVenue?: SorVenue;
}

export interface RouteResponse {
	success: true;
	route: RoutePlan;
}

export interface RouteErrorResponse {
	success: false;
	error: string;
	code: string;
}

export type SorRouteResult = RouteResponse | RouteErrorResponse;

export type ExecutionLegStatus =
	| "pending"
	| "bridging"
	| "awaiting_signature"
	| "submitted"
	| "filled"
	| "partial_fill"
	| "failed"
	| "cancelled";

export type RouteExecutionStatus =
	| "created"
	| "executing"
	| "partial"
	| "complete"
	| "failed"
	| "expired"
	| "cancelled"
	| "rerouting"
	| "done";

export interface ExecutionLeg {
	venue: SorVenue;
	status: ExecutionLegStatus;
	shares: number;
	filledShares: number;
	txHash?: string;
	bridgeTxHash?: string;
	error?: string;
	updatedAt: number;
}

export interface RouteExecution {
	routeId: string;
	status: RouteExecutionStatus;
	legs: ExecutionLeg[];
	totalFilledShares: number;
	totalSpent: number;
	createdAt: number;
	updatedAt: number;
	remainingBudget: number;
}

export const CHAIN_LIFI_IDS: Record<SorChain, number> = {
	base: 8453,
	polygon: 137,
	solana: 1151111081099710,
	bnb: 56,
};

export const VENUE_DISPLAY_NAMES: Record<SorVenue, string> = {
	levelup: "LevelUp",
	polymarket: "Polymarket",
	dflow: "DFlow",
	predictfun: "Predict.fun",
};

export const VENUE_COLORS: Record<SorVenue, string> = {
	levelup: "#6366f1",
	polymarket: "#22c55e",
	dflow: "#f59e0b",
	predictfun: "#ec4899",
};
