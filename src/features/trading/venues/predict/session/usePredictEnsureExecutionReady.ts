import { useCallback, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useQueryClient } from "@tanstack/react-query";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { findVenueSetup } from "@/features/trading/hooks/venueSetup";
import { useCurrentProfile } from "@/features/trading/hooks/useCurrentProfile";
import { tradingQueryKeys } from "@/features/trading/queryKeys";
import type { EnsureFailureState } from "@/features/trading/ensure-execution/ensureExecutionRetry";
import {
	computeEnsureSetupInProgress,
	markEnsureSetupCompleted,
	recordEnsureSetupFailure,
} from "@/features/trading/ensure-execution/ensureExecutionRetry";
import {
	isEnsureRunnerExhausted,
	useVenueEnsureExecutionRunner,
} from "@/features/trading/ensure-execution/useVenueEnsureExecutionRunner";
import { usePredictApprovalsStatus } from "../wallet/usePredictApprovalsStatus";
import type { usePredictTradingSession } from "./usePredictTradingSession";

type PredictSession = ReturnType<typeof usePredictTradingSession>;

type SetupPhase =
	| "idle"
	| "checking"
	| "authenticating"
	| "approving"
	| "syncing"
	| "ready"
	| "error";

export type PredictEnsureExecutionReadyState = {
	/** Whenever `enabled` is true, the hook is running through setup (true) or fully ready (false). */
	setupInProgress: boolean;
	ready: boolean;
	phase: SetupPhase;
	error: string | null;
};

/**
 * Automates Predict.fun venue setup so the user never sees "Complete venue setup".
 *
 * Flow, when `enabled`:
 *  1. GET /account-overview; fast-path when `setup.sorCanInclude` + on-chain approvals.
 *  2. Fetch server-side venue state via `getPredictAccount`.
 *  3. If JWT missing/expired, run `predictSession.ensureSession()` (which signs + auths).
 *  4. Read on-chain USDT + CTF approvals for the approval subject. If any are missing,
 *     call `predictSession.setApprovals({ isNegRisk, isYieldBearing })` — scoped to the
 *     **current** market type so we fire 2-3 sponsored sends instead of the SDK's full
 *     10-tx cross-product. See `usePredictTradingSession.setApprovals` for why.
 *  5. Post `/api/predict/account/sync` so the backend SOR row reflects setup complete.
 *
 * Failures back off exponentially per run-key so transient rate limits (Privy 429,
 * RPC hiccups) don't turn into tight crash loops.
 */
export function usePredictEnsureExecutionReady(args: {
	enabled: boolean;
	predictSession: PredictSession;
	approvalSubject: string | null;
	isNegRisk: boolean;
	isYieldBearing: boolean;
}): PredictEnsureExecutionReadyState {
	const { enabled, predictSession, approvalSubject, isNegRisk, isYieldBearing } = args;
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();
	const qc = useQueryClient();
	const profileQuery = useCurrentProfile({ enabled: enabled && authenticated });
	const profileId = profileQuery.data?._id;

	const approvalsQuery = usePredictApprovalsStatus(
		approvalSubject,
		isNegRisk,
		isYieldBearing,
		enabled && authenticated && Boolean(approvalSubject),
	);

	const [phase, setPhase] = useState<SetupPhase>("idle");
	const [error, setError] = useState<string | null>(null);

	// Keep the latest session + api in refs so `runSetup` identity only depends on runKey.
	const sessionRef = useRef(predictSession);
	sessionRef.current = predictSession;
	const apiRef = useRef(api);
	apiRef.current = api;
	const profileIdRef = useRef<string | undefined>(profileId);
	profileIdRef.current = profileId;

	const inFlightRef = useRef(false);
	const completedKeyRef = useRef<string | null>(null);
	const failuresByKeyRef = useRef<Map<string, EnsureFailureState>>(new Map());

	const onChainApprovalsOk = approvalsQuery.data === true;
	const approvalsQueryReady =
		!approvalsQuery.isLoading &&
		approvalsQuery.fetchStatus !== "fetching" &&
		approvalsQuery.data !== undefined;

	/** Unique key per (user, market class) so we re-run once if subject/market type changes. */
	const runKey = useMemo(() => {
		if (!approvalSubject) return null;
		return `${approvalSubject.toLowerCase()}|${isNegRisk ? 1 : 0}|${isYieldBearing ? 1 : 0}`;
	}, [approvalSubject, isNegRisk, isYieldBearing]);

	const runSetup = useCallback(async () => {
		if (!runKey || inFlightRef.current) return;
		inFlightRef.current = true;
		setError(null);
		try {
			const apiClient = apiRef.current;
			const session = sessionRef.current;
			const currentProfileIdAtStart = profileIdRef.current;

			// Never call `getPredictAccount()` without `profileId` — that bypasses
			// `tradingQueryKeys.predictAccount` and duplicates `AccountDataProvider`'s
			// boot fetch. `useEffect` below re-runs when profile hydrates.
			if (!currentProfileIdAtStart) {
				setPhase("idle");
				return;
			}

			setPhase("checking");

			try {
				const overview = await qc.fetchQuery({
					queryKey: tradingQueryKeys.accountOverview(currentProfileIdAtStart),
					queryFn: () => apiClient.getAccountOverview(currentProfileIdAtStart),
				});
				const setup = findVenueSetup(overview, "predictfun");
				if (setup?.sorCanInclude === true && onChainApprovalsOk) {
					markEnsureSetupCompleted(completedKeyRef, failuresByKeyRef.current, runKey);
					setPhase("ready");
					return;
				}
			} catch {
				/* fall through to predict account sync path */
			}

			// Read through the canonical TanStack cache so the result is shared
			// with `AccountDataContext` and any other observer of
			// `tradingQueryKeys.predictAccount(profileId)`. Without this, the
			// background activator + the trade-box mount each fired their own
			// `GET /api/predict/account` (3+ requests at boot).
			await qc.fetchQuery({
				queryKey: tradingQueryKeys.predictAccount(currentProfileIdAtStart),
				queryFn: () => apiClient.getPredictAccount(),
			});

			// Step 1: ensure a live JWT + builder + signer.
			setPhase("authenticating");
			const { signer } = await session.ensureSession();
			const signerAddress = await signer.getAddress();
			const makerAddress = session.predictAccount?.trim();
			if (!makerAddress) {
				throw new Error(
					"Predict wallet missing — venueAddressChainMap.predictfun.walletAddress is required",
				);
			}

			// Step 2: on-chain approvals (only if not already satisfied on-chain).
			// Scoped to the current market type — non-scoped `setApprovals()`
			// would fire 10 sponsored sends, blow past Privy's per-wallet RPC
			// rate limit, and stall onboarding for minutes.
			if (!onChainApprovalsOk) {
				setPhase("approving");
				await session.setApprovals({ isNegRisk, isYieldBearing });
			}

			// Step 3: sync backend state so account overview `sorCanInclude` flips true.
			setPhase("syncing");
			await apiClient.postPredictAccountSync({
				makerAddress,
				signerAddress,
				approvalComplete: true,
				tradingEnabled: true,
			});

			// Invalidate the SOR-facing account overview so the next route fetch
			// sees `predictFun.canExecute: true`. Without this the user has to
			// trigger a refetch (tab switch, manual reload) before SOR will
			// route to Predict, which is exactly the jank the modal is trying
			// to avoid for new users. Also drop the cached predictAccount so
			// any AccountDataContext observer re-reads the post-sync state.
			const currentProfileId = profileIdRef.current;
			if (currentProfileId) {
				await Promise.all([
					qc.invalidateQueries({
						queryKey: tradingQueryKeys.accountOverview(currentProfileId),
					}),
					qc.invalidateQueries({
						queryKey: tradingQueryKeys.predictAccount(currentProfileId),
					}),
				]);
			}

			markEnsureSetupCompleted(completedKeyRef, failuresByKeyRef.current, runKey);
			setPhase("ready");
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			recordEnsureSetupFailure(failuresByKeyRef.current, runKey);
			setError(msg);
			setPhase("error");
			// Best-effort: report lastError to backend. Don't await forever.
			try {
				await apiRef.current.postPredictAccountSync({
					lastError: msg.slice(0, 500),
				});
			} catch {
				/* ignore secondary sync failures */
			}
		} finally {
			inFlightRef.current = false;
		}
	}, [isNegRisk, isYieldBearing, onChainApprovalsOk, qc, runKey]);

	useVenueEnsureExecutionRunner({
		enabled,
		authenticated,
		runKey,
		prerequisitesReady: predictSession.ready && approvalsQueryReady && Boolean(profileId),
		runSetup,
		refs: { inFlightRef, completedKeyRef, failuresByKeyRef },
		onDisabled: () => {
			setPhase("idle");
		},
	});

	const ready = phase === "ready";
	const exhausted = isEnsureRunnerExhausted(failuresByKeyRef, runKey);
	const setupInProgress = computeEnsureSetupInProgress({
		enabled,
		authenticated,
		ready,
		phase,
		exhausted,
	});

	return { setupInProgress, ready, phase, error };
}
