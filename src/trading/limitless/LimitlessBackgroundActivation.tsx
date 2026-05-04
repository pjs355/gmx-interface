import { useEffect, useRef, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSetupActivationOptional } from "@/onboarding/SetupActivationContext";
import { useSignerContext } from "context/SignerContext";
import { useLimitlessEnsureExecutionReady } from "./useLimitlessEnsureExecutionReady";

const LOG_TAG = "[LimitlessActivation]";

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
 * Global background activator for Limitless, mirroring
 * `PolymarketBackgroundActivation` and `PredictBackgroundActivation`.
 *
 * Behavior:
 *  - Waits for Privy + signer context to settle, then optionally for an idle
 *    window (skipped when the post-signup setup modal is active so the user
 *    isn't watching their checklist stall on a 5s `requestIdleCallback`).
 *  - Mounts `useLimitlessEnsureExecutionReady`, which fires the idempotent
 *    `POST /api/limitless/ensure-account` and invalidates `accountOverview`
 *    so the SOR sees `limitless.canExecute: true`.
 *  - Reports its `setupInProgress` / `ready` to the shared
 *    `SetupActivationContext` so both the modal and the trade box can render
 *    coherent state without duplicate ensure calls.
 */
export function LimitlessBackgroundActivation(): null {
	const { authenticated, ready: privyReady } = usePrivy();
	const signerCtx = useSignerContext();
	const setupActivation = useSetupActivationOptional();

	const [idleReached, setIdleReached] = useState(false);

	const prerequisitesReady = privyReady && authenticated && signerCtx.ready;
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

	const ensureState = useLimitlessEnsureExecutionReady({
		enabled: prerequisitesReady && idleReached,
	});

	const reportVenueSnapshot = setupActivation?.reportVenueSnapshot;
	const lastSnapshotRef = useRef<string>("");
	useEffect(() => {
		if (!reportVenueSnapshot) return;
		const key = `${ensureState.setupInProgress ? 1 : 0}|${ensureState.ready ? 1 : 0}`;
		if (key === lastSnapshotRef.current) return;
		lastSnapshotRef.current = key;
		reportVenueSnapshot("limitless", {
			setupInProgress: ensureState.setupInProgress,
			ready: ensureState.ready,
		});
	}, [reportVenueSnapshot, ensureState.setupInProgress, ensureState.ready]);

	return null;
}
