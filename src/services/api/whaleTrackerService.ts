import { getPredictionApiBaseUrl } from "@/config/predictionApiBase";

/**
 * Public client for the predictions-api whale-tracker endpoints.
 * No auth — these endpoints are intentionally public for the slice.
 */

export type TraderLeaderboardType =
	| "biggest-bettors"
	/** Locked-in realised PnL only. NOT paper gains. */
	| "top-winners"
	| "top-losers"
	/** Live open-position marks — "who's sitting on paper gains/losses". */
	| "top-unrealized-winners"
	| "top-unrealized-losers"
	| "top-roi"
	| "top-predictors"
	| "most-active-30d";

export type TraderSportFilter =
	| "all"
	| "soccer"
	| "baseball"
	| "basketball"
	| "football"
	| "hockey"
	| "tennis"
	| "mma"
	| "golf"
	| "racing"
	| "cricket"
	| "esports_cs"
	| "esports_valorant"
	| "esports_lol"
	| "esports_dota"
	| "esports";

export type TraderStatsConfidence = "high" | "medium" | "low";

/**
 * Copy-trader-friendly taxonomy of wallets.
 *   - `trader`: real people who buy with intent, mostly hold to resolution
 *   - `churner`: real people who trade in-and-out (still worth watching)
 *   - `bot`: market makers / wash traders / high-frequency systems
 *   - `unclassified`: not enough activity to call
 *   - `all`: no filter — show every active wallet
 */
export type TraderCategory =
	| "trader"
	| "churner"
	| "bot"
	| "unclassified"
	| "all";

/**
 * Copy-trading strategy archetype — "what am I signing up for if I copy
 * this account". Grounded in a fill-level audit of the top whales:
 * the biggest winners place FEW massive positions accumulated via
 * hundreds of sliced fills in a tight price band over 10–160 minutes,
 * then hold to resolution. Fill counts measure execution style;
 * POSITIONS measure strategy — every archetype below is defined on
 * positions and dollars.
 *
 *   position_holder    — few decisions/day, held to resolution. Includes
 *     the conviction whales: sliced accumulation gives a copier a
 *     minutes-long window (see avgEntryWindowMins) to join at ~the same
 *     price. The stable copy target.
 *   grinder            — many small positions per day, held to
 *     resolution. Often outstanding settled records, but faithful
 *     copying needs automation — too many decisions to mirror by hand.
 *   swing_trader       — exits most dollars before resolution; a copier
 *     must time exits too, not just entries.
 *   inventory_balancer — meaningful dollars on BOTH sides of the same
 *     book. The net book is the strategy; one side alone loses. The only
 *     structurally un-copyable archetype.
 *   mixed              — not enough settled sample to call.
 */
export type TraderCopyStrategy =
	| "position_holder"
	| "grinder"
	| "swing_trader"
	| "inventory_balancer"
	| "mixed";

/** easy = mirror faithfully · medium = expect slippage/timing/automation gaps · hard = strategy can't be mirrored */
export type TraderCopyDifficulty = "easy" | "medium" | "hard";

export interface TraderLeaderboardEntry {
	rank: number;
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	bets: number;
	winRate: number;
	/** Sample-adjusted win rate. Use for discovery ranking, not raw winRate. */
	winRateWilsonLower?: number;
	volumeUsd: number;
	/**
	 * **Realised PnL only.** Money the wallet has actually locked in via
	 * sells or redemptions. NOT paper gains on open positions. This is
	 * the honest "who has made money" number.
	 */
	pnlUsd: number;
	/**
	 * Open-position mark. The current value of positions the wallet is
	 * still holding, marked to book mid. Distinct from `pnlUsd` — never
	 * combine at the display layer.
	 */
	unrealizedPnlUsd: number;
	/**
	 * `pnlUsd / volumeUsd`. Realised-only ROI. Positive = profit,
	 * negative = loss. Sample-gated on `top-roi` (≥10 bets, ≥$1k vol).
	 */
	roiPct: number;
	statsConfidence: TraderStatsConfidence;
	currentWinStreak?: number;
	longestWinStreak?: number;
	traderCategory?: TraderCategory;
	/** Copy-trading archetype — badge this. See TraderCopyStrategy. */
	copyStrategy?: TraderCopyStrategy;
	/** easy 🟢 / medium 🟡 / hard 🔴 copy-risk flag. */
	copyDifficulty?: TraderCopyDifficulty;
	/** Volume-weighted avg entry price (0-1) — where on the odds curve they buy. */
	avgBuyPrice?: number;
	/**
	 * 0–100 FOMO-style copy rank. edge 40 (Wilson position win rate 25 +
	 * settled ROI 15) + copyability 30 (easy 30/medium 18/hard 5) +
	 * sample 15 (settled positions vs 50) + consistency 15 (active days
	 * vs 30 + positive realized PnL). Sort "who should I copy" by this.
	 */
	copyScore?: number;
	/** Total buy cost / distinct positions — the conviction unit ($). */
	avgPositionSizeUsd?: number;
	/** Mean minutes a multi-fill position takes to build = the copier's join window. */
	avgEntryWindowMins?: number;
	/** Independent decisions per active day (positions, NOT fills). */
	positionsPerActiveDay?: number;
	/** Dollar-weighted share of closed cost basis held to resolution. */
	pctDollarsHeldToSettlement?: number;
	/** Settled POSITIONS won/lost (lots grouped by market+outcome — the honest record). */
	settledPositionsWon?: number;
	settledPositionsLost?: number;
	/** settledPositionsWon / (won + lost). Show THIS, not lot-based winRate. */
	positionWinRate?: number;
	/** Total settled predictions the wallet won. Powers "real winners" filter. */
	totalRedemptionWins?: number;
	/** `wins / (wins + losses)` on settled positions only. Purest predictive signal. */
	predictionAccuracy?: number;
}

export interface TraderLeaderboardResponse {
	type: TraderLeaderboardType;
	sport: TraderSportFilter;
	category: TraderCategory;
	entries: TraderLeaderboardEntry[];
}

/**
 * Single-shot dashboard payload — one HTTP call returns every leaderboard
 * section the Traders page needs. Backed by a 10-min in-memory cache on
 * the API side so repeat requests are near-instant.
 */
export interface TraderDashboardResponse {
	sport: TraderSportFilter;
	category: TraderCategory;
	biggestBettors: TraderLeaderboardEntry[];
	topWinners: TraderLeaderboardEntry[];
	biggestLosers: TraderLeaderboardEntry[];
}

export interface TraderPeriodStats {
	bets: number;
	volumeUsd: number;
	realizedPnlUsd: number;
	winRate: number;
}

export interface TraderPerSportStats {
	sport: string;
	bets: number;
	volumeUsd: number;
	realizedPnlUsd: number;
	unrealizedPnlUsd: number;
	winRate: number;
	avgBetSizeUsd: number;
	largestWinUsd: number;
	largestLossUsd: number;
	openPositionsCount: number;
	lastBetAt?: string;
}

export interface TraderPerTeamStats {
	team: string;
	sport?: string;
	bets: number;
	volumeUsd: number;
	realizedPnlUsd: number;
	winRate: number;
	betsForTeam: number;
	betsAgainstTeam: number;
	pnlForTeamUsd: number;
	pnlAgainstTeamUsd: number;
	lastBetAt?: string;
}

/** Standout single trade — surfaces in Biggest Wins / Biggest Losses. */
export interface TraderTradeHighlight {
	conditionId: string;
	marketTitle?: string;
	sport: string;
	league?: string | null;
	teams?: string[];
	outcome: "yes" | "no";
	pnlUsd: number;
	shares: number;
	buyPrice: number;
	sellPrice: number;
	closedAt: string;
	closeSource: "polymarket_data_api" | "polymarket_redemption" | "polymarket_resolution";
}

/** A position the wallet is holding right now — "what are they riding?". */
export interface TraderOpenPosition {
	conditionId: string;
	marketTitle?: string;
	sport: string;
	league?: string | null;
	teams?: string[];
	outcome: "yes" | "no";
	/** Named side from the market's outcomes (e.g. "Sharks"). Absent when the market is a plain Yes/No. */
	outcomeLabel?: string;
	shares: number;
	costUsd: number;
	avgEntryPrice: number;
	currentMarkPrice?: number;
	currentValueUsd?: number;
	unrealizedPnlUsd?: number;
	firstEnteredAt?: string;
	lastEnteredAt?: string;
}

export interface TraderProfile {
	wallet: string;
	polymarketUsername?: string;
	/** Polymarket-hosted avatar URL — pipe straight into `<img src>`. */
	profileImageUrl?: string;
	displayName: string;
	firstSportsBetAt?: string;
	lastSportsBetAt?: string;

	totalSportsBets: number;
	totalSportsVolumeUsd: number;
	totalSportsRealizedPnlUsd: number;
	totalSportsUnrealizedPnlUsd: number;
	totalSportsPnlUsd: number;
	sportsWinRate: number;
	sportsRoi: number;
	avgSportsBetSizeUsd: number;
	largestSportsWinUsd: number;
	largestSportsLossUsd: number;
	openSportsPositionsCount: number;
	openSportsPositionsValueUsd: number;

	perSport: TraderPerSportStats[];
	/** Trimmed server-side to the top teams by bets — see `perTeamCount`. */
	perTeam: TraderPerTeamStats[];
	/** Full tracked-team count before the server trims `perTeam`. */
	perTeamCount?: number;

	last7d: TraderPeriodStats;
	last30d: TraderPeriodStats;
	last90d: TraderPeriodStats;

	isActive: boolean;
	isMarketMaker: boolean;
	isWashTrader: boolean;
	statsConfidence: TraderStatsConfidence;

	// v3 fields — streak, best/worst single trade, live positions, quality signals
	/** Consecutive redemption wins (held-to-end predictions). See HotStreakRow. */
	currentWinStreak?: number;
	longestWinStreak?: number;
	totalRedemptionWins?: number;
	totalRedemptionLosses?: number;
	predictionAccuracy?: number;
	bestSingleWinUsd?: number;
	worstSingleLossUsd?: number;
	topClosedWins?: TraderTradeHighlight[];
	topClosedLosses?: TraderTradeHighlight[];
	currentOpenPositions?: TraderOpenPosition[];
	tradesPerActiveDay?: number;
	winRateWilsonLower?: number;
	traderQualityScore?: number;
	traderCategory?: TraderCategory;
	botIsProfitable?: boolean;

	// v4/v5 copy-trading classification + position-level mechanics
	copyStrategy?: TraderCopyStrategy;
	copyDifficulty?: TraderCopyDifficulty;
	/** Volume-weighted avg entry price (0-1). */
	avgBuyPrice?: number;
	/** 0–100 copy rank — see TraderLeaderboardEntry.copyScore. */
	copyScore?: number;
	activeDays?: number;
	positionsPerActiveDay?: number;
	avgPositionSizeUsd?: number;
	avgEntryWindowMins?: number;
	pctDollarsHeldToSettlement?: number;
	/** Share of buy dollars two-sided on the same market (inventory balancing). */
	pctTwoSidedDollars?: number;
	settledPositionsWon?: number;
	settledPositionsLost?: number;
	positionWinRate?: number;

	lastBuiltAt?: string;
}

export interface TraderBet {
	betId: string;
	wallet: string;
	conditionId: string;
	marketTitle?: string;
	sport: string;
	league?: string | null;
	teams: string[];
	marketType: string;
	outcome: "yes" | "no";
	side: "buy" | "sell";
	shares: number;
	price: number;
	costUsd: number;
	placedAt: string;
	txHash?: string;
}

// ---- time windows (industry-standard leaderboard filter) ----

export type TraderWindow = "today" | "week" | "month" | "90d" | "all";

/**
 * Metric selector for the unified ranked leaderboard endpoint. Every row
 * still exposes `pnlUsd`, `roiPct`, AND `volumeUsd` — this only changes
 * which one the backend sorts by. Render the picked metric as the
 * headline column and the other two as secondary labels.
 *
 *   pnl    — locked-in realised PnL (NOT paper gains)
 *   roi    — realised PnL / volume, sample-size gated (≥10 bets, ≥$1k vol)
 *   volume — total capital deployed
 */
export type TraderMetric = "pnl" | "roi" | "volume";

/**
 * Payload of the unified metric×window endpoint. One flat list of
 * ranked wallets, each row has all three metrics populated so a UI
 * metric-tab swap is a pure re-sort at display time (no re-fetch needed
 * if the UI wants to prefetch all three at once).
 */
export interface RankedLeaderboardResponse {
	metric: TraderMetric;
	window: TraderWindow;
	sport: TraderSportFilter;
	category: TraderCategory;
	entries: TraderLeaderboardEntry[];
}

// ---- combos (Polymarket multi-leg parlays) ----

export type ComboStatus = "OPEN" | "PARTIAL" | "RESOLVED_WIN" | "RESOLVED_LOSS";

/**
 * One leg inside a combo — a specific market outcome that has to hit for
 * the combo to resolve WIN. `leg_status` tracks per-leg resolution so we
 * can show "3 of 5 legs settled" progress bars.
 */
export interface ComboLeg {
	legIndex: number;
	legPositionId: string;
	legConditionId: string;
	legOutcomeIndex: number;
	legOutcomeLabel: string;
	legStatus: string;
	legResolvedAt?: string;
	legCurrentPrice: number;
	/** Last live price snapshot — see ComboLegSummary.legLastLivePrice. */
	legLastLivePrice?: number;
	marketId?: string;
	marketSlug?: string;
	marketTitle?: string;
	marketImageUrl?: string;
	marketCategory?: string;
	marketSubcategory?: string;
	marketEndDate?: string;
	marketTags?: string[];
	eventId?: string;
	eventTitle?: string;
}

export interface ComboMarketRow {
	conditionId: string;
	title: string;
	slug: string;
	image?: string;
	outcomes: string[];
	outcomePrices: number[];
	volume: number;
	sport: string;
	league?: string | null;
	teams: string[];
}

export interface ComboPositionRow {
	positionId: string;
	wallet: string;
	comboConditionId: string;
	moduleId?: number;
	sharesBalance: number;
	entryAvgPriceUsdc: number;
	entryCostUsdc: number;
	realizedPayoutUsdc: number;
	totalCostUsdc: number;
	pnlUsd?: number;
	status: ComboStatus;
	firstEnteredAt?: string;
	resolvedAt?: string;
	legsTotal: number;
	legsResolved: number;
	legsPending: number;
	legs: ComboLeg[];
	comboTitle?: string;
	comboSlug?: string;
	comboImageUrl?: string;
	sport?: string;
	league?: string | null;
	/**
	 * Sports of each leg's underlying market (deduped). A combo "includes
	 * soccer" when this contains it OR the combo itself classified to it.
	 */
	legSports?: string[];
}

export type ComboLeaderboardType =
	| "combo-biggest-bettors"
	| "combo-top-winners"
	| "combo-biggest-losers"
	| "combo-top-roi"
	| "combo-most-active";

/**
 * Wallet-aggregated combo stats — one row per wallet, rolled up across
 * every combo they've ever taken (or in the current window). Drives the
 * "biggest combo bettors / top combo winners / biggest combo losers"
 * leaderboards.
 */
export interface ComboLeaderboardEntry {
	rank: number;
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	totalCombos: number;
	resolvedCombos: number;
	openCombos: number;
	wonCombos: number;
	lostCombos: number;
	/** wonCombos / (wonCombos + lostCombos). 0-1. */
	winRate: number;
	totalCostUsd: number;
	totalPnlUsd: number;
	/**
	 * `totalPnlUsd / totalCostUsd`. Percent return on capital deployed
	 * across all this wallet's combos in the window. Sample-size gated
	 * on the `combo-top-roi` board (default: ≥5 combos, ≥$500 cost).
	 */
	roiPct: number;
	biggestSingleWinUsd: number;
	/** Negative number — biggest single combo loss. */
	biggestSingleLossUsd: number;
	firstComboAt?: string;
	lastComboAt?: string;
}

/**
 * One-shot combo dashboard — three wallet-aggregated boards in a single
 * HTTP call. Server-side 10-min cache; use for the "Combos" tab of the
 * Traders page.
 */
export interface ComboDashboardResponse {
	sport: TraderSportFilter;
	window: TraderWindow;
	comboBiggestBettors: ComboLeaderboardEntry[];
	comboTopWinners: ComboLeaderboardEntry[];
	comboBiggestLosers: ComboLeaderboardEntry[];
}

/**
 * Trimmed per-leg payload on combo feed rows (live + won). Enough to
 * render a parlay-ticket breakdown: outcome side, settled/pending state,
 * the leg's market price (= odds), and what market it's on.
 *
 * `legStatus`: "OPEN" while pending, "RESOLVED_WIN" / "RESOLVED_LOSS"
 * once settled (raw Polymarket values). Settled legs collapse
 * `legCurrentPrice` to 1 / 0 — show won/lost instead of a price there.
 */
export interface ComboLegSummary {
	legIndex: number;
	legOutcomeLabel: string;
	legStatus: string;
	legCurrentPrice: number;
	/**
	 * Last price seen while the leg was still live — the leg's real odds
	 * once `legCurrentPrice` collapses to 0/1 at settlement. Absent when
	 * the combo resolved before ingest ever saw it live.
	 */
	legLastLivePrice?: number;
	marketTitle?: string;
	eventTitle?: string;
}

export interface ComboHighlightRow {
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	positionId: string;
	comboConditionId: string;
	comboTitle?: string;
	comboSlug?: string;
	comboImageUrl?: string;
	sport?: string;
	league?: string | null;
	status: ComboStatus;
	legsTotal: number;
	legsResolved: number;
	totalCostUsdc: number;
	realizedPayoutUsdc: number;
	pnlUsd: number;
	firstEnteredAt?: string;
	resolvedAt?: string;
	/** Absent on responses cached before the API started sending legs. */
	legs?: ComboLegSummary[];
}

/** A combo still riding — stake in, payout pending every remaining leg. */
export interface LiveComboRow {
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	positionId: string;
	comboConditionId: string;
	comboTitle?: string;
	comboSlug?: string;
	comboImageUrl?: string;
	sport?: string;
	league?: string | null;
	status: ComboStatus;
	legsTotal: number;
	legsResolved: number;
	totalCostUsdc: number;
	/** Payout if every remaining leg hits ($1/share). */
	sharesBalance: number;
	potentialPayoutUsdc: number;
	firstEnteredAt?: string;
	/** Absent on responses cached before the API started sending legs. */
	legs?: ComboLegSummary[];
}

// ---- new lens endpoint payloads ----

/**
 * A single closed FIFO lot. This is what powers the "biggest win / loss
 * on soccer today / week / month / all-time" boards — one row per lot,
 * queried directly from `whale_closed_lots` on the backend.
 */
export interface ClosedLotRow {
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	traderCategory?: TraderCategory;
	pnlUsd: number;
	/** pnlUsd / costBasisUsd — multiple on money for THIS lot (0.5 = +50%). */
	roiPct: number;
	shares: number;
	buyPrice: number;
	sellPrice: number;
	costBasisUsd: number;
	proceedsUsd: number;
	conditionId: string;
	marketTitle?: string;
	sport: string;
	league?: string | null;
	teams: string[];
	outcome: "yes" | "no";
	/** Named side from the market's outcomes (e.g. "Sharks"). Absent when the market is a plain Yes/No. */
	outcomeLabel?: string;
	openedAt?: string;
	closedAt: string;
	/** Hours between open and close on this specific lot. */
	holdTimeHours?: number;
	/**
	 * How the lot closed: `polymarket_data_api` = SOLD on the market
	 * before resolution; redemption/resolution = HELD to settlement.
	 */
	closeSource: "polymarket_data_api" | "polymarket_redemption" | "polymarket_resolution";
}

export interface BigBetRow {
	betId: string;
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	conditionId: string;
	marketTitle?: string;
	sport: string;
	league?: string | null;
	teams: string[];
	side: "buy" | "sell";
	outcome: "yes" | "no";
	/** Named side from the market's outcomes (e.g. "Sharks"). Absent when the market is a plain Yes/No. */
	outcomeLabel?: string;
	shares: number;
	price: number;
	costUsd: number;
	placedAt: string;
	txHash?: string;
	/**
	 * Mark-to-market block — present when the backend holds a price
	 * snapshot for the market. `currentValueUsd = shares × currentPrice`;
	 * `unrealizedPnlUsd = currentValueUsd − costUsd`. On settled markets
	 * prices collapse to 0/1 so currentValue doubles as the payout.
	 */
	marketClosed?: boolean;
	currentPrice?: number;
	currentValueUsd?: number;
	unrealizedPnlUsd?: number;
	pricesUpdatedAt?: string;
}

export interface HighlightRow {
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	statsConfidence: TraderStatsConfidence;
	traderCategory: TraderCategory;
	highlight: TraderTradeHighlight;
}

/**
 * NEW WHALES — accounts whose first sports bet is recent (default ≤30d)
 * but already trading serious volume. Hunting lens for sharp fresh
 * accounts that tend to smash, cash out, and rotate wallets.
 */
export interface NewWhaleRow {
	rank: number;
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	traderCategory?: TraderCategory;
	statsConfidence?: TraderStatsConfidence;
	copyStrategy?: TraderCopyStrategy;
	copyDifficulty?: TraderCopyDifficulty;
	avgBuyPrice?: number;
	copyScore?: number;
	avgPositionSizeUsd?: number;
	positionWinRate?: number;
	/** ISO timestamp of the account's first sports bet ever. */
	firstSportsBetAt?: string;
	/** Days since first sports bet — the headline "3 days old" number. */
	accountAgeDays: number;
	bets: number;
	winRate: number;
	volumeUsd: number;
	/** Realised PnL only. */
	pnlUsd: number;
	unrealizedPnlUsd: number;
	roiPct: number;
	currentWinStreak?: number;
	totalRedemptionWins?: number;
}

export interface NewWhalesResponse {
	sport: TraderSportFilter;
	maxAgeDays: number;
	minVolumeUsd: number;
	entries: NewWhaleRow[];
}

export interface HotStreakRow {
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	traderCategory: TraderCategory;
	/**
	 * Current active streak of positions the wallet **held to resolution
	 * and won** — cashed out at $1 via redemption. Market sells (early
	 * profit-taking) don't count.
	 */
	currentWinStreak: number;
	longestWinStreak: number;
	sportsWinRate: number;
	totalSportsPnlUsd: number;
	/** Total positions the wallet held to resolution and won. */
	totalRedemptionWins?: number;
	/** Total positions held to resolution that lost (rare). */
	totalRedemptionLosses?: number;
	/**
	 * Redemption wins / (wins + losses). The purest "how often does this
	 * wallet actually predict correctly?" signal, free of intra-market
	 * flip noise.
	 */
	predictionAccuracy?: number;
}

/** One point on the profile PnL chart. */
export interface PnlHistoryPoint {
	/** Bucket start, ISO. Hourly buckets on `today`, daily otherwise. */
	t: string;
	/** Cumulative realised PnL up to and including this bucket. */
	pnlUsd: number;
}

export interface PnlHistoryResponse {
	window: TraderWindow;
	sport: TraderSportFilter;
	points: PnlHistoryPoint[];
}

/**
 * Sport × window track-record numbers, computed server-side from the
 * source-of-truth collections so they always reconcile with the PnL
 * chart and the visible trade history. Realized and unrealized are
 * separate on purpose — never sum them at the display layer.
 */
export interface TraderStatsResponse {
	window: TraderWindow;
	sport: TraderSportFilter;
	/** Locked-in PnL from settled lots + resolved combos in the window. */
	realizedPnlUsd: number;
	/** Current open-position mark ("now"; window doesn't apply, sport does). */
	unrealizedPnlUsd: number;
	volumeUsd: number;
	trades: number;
	winRate: number;
	roiPct: number;
	settledWins: number;
	settledLosses: number;
}

export interface OpenPositionsResponse {
	wallet: string;
	displayName: string;
	polymarketUsername?: string;
	profileImageUrl?: string;
	currentOpenPositions: TraderOpenPosition[];
	openSportsPositionsCount: number;
	openSportsPositionsValueUsd: number;
}

interface ApiEnvelope<T> {
	success: boolean;
	data?: T;
	error?: string;
}

/** HTTP error with status attached, so callers can tell 404 from 500. */
export class WhaleApiError extends Error {
	constructor(
		message: string,
		public readonly status: number,
	) {
		super(message);
		this.name = "WhaleApiError";
	}
}

/**
 * React Query retry policy for every whale-tracker query. 4xx responses are
 * definitive (a 404 profile will still be a 404 on attempt three) — retrying
 * them just holds the user in a spinner for ~7s of exponential backoff.
 * Only network failures and 5xx get retried, and only once.
 */
export function shouldRetryWhaleQuery(failureCount: number, error: unknown): boolean {
	if (error instanceof WhaleApiError && error.status < 500) return false;
	return failureCount < 1;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
	const base = getPredictionApiBaseUrl();
	const res = await fetch(`${base}${path}`, {
		method: "GET",
		headers: { Accept: "application/json" },
		signal,
	});
	const text = await res.text();
	let body: ApiEnvelope<T> | null = null;
	try {
		body = text ? (JSON.parse(text) as ApiEnvelope<T>) : null;
	} catch {
		body = null;
	}
	if (!res.ok || !body || body.success !== true || body.data === undefined) {
		const msg = body?.error ?? `Request failed with ${res.status}`;
		throw new WhaleApiError(msg, res.status);
	}
	return body.data;
}

export const whaleTrackerService = {
	fetchBigBets(input: {
		sport: TraderSportFilter;
		window?: TraderWindow;
		limit?: number;
		minSizeUsd?: number;
	}, signal?: AbortSignal): Promise<{ sport: TraderSportFilter; window: TraderWindow; entries: BigBetRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			window: input.window ?? "all",
			limit: String(input.limit ?? 20),
			minSizeUsd: String(input.minSizeUsd ?? 1000),
		});
		return getJson(`/api/whale-tracker/big-bets?${qs.toString()}`, signal);
	},

	fetchBiggestWins(input: {
		sport: TraderSportFilter;
		window?: TraderWindow;
		limit?: number;
		/**
		 * "pnl" (default) = biggest dollar wins. "roi" = biggest multiples —
		 * longshots that hit (a $200 bet that paid $2,000 outranks a $50k bet
		 * that paid $55k). Backend gates roi mode to ≥$10 cost basis.
		 */
		sortBy?: "pnl" | "roi";
		minCostUsd?: number;
	}, signal?: AbortSignal): Promise<{ sport: TraderSportFilter; window: TraderWindow; sortBy: "pnl" | "roi"; entries: ClosedLotRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			window: input.window ?? "all",
			limit: String(input.limit ?? 20),
			sortBy: input.sortBy ?? "pnl",
		});
		if (input.minCostUsd != null) qs.set("minCostUsd", String(input.minCostUsd));
		return getJson(`/api/whale-tracker/biggest-wins?${qs.toString()}`, signal);
	},

	fetchBiggestLosses(input: {
		sport: TraderSportFilter;
		window?: TraderWindow;
		limit?: number;
	}, signal?: AbortSignal): Promise<{ sport: TraderSportFilter; window: TraderWindow; entries: ClosedLotRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			window: input.window ?? "all",
			limit: String(input.limit ?? 20),
		});
		return getJson(`/api/whale-tracker/biggest-losses?${qs.toString()}`, signal);
	},

	/**
	 * Per-wallet closed lot history — used by the "History" tab on a
	 * profile after the user has looked at their active bets.
	 */
	fetchWalletClosedLots(input: {
		address: string;
		sport?: TraderSportFilter;
		window?: TraderWindow;
		kind?: "all" | "wins" | "losses";
		limit?: number;
		offset?: number;
	}, signal?: AbortSignal): Promise<{
		sport: TraderSportFilter;
		window: TraderWindow;
		kind: "all" | "wins" | "losses";
		entries: ClosedLotRow[];
		// Position-based cursor: the server pages whole positions (every lot of
		// a market+side together), so `limit`/`offset` count positions, not
		// lots. `null` once the last position has been returned.
		nextOffset: number | null;
	}> {
		const qs = new URLSearchParams({
			sport: input.sport ?? "all",
			window: input.window ?? "all",
			kind: input.kind ?? "all",
			limit: String(input.limit ?? 50),
			offset: String(input.offset ?? 0),
		});
		return getJson(
			`/api/whale-tracker/wallets/${encodeURIComponent(
				input.address.toLowerCase(),
			)}/closed-lots?${qs.toString()}`,
			signal,
		);
	},

	fetchHotStreaks(input: {
		sport: TraderSportFilter;
		category?: TraderCategory;
		limit?: number;
		minStreak?: number;
	}, signal?: AbortSignal): Promise<{ sport: TraderSportFilter; entries: HotStreakRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			category: input.category ?? "all",
			limit: String(input.limit ?? 20),
			minStreak: String(input.minStreak ?? 3),
		});
		return getJson(`/api/whale-tracker/hot-streaks?${qs.toString()}`, signal);
	},

	/**
	 * Fresh accounts (first bet within `maxAgeDays`, default 30) already
	 * trading ≥ `minVolumeUsd` (default $10k). Sorted by volume desc.
	 */
	fetchNewWhales(input: {
		sport: TraderSportFilter;
		limit?: number;
		minVolumeUsd?: number;
		maxAgeDays?: number;
	}, signal?: AbortSignal): Promise<NewWhalesResponse> {
		const qs = new URLSearchParams({
			sport: input.sport,
			limit: String(input.limit ?? 20),
		});
		if (input.minVolumeUsd != null) qs.set("minVolumeUsd", String(input.minVolumeUsd));
		if (input.maxAgeDays != null) qs.set("maxAgeDays", String(input.maxAgeDays));
		return getJson(`/api/whale-tracker/new-whales?${qs.toString()}`, signal);
	},

	/**
	 * Cumulative realised PnL series for the profile chart. Sport-scoped:
	 * combos count when the combo or any of its legs is in the sport.
	 */
	fetchPnlHistory(input: {
		address: string;
		window?: TraderWindow;
		sport?: TraderSportFilter;
	}, signal?: AbortSignal): Promise<PnlHistoryResponse> {
		const qs = new URLSearchParams({
			window: input.window ?? "all",
			sport: input.sport ?? "all",
		});
		return getJson(
			`/api/whale-tracker/wallets/${encodeURIComponent(
				input.address.toLowerCase(),
			)}/pnl-history?${qs.toString()}`,
			signal,
		);
	},

	/** Sport × window track-record stats for the profile page. */
	fetchTraderStats(input: {
		address: string;
		window?: TraderWindow;
		sport?: TraderSportFilter;
	}, signal?: AbortSignal): Promise<TraderStatsResponse> {
		const qs = new URLSearchParams({
			window: input.window ?? "all",
			sport: input.sport ?? "all",
		});
		return getJson(
			`/api/whale-tracker/wallets/${encodeURIComponent(
				input.address.toLowerCase(),
			)}/stats?${qs.toString()}`,
			signal,
		);
	},

	fetchOpenPositions(address: string, signal?: AbortSignal): Promise<OpenPositionsResponse> {
		return getJson(
			`/api/whale-tracker/wallets/${encodeURIComponent(address.toLowerCase())}/open-positions`,
			signal,
		);
	},

	// ---- combos ----

	fetchComboMarkets(input: {
		sport: TraderSportFilter;
		limit?: number;
	}): Promise<{ sport: TraderSportFilter; entries: ComboMarketRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			limit: String(input.limit ?? 20),
		});
		return getJson(`/api/whale-tracker/combo-markets?${qs.toString()}`);
	},

	fetchWalletComboPositions(input: {
		address: string;
		status?: ComboStatus | "all";
		sport?: TraderSportFilter;
		limit?: number;
		offset?: number;
	}, signal?: AbortSignal): Promise<{
		status: ComboStatus | "all";
		sport: TraderSportFilter;
		entries: ComboPositionRow[];
	}> {
		const qs = new URLSearchParams({
			status: input.status ?? "all",
			sport: input.sport ?? "all",
			limit: String(input.limit ?? 50),
			offset: String(input.offset ?? 0),
		});
		return getJson(
			`/api/whale-tracker/wallets/${encodeURIComponent(
				input.address.toLowerCase(),
			)}/combo-positions?${qs.toString()}`,
			signal,
		);
	},

	/** Single-shot combo dashboard — three wallet-aggregated leaderboards. */
	fetchComboDashboard(input: {
		sport: TraderSportFilter;
		window?: TraderWindow;
		limit?: number;
		minCombos?: number;
	}): Promise<ComboDashboardResponse> {
		const qs = new URLSearchParams({
			sport: input.sport,
			window: input.window ?? "all",
			limit: String(input.limit ?? 10),
			minCombos: String(input.minCombos ?? 1),
		});
		return getJson(`/api/whale-tracker/combo-dashboard?${qs.toString()}`);
	},

	/** Single combo leaderboard (matches the dashboard's three sections). */
	fetchComboLeaderboard(input: {
		type: ComboLeaderboardType;
		sport: TraderSportFilter;
		window?: TraderWindow;
		limit?: number;
		minCombos?: number;
	}, signal?: AbortSignal): Promise<{
		type: ComboLeaderboardType;
		sport: TraderSportFilter;
		window: TraderWindow;
		entries: ComboLeaderboardEntry[];
	}> {
		const qs = new URLSearchParams({
			sport: input.sport,
			window: input.window ?? "all",
			limit: String(input.limit ?? 20),
			minCombos: String(input.minCombos ?? 1),
		});
		return getJson(
			`/api/whale-tracker/combo-leaderboards/${encodeURIComponent(input.type)}?${qs.toString()}`,
			signal,
		);
	},

	fetchBiggestComboWins(input: {
		sport: TraderSportFilter;
		window?: TraderWindow;
		limit?: number;
	}, signal?: AbortSignal): Promise<{ sport: TraderSportFilter; window: TraderWindow; entries: ComboHighlightRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			window: input.window ?? "all",
			limit: String(input.limit ?? 20),
		});
		return getJson(`/api/whale-tracker/biggest-combo-wins?${qs.toString()}`, signal);
	},

	/**
	 * Biggest combos still riding (OPEN / PARTIAL), sorted by stake. Rows
	 * include `sharesBalance` = payout if every remaining leg hits, so the
	 * potential multiple is `sharesBalance / totalCostUsdc`.
	 */
	fetchBiggestLiveCombos(input: {
		sport: TraderSportFilter;
		limit?: number;
	}, signal?: AbortSignal): Promise<{ sport: TraderSportFilter; entries: LiveComboRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			limit: String(input.limit ?? 20),
		});
		return getJson(`/api/whale-tracker/biggest-live-combos?${qs.toString()}`, signal);
	},

	fetchBiggestComboLosses(input: {
		sport: TraderSportFilter;
		window?: TraderWindow;
		limit?: number;
	}): Promise<{ sport: TraderSportFilter; window: TraderWindow; entries: ComboHighlightRow[] }> {
		const qs = new URLSearchParams({
			sport: input.sport,
			window: input.window ?? "all",
			limit: String(input.limit ?? 20),
		});
		return getJson(`/api/whale-tracker/biggest-combo-losses?${qs.toString()}`);
	},

	/**
	 * Unified metric×window leaderboard — the "single sortable list" the
	 * UX uses when the user has picked a metric tab (PnL / % Return /
	 * Volume) and a window tab (Today / Week / Month / All).
	 *
	 * Every row includes `pnlUsd`, `roiPct`, `volumeUsd`, `bets`,
	 * `winRate`, `unrealizedPnlUsd`, plus streaks / redemptions — the UI
	 * shows the picked metric as the headline column and the others as
	 * secondary labels without a second fetch.
	 */
	fetchRanked(
		input: {
			metric: TraderMetric;
			window?: TraderWindow;
			sport: TraderSportFilter;
			category?: TraderCategory;
			/** e.g. "position_holder" → only the stable copy targets. */
			copyStrategy?: TraderCopyStrategy | "all";
			limit?: number;
			minRedemptionWins?: number;
		},
		signal?: AbortSignal,
	): Promise<RankedLeaderboardResponse> {
		const qs = new URLSearchParams({
			metric: input.metric,
			window: input.window ?? "all",
			sport: input.sport,
			category: input.category ?? "all",
			limit: String(input.limit ?? 20),
		});
		if (input.copyStrategy && input.copyStrategy !== "all") {
			qs.set("copyStrategy", input.copyStrategy);
		}
		if (input.minRedemptionWins != null) {
			qs.set("minRedemptionWins", String(input.minRedemptionWins));
		}
		return getJson<RankedLeaderboardResponse>(
			`/api/whale-tracker/ranked?${qs.toString()}`,
			signal,
		);
	},

	fetchDashboard(input: {
		sport: TraderSportFilter;
		category: TraderCategory;
		limit?: number;
		window?: TraderWindow;
	}, signal?: AbortSignal): Promise<TraderDashboardResponse> {
		const qs = new URLSearchParams({
			sport: input.sport,
			category: input.category,
			limit: String(input.limit ?? 10),
			window: input.window ?? "all",
		});
		return getJson<TraderDashboardResponse>(
			`/api/whale-tracker/dashboard?${qs.toString()}`,
			signal,
		);
	},

	fetchLeaderboard(input: {
		type: TraderLeaderboardType;
		sport: TraderSportFilter;
		category: TraderCategory;
		limit: number;
		/**
		 * Hide wallets whose PnL is pure paper — require at least this
		 * many settled predictions. Use `3` for a "real winners only"
		 * toggle on Top Winners.
		 */
		minRedemptionWins?: number;
	}): Promise<TraderLeaderboardResponse> {
		const qs = new URLSearchParams({
			sport: input.sport,
			limit: String(input.limit),
			category: input.category,
		});
		if (input.minRedemptionWins != null) {
			qs.set("minRedemptionWins", String(input.minRedemptionWins));
		}
		return getJson<TraderLeaderboardResponse>(
			`/api/whale-tracker/leaderboards/${encodeURIComponent(input.type)}?${qs.toString()}`,
		);
	},

	fetchProfile(address: string, signal?: AbortSignal): Promise<TraderProfile> {
		return getJson<TraderProfile>(
			`/api/whale-tracker/wallets/${encodeURIComponent(address.toLowerCase())}/profile`,
			signal,
		);
	},

	fetchBets(input: {
		address: string;
		sport: TraderSportFilter;
		limit: number;
		offset: number;
	}, signal?: AbortSignal): Promise<TraderBet[]> {
		const qs = new URLSearchParams({
			sport: input.sport,
			limit: String(input.limit),
			offset: String(input.offset),
		});
		return getJson<TraderBet[]>(
			`/api/whale-tracker/wallets/${encodeURIComponent(input.address.toLowerCase())}/bets?${qs.toString()}`,
			signal,
		);
	},
};
