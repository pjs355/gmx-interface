import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useAccountData } from "@/context/AccountDataContext";
import type { FundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";
import { pollWithMaxAttempts } from "@/trading/sor/pollAccountRefresh";
import {
	captureAccountReconcileSnapshot,
	evidenceSnapshotChanged,
	type AccountReconcileSnapshot,
} from "@/trading/sor/postTradeReconcile";
import {
	BLIND_REFRESH_INTERVAL_MS,
	BLIND_REFRESH_ITERATIONS,
	buildSyntheticBlindPending,
	buildWatchTargets,
	filterUnresolvedPending,
	pendingHasDflowShares,
	pendingHasLevelUp,
	pendingHasPolymarketShares,
	DFLOW_POST_TRADE_MAX_ATTEMPTS,
	DFLOW_POST_TRADE_POLL_MS,
	LEVELUP_POST_TRADE_MAX_ATTEMPTS,
	LEVELUP_POST_TRADE_POLL_MS,
	MAX_REFETCH_ATTEMPTS,
	POLL_INTERVAL_MS,
	POLYMARKET_POST_TRADE_MAX_ATTEMPTS,
	POLYMARKET_POST_TRADE_POLL_MS,
	POST_TRADE_SYNC_WALL_CLOCK_MS,
	LEVELUP_READ_DELAY_MS,
	performPostTradeDataRefreshPass,
	refetchCollateralCachesForClaim,
	refetchForPending,
	refetchPassOptsFromPending,
	runPostTradeExitBurst,
	sleep,
	type BlindPostTradeBalanceRefreshRequest,
	type PostTradeAccountRefetch,
	type PostTradePendingTarget,
	type PostTradeSyncRequest,
	readTotalCashHumanFromQueryClient,
	valueDiverged,
	CASH_CONVERGENCE_TOL_USD,
} from "@/trading/sor/performPostTradeDataRefresh";

export type SorPostTradeSyncInput = PostTradeSyncRequest & {
	operationId: string;
	preTradeSnapshot: AccountReconcileSnapshot | null;
};

export type PostTradeAccountSyncApi = {
	runAfterSorFilled: (input: SorPostTradeSyncInput) => void;
	startBlindBalanceRefresh: (req: BlindPostTradeBalanceRefreshRequest) => void;
	startCashAfterClaim: (req: {
		queryClient: QueryClient;
		refetchCollateral: () => Promise<FundingStableBalancesHuman | undefined>;
		baselineTotalCash: number;
	}) => void;
};

const PostTradeAccountSyncContext = createContext<PostTradeAccountSyncApi | null>(
	null,
);

const PostTradeAccountSyncUiContext = createContext<string | null>(null);
const ClaimCashSyncPendingContext = createContext(false);

function computePollBudget(pending: PostTradePendingTarget[]): {
	maxAttempts: number;
	delayMs: number;
} {
	const dflowPoll = pendingHasDflowShares(pending);
	const polyPoll = !dflowPoll && pendingHasPolymarketShares(pending);
	const levelUpPoll = !dflowPoll && !polyPoll && pendingHasLevelUp(pending);
	const maxAttempts = dflowPoll
		? DFLOW_POST_TRADE_MAX_ATTEMPTS
		: polyPoll
			? POLYMARKET_POST_TRADE_MAX_ATTEMPTS
			: levelUpPoll
				? LEVELUP_POST_TRADE_MAX_ATTEMPTS
				: MAX_REFETCH_ATTEMPTS;
	const delayMs = dflowPoll
		? DFLOW_POST_TRADE_POLL_MS
		: polyPoll
			? POLYMARKET_POST_TRADE_POLL_MS
			: levelUpPoll
				? LEVELUP_POST_TRADE_POLL_MS
				: POLL_INTERVAL_MS;
	return { maxAttempts, delayMs };
}

export function PostTradeAccountSyncProvider({ children }: { children: ReactNode }) {
	const sessionRef = useRef(0);
	const claimCashSessionRef = useRef(0);
	const [pendingSyncUiKey, setPendingSyncUiKey] = useState<string | null>(null);
	const [claimCashSyncPending, setClaimCashSyncPending] = useState(false);

	const accountData = useAccountData();
	const accountDataRef = useRef(accountData);
	accountDataRef.current = accountData;

	const accountPostTradeRef = useRef<PostTradeAccountRefetch>({
		refreshVenuePositions: async () => {},
		refreshCash: async () => {},
	});
	accountPostTradeRef.current = {
		refreshVenuePositions: (venue) => accountData.refresh.positions(venue),
		refreshCash: () => accountData.refresh.cash(),
	};

	const runAfterSorFilled = useCallback(
		(input: SorPostTradeSyncInput) => {
			const session = ++sessionRef.current;
			setPendingSyncUiKey(input.syncUiKey ?? null);

			const wallClockTimer = setTimeout(() => {
				if (sessionRef.current !== session) return;
				if (import.meta.env.DEV) {
					console.warn("[postTradeAccountSync] wall-clock fail-safe", {
						wallClockMs: POST_TRADE_SYNC_WALL_CLOCK_MS,
						operationId: input.operationId,
					});
				}
				sessionRef.current += 1;
				setPendingSyncUiKey(null);
			}, POST_TRADE_SYNC_WALL_CLOCK_MS);

			void (async () => {
				const logBase = {
					operationId: input.operationId,
					marketId: input.syncUiKey,
					routeId: input.execution.routeId,
				};
				try {
					console.info("[postTradeAccountSync] account refresh started", logBase);
					const account = accountPostTradeRef.current;
					const initialPending = buildWatchTargets(
						input.route,
						input.execution,
						input.baseline,
						input.shareIdentityCtx,
					);
					if (initialPending.length === 0) {
						if (sessionRef.current === session) {
							setPendingSyncUiKey(null);
						}
						console.info("[postTradeAccountSync] no watch targets; done", logBase);
						return;
					}

					const { maxAttempts, delayMs } = computePollBudget(initialPending);
					let refreshError: unknown = null;

					try {
						await performPostTradeDataRefreshPass(
							input.queryClient,
							input,
							account,
							refetchPassOptsFromPending(initialPending),
						);
						if (input.baseline.levelUp?.marketId) {
							await sleep(LEVELUP_READ_DELAY_MS);
						}
					} catch (e) {
						refreshError = e;
						console.error("[postTradeAccountSync] first refresh pass failed", {
							...logBase,
							error: e instanceof Error ? e.message : String(e),
						});
					}

					const readSnapshot = (): AccountReconcileSnapshot =>
						captureAccountReconcileSnapshot({
							positions: accountDataRef.current.positions,
							cashTotal: accountDataRef.current.cash.total,
							accountVersion: accountDataRef.current.accountVersion,
							readLevelUpSide: input.readLevelUpSide,
							levelUpMarketId: input.baseline.levelUp?.marketId ?? null,
						});

					const tryMarkSynced = (): boolean => {
						if (sessionRef.current !== session) return true;
						const unresolved = filterUnresolvedPending(
							initialPending,
							input.queryClient,
							input.addresses,
							input.readLevelUpSide,
						);
						if (unresolved.length === 0) {
							console.info("[postTradeAccountSync] watch targets resolved", logBase);
							return true;
						}
						// Do not treat global snapshot drift (e.g. Polygon cash moved on fill) as
						// "synced" while venue **share** rows are still catching up on the indexer.
						// Otherwise we exit before `polymarket-positions` refetch shows the new row.
						const stillWaitingOnVenueShares = unresolved.some(
							(t) => t.kind === "shares",
						);
						if (
							!stillWaitingOnVenueShares &&
							input.preTradeSnapshot &&
							evidenceSnapshotChanged(input.preTradeSnapshot, readSnapshot())
						) {
							console.info("[postTradeAccountSync] snapshot evidence matched", logBase);
							return true;
						}
						return false;
					};

					if (!refreshError && tryMarkSynced()) {
						// synced on first pass
					} else if (!refreshError) {
						await pollWithMaxAttempts({
							maxAttempts: Math.max(1, maxAttempts - 1),
							delayMs,
							isStale: () => sessionRef.current !== session,
							done: () => tryMarkSynced(),
							step: async () => {
								if (sessionRef.current !== session) return;
								try {
									const unresolved = filterUnresolvedPending(
										initialPending,
										input.queryClient,
										input.addresses,
										input.readLevelUpSide,
									);
									const levelUpRan = await refetchForPending(
										input.queryClient,
										unresolved,
										input,
										account,
									);
									if (sessionRef.current !== session) return;
									if (levelUpRan) {
										await sleep(LEVELUP_READ_DELAY_MS);
									}
								} catch (e) {
									refreshError = e;
									console.error("[postTradeAccountSync] poll step failed", {
										...logBase,
										error: e instanceof Error ? e.message : String(e),
									});
								}
							},
						});
					}

					if (sessionRef.current === session) {
						await runPostTradeExitBurst(
							input.queryClient,
							input,
							account,
							initialPending,
						);
						console.info("[postTradeAccountSync] exit burst complete", {
							...logBase,
							refreshFailed: Boolean(refreshError),
						});
						setPendingSyncUiKey(null);
					}
				} finally {
					clearTimeout(wallClockTimer);
				}
			})();
		},
		[],
	);

	const startBlindBalanceRefresh = useCallback(
		(breq: BlindPostTradeBalanceRefreshRequest) => {
			const session = ++sessionRef.current;
			setPendingSyncUiKey(breq.syncUiKey ?? null);

			const wallClockTimer = setTimeout(() => {
				if (sessionRef.current !== session) return;
				if (import.meta.env.DEV) {
					console.warn("[postTradeAccountSync] blind wall-clock fail-safe", {
						wallClockMs: POST_TRADE_SYNC_WALL_CLOCK_MS,
					});
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
						refreshLevelUpOrders: breq.refreshLevelUpOrders,
					};
					const synthetic = buildSyntheticBlindPending(
						breq.accountVenues,
						breq.includeLevelUpRpc,
					);
					const opts = refetchPassOptsFromPending(synthetic);
					for (let i = 0; i < iterations; i++) {
						if (sessionRef.current !== session) return;
						await performPostTradeDataRefreshPass(
							breq.queryClient,
							reqSlice,
							account,
							opts,
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
							synthetic,
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

	const api = useMemo<PostTradeAccountSyncApi>(
		() => ({ runAfterSorFilled, startBlindBalanceRefresh, startCashAfterClaim }),
		[runAfterSorFilled, startBlindBalanceRefresh, startCashAfterClaim],
	);

	return (
		<PostTradeAccountSyncContext.Provider value={api}>
			<PostTradeAccountSyncUiContext.Provider value={pendingSyncUiKey}>
				<ClaimCashSyncPendingContext.Provider value={claimCashSyncPending}>
					{children}
				</ClaimCashSyncPendingContext.Provider>
			</PostTradeAccountSyncUiContext.Provider>
		</PostTradeAccountSyncContext.Provider>
	);
}

export function usePostTradeAccountSync(): PostTradeAccountSyncApi {
	const ctx = useContext(PostTradeAccountSyncContext);
	if (!ctx) {
		if (import.meta.env.DEV) {
			console.warn(
				"[usePostTradeAccountSync] No PostTradeAccountSyncProvider — post-trade sync disabled",
			);
		}
		return {
			runAfterSorFilled: () => {},
			startBlindBalanceRefresh: () => {},
			startCashAfterClaim: () => {},
		};
	}
	return ctx;
}

export function useClaimCashSyncPending(): boolean {
	return useContext(ClaimCashSyncPendingContext);
}

export function usePostTradeAccountSyncPending(syncUiKey: string | null): boolean {
	const pendingKey = useContext(PostTradeAccountSyncUiContext);
	return Boolean(syncUiKey && pendingKey && pendingKey === syncUiKey);
}

/** True while post-trade position sync runs for any market — use for global UI (header). */
export function usePostTradePositionSyncPendingGlobal(): boolean {
	const pendingKey = useContext(PostTradeAccountSyncUiContext);
	return typeof pendingKey === "string" && pendingKey.trim() !== "";
}

export { readTotalCashHumanFromQueryClient } from "@/trading/sor/performPostTradeDataRefresh";
export type { AccountReconcileSnapshot } from "@/trading/sor/postTradeReconcile";
