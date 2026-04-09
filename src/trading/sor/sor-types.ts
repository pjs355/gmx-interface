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
	/** When set by SOR, use as limit price for LevelUp legs (slippage cap). */
	maxPrice?: number;
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
	executionReady?: boolean;
	blockingReasons?: string[];
}

/** Buy routes: optimal plan includes venues the user cannot execute yet. */
export interface ExecutionShortfall {
	executableTotalShares: number;
	extraSharesIfFullyReady: number;
	venuesBlocking: SorVenue[];
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
	executionShortfall?: ExecutionShortfall;
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
	dflow: "Kalshi",
	predictfun: "Predict",
};

export const VENUE_COLORS: Record<SorVenue, string> = {
	levelup: "#6366f1",
	polymarket: "#22c55e",
	dflow: "#f59e0b",
	predictfun: "#ec4899",
};

const EXEC_SHORTFALL_EPS = 0.01;

function formatShortfallShares(n: number): string {
	return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

/** User-facing line for the “missed opportunity” banner (buy + executionShortfall). */
export function getExecutionShortfallBannerText(route: RoutePlan): string | null {
	if (route.side !== "buy" || !route.executionShortfall) return null;
	const { extraSharesIfFullyReady, executableTotalShares, venuesBlocking } =
		route.executionShortfall;
	if (extraSharesIfFullyReady <= EXEC_SHORTFALL_EPS) return null;

	const plus = formatShortfallShares(extraSharesIfFullyReady);
	const today = formatShortfallShares(executableTotalShares);

	const onlyDflow =
		venuesBlocking.length === 1 && venuesBlocking[0] === "dflow";
	const setupLead = onlyDflow
		? "Complete Kalshi (DFlow) verification"
		: venuesBlocking.length > 0
			? `Complete setup on ${venuesBlocking.map((v) => VENUE_DISPLAY_NAMES[v]).join(", ")}`
			: "Complete venue setup";

	return `${setupLead} to unlock about +${plus} more shares on this route. With your connected venues you’d get about ${today} shares today.`;
}
