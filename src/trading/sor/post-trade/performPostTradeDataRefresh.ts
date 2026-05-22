/**
 * Single imperative post-trade data refresh pass (AccountData + TanStack supplements).
 * Extracted from legacy post-trade sync — trading / signing paths do not import this file.
 */
import { type QueryClient } from "@tanstack/react-query";
import type { AccountVenueKey } from "@/context/AccountDataContext";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { COLLATERAL_TOKENS_QUERY_KEY } from "@/context/CollateralTokenContext";
import type { CollateralChainKey } from "@/trading/sor/prefund/fundingStableBalances";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import { LIMITLESS_QUERY_ROOT, limitlessQueryKeys } from "@/trading/venues/limitless/trade/limitlessQueryKeys";
import { debugLimitlessPortfolio } from "@/trading/venues/limitless/portfolio/limitlessPortfolioDebug";
import type { FundingStableBalancesHuman } from "../prefund/fundingStableBalances";
import type { RouteExecution, RoutePlan, SorSide } from "../core/sor-types";
import {
	CASH_CONVERGENCE_TOL_USD,
	computeExpectedDeltas,
	shareIdentityForVenuePosition,
	type PostTradeBaseline,
	type PostTradeBaselineAddresses,
	type ShareIdentityRouteLegContext,
} from "./postTradeBaseline";
import { normalizePredictTokenId } from "@/trading/venues/predict/portfolio/predictOrdersApi";
import { getCachedDflowPositions } from "@/trading/venues/dflow/portfolio/dflowPositionsQueryCache";
import { withTimeout } from "@/utils/withTimeout";
import {
	accountVenueKeyToRefreshKey,
	createPostTradeVenueRefreshRegistry,
	runPostTradeCashRefresh,
	runPostTradeVenueRefresh,
	type PostTradeAccountRefetch,
	type PostTradeVenueRefreshContext,
} from "@/trading/sor/post-trade/postTradeVenueRefresh";

export type { PostTradeAccountRefetch };

/** Same total as `PortfolioContext` cashBalance — sum of stable slices from cached collateral queries. */
export function readTotalCashHumanFromQueryClient(
	queryClient: QueryClient,
): number | null {
	const all = queryClient.getQueriesData<FundingStableBalancesHuman>({
		queryKey: [COLLATERAL_TOKENS_QUERY_KEY],
	});
	for (const [, data] of all) {
		if (!data) continue;
		return (
			data.base +
			data.polygon +
			data.bnb +
			data.solana +
			(data.limitlessMakerBase ?? 0)
		);
	}
	return null;
}

export const POLL_INTERVAL_MS = 5_000;
export const MAX_REFETCH_ATTEMPTS = 17;

export const DFLOW_POST_TRADE_POLL_MS = 2_000;
export const DFLOW_POST_TRADE_MAX_ATTEMPTS = 15;
export const POLYMARKET_POST_TRADE_POLL_MS = 2_000;
export const POLYMARKET_POST_TRADE_MAX_ATTEMPTS = 30;
export const LEVELUP_POST_TRADE_POLL_MS = 2_000;
export const LEVELUP_POST_TRADE_MAX_ATTEMPTS = 30;

export const REFETCH_TASK_TIMEOUT_MS = 20_000;
export const POST_TRADE_SYNC_WALL_CLOCK_MS = 180_000;
export const LEVELUP_READ_DELAY_MS = 64;

export const BLIND_REFRESH_ITERATIONS = 8;
export const BLIND_REFRESH_INTERVAL_MS = 2_000;

export type PostTradeSyncRequest = {
	queryClient: QueryClient;
	route: RoutePlan;
	execution: RouteExecution;
	baseline: PostTradeBaseline;
	addresses: PostTradeBaselineAddresses;
	/** LevelUp CTF shares (RPC → `UserDataContext.tokenBalances`). */
	refreshLevelUpPositions: () => Promise<void>;
	/** LevelUp fills (GET /orders/:wallet → `UserDataContext.orders`). */
	refreshLevelUpOrders: () => Promise<void>;
	refetchCollateral: () => Promise<FundingStableBalancesHuman | undefined>;
	readLevelUpSide: (marketId: string, side: "yes" | "no") => number;
	syncUiKey: string | null;
	shareIdentityCtx?: ShareIdentityRouteLegContext | null;
};

export type BlindPostTradeBalanceRefreshRequest = {
	queryClient: QueryClient;
	syncUiKey: string | null;
	accountVenues: AccountVenueKey[];
	includeLevelUpRpc: boolean;
	refreshLevelUpPositions: () => Promise<void>;
	refreshLevelUpOrders: () => Promise<void>;
	iterations?: number;
	intervalMs?: number;
};

export type PostTradeShareRouteSide = SorSide;

export type PostTradePendingTarget =
	| {
			kind: "shares";
			venue: VenuePosition["venue"];
			identity: string;
			baselineShares: number;
			expectedSharesAbs: number;
			routeSide: PostTradeShareRouteSide;
	  }
	| { kind: "cash"; chain: CollateralChainKey; baselineCash: number }
	| {
			kind: "levelup";
			marketId: string;
			side: "yes" | "no";
			baselineLevelUp: number;
			expectedLevelUpAbs: number;
			routeSide: PostTradeShareRouteSide;
	  };

export function pendingHasDflowShares(pending: PostTradePendingTarget[]): boolean {
	return pending.some((t) => t.kind === "shares" && t.venue === "dflow");
}

export function pendingHasPolymarketShares(
	pending: PostTradePendingTarget[],
): boolean {
	return pending.some((t) => t.kind === "shares" && t.venue === "polymarket");
}

export function pendingHasLevelUp(pending: PostTradePendingTarget[]): boolean {
	return pending.some((t) => t.kind === "levelup");
}

export function readVenueShares(
	queryClient: QueryClient,
	venue: VenuePosition["venue"],
	identity: string,
	addresses: PostTradeBaselineAddresses,
): number | null {
	const findShares = (rows: VenuePosition[] | undefined): number => {
		if (!rows) return 0;
		for (const r of rows) {
			if (r.venue !== venue) continue;
			const id = shareIdentityForVenuePosition(r);
			if (id === identity) return r.shares;
		}
		return 0;
	};

	switch (venue) {
		case "polymarket": {
			const safe = addresses.polymarketSafe?.toLowerCase() ?? null;
			if (!safe) return null;
			const rows = queryClient.getQueryData<VenuePosition[]>([
				"polymarket-positions",
				safe,
			]);
			if (rows === undefined) return null;
			return findShares(rows);
		}
		case "predictfun": {
			const wallet =
				(addresses.predictWallet ?? "").trim().toLowerCase() || null;
			if (!wallet) return null;
			const rows = queryClient.getQueryData<VenuePosition[]>([
				"predict-positions",
				wallet,
			]);
			if (rows === undefined) return null;
			let n = findShares(rows);
			if (n > 0) return n;
			const body = identity.startsWith("predictfun:")
				? identity.slice("predictfun:".length)
				: "";
			if (body !== "" && !body.includes("|")) {
				const want = normalizePredictTokenId(body);
				if (want && rows?.length) {
					for (const r of rows) {
						if (r.venue !== "predictfun") continue;
						if (normalizePredictTokenId(r.tokenId) === want) return r.shares;
					}
				}
			}
			return n;
		}
		case "dflow": {
			const owner = addresses.solanaAddress?.trim() ?? null;
			if (!owner) return null;
			const rows = getCachedDflowPositions(queryClient, owner);
			if (rows === undefined) return null;
			return findShares(rows);
		}
		case "limitless": {
			const rows = queryClient.getQueryData<VenuePosition[]>(
				limitlessQueryKeys.positionsVenue,
			);
			if (rows === undefined) return null;
			return findShares(rows);
		}
		default:
			return null;
	}
}

function readCashForChain(
	queryClient: QueryClient,
	chain: CollateralChainKey,
): number | null {
	const all = queryClient.getQueriesData<FundingStableBalancesHuman>({
		queryKey: [COLLATERAL_TOKENS_QUERY_KEY],
	});
	for (const [, data] of all) {
		if (!data) continue;
		switch (chain) {
			case "base":
				return data.base;
			case "polygon":
				return data.polygon;
			case "bnb":
				return data.bnb;
			case "solana":
				return data.solana;
			case "limitlessMakerBase":
				return data.limitlessMakerBase ?? 0;
		}
	}
	return null;
}

export function buildWatchTargets(
	route: RoutePlan,
	execution: RouteExecution,
	baseline: PostTradeBaseline,
	shareIdentityCtx?: ShareIdentityRouteLegContext | null,
): PostTradePendingTarget[] {
	const deltas = computeExpectedDeltas(
		route,
		execution,
		baseline,
		shareIdentityCtx,
	);
	const out: PostTradePendingTarget[] = [];
	const seenShare = new Set<string>();
	for (const identity of deltas.expectedShares.keys()) {
		if (seenShare.has(identity)) continue;
		seenShare.add(identity);
		const venue = identity.split(":", 1)[0] as VenuePosition["venue"];
		const baselineS = baseline.shares.get(identity) ?? 0;
		if (route.side === "sell" && baselineS === 0) continue;
		const expectedAbs = deltas.expectedShares.get(identity) ?? baselineS;
		out.push({
			kind: "shares",
			venue,
			identity,
			baselineShares: baselineS,
			expectedSharesAbs: expectedAbs,
			routeSide: route.side,
		});
	}
	const seenCash = new Set<CollateralChainKey>();
	for (const [chainKey, delta] of Object.entries(deltas.cashDeltas) as [
		CollateralChainKey,
		number,
	][]) {
		if (!Number.isFinite(delta) || delta === 0) continue;
		if (seenCash.has(chainKey)) continue;
		seenCash.add(chainKey);
		const baselineCash = baseline.cash[chainKey];
		if (baselineCash == null) continue;
		out.push({ kind: "cash", chain: chainKey, baselineCash });
	}
	if (deltas.levelUp && baseline.levelUp) {
		const routeId = deltas.levelUp.marketId.trim();
		const baselineId = baseline.levelUp.marketId.trim();
		if (
			routeId &&
			baselineId &&
			routeId !== baselineId &&
			import.meta.env.DEV
		) {
			console.warn(
				"[postTradeDataRefresh] levelUp leg id differs from baseline page id — using baseline id for reads",
				{ routeMarketId: routeId, baselineMarketId: baselineId },
			);
		}
		const baselineLevelUp =
			deltas.levelUp.side === "yes"
				? baseline.levelUp.yes
				: baseline.levelUp.no;
		if (!(route.side === "sell" && baselineLevelUp === 0)) {
			const expectedLevelUpAbs =
				route.side === "buy"
					? baselineLevelUp + deltas.levelUp.deltaShares
					: Math.max(0, baselineLevelUp - deltas.levelUp.deltaShares);
			out.push({
				kind: "levelup",
				marketId: baselineId,
				side: deltas.levelUp.side,
				baselineLevelUp,
				expectedLevelUpAbs,
				routeSide: route.side,
			});
		}
	}
	return out;
}

export function valueDiverged(
	observed: number | null,
	baseline: number,
	tol: number,
): boolean {
	if (observed == null || !Number.isFinite(observed)) return false;
	return Math.abs(observed - baseline) > tol;
}

/**
 * Strict post-trade share completion vs pre-trade baseline (venue cache).
 * `null` observed → query not hydrated yet (`readVenueShares`); caller treats as unresolved.
 * Sell with baseline 0: `obs < 0` is impossible — treated as resolved (see `buildWatchTargets` omit).
 */
export function venueShareDirectionResolved(
	routeSide: PostTradeShareRouteSide,
	observed: number | null,
	baselineShares: number,
): boolean | null {
	if (observed === null) return null;
	if (!Number.isFinite(observed)) return null;
	if (routeSide === "sell" && baselineShares === 0) return true;
	if (routeSide === "buy") return observed > baselineShares;
	return observed < baselineShares;
}

/** LevelUp balance read is always finite today; same strict rules as venue (incl. empty `marketId`). */
export function levelUpShareDirectionResolved(
	routeSide: PostTradeShareRouteSide,
	observed: number,
	baselineLevelUp: number,
): boolean {
	if (routeSide === "sell" && baselineLevelUp === 0) return true;
	if (!Number.isFinite(observed)) return false;
	if (routeSide === "buy") return observed > baselineLevelUp;
	return observed < baselineLevelUp;
}

function venueToAccountVenue(
	venue: VenuePosition["venue"],
): AccountVenueKey | null {
	switch (venue) {
		case "polymarket":
			return "polymarket";
		case "predictfun":
			return "predict";
		case "dflow":
			return "dflow";
		case "limitless":
			return "limitless";
		default:
			return null;
	}
}

export function exitBurstSpecFromPending(pending: readonly PostTradePendingTarget[]): {
	accountVenues: AccountVenueKey[];
	includeLevelUp: boolean;
	includeCash: boolean;
} {
	const accountVenues: AccountVenueKey[] = [];
	const seen = new Set<AccountVenueKey>();
	let includeLevelUp = false;
	let includeCash = false;
	for (const t of pending) {
		if (t.kind === "shares") {
			const k = venueToAccountVenue(t.venue);
			if (k && !seen.has(k)) {
				seen.add(k);
				accountVenues.push(k);
			}
		} else if (t.kind === "levelup") {
			includeLevelUp = true;
		} else if (t.kind === "cash") {
			includeCash = true;
		}
	}
	return { accountVenues, includeLevelUp, includeCash };
}

export function buildSyntheticBlindPending(
	accountVenues: readonly AccountVenueKey[],
	includeLevelUpRpc: boolean,
): PostTradePendingTarget[] {
	const out: PostTradePendingTarget[] = [];
	const map: Record<AccountVenueKey, VenuePosition["venue"]> = {
		polymarket: "polymarket",
		predict: "predictfun",
		dflow: "dflow",
		limitless: "limitless",
	};
	for (const av of accountVenues) {
		out.push({
			kind: "shares",
			venue: map[av],
			identity: `__blind__:${av}`,
			baselineShares: 0,
			expectedSharesAbs: 0,
			routeSide: "buy",
		});
	}
	if (includeLevelUpRpc) {
		out.push({
			kind: "levelup",
			marketId: "",
			side: "yes",
			baselineLevelUp: 0,
			expectedLevelUpAbs: 0,
			routeSide: "buy",
		});
	}
	out.push({
		kind: "cash",
		chain: "base",
		baselineCash: 0,
	});
	return out;
}

export type PostTradeRefetchPassOpts = {
	venueShareKeys: AccountVenueKey[];
	predictMarketSupplement: boolean;
	dflowOutcomeBalance: boolean;
	limitlessPortfolioAndCollateral: boolean;
	levelUpRpc: boolean;
	cash: boolean;
};

/**
 * One hydration pass: canonical venue refetches via AccountData, narrow
 * `queryClient` refetches only where AccountData does not cover.
 */
export async function performPostTradeDataRefreshPass(
	queryClient: QueryClient,
	req: Pick<
		PostTradeSyncRequest,
		"refreshLevelUpPositions" | "refreshLevelUpOrders"
	>,
	account: PostTradeAccountRefetch,
	opts: PostTradeRefetchPassOpts,
): Promise<void> {
	const tasks: Promise<unknown>[] = [];
	const pushTask = (label: string, p: Promise<unknown>): void => {
		tasks.push(withTimeout(p, REFETCH_TASK_TIMEOUT_MS, label));
	};

	const registryCtx: PostTradeVenueRefreshContext = {
		queryClient,
		account,
		refreshLevelUpTokenPositions: req.refreshLevelUpPositions,
		refreshLevelUpOrders: req.refreshLevelUpOrders,
	};
	const registry = createPostTradeVenueRefreshRegistry(registryCtx);

	const venuesToRefresh = new Set(
		opts.venueShareKeys.map((k) => accountVenueKeyToRefreshKey(k)),
	);
	if (opts.levelUpRpc) {
		venuesToRefresh.add("levelup");
	}

	for (const venue of venuesToRefresh) {
		pushTask(`postTradeVenueRefresh.${venue}`, runPostTradeVenueRefresh(registry, venue));
	}

	if (opts.cash) {
		pushTask(
			"postTradeVenueRefresh.cash",
			runPostTradeCashRefresh(queryClient, account),
		);
	}
	await Promise.allSettled(tasks);
}

export function refetchPassOptsFromPending(
	pending: readonly PostTradePendingTarget[],
): PostTradeRefetchPassOpts {
	const venueShareKeys: AccountVenueKey[] = [];
	const seen = new Set<AccountVenueKey>();
	let predictMarketSupplement = false;
	let dflowOutcomeBalance = false;
	let limitlessPortfolioAndCollateral = false;
	let levelUpRpc = false;
	let cash = false;
	for (const t of pending) {
		if (t.kind === "shares") {
			const k = venueToAccountVenue(t.venue);
			if (k && !seen.has(k)) {
				seen.add(k);
				venueShareKeys.push(k);
			}
			if (t.venue === "predictfun") predictMarketSupplement = true;
			if (t.venue === "dflow") dflowOutcomeBalance = true;
			if (t.venue === "limitless") limitlessPortfolioAndCollateral = true;
		} else if (t.kind === "levelup") {
			levelUpRpc = true;
		} else if (t.kind === "cash") {
			cash = true;
		}
	}
	return {
		venueShareKeys,
		predictMarketSupplement,
		dflowOutcomeBalance,
		limitlessPortfolioAndCollateral,
		levelUpRpc,
		cash,
	};
}

export async function refetchForPending(
	queryClient: QueryClient,
	pending: PostTradePendingTarget[],
	req: PostTradeSyncRequest,
	account: PostTradeAccountRefetch,
): Promise<boolean> {
	const opts = refetchPassOptsFromPending(pending);
	await performPostTradeDataRefreshPass(queryClient, req, account, opts);
	return opts.levelUpRpc;
}

export async function runPostTradeExitBurst(
	queryClient: QueryClient,
	req: Pick<
		PostTradeSyncRequest,
		"refreshLevelUpPositions" | "refreshLevelUpOrders"
	>,
	account: PostTradeAccountRefetch,
	pendingSnapshot: readonly PostTradePendingTarget[],
): Promise<void> {
	const spec = exitBurstSpecFromPending(pendingSnapshot);
	await performPostTradeDataRefreshPass(queryClient, req, account, {
		venueShareKeys: spec.accountVenues,
		predictMarketSupplement: spec.accountVenues.includes("predict"),
		dflowOutcomeBalance: spec.accountVenues.includes("dflow"),
		limitlessPortfolioAndCollateral: spec.accountVenues.includes("limitless"),
		levelUpRpc: spec.includeLevelUp,
		cash: spec.includeCash,
	});
	if (spec.includeLevelUp) {
		await sleep(LEVELUP_READ_DELAY_MS);
	}
}

export async function refetchCollateralCachesForClaim(
	queryClient: QueryClient,
	refetchCollateral: () => Promise<FundingStableBalancesHuman | undefined>,
): Promise<void> {
	await Promise.allSettled([
		queryClient.invalidateQueries({
			queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
		}),
		queryClient.invalidateQueries({ queryKey: [COLLATERAL_TOKENS_QUERY_KEY] }),
		refetchCollateral(),
	]);
}

export function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** True when every watch target matches venue/cash/LevelUp expectations. */
export function pendingWatchTargetsResolved(
	pending: readonly PostTradePendingTarget[],
	queryClient: QueryClient,
	addresses: PostTradeBaselineAddresses,
	readLevelUpSide: (marketId: string, side: "yes" | "no") => number,
): boolean {
	for (const t of pending) {
		if (t.kind === "shares") {
			const obs = readVenueShares(queryClient, t.venue, t.identity, addresses);
			const ok = venueShareDirectionResolved(t.routeSide, obs, t.baselineShares);
			if (ok !== true) return false;
		} else if (t.kind === "cash") {
			const obs = readCashForChain(queryClient, t.chain);
			if (obs == null || !Number.isFinite(obs)) return false;
			if (!valueDiverged(obs, t.baselineCash, CASH_CONVERGENCE_TOL_USD)) {
				return false;
			}
		} else {
			const obs = readLevelUpSide(t.marketId, t.side);
			if (!levelUpShareDirectionResolved(t.routeSide, obs, t.baselineLevelUp)) {
				return false;
			}
		}
	}
	return true;
}

export function filterUnresolvedPending(
	pending: PostTradePendingTarget[],
	queryClient: QueryClient,
	addresses: PostTradeBaselineAddresses,
	readLevelUpSide: (marketId: string, side: "yes" | "no") => number,
): PostTradePendingTarget[] {
	return pending.filter((t) => {
		if (t.kind === "shares") {
			const obs = readVenueShares(queryClient, t.venue, t.identity, addresses);
			const ok = venueShareDirectionResolved(t.routeSide, obs, t.baselineShares);
			return ok !== true;
		}
		if (t.kind === "cash") {
			const obs = readCashForChain(queryClient, t.chain);
			return !valueDiverged(obs, t.baselineCash, CASH_CONVERGENCE_TOL_USD);
		}
		const obs = readLevelUpSide(t.marketId, t.side);
		return !levelUpShareDirectionResolved(t.routeSide, obs, t.baselineLevelUp);
	});
}

export { CASH_CONVERGENCE_TOL_USD } from "./postTradeBaseline";
