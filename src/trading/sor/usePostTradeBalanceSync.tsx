import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { type QueryClient } from "@tanstack/react-query";
import type { AccountVenueKey } from "@/context/AccountDataContext";
import { useAccountData } from "@/context/AccountDataContext";
import type { VenuePosition } from "@/types/trading/venuePosition";
import {
	COLLATERAL_TOKENS_QUERY_KEY,
} from "@/context/CollateralTokenContext";
import type { CollateralChainKey } from "@/trading/sor/fundingStableBalances";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import {
	LIMITLESS_QUERY_ROOT,
	limitlessQueryKeys,
} from "@/trading/limitless/limitlessQueryKeys";
import { debugLimitlessPortfolio } from "@/trading/limitless/limitlessPortfolioDebug";
import type { FundingStableBalancesHuman } from "./fundingStableBalances";
import type { RouteExecution, RoutePlan } from "./sor-types";
import {
	CASH_CONVERGENCE_TOL_USD,
	SHARES_CONVERGENCE_TOL,
	computeExpectedDeltas,
	shareIdentityForVenuePosition,
	type PostTradeBaseline,
	type PostTradeBaselineAddresses,
	type ShareIdentityRouteLegContext,
} from "./postTradeBaseline";
import { normalizePredictTokenId } from "@/trading/predict/predictOrdersApi";
import { getCachedDflowPositions } from "@/trading/dflow/dflowPositionsQueryCache";
import { withTimeout } from "@/utils/withTimeout";

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

/** Fixed cadence between refetches while waiting for server-backed divergence from baseline. */
const POLL_INTERVAL_MS = 5_000;
/** Immediate first refetch + subsequent polls — wall ~80s max. */
const MAX_REFETCH_ATTEMPTS = 17;

/** DFlow: faster polls so server-backed `dflow-positions` converges within ~30s wall. */
const DFLOW_POST_TRADE_POLL_MS = 2_000;
const DFLOW_POST_TRADE_MAX_ATTEMPTS = 15;
/**
 * Polymarket: same fast cadence as DFlow because the Goldsky-backed Data API
 * usually catches up within seconds of the on-chain CTF transfer. A fresh
 * hard-reload sees the new shares in ~10 s; the in-page poll loop must match
 * that user expectation. 2 s × 30 attempts = ~60 s of fast polling, after
 * which the per-task timeout + wall-clock guard take over.
 */
const POLYMARKET_POST_TRADE_POLL_MS = 2_000;
const POLYMARKET_POST_TRADE_MAX_ATTEMPTS = 30;
/** LevelUp: RPC-backed `tokenBalances` — fast cadence like Polymarket so the row clears quickly. */
const LEVELUP_POST_TRADE_POLL_MS = 2_000;
const LEVELUP_POST_TRADE_MAX_ATTEMPTS = 30;
/**
 * Per-task cap inside `Promise.allSettled` so a single slow refetch (notably
 * `req.refetchCollateral()` after a LiFi prefund — `/portfolio/cash-summary`
 * has no client-side timeout) cannot stall the polymarket-positions polling
 * cadence. Long enough for a healthy `data-api.polymarket.com` round-trip.
 */
const REFETCH_TASK_TIMEOUT_MS = 20_000;
/**
 * Hard wall-clock cap on the spinner: even if every task hangs, the spinner
 * must clear so the user (or the E2E suite) doesn't see a forever spinner.
 * 180 s comfortably exceeds the longest healthy poll budget (Polymarket
 * cadence: 30 × 2 s = 60 s polling + per-iteration `Promise.allSettled` time)
 * while still bounding the worst-case observable spinner time.
 */
const POST_TRADE_SYNC_WALL_CLOCK_MS = 180_000;
/** Allow React state (e.g. LevelUp tokenBalances) to settle after RPC refresh. */
const LEVELUP_READ_DELAY_MS = 64;

export type PostTradeSyncRequest = {
	queryClient: QueryClient;
	route: RoutePlan;
	execution: RouteExecution;
	baseline: PostTradeBaseline;
	addresses: PostTradeBaselineAddresses;
	/** Forces an RPC refresh of LevelUp positions (not in React Query). */
	refreshLevelUpPositions: () => Promise<void>;
	/** Refetch the collateral context (`GET /portfolio/cash-summary`). */
	refetchCollateral: () => Promise<FundingStableBalancesHuman | undefined>;
	/** Read LevelUp YES/NO numeric balance for `marketId` after refresh (same source as trade box). */
	readLevelUpSide: (marketId: string, side: "yes" | "no") => number;
	/** Page market id — when post-trade sync is active for this key, trade box shows share spinner. */
	syncUiKey: string | null;
	/** Same object passed to `capturePostTradeBaseline` so watch targets match baseline Map keys. */
	shareIdentityCtx?: ShareIdentityRouteLegContext | null;
};

/** Canonical collateral + venue position refetch (same as `AccountData.refresh`). */
export type PostTradeAccountRefetch = {
	refreshVenuePositions: (venue?: AccountVenueKey) => Promise<void>;
	refreshCash: () => Promise<void>;
};

export type BlindPostTradeBalanceRefreshRequest = {
	queryClient: QueryClient;
	syncUiKey: string | null;
	accountVenues: AccountVenueKey[];
	includeLevelUpRpc: boolean;
	refreshLevelUpPositions: () => Promise<void>;
	iterations?: number;
	intervalMs?: number;
};

const BLIND_REFRESH_ITERATIONS = 8;
const BLIND_REFRESH_INTERVAL_MS = 2_000;

type PendingTarget =
	| {
			kind: "shares";
			venue: VenuePosition["venue"];
			identity: string;
			baselineShares: number;
	  }
	| { kind: "cash"; chain: CollateralChainKey; baselineCash: number }
	| {
			kind: "levelup";
			marketId: string;
			side: "yes" | "no";
			baselineLevelUp: number;
	  };

function pendingHasDflowShares(pending: PendingTarget[]): boolean {
	return pending.some(
		(t) => t.kind === "shares" && t.venue === "dflow",
	);
}

function pendingHasPolymarketShares(pending: PendingTarget[]): boolean {
	return pending.some(
		(t) => t.kind === "shares" && t.venue === "polymarket",
	);
}

function pendingHasLevelUp(pending: PendingTarget[]): boolean {
	return pending.some((t) => t.kind === "levelup");
}

function readVenueShares(
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
			return findShares(
				queryClient.getQueryData<VenuePosition[]>([
					"polymarket-positions",
					safe,
				]),
			);
		}
		case "predictfun": {
			const wallet =
				(addresses.predictWallet ?? "").trim().toLowerCase() || null;
			if (!wallet) return null;
			const rows = queryClient.getQueryData<VenuePosition[]>([
				"predict-positions",
				wallet,
			]);
			let n = findShares(rows);
			if (n > 0) return n;
			// Same REST rows as the trade box: if watch key is `predictfun:<token>` but
			// the row only lines up by normalized on-chain id, count that position.
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
			return findShares(getCachedDflowPositions(queryClient, owner));
		}
		case "limitless": {
			return findShares(
				queryClient.getQueryData<VenuePosition[]>(
					limitlessQueryKeys.positionsVenue,
				),
			);
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

function buildWatchTargets(
	route: RoutePlan,
	execution: RouteExecution,
	baseline: PostTradeBaseline,
	shareIdentityCtx?: ShareIdentityRouteLegContext | null,
): PendingTarget[] {
	const deltas = computeExpectedDeltas(
		route,
		execution,
		baseline,
		shareIdentityCtx,
	);
	const out: PendingTarget[] = [];
	const seenShare = new Set<string>();
	for (const identity of deltas.expectedShares.keys()) {
		if (seenShare.has(identity)) continue;
		seenShare.add(identity);
		const venue = identity.split(":", 1)[0] as VenuePosition["venue"];
		out.push({
			kind: "shares",
			venue,
			identity,
			baselineShares: baseline.shares.get(identity) ?? 0,
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
				"[postTradeSync] levelUp leg id differs from baseline page id — using baseline id for reads",
				{ routeMarketId: routeId, baselineMarketId: baselineId },
			);
		}
		const baselineLevelUp =
			deltas.levelUp.side === "yes"
				? baseline.levelUp.yes
				: baseline.levelUp.no;
		out.push({
			kind: "levelup",
			marketId: baselineId,
			side: deltas.levelUp.side,
			baselineLevelUp,
		});
	}
	return out;
}

function valueDiverged(
	observed: number | null,
	baseline: number,
	tol: number,
): boolean {
	if (observed == null || !Number.isFinite(observed)) return false;
	return Math.abs(observed - baseline) > tol;
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

function exitBurstSpecFromPending(pending: readonly PendingTarget[]): {
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

/** Minimal `PendingTarget[]` so exit-burst logic matches blind-refresh intent. */
function buildSyntheticBlindPending(
	accountVenues: readonly AccountVenueKey[],
	includeLevelUpRpc: boolean,
): PendingTarget[] {
	const out: PendingTarget[] = [];
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
		});
	}
	if (includeLevelUpRpc) {
		out.push({
			kind: "levelup",
			marketId: "",
			side: "yes",
			baselineLevelUp: 0,
		});
	}
	out.push({
		kind: "cash",
		chain: "base",
		baselineCash: 0,
	});
	return out;
}

type RefetchPassOpts = {
	venueShareKeys: AccountVenueKey[];
	predictMarketSupplement: boolean;
	dflowOutcomeBalance: boolean;
	limitlessPortfolioAndCollateral: boolean;
	levelUpRpc: boolean;
	cash: boolean;
};

/**
 * One hydration pass: canonical venue refetches via AccountData, narrow
 * `queryClient` refetches only where AccountData does not cover (Predict market
 * detail rows, DFlow outcome balance mint rows, Limitless portfolio subtree).
 */
async function runPostTradeRefetchPass(
	queryClient: QueryClient,
	req: Pick<PostTradeSyncRequest, "refreshLevelUpPositions">,
	account: PostTradeAccountRefetch,
	opts: RefetchPassOpts,
): Promise<void> {
	const tasks: Promise<unknown>[] = [];
	const pushTask = (label: string, p: Promise<unknown>): void => {
		tasks.push(withTimeout(p, REFETCH_TASK_TIMEOUT_MS, label));
	};
	for (const v of opts.venueShareKeys) {
		pushTask(
			`postTradeSync AccountData positions(${v})`,
			account.refreshVenuePositions(v),
		);
	}
	if (opts.predictMarketSupplement) {
		// `AccountData.refresh.positions("predict")` does not refetch `["predict-market", …]`
		// — trade box YES/NO mapping uses that query (`useTradeBoxShareBalances`).
		pushTask(
			"postTradeSync predict-market",
			queryClient.refetchQueries({
				queryKey: ["predict-market"],
				type: "all",
			}),
		);
	}
	if (opts.dflowOutcomeBalance) {
		pushTask(
			"postTradeSync dflow-outcome-balance",
			queryClient.refetchQueries({
				queryKey: ["dflow-outcome-balance"],
				type: "all",
			}),
		);
	}
	if (opts.limitlessPortfolioAndCollateral) {
		pushTask(
			"postTradeSync limitless",
			queryClient.refetchQueries({
				queryKey: [...LIMITLESS_QUERY_ROOT],
				type: "all",
			}),
		);
		pushTask(
			"postTradeSync limitless-collateral",
			queryClient.refetchQueries({
				queryKey: [COLLATERAL_TOKENS_QUERY_KEY],
				type: "all",
			}),
		);
		debugLimitlessPortfolio("postTradeSync: refetched LIMITLESS_QUERY_ROOT", {
			queryKey: [...LIMITLESS_QUERY_ROOT],
		});
	}
	if (opts.levelUpRpc) {
		pushTask(
			"postTradeSync refreshLevelUpPositions",
			req.refreshLevelUpPositions(),
		);
	}
	if (opts.cash) {
		pushTask(
			"postTradeSync bridge-funding-balances",
			queryClient.invalidateQueries({
				queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
			}),
		);
		pushTask(
			"postTradeSync collateral-query-keys",
			queryClient.invalidateQueries({ queryKey: [COLLATERAL_TOKENS_QUERY_KEY] }),
		);
		pushTask("postTradeSync AccountData.refresh.cash", account.refreshCash());
	}
	await Promise.allSettled(tasks);
}

function refetchPassOptsFromPending(pending: readonly PendingTarget[]): RefetchPassOpts {
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

async function refetchForPending(
	queryClient: QueryClient,
	pending: PendingTarget[],
	req: PostTradeSyncRequest,
	account: PostTradeAccountRefetch,
): Promise<boolean> {
	const opts = refetchPassOptsFromPending(pending);
	await runPostTradeRefetchPass(queryClient, req, account, opts);
	return opts.levelUpRpc;
}

async function runPostTradeExitBurst(
	queryClient: QueryClient,
	req: Pick<PostTradeSyncRequest, "refreshLevelUpPositions">,
	account: PostTradeAccountRefetch,
	pendingSnapshot: readonly PendingTarget[],
): Promise<void> {
	const spec = exitBurstSpecFromPending(pendingSnapshot);
	await runPostTradeRefetchPass(queryClient, req, account, {
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

async function refetchCollateralCachesForClaim(
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

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export type PostTradeBalanceSyncApi = {
	start: (req: PostTradeSyncRequest) => void;
	/**
	 * When baseline correlation fails (e.g. `routeId` drift), still hammer venue
	 * queries + LevelUp RPC + cash for a bounded window so the UI converges.
	 */
	startBlindBalanceRefresh: (req: BlindPostTradeBalanceRefreshRequest) => void;
	/**
	 * After a winnings claim, keep the header cash skeleton up until the
	 * collateral query shows a total that diverges from `baselineTotalCash`
	 * (same tolerance as post-trade cash convergence).
	 */
	startCashAfterClaim: (req: {
		queryClient: QueryClient;
		refetchCollateral: () => Promise<FundingStableBalancesHuman | undefined>;
		baselineTotalCash: number;
	}) => void;
};

const PostTradeBalanceSyncContext = createContext<PostTradeBalanceSyncApi | null>(
	null,
);

const PostTradeBalanceSyncUiContext = createContext<string | null>(null);

const ClaimCashSyncPendingContext = createContext(false);

/**
 * Provider that hosts post-trade refetch + baseline-divergence checks. Mount once
 * near the app root so sync survives trade-box unmounts.
 */
export function PostTradeBalanceSyncProvider({ children }: { children: ReactNode }) {
	const sessionRef = useRef(0);
	const claimCashSessionRef = useRef(0);
	const [pendingSyncUiKey, setPendingSyncUiKey] = useState<string | null>(null);
	const [claimCashSyncPending, setClaimCashSyncPending] = useState(false);

	const { refresh } = useAccountData();
	const accountPostTradeRef = useRef<PostTradeAccountRefetch>({
		refreshVenuePositions: async () => {},
		refreshCash: async () => {},
	});
	accountPostTradeRef.current = {
		refreshVenuePositions: (venue) => refresh.positions(venue),
		refreshCash: () => refresh.cash(),
	};

	const startBlindBalanceRefresh = useCallback(
		(breq: BlindPostTradeBalanceRefreshRequest) => {
			const session = ++sessionRef.current;
			setPendingSyncUiKey(breq.syncUiKey ?? null);

			const wallClockTimer = setTimeout(() => {
				if (sessionRef.current !== session) return;
				if (import.meta.env.DEV) {
					console.warn(
						"[postTradeSync] blind refresh wall-clock fail-safe; clearing spinner",
						{ wallClockMs: POST_TRADE_SYNC_WALL_CLOCK_MS },
					);
				}
				sessionRef.current += 1;
				setPendingSyncUiKey(null);
			}, POST_TRADE_SYNC_WALL_CLOCK_MS);

			const iterations = breq.iterations ?? BLIND_REFRESH_ITERATIONS;
			const intervalMs = breq.intervalMs ?? BLIND_REFRESH_INTERVAL_MS;

			void (async () => {
				try {
					const account = accountPostTradeRef.current;
					const reqSlice = {
						refreshLevelUpPositions: breq.refreshLevelUpPositions,
					};
					for (let i = 0; i < iterations; i++) {
						if (sessionRef.current !== session) return;
						await runPostTradeRefetchPass(
							breq.queryClient,
							reqSlice,
							account,
							{
								venueShareKeys: [...breq.accountVenues],
								predictMarketSupplement:
									breq.accountVenues.includes("predict"),
								dflowOutcomeBalance: breq.accountVenues.includes("dflow"),
								limitlessPortfolioAndCollateral:
									breq.accountVenues.includes("limitless"),
								levelUpRpc: breq.includeLevelUpRpc,
								cash: true,
							},
						);
						if (breq.includeLevelUpRpc) {
							await sleep(LEVELUP_READ_DELAY_MS);
							if (sessionRef.current !== session) return;
						}
						if (i < iterations - 1) {
							await sleep(intervalMs);
							if (sessionRef.current !== session) return;
						}
					}
					if (sessionRef.current === session) {
						await runPostTradeExitBurst(
							breq.queryClient,
							reqSlice,
							account,
							buildSyntheticBlindPending(
								breq.accountVenues,
								breq.includeLevelUpRpc,
							),
						);
					}
				} finally {
					clearTimeout(wallClockTimer);
					if (sessionRef.current === session) {
						setPendingSyncUiKey(null);
					}
				}
			})();
		},
		[],
	);

	const start = useCallback(
		(req: PostTradeSyncRequest) => {
			const session = ++sessionRef.current;
			setPendingSyncUiKey(req.syncUiKey ?? null);

			/**
			 * Wall-clock fail-safe: if the IIFE below somehow stalls (e.g. a
			 * future regression re-introduces an un-bounded await), the spinner
			 * must still clear so the user does not see "forever spinner". We
			 * also bump `sessionRef.current` to cancel the in-flight loop on
			 * its next checkpoint.
			 */
			const wallClockTimer = setTimeout(() => {
				if (sessionRef.current !== session) return;
				if (import.meta.env.DEV) {
					console.warn(
						"[postTradeSync] wall-clock fail-safe fired; forcing spinner clear",
						{ wallClockMs: POST_TRADE_SYNC_WALL_CLOCK_MS },
					);
				}
				sessionRef.current += 1;
				setPendingSyncUiKey(null);
			}, POST_TRADE_SYNC_WALL_CLOCK_MS);

			void (async () => {
				try {
					const account = accountPostTradeRef.current;
					const initialPending = buildWatchTargets(
						req.route,
						req.execution,
						req.baseline,
						req.shareIdentityCtx,
					);
					if (initialPending.length === 0) {
						if (sessionRef.current === session) {
							setPendingSyncUiKey(null);
						}
						return;
					}

					let pending = initialPending;

					for (let attempt = 0; ; attempt++) {
						if (sessionRef.current !== session) return;

						/**
						 * Cadence preference order: DFlow (Solana-on-chain lag) > Polymarket
						 * (Goldsky indexer usually catches up in seconds — match the
						 * hard-reload feel of ~10 s shares-visible) > default.
						 */
						const dflowPoll = pendingHasDflowShares(pending);
						const polyPoll = !dflowPoll && pendingHasPolymarketShares(pending);
						const levelUpPoll =
							!dflowPoll && !polyPoll && pendingHasLevelUp(pending);
						const maxAttempts = dflowPoll
							? DFLOW_POST_TRADE_MAX_ATTEMPTS
							: polyPoll
								? POLYMARKET_POST_TRADE_MAX_ATTEMPTS
								: levelUpPoll
									? LEVELUP_POST_TRADE_MAX_ATTEMPTS
									: MAX_REFETCH_ATTEMPTS;
						const pollMs = dflowPoll
							? DFLOW_POST_TRADE_POLL_MS
							: polyPoll
								? POLYMARKET_POST_TRADE_POLL_MS
								: levelUpPoll
									? LEVELUP_POST_TRADE_POLL_MS
									: POLL_INTERVAL_MS;

						if (attempt >= maxAttempts) break;

						const levelUpRan = await refetchForPending(
							req.queryClient,
							pending,
							req,
							account,
						);
						if (sessionRef.current !== session) return;

						if (levelUpRan) {
							await sleep(LEVELUP_READ_DELAY_MS);
							if (sessionRef.current !== session) return;
						}

						pending = pending.filter((t) => {
							if (t.kind === "shares") {
								const obs = readVenueShares(
									req.queryClient,
									t.venue,
									t.identity,
									req.addresses,
								);
								return !valueDiverged(obs, t.baselineShares, SHARES_CONVERGENCE_TOL);
							}
							if (t.kind === "cash") {
								const obs = readCashForChain(req.queryClient, t.chain);
								return !valueDiverged(obs, t.baselineCash, CASH_CONVERGENCE_TOL_USD);
							}
							const obs = req.readLevelUpSide(t.marketId, t.side);
							return !valueDiverged(obs, t.baselineLevelUp, SHARES_CONVERGENCE_TOL);
						});

						if (pending.length === 0) {
							if (import.meta.env.DEV) {
								console.log("[postTradeSync] diverged from baseline after attempt", attempt + 1);
							}
							break;
						}

						if (attempt < maxAttempts - 1) {
							await sleep(pollMs);
						}
					}

					if (pending.length > 0 && import.meta.env.DEV) {
						console.warn(
							"[postTradeSync] timeout — balances may still match baseline. Pending:",
							pending,
						);
					}

					if (sessionRef.current === session) {
						await runPostTradeExitBurst(
							req.queryClient,
							req,
							account,
							initialPending,
						);
						setPendingSyncUiKey(null);
					}
				} finally {
					clearTimeout(wallClockTimer);
				}
			})();
		},
		[],
	);

	const startCashAfterClaim = useCallback(
		(req: {
			queryClient: QueryClient;
			refetchCollateral: () => Promise<FundingStableBalancesHuman | undefined>;
			baselineTotalCash: number;
		}) => {
			const session = ++claimCashSessionRef.current;
			setClaimCashSyncPending(true);
			void (async () => {
				try {
					for (let attempt = 0; attempt < MAX_REFETCH_ATTEMPTS; attempt++) {
						if (claimCashSessionRef.current !== session) return;

						await refetchCollateralCachesForClaim(
							req.queryClient,
							req.refetchCollateral,
						);

						const obs = readTotalCashHumanFromQueryClient(req.queryClient);
						if (
							obs != null &&
							valueDiverged(
								obs,
								req.baselineTotalCash,
								CASH_CONVERGENCE_TOL_USD,
							)
						) {
							break;
						}

						if (attempt < MAX_REFETCH_ATTEMPTS - 1) {
							await sleep(POLL_INTERVAL_MS);
						}
					}
				} finally {
					if (claimCashSessionRef.current === session) {
						setClaimCashSyncPending(false);
					}
				}
			})();
		},
		[],
	);

	const api = useMemo<PostTradeBalanceSyncApi>(
		() => ({ start, startBlindBalanceRefresh, startCashAfterClaim }),
		[start, startBlindBalanceRefresh, startCashAfterClaim],
	);

	return (
		<PostTradeBalanceSyncContext.Provider value={api}>
			<PostTradeBalanceSyncUiContext.Provider value={pendingSyncUiKey}>
				<ClaimCashSyncPendingContext.Provider value={claimCashSyncPending}>
					{children}
				</ClaimCashSyncPendingContext.Provider>
			</PostTradeBalanceSyncUiContext.Provider>
		</PostTradeBalanceSyncContext.Provider>
	);
}

export function usePostTradeBalanceSync(): PostTradeBalanceSyncApi {
	const ctx = useContext(PostTradeBalanceSyncContext);
	if (!ctx) {
		if (import.meta.env.DEV) {
			console.warn(
				"[usePostTradeBalanceSync] No PostTradeBalanceSyncProvider in tree — sync disabled",
			);
		}
		return { start: () => {}, startBlindBalanceRefresh: () => {}, startCashAfterClaim: () => {} };
	}
	return ctx;
}

/** True while post-claim polling waits for header cash to diverge from the pre-claim snapshot. */
export function useClaimCashSyncPending(): boolean {
	return useContext(ClaimCashSyncPendingContext);
}

/** True while post-trade sync is waiting for server-backed divergence for this page market. */
export function usePostTradeBalanceSyncPending(syncUiKey: string | null): boolean {
	const pendingKey = useContext(PostTradeBalanceSyncUiContext);
	return Boolean(syncUiKey && pendingKey && pendingKey === syncUiKey);
}
