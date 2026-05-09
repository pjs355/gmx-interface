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
} from "./postTradeBaseline";
import { getCachedDflowPositions } from "@/trading/dflow/dflowPositionsQueryCache";

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
};

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
			return findShares(
				queryClient.getQueryData<VenuePosition[]>([
					"predict-positions",
					wallet,
				]),
			);
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
): PendingTarget[] {
	const deltas = computeExpectedDeltas(route, execution, baseline);
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
	if (
		deltas.levelUp &&
		baseline.levelUp &&
		baseline.levelUp.marketId === deltas.levelUp.marketId
	) {
		const baselineLevelUp =
			deltas.levelUp.side === "yes"
				? baseline.levelUp.yes
				: baseline.levelUp.no;
		out.push({
			kind: "levelup",
			marketId: deltas.levelUp.marketId,
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

async function refetchForPending(
	queryClient: QueryClient,
	pending: PendingTarget[],
	req: PostTradeSyncRequest,
): Promise<boolean> {
	const venueSharePending = new Set<VenuePosition["venue"]>();
	let cashPending = false;
	let levelUpPending = false;

	for (const t of pending) {
		if (t.kind === "shares") venueSharePending.add(t.venue);
		else if (t.kind === "cash") cashPending = true;
		else if (t.kind === "levelup") levelUpPending = true;
	}

	const tasks: Promise<unknown>[] = [];
	if (venueSharePending.has("polymarket")) {
		tasks.push(
			queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] }),
		);
	}
	if (venueSharePending.has("predictfun")) {
		tasks.push(
			queryClient.invalidateQueries({ queryKey: ["predict-positions"] }),
		);
		tasks.push(
			queryClient.invalidateQueries({ queryKey: ["predict-outcome-shares"] }),
		);
		tasks.push(
			queryClient.invalidateQueries({ queryKey: ["predict-usdt-balance"] }),
		);
	}
	if (venueSharePending.has("dflow")) {
		tasks.push(queryClient.invalidateQueries({ queryKey: ["dflow-positions"] }));
		tasks.push(
			queryClient.invalidateQueries({ queryKey: ["dflow-outcome-balance"] }),
		);
	}
	if (venueSharePending.has("limitless")) {
		tasks.push(
			queryClient.invalidateQueries({ queryKey: [...LIMITLESS_QUERY_ROOT] }),
		);
		debugLimitlessPortfolio("postTradeSync: invalidated LIMITLESS_QUERY_ROOT", {
			queryKey: [...LIMITLESS_QUERY_ROOT],
		});
	}
	if (cashPending) {
		tasks.push(
			queryClient.invalidateQueries({
				queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
			}),
		);
		tasks.push(
			queryClient.invalidateQueries({ queryKey: [COLLATERAL_TOKENS_QUERY_KEY] }),
		);
		tasks.push(req.refetchCollateral());
	}
	if (levelUpPending) {
		tasks.push(req.refreshLevelUpPositions());
	}
	await Promise.allSettled(tasks);
	return levelUpPending;
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

	const start = useCallback(
		(req: PostTradeSyncRequest) => {
			const session = ++sessionRef.current;
			setPendingSyncUiKey(req.syncUiKey ?? null);

			void (async () => {
				let pending = buildWatchTargets(
					req.route,
					req.execution,
					req.baseline,
				);
				if (pending.length === 0) {
					if (sessionRef.current === session) {
						setPendingSyncUiKey(null);
					}
					return;
				}

				for (let attempt = 0; ; attempt++) {
					if (sessionRef.current !== session) return;

					const dflowPoll = pendingHasDflowShares(pending);
					const maxAttempts = dflowPoll
						? DFLOW_POST_TRADE_MAX_ATTEMPTS
						: MAX_REFETCH_ATTEMPTS;
					const pollMs = dflowPoll
						? DFLOW_POST_TRADE_POLL_MS
						: POLL_INTERVAL_MS;

					if (attempt >= maxAttempts) break;

					const levelUpRan = await refetchForPending(
						req.queryClient,
						pending,
						req,
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
					setPendingSyncUiKey(null);
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
		() => ({ start, startCashAfterClaim }),
		[start, startCashAfterClaim],
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
		return { start: () => {}, startCashAfterClaim: () => {} };
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
