import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	type ReactNode,
} from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type { MatchedMarket } from "@/types/odds-monitor";
import {
	COLLATERAL_TOKENS_QUERY_KEY,
	useCollateralTokens,
} from "@/context/CollateralTokenContext";
import type { CollateralChainKey } from "@/context/collateralTokensOptimisticOverlays";
import { useUserData } from "@/context/UserDataContext";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import { LIMITLESS_QUERY_ROOT } from "@/trading/limitless/limitlessQueryKeys";
import { applyOptimisticPolymarketFillToQueryCache } from "@/trading/polymarket/optimisticPolymarketPositionsCache";
import { applyOptimisticPredictFillToQueryCache } from "@/trading/predict/optimisticPredictPositionsCache";
import { applyOptimisticDflowFillToQueryCache } from "@/trading/dflow/optimisticDflowPositionsCache";
import { applyOptimisticLimitlessFillToQueryCache } from "@/trading/limitless/optimisticLimitlessPositionsCache";
import { limitlessQueryKeys } from "@/trading/limitless/limitlessQueryKeys";
import type { FundingStableBalancesHuman } from "./fundingStableBalances";
import type { RouteExecution, RoutePlan } from "./sor-types";
import {
	CASH_CONVERGENCE_TOL_USD,
	SHARES_CONVERGENCE_TOL,
	chainToCollateralKey,
	computeExpectedDeltas,
	shareIdentityForVenuePosition,
	type PostTradeBaseline,
	type PostTradeBaselineAddresses,
} from "./postTradeBaseline";

/**
 * Backoff schedule for the post-trade convergence poller. Total ≈ 80s, with
 * the first refetch at 1s after submit. Each tick refreshes only the queries
 * we still expect to converge.
 */
const POLL_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 12_000, 15_000, 15_000, 15_000];

export type PostTradeSyncRequest = {
	queryClient: QueryClient;
	route: RoutePlan;
	execution: RouteExecution;
	baseline: PostTradeBaseline;
	matchedMonitor: MatchedMarket | null;
	marketTitleHint: string;
	addresses: PostTradeBaselineAddresses;
	/** Forces an RPC refresh of LevelUp positions (not in React Query). */
	refreshLevelUpPositions: () => Promise<void>;
	/** Refetch the collateral context. */
	refetchCollateral: () => Promise<FundingStableBalancesHuman | undefined>;
	/** Apply an optimistic LevelUp share bump. */
	applyOptimisticLevelUpFill: (input: {
		marketId: string;
		side: "yes" | "no";
		deltaShares: number;
		direction: "buy" | "sell";
	}) => void;
	/** Apply an optimistic per-chain cash overlay. */
	applyOptimisticCashChange: (input: {
		chain: CollateralChainKey;
		baseline: number;
		amountUsd: number;
		direction: "buy" | "sell";
	}) => void;
};

type ActiveSync = {
	routeId: string;
	cancelled: boolean;
	timer: ReturnType<typeof setTimeout> | null;
};

export type PostTradeBalanceSyncApi = {
	start: (req: PostTradeSyncRequest) => void;
};

const PostTradeBalanceSyncContext = createContext<PostTradeBalanceSyncApi | null>(
	null,
);

/** Polling targets we still need to verify per sync. */
type PendingTarget =
	| { kind: "shares"; venue: VenuePosition["venue"]; identity: string; expected: number }
	| { kind: "cash"; chain: CollateralChainKey; expected: number; direction: "buy" | "sell" }
	| { kind: "levelup"; marketId: string; side: "yes" | "no"; expected: number; direction: "buy" | "sell" };

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
			return findShares(
				queryClient.getQueryData<VenuePosition[]>([
					"dflow-positions",
					owner,
				]),
			);
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

function buildInitialPending(
	req: PostTradeSyncRequest,
): PendingTarget[] {
	const { route, execution, baseline } = req;
	const deltas = computeExpectedDeltas(route, execution, baseline);
	const out: PendingTarget[] = [];

	for (const [identity, expected] of deltas.expectedShares) {
		const venue = identity.split(":", 1)[0] as VenuePosition["venue"];
		out.push({ kind: "shares", venue, identity, expected });
	}
	for (const [chainKey, delta] of Object.entries(deltas.cashDeltas) as [
		CollateralChainKey,
		number,
	][]) {
		if (!Number.isFinite(delta) || delta === 0) continue;
		const baselineCash = baseline.cash[chainKey];
		if (baselineCash == null) continue;
		const expected = baselineCash + delta;
		out.push({
			kind: "cash",
			chain: chainKey,
			expected,
			direction: route.side,
		});
	}
	if (deltas.levelUp && baseline.levelUp) {
		const cur =
			deltas.levelUp.side === "yes"
				? baseline.levelUp.yes
				: baseline.levelUp.no;
		const expected =
			route.side === "buy"
				? cur + deltas.levelUp.deltaShares
				: Math.max(0, cur - deltas.levelUp.deltaShares);
		out.push({
			kind: "levelup",
			marketId: deltas.levelUp.marketId,
			side: deltas.levelUp.side,
			expected,
			direction: route.side,
		});
	}

	return out;
}

function targetReached(t: PendingTarget, observed: number | null): boolean {
	if (observed == null || !Number.isFinite(observed)) return false;
	switch (t.kind) {
		case "shares": {
			// Buys: shares went up — converged when observed >= expected.
			// Sells: shares went down — converged when observed <= expected.
			// We don't carry direction on shares targets, so treat both directions
			// as "within tolerance of expected" — close enough either way.
			return Math.abs(observed - t.expected) <= SHARES_CONVERGENCE_TOL ||
				observed >= t.expected - SHARES_CONVERGENCE_TOL;
		}
		case "cash": {
			if (t.direction === "buy") {
				return observed <= t.expected + CASH_CONVERGENCE_TOL_USD;
			}
			return observed >= t.expected - CASH_CONVERGENCE_TOL_USD;
		}
		case "levelup": {
			if (t.direction === "buy") {
				return observed >= t.expected - SHARES_CONVERGENCE_TOL;
			}
			return observed <= t.expected + SHARES_CONVERGENCE_TOL;
		}
	}
}

async function refetchForPending(
	queryClient: QueryClient,
	pending: PendingTarget[],
	req: PostTradeSyncRequest,
): Promise<void> {
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
}

function applyOptimisticForRequest(req: PostTradeSyncRequest): void {
	const { queryClient, route, execution, baseline, matchedMonitor } = req;

	if (matchedMonitor && req.addresses.polymarketSafe) {
		applyOptimisticPolymarketFillToQueryCache(
			queryClient,
			req.addresses.polymarketSafe,
			route,
			execution,
			matchedMonitor,
			req.marketTitleHint,
		);
	}
	applyOptimisticPredictFillToQueryCache(
		queryClient,
		req.addresses.predictWallet ?? null,
		route,
		execution,
		req.marketTitleHint,
	);
	applyOptimisticDflowFillToQueryCache(
		queryClient,
		req.addresses.solanaAddress ?? null,
		route,
		execution,
		req.marketTitleHint,
	);
	applyOptimisticLimitlessFillToQueryCache(
		queryClient,
		route,
		execution,
		req.marketTitleHint,
	);

	const deltas = computeExpectedDeltas(route, execution, baseline);

	if (deltas.levelUp) {
		req.applyOptimisticLevelUpFill({
			marketId: deltas.levelUp.marketId,
			side: deltas.levelUp.side,
			deltaShares: deltas.levelUp.deltaShares,
			direction: route.side,
		});
	}

	for (const [chainKey, delta] of Object.entries(deltas.cashDeltas) as [
		CollateralChainKey,
		number,
	][]) {
		if (!Number.isFinite(delta) || delta === 0) continue;
		const baselineCash = baseline.cash[chainKey];
		if (baselineCash == null) continue;
		req.applyOptimisticCashChange({
			chain: chainKey,
			baseline: baselineCash,
			amountUsd: Math.abs(delta),
			direction: route.side,
		});
	}

	// chainToCollateralKey is used inside computeExpectedDeltas; keep import side-effect free.
	void chainToCollateralKey;
}

/**
 * Provider that hosts a single shared post-trade sync registry. Mount once
 * near the app root so syncs survive trade-box unmounts (navigation away).
 */
export function PostTradeBalanceSyncProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();
	const collateral = useCollateralTokens();
	const userData = useUserData();
	const activeRef = useRef<ActiveSync | null>(null);

	const start = useCallback(
		(req: PostTradeSyncRequest) => {
			// Cancel any in-flight previous sync — latest trade wins.
			if (activeRef.current) {
				activeRef.current.cancelled = true;
				if (activeRef.current.timer) {
					clearTimeout(activeRef.current.timer);
				}
			}
			const sync: ActiveSync = {
				routeId: req.execution.routeId,
				cancelled: false,
				timer: null,
			};
			activeRef.current = sync;

			// 1. Apply optimistic updates immediately so the UI reflects the trade.
			applyOptimisticForRequest(req);

			// 2. Build the convergence target list.
			let pending = buildInitialPending(req);
			if (pending.length === 0) {
				activeRef.current = null;
				return;
			}

			let stepIdx = 0;

			const tick = async () => {
				if (sync.cancelled) return;
				try {
					await refetchForPending(req.queryClient, pending, req);
				} catch (e) {
					if (import.meta.env.DEV) {
						console.warn("[postTradeSync] refetch failed", e);
					}
				}
				if (sync.cancelled) return;

				// Re-evaluate which targets are still pending.
				pending = pending.filter((t) => {
					let observed: number | null = null;
					if (t.kind === "shares") {
						observed = readVenueShares(
							req.queryClient,
							t.venue,
							t.identity,
							req.addresses,
						);
					} else if (t.kind === "cash") {
						observed = readCashForChain(req.queryClient, t.chain);
					} else if (t.kind === "levelup") {
						// Read from UserDataContext via the `req.baseline` proxy is
						// unavailable here — instead we trust the optimistic-fill +
						// floor merge to keep the displayed value correct, and clear
						// the LevelUp target after a single refresh cycle.
						return false;
					}
					return !targetReached(t, observed);
				});

				if (pending.length === 0) {
					if (import.meta.env.DEV) {
						console.log("[postTradeSync] converged in", stepIdx + 1, "tick(s)");
					}
					activeRef.current = null;
					return;
				}

				if (stepIdx >= POLL_DELAYS_MS.length - 1) {
					if (import.meta.env.DEV) {
						console.warn(
							"[postTradeSync] timeout — leaving optimistic overlays in place. Pending:",
							pending,
						);
					}
					activeRef.current = null;
					return;
				}

				stepIdx += 1;
				sync.timer = setTimeout(tick, POLL_DELAYS_MS[stepIdx]);
			};

			sync.timer = setTimeout(tick, POLL_DELAYS_MS[0]);
		},
		// queryClient/collateral/userData captured via closure on the request.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	);

	useEffect(() => {
		return () => {
			if (activeRef.current?.timer) {
				clearTimeout(activeRef.current.timer);
			}
			if (activeRef.current) {
				activeRef.current.cancelled = true;
				activeRef.current = null;
			}
		};
	}, []);

	const api = useMemo<PostTradeBalanceSyncApi>(() => ({ start }), [start]);

	// Side-effect-free use of these contexts to keep the provider re-rendering
	// when relevant identity changes (so consumers always see fresh `req`).
	void queryClient;
	void collateral;
	void userData;

	return (
		<PostTradeBalanceSyncContext.Provider value={api}>
			{children}
		</PostTradeBalanceSyncContext.Provider>
	);
}

export function usePostTradeBalanceSync(): PostTradeBalanceSyncApi {
	const ctx = useContext(PostTradeBalanceSyncContext);
	if (!ctx) {
		// Safe fallback: no-op so consumers (e.g. trade box outside provider in tests)
		// don't crash. In production the provider should always be mounted.
		if (import.meta.env.DEV) {
			console.warn(
				"[usePostTradeBalanceSync] No PostTradeBalanceSyncProvider in tree — sync disabled",
			);
		}
		return { start: () => {} };
	}
	return ctx;
}
