export type SorVenue =
	| "levelup"
	| "polymarket"
	| "dflow"
	| "predictfun"
	| "limitless";
export type SorChain = "base" | "polygon" | "solana" | "bnb";
export type SorOutcome = "A" | "B";
export type SorSide = "buy" | "sell";
export type SorOrderType = "market" | "limit";

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
	/** Limitless (Base) — from SOR server legs */
	limitlessSlug?: string;
	limitlessTokenIdA?: string;
	limitlessTokenIdB?: string;
	limitlessOrderbookSlugA?: string;
	limitlessOrderbookSlugB?: string;
	levelUpQuestionId?: string;
}

export interface RouteLeg {
	venue: SorVenue;
	chain: SorChain;
	outcome: SorOutcome;
	shares: number;
	avgPrice: number;
	/** Kalshi: expected USDC settlement when whole contracts differ from GET /order cap. */
	settlementUsd?: number;
	executionAmountUsd: number;
	fee: number;
	priceImpact: number;
	estimatedTimeSeconds: number;
	bridge: RouteLegBridge | null;
	minSharesAtSlippage: number;
	/** When set by SOR, use as limit price for LevelUp legs (slippage cap). */
	maxPrice?: number;
	/** Sell legs: worst bid used for LevelUp market sells (matches SOR `worstPrice`). */
	minPrice?: number;
	venueMarketIds: VenueMarketIds;
	/** Market (FOK) or limit (GTC/resting) execution for this leg. */
	orderType: SorOrderType;
	/** Limit price as integer cents (1–99). Present iff orderType === "limit". */
	limitPriceCents?: number;
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
	/**
	 * True when a live orderbook snapshot was present at route time. False when
	 * the venue is matched for this market but no ask-side / bid-side depth had
	 * been ingested yet — a transient price-feed gap. The UI should show
	 * "waiting for price feed" rather than "complete setup" in this case.
	 */
	bookAvailable?: boolean;
	/**
	 * True when this venue contributed at least one filled leg to the returned
	 * plan. Lets the UI distinguish "Polymarket is in the route" from
	 * "Polymarket was scanned but dropped".
	 */
	inPlan?: boolean;
}

/** Buy routes: optimal plan includes venues the user cannot execute yet. */
export interface ExecutionShortfall {
	executableTotalShares: number;
	extraSharesIfFullyReady: number;
	venuesBlocking: SorVenue[];
}

/**
 * Optional hint returned on buy routes when bumping the trade size by a small
 * amount would unlock a materially cheaper venue. Advisory only.
 */
export interface SizeSuggestion {
	suggestedAmount: number;
	deltaAmount: number;
	unlockedVenue: SorVenue;
	unlockedEffectivePrice: number;
	currentEffectivePrice: number;
	improvementPct: number;
	reason: string;
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
	sizeSuggestion?: SizeSuggestion;
	/**
	 * Buy: `true` when per-chain balances cover the route legs (server-computed).
	 * `false` when wallet payload empty, zero, or short on a required chain.
	 */
	sufficientFunds?: boolean;
	/**
	 * @deprecated Legacy preview flag from older API. Prefer `sufficientFunds`.
	 */
	theoreticalLiquidity?: boolean;
	/** When set server-side, every leg must use this venue (HMAC-bound). */
	lockedExecutionVenue?: SorVenue;
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
	/** Limitless buy fee bps (optional; server defaults to 300). */
	limitlessFeeRateBps?: number;
	targetVenue?: SorVenue;
	/** Defaults to "market". Limit orders also require targetVenue + limitPriceCents. */
	orderType?: SorOrderType;
	/** Integer cents 1–99 (0.01–0.99 probability). Required for limit orders. */
	limitPriceCents?: number;
	/**
	 * Buy: USDC on the Limitless delegated maker (Base). Separate from `walletBalances`
	 * `base`, which is the smart wallet — keeps LevelUp from inheriting maker spend.
	 */
	limitlessMakerBaseUsdc?: number;
}

export interface RouteResponse {
	success: true;
	route: RoutePlan;
}

/** Mirrors server `SorErrorCode` (subset extended as API grows). */
export type SorErrorCode =
	| "NO_MARKET_FOUND"
	| "NO_VENUES_ELIGIBLE"
	| "NO_BOOKS_AVAILABLE"
	| "ALL_BOOKS_STALE"
	| "AMOUNT_TOO_SMALL"
	| "AMOUNT_TOO_LARGE"
	| "INTERNAL_ERROR"
	| "RATE_LIMITED"
	| "ROUTE_EXPIRED"
	| "INVALID_HMAC"
	| "VALIDATION_ERROR"
	| "WHOLE_SHARES_ONLY"
	| "EXECUTION_NOT_READY"
	| "THEORETICAL_ROUTE_NOT_EXECUTABLE"
	| "INSUFFICIENT_FUNDS";

export interface RouteErrorResponse {
	success: false;
	error: string;
	code: SorErrorCode;
	/** Present on some validation responses (e.g. Kalshi whole-share hint). */
	tone?: "warning" | "error";
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
	/** DFlow only: `true` when POST submit returned `initializedMarket` (init-payer co-sign path). */
	initializedMarket?: boolean;
	/** DFlow: settlement had refund `reverts` while outcome (or USDC on SELL) still delivered. */
	dflowPartialFill?: boolean;
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
	limitless: "Limitless",
};

export const VENUE_COLORS: Record<SorVenue, string> = {
	levelup: "#6366f1",
	polymarket: "#22c55e",
	dflow: "#f59e0b",
	predictfun: "#ec4899",
	limitless: "#94a3b8",
};

const EXEC_SHORTFALL_EPS = 0.01;

function formatShortfallShares(n: number): string {
	return n % 1 === 0 ? String(Math.round(n)) : n.toFixed(1);
}

/** Profile anchor for Kalshi / DFlow Proof KYC (see DflowProofSection). */
export const PROFILE_DFLOW_KYC_HASH = "dflow-kyc";

export type KalshiKycShortfallBannerParts = {
	extraShares: string;
};

/**
 * Buy-route shortfall banner only when Kalshi (dflow) is blocking — Polymarket and
 * other venues do not use this “account setup” message here.
 */
export function getKalshiKycShortfallBannerParts(
	route: RoutePlan
): KalshiKycShortfallBannerParts | null {
	if (route.side !== "buy" || !route.executionShortfall) return null;
	const { extraSharesIfFullyReady, venuesBlocking } = route.executionShortfall;
	if (extraSharesIfFullyReady <= EXEC_SHORTFALL_EPS) return null;
	if (!venuesBlocking.includes("dflow")) return null;

	return {
		extraShares: formatShortfallShares(extraSharesIfFullyReady),
	};
}
