import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/trading/queryKeys";
import {
	getLimitlessEnsureTradeGate,
	limitlessEnsureNotReadyCodeToWhy,
	limitlessEnsureWarrantsAccountOverviewRefresh,
} from "./limitlessEnsureTradeGate";
import { isTradingDebugLoggingEnabled } from "@/config/tradingDebug";

const LOG_TAG = "[LimitlessActivation]";

export type LimitlessEnsureExecutionReadyState = {
	setupInProgress: boolean;
	ready: boolean;
	error: string | null;
};

/**
 * Maximum failed `ensure-account` attempts before we stop reporting
 * `setupInProgress: true`. Mirrors the FAILURE_BACKOFF_MS schedule used by
 * Predict and Polymarket so the modal/checklist UX is consistent across all
 * three venues — they keep the spinner engaged through transient errors and
 * only drop it once the schedule is exhausted.
 */
const MAX_ENSURE_FAILURES = 4;

/**
 * Watchdog window: if the query has been enabled for this long without
 * having fired (no fetch, no data, no error), we manually call
 * `refetch()` once to kick React Query. This guards against the edge
 * where the queryKey shape changes mid-render (disabled sentinel → real
 * key with profileId) and React Query's QueryObserver misses the
 * transition's "should fetch now" signal — the symptom that was making
 * Limitless require a hard refresh after Polymarket's heavy activation
 * flow ate a re-render burst.
 */
const ENSURE_KICK_WATCHDOG_MS = 2_500;

/**
 * Single source of truth for "Limitless is ready to trade". Mirrors the shape
 * of `usePolymarketEnsureExecutionReady` and `usePredictEnsureExecutionReady`
 * so the post-signup setup modal and the trade box can read all three from
 * the same activator components.
 *
 * Behavior:
 *  - When `enabled` + Privy authenticated, fires `POST /api/limitless/ensure-account`
 *    via React Query. The endpoint is idempotent and chains all the server-side
 *    setup (server wallet provisioning, owner-id sync, allowance verification,
 *    flipping `tradingEnabled: true`) so a single call makes the venue
 *    `executionReady` for the SOR.
 *  - On success, invalidates `tradingQueryKeys.accountOverview(profileId)` once
 *    so the next SOR `getRoute` sees `routingEligibility.limitless.canExecute: true`.
 *  - On-chain Base approvals (USDC `approve`, CTF `setApprovalForAll`) are
 *    deliberately NOT run here. They depend on a per-market `verify-allowance`
 *    response (spender varies by market) and are already executed JIT inside
 *    `useSorLegExecutor` on the buy click. Trying to run them upfront with a
 *    "warmup" market slug is brittle and a wasted signing session for users
 *    who never trade Limitless.
 *  - If React Query stalls between `enabled` flipping true and queryFn firing
 *    (the classic post-Polymarket re-render burst symptom), the watchdog
 *    above kicks the query manually after `ENSURE_KICK_WATCHDOG_MS`.
 *
 * The query is shared at `tradingQueryKeys.limitlessEnsureAccount(profileId)`,
 * so the trade box's existing query reads the same cache entry — no
 * duplicate `ensure-account` calls.
 */

export function useLimitlessEnsureExecutionReady(args: {
	enabled: boolean;
}): LimitlessEnsureExecutionReadyState {
	const { enabled } = args;
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const qc = useQueryClient();
	const profileQuery = useCurrentProfile({ enabled: enabled && authenticated });
	const profileId = profileQuery.data?._id;

	const queryEnabled = Boolean(enabled && authenticated && profileId);

	// Stable queryKey: shape never changes, only the profileId slot is
	// substituted. When the key was previously
	// `["trading", "limitlessEnsure", "__disabled__"]` vs.
	// `["trading", "limitless", "ensureAccount", profileId]` it changed
	// *prefix shape* between renders, which React Query treats as two
	// completely unrelated queries. The transition would unsubscribe the
	// old observer and subscribe a new one in the same commit, and in the
	// post-Polymarket render-burst the new observer didn't always fire.
	// Using a stable shape (with `__pending__` placeholder) keeps the same
	// observer alive across the gating transition.
	const ensureQueryKey = profileId
		? tradingQueryKeys.limitlessEnsureAccount(profileId)
		: tradingQueryKeys.limitlessEnsureAccount("__pending__");

	const ensureQuery = useQuery({
		queryKey: ensureQueryKey,
		queryFn: async () => {
			const startedAt = performance.now();
			if (isTradingDebugLoggingEnabled()) {
				console.info(LOG_TAG, "ensure:start", {
					at: new Date().toISOString(),
					profileId,
				});
			}
			try {
				const data = await api.postLimitlessEnsureAccount();
				const elapsedMs = Math.round(performance.now() - startedAt);
				const gate = getLimitlessEnsureTradeGate(data ?? null);
				if (isTradingDebugLoggingEnabled()) {
					console.info(LOG_TAG, "ensure:done", {
						elapsedMs,
						ready: gate.ready,
						notReady: limitlessEnsureNotReadyCodeToWhy(gate.notReadyCode),
					});
				}
				return data;
			} catch (e) {
				const elapsedMs = Math.round(performance.now() - startedAt);
				console.warn(LOG_TAG, "ensure:failed", {
					elapsedMs,
					error: e instanceof Error ? e.message : String(e),
				});
				throw e;
			}
		},
		enabled: queryEnabled,
		staleTime: 1000 * 60 * 30,
		retry: MAX_ENSURE_FAILURES - 1,
	});

	// Compute gate up-front so multiple effects can read it without
	// re-deriving. The trade box pre-warms `ensure-account` the moment
	// Privy auth resolves — well before our activator's gate opens — and
	// the response gets cached for `staleTime`. If that early response
	// came back with the venue still mid-provisioning (`gate.ready:
	// false`), naively reading the cache would trap us forever. The
	// stale-refetch effect below uses this to detect that case.
	const gate = getLimitlessEnsureTradeGate(ensureQuery.data ?? null);

	// React Query state logging (gated by `VITE_DEBUG_TRADING` / `isTradingDebugLoggingEnabled`) —
	// fires on every transition so we can see whether the queryFn was actually invoked
	// (`fetchStatus: "fetching"`) vs. silently waiting (`fetchStatus: "idle"` while
	// `enabled: true` and `data: undefined`). The latter is the symptom the watchdog below handles.
	const lastQueryStateRef = useRef<string>("");
	useEffect(() => {
		const snap = JSON.stringify({
			queryEnabled,
			profileLoaded: Boolean(profileId),
			status: ensureQuery.status,
			fetchStatus: ensureQuery.fetchStatus,
			isFetched: ensureQuery.isFetched,
			failureCount: ensureQuery.failureCount,
			hasData: ensureQuery.data != null,
			gateReady: gate.ready,
		});
		if (snap === lastQueryStateRef.current) return;
		lastQueryStateRef.current = snap;
		if (isTradingDebugLoggingEnabled()) {
			console.info(LOG_TAG, "ensure:rqState", {
				at: new Date().toISOString(),
				...JSON.parse(snap),
			});
		}
	}, [
		queryEnabled,
		profileId,
		ensureQuery.status,
		ensureQuery.fetchStatus,
		ensureQuery.isFetched,
		ensureQuery.failureCount,
		ensureQuery.data,
		gate.ready,
	]);

	// Stale-data refetch: fires once per `(profileId, gate-open)` when the
	// cache already contains a successful but `gate.ready: false` response
	// (typically the trade box's early warmup that returned before the
	// backend finished provisioning the venue). Without this we'd trust
	// that stale "still provisioning" row for the full `staleTime`
	// (30 minutes) and the spinner would never resolve. By calling
	// `refetchQueries` we bypass `staleTime` and force a fresh server
	// call now that we are actually ready to consume a real response.
	const staleRefetchFiredForKeyRef = useRef<string | null>(null);
	useEffect(() => {
		if (!queryEnabled || !profileId) return;
		if (ensureQuery.fetchStatus === "fetching") return;
		if (ensureQuery.data == null) return;
		if (gate.ready) return;
		const keyId = String(profileId);
		if (staleRefetchFiredForKeyRef.current === keyId) return;
		staleRefetchFiredForKeyRef.current = keyId;
		console.warn(LOG_TAG, "ensure:staleRefetch", {
			at: new Date().toISOString(),
			reason: "cached response has gate.ready=false; forcing fresh fetch",
			notReady: limitlessEnsureNotReadyCodeToWhy(gate.notReadyCode),
		});
		void qc.refetchQueries({ queryKey: ensureQueryKey });
	}, [
		queryEnabled,
		profileId,
		ensureQuery.fetchStatus,
		ensureQuery.data,
		gate.ready,
		gate.notReadyCode,
		qc,
		ensureQueryKey,
	]);

	// Watchdog: if enabled for >ENSURE_KICK_WATCHDOG_MS without making
	// real progress, kick it once. "No real progress" means either
	// (a) no fetch ever started and we have no data, or
	// (b) we have data but the gate is still not ready and the
	//     stale-refetch effect above somehow didn't fire.
	const watchdogFiredForKeyRef = useRef<string | null>(null);
	useEffect(() => {
		if (!queryEnabled || !profileId) return;
		if (ensureQuery.fetchStatus === "fetching") return;
		if (ensureQuery.isError) return;
		const hasReadyData = ensureQuery.data != null && gate.ready;
		if (hasReadyData) return;
		const fetchNeverStarted =
			!ensureQuery.isFetched && ensureQuery.data == null;
		const stuckOnNotReadyData = ensureQuery.data != null && !gate.ready;
		if (!fetchNeverStarted && !stuckOnNotReadyData) return;
		const keyId = String(profileId);
		if (watchdogFiredForKeyRef.current === keyId) return;
		const t = setTimeout(() => {
			if (watchdogFiredForKeyRef.current === keyId) return;
			watchdogFiredForKeyRef.current = keyId;
			console.warn(LOG_TAG, "ensure:watchdogKick", {
				at: new Date().toISOString(),
				reason: fetchNeverStarted
					? "queryEnabled true but fetch never started"
					: "cached data stuck with gate.ready=false",
				status: ensureQuery.status,
				fetchStatus: ensureQuery.fetchStatus,
			});
			void qc.refetchQueries({ queryKey: ensureQueryKey });
		}, ENSURE_KICK_WATCHDOG_MS);
		return () => clearTimeout(t);
	}, [
		queryEnabled,
		profileId,
		ensureQuery.fetchStatus,
		ensureQuery.isFetched,
		ensureQuery.data,
		ensureQuery.isError,
		ensureQuery.status,
		gate.ready,
		qc,
		ensureQueryKey,
	]);

	const lastInvalidatedRef = useRef<number>(0);
	useEffect(() => {
		if (!profileId) return;
		if (ensureQuery.status !== "success") return;
		if (!limitlessEnsureWarrantsAccountOverviewRefresh(ensureQuery.data)) return;
		if (lastInvalidatedRef.current === ensureQuery.dataUpdatedAt) return;
		lastInvalidatedRef.current = ensureQuery.dataUpdatedAt;
		void qc.invalidateQueries({
			queryKey: tradingQueryKeys.accountOverview(profileId),
		});
	}, [
		profileId,
		ensureQuery.status,
		ensureQuery.data,
		ensureQuery.dataUpdatedAt,
		qc,
	]);

	const ready = Boolean(
		ensureQuery.isSuccess && ensureQuery.data != null && gate.ready,
	);

	// Match Predict / Polymarket: stay "in progress" until ready, OR until
	// the failure schedule is exhausted. Without this, the checklist
	// spinner drops the moment React Query settles even though the venue
	// isn't actually usable yet, which is the bug where Limitless flickers
	// off while Predict/Polymarket keep spinning.
	const exhausted =
		ensureQuery.isError &&
		(ensureQuery.failureCount ?? 0) >= MAX_ENSURE_FAILURES;
	const setupInProgress = queryEnabled && !ready && !exhausted;

	let error: string | null = null;
	if (ensureQuery.isError) {
		error =
			ensureQuery.error instanceof Error
				? ensureQuery.error.message
				: String(ensureQuery.error);
	}

	return { setupInProgress, ready, error };
}
