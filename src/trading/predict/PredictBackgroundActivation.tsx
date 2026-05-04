import { useEffect, useMemo, useRef, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import { useSignerContext } from "context/SignerContext";
import { usePredictTradingSession } from "./usePredictTradingSession";
import { usePredictEnsureExecutionReady } from "./usePredictEnsureExecutionReady";

const LOG_TAG = "[PredictActivation]";

type IdleWindow = Window & {
	requestIdleCallback?: (
		cb: (deadline: { didTimeout: boolean; timeRemaining(): number }) => void,
		opts?: { timeout?: number },
	) => number;
	cancelIdleCallback?: (handle: number) => void;
};

const IDLE_TIMEOUT_MS = 5_000;
const START_DELAY_MS = 250;

/**
 * Global background activator for Predict.fun, mirroring
 * `PolymarketBackgroundActivation`.
 *
 * Activation steps (run silently; no UI prompts thanks to Privy
 * embedded-wallet auto-signing + TEE-sponsored gas):
 *  1. Resolve the embedded EOA via `useWallets`.
 *  2. Open a Predict trading session (`usePredictTradingSession`) — signs the
 *     auth message, exchanges it for a JWT, hydrates the order builder.
 *  3. Run `usePredictEnsureExecutionReady` for the **default** (non-negRisk,
 *     non-yieldBearing) market shape, which covers ~all common markets and
 *     flips `routingEligibility.predictFun.canExecute: true` on the SOR.
 *
 * Per-market activation for negRisk / yield-bearing markets still happens
 * inside the trade box (the same hook with a different `approvalSubject`
 * shape), but for those markets the ensure call fast-paths because JWT +
 * baseline approvals are already in place.
 *
 * The activator gates on `requestIdleCallback` to keep first paint snappy,
 * but it bypasses the idle gate entirely while the post-signup setup modal
 * is active (`onboardingActive`) so the user doesn't watch a checklist
 * stall for 5 seconds of artificial slack.
 */
export function PredictBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const { wallets } = useWallets();
	const signerCtx = useSignerContext();
	const setupActivation = useSetupActivationOptional();

	const [idleReached, setIdleReached] = useState(false);

	// Predict approvals + auth happen against the Privy embedded EOA on BSC,
	// matching the trade-box's existing `predictApprovalSubject` resolution.
	// `VITE_PREDICT_ACCOUNT_ADDRESS` is an existing dev override (already in
	// use elsewhere) — no new env var introduced.
	const approvalSubject = useMemo<string | null>(() => {
		const fromEnv = (import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS ?? "")
			.toString()
			.trim();
		if (fromEnv) return fromEnv;
		const embedded = (wallets ?? []).find(
			(w) =>
				(w as { walletClientType?: string }).walletClientType === "privy" ||
				(w as { connectorType?: string }).connectorType === "embedded",
		);
		return embedded?.address ?? null;
	}, [wallets]);

	const prerequisitesReady =
		privyReady && authenticated && signerCtx.ready && Boolean(approvalSubject);

	const onboardingActive = setupActivation?.onboardingActive ?? false;

	useEffect(() => {
		if (!prerequisitesReady) {
			setIdleReached(false);
			return;
		}
		if (idleReached) return;

		if (onboardingActive) {
			console.info(LOG_TAG, "bg:onboardingActive:skipIdle");
			setIdleReached(true);
			return;
		}

		const w = window as IdleWindow;
		let idleHandle: number | null = null;
		let startTimer: ReturnType<typeof setTimeout> | null = null;
		let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

		const fire = () => {
			console.info(LOG_TAG, "bg:idleFired");
			setIdleReached(true);
		};

		startTimer = setTimeout(() => {
			startTimer = null;
			if (typeof w.requestIdleCallback === "function") {
				idleHandle = w.requestIdleCallback(fire, {
					timeout: IDLE_TIMEOUT_MS,
				});
			} else {
				fallbackTimer = setTimeout(fire, 0);
			}
		}, START_DELAY_MS);

		return () => {
			if (startTimer) clearTimeout(startTimer);
			if (fallbackTimer) clearTimeout(fallbackTimer);
			if (
				idleHandle !== null &&
				typeof w.cancelIdleCallback === "function"
			) {
				w.cancelIdleCallback(idleHandle);
			}
		};
	}, [prerequisitesReady, idleReached, onboardingActive]);

	const sessionEnabled = prerequisitesReady && idleReached;
	const predictSession = usePredictTradingSession(sessionEnabled);

	const ensureState = usePredictEnsureExecutionReady({
		enabled: sessionEnabled && predictSession.ready,
		predictSession,
		approvalSubject,
		isNegRisk: false,
		isYieldBearing: false,
	});

	const reportVenueSnapshot = setupActivation?.reportVenueSnapshot;
	const lastSnapshotRef = useRef<string>("");
	useEffect(() => {
		if (!reportVenueSnapshot) return;
		// Setup is "in progress" until the ensure hook reports ready. Predict
		// has two staged steps — opening the session, then running ensure — so
		// surface "in progress" while the session is still loading too.
		const inProgress =
			sessionEnabled &&
			(predictSession.loading ||
				!predictSession.ready ||
				ensureState.setupInProgress);
		const ready = ensureState.ready;
		const key = `${inProgress ? 1 : 0}|${ready ? 1 : 0}`;
		if (key === lastSnapshotRef.current) return;
		lastSnapshotRef.current = key;
		reportVenueSnapshot("predict", { setupInProgress: inProgress, ready });
	}, [
		reportVenueSnapshot,
		sessionEnabled,
		predictSession.loading,
		predictSession.ready,
		ensureState.setupInProgress,
		ensureState.ready,
	]);

	return null;
}
