import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { usePredictApprovalsStatus } from "./usePredictApprovalsStatus";
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

/** Backoff schedule between retry attempts after setup failures, in ms. */
const FAILURE_BACKOFF_MS = [3_000, 10_000, 30_000, 60_000];

/**
 * Automates Predict.fun venue setup so the user never sees "Complete venue setup".
 *
 * Flow, when `enabled`:
 *  1. Fetch server-side venue state via `getPredictAccount`.
 *  2. If JWT missing/expired, run `predictSession.ensureSession()` (which signs + auths).
 *  3. Read on-chain USDT + CTF approvals for the approval subject. If any are missing,
 *     call `predictSession.setApprovals()` (Privy TEE sponsors BSC gas).
 *  4. Post `/api/predict/account/sync` with `{ makerAddress, signerAddress, approvalComplete: true, tradingEnabled: true }`
 *     so the backend's SOR routing eligibility flips `executionReady: true`.
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
	const { enabled, predictSession, approvalSubject, isNegRisk, isYieldBearing } =
		args;
	const { authenticated } = usePrivy();
	const api = usePrivateApiClient();

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

	const inFlightRef = useRef(false);
	const completedKeyRef = useRef<string | null>(null);
	const failuresByKeyRef = useRef<
		Map<string, { attempts: number; nextAllowedAt: number }>
	>(new Map());
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

			setPhase("checking");
			const account = await apiClient.getPredictAccount();
			const st = account.predictAccount;
			const jwtOk = st.hasJwt && !st.jwtExpired;
			const approvalServerOk = Boolean(st.approvalComplete);
			const tradingOk = Boolean(st.tradingEnabled);

			// Fast-path: server already agrees we're fully set up AND on-chain approvals pass.
			if (jwtOk && approvalServerOk && tradingOk && onChainApprovalsOk) {
				completedKeyRef.current = runKey;
				failuresByKeyRef.current.delete(runKey);
				setPhase("ready");
				return;
			}

			// Step 1: ensure a live JWT + builder + signer.
			setPhase("authenticating");
			const { signer } = await session.ensureSession();
			const signerAddress = await signer.getAddress();
			const makerAddress = session.predictAccount ?? signerAddress;

			// Step 2: on-chain approvals (only if not already satisfied on-chain).
			if (!onChainApprovalsOk) {
				setPhase("approving");
				await session.setApprovals();
			}

			// Step 3: sync backend state so SOR `executionReady` flips true.
			setPhase("syncing");
			await apiClient.postPredictAccountSync({
				makerAddress,
				signerAddress,
				approvalComplete: true,
				tradingEnabled: true,
			});

			completedKeyRef.current = runKey;
			failuresByKeyRef.current.delete(runKey);
			setPhase("ready");
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			const prev = failuresByKeyRef.current.get(runKey) ?? {
				attempts: 0,
				nextAllowedAt: 0,
			};
			const attempts = prev.attempts + 1;
			const backoff =
				FAILURE_BACKOFF_MS[
					Math.min(attempts - 1, FAILURE_BACKOFF_MS.length - 1)
				];
			failuresByKeyRef.current.set(runKey, {
				attempts,
				nextAllowedAt: Date.now() + backoff,
			});
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
	}, [onChainApprovalsOk, runKey]);

	useEffect(() => {
		return () => {
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
		};
	}, []);

	useEffect(() => {
		if (!enabled || !authenticated) {
			setPhase("idle");
			return;
		}
		if (!predictSession.ready) return;
		if (!runKey) return;
		if (!approvalsQueryReady) return;
		if (completedKeyRef.current === runKey) return;
		if (inFlightRef.current) return;

		const failState = failuresByKeyRef.current.get(runKey);
		const now = Date.now();
		if (failState && now < failState.nextAllowedAt) {
			// Schedule a single retry at the next allowed time.
			if (retryTimerRef.current) return;
			const delay = failState.nextAllowedAt - now;
			retryTimerRef.current = setTimeout(() => {
				retryTimerRef.current = null;
				if (
					!inFlightRef.current &&
					completedKeyRef.current !== runKey
				) {
					void runSetup();
				}
			}, delay);
			return;
		}

		void runSetup();
	}, [
		enabled,
		authenticated,
		predictSession.ready,
		runKey,
		approvalsQueryReady,
		runSetup,
	]);

	const ready = phase === "ready";
	// While enabled+authenticated, setup is "in progress" from the UI's perspective
	// until we reach `ready`. During `error` we still report in-progress so the
	// button shows "Preparing Predict…" while we wait for the backoff retry, unless
	// we've exhausted the backoff schedule.
	const failState = runKey ? failuresByKeyRef.current.get(runKey) : undefined;
	const exhausted =
		!!failState && failState.attempts >= FAILURE_BACKOFF_MS.length;
	const setupInProgress =
		enabled && authenticated && !ready && !(phase === "error" && exhausted);

	return { setupInProgress, ready, phase, error };
}
