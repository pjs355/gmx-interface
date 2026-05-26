import { useEffect, useRef } from "react";
import type { EnsureFailureState } from "./ensureExecutionRetry";
import { getEnsureRetryDelayMs, isEnsureSetupExhausted } from "./ensureExecutionRetry";

export type VenueEnsureExecutionRunnerRefs = {
	inFlightRef: React.MutableRefObject<boolean>;
	completedKeyRef: React.MutableRefObject<string | null>;
	failuresByKeyRef: React.MutableRefObject<Map<string, EnsureFailureState>>;
	mountedRef: React.MutableRefObject<boolean> | undefined;
};

export type UseVenueEnsureExecutionRunnerArgs = {
	enabled: boolean;
	authenticated: boolean;
	runKey: string | null;
	/** When false, the gate effect waits without calling `runSetup`. */
	prerequisitesReady: boolean;
	runSetup: () => Promise<void>;
	/** Refs owned by the venue hook so `runSetup` can read/write them directly. */
	refs: Pick<
		VenueEnsureExecutionRunnerRefs,
		"inFlightRef" | "completedKeyRef" | "failuresByKeyRef"
	>;
	/** Called when `!enabled || !authenticated`. */
	onDisabled?: () => void;
	/** Called when enabled but `prerequisitesReady` is false. */
	onPrerequisitesWaiting?: () => void;
	/** Called when a failed attempt schedules the next retry. */
	onRetryScheduled?: (args: { attempts: number; delayMs: number }) => void;
	/**
	 * When set, tracks mount state and skips scheduled retries after unmount.
	 * Polymarket uses this to avoid setState after unmount.
	 */
	mountedRef?: React.MutableRefObject<boolean>;
};

/**
 * Shared retry/backoff gate for venue ensure-execution hooks (Predict, Polymarket, Limitless).
 * Owns retry timer scheduling; venue hooks own refs and `runSetup` bodies.
 */
export function useVenueEnsureExecutionRunner(
	args: UseVenueEnsureExecutionRunnerArgs,
): VenueEnsureExecutionRunnerRefs {
	const {
		enabled,
		authenticated,
		runKey,
		prerequisitesReady,
		runSetup,
		refs,
		onDisabled,
		onPrerequisitesWaiting,
		onRetryScheduled,
		mountedRef,
	} = args;

	const { inFlightRef, completedKeyRef, failuresByKeyRef } = refs;
	const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (mountedRef) {
			mountedRef.current = true;
		}
		return () => {
			if (mountedRef) {
				mountedRef.current = false;
			}
			if (retryTimerRef.current) {
				clearTimeout(retryTimerRef.current);
				retryTimerRef.current = null;
			}
		};
	}, [mountedRef]);

	useEffect(() => {
		if (!enabled || !authenticated) {
			onDisabled?.();
			return;
		}
		if (!prerequisitesReady) {
			onPrerequisitesWaiting?.();
			return;
		}
		if (!runKey) return;
		if (completedKeyRef.current === runKey) return;
		if (inFlightRef.current) return;

		const failState = failuresByKeyRef.current.get(runKey);
		const delay = getEnsureRetryDelayMs(failState, Date.now());
		if (delay !== null) {
			if (retryTimerRef.current) return;
			const delayMs = delay;
			onRetryScheduled?.({
				attempts: failState?.attempts ?? 0,
				delayMs,
			});
			retryTimerRef.current = setTimeout(() => {
				retryTimerRef.current = null;
				const shouldRun =
					!inFlightRef.current &&
					completedKeyRef.current !== runKey &&
					(mountedRef === undefined || mountedRef.current);
				if (shouldRun) {
					void runSetup();
				}
			}, delayMs);
			return;
		}

		void runSetup();
	}, [
		enabled,
		authenticated,
		prerequisitesReady,
		runKey,
		runSetup,
		onDisabled,
		onPrerequisitesWaiting,
		onRetryScheduled,
		completedKeyRef,
		inFlightRef,
		failuresByKeyRef,
		mountedRef,
	]);

	return {
		inFlightRef,
		completedKeyRef,
		failuresByKeyRef,
		mountedRef,
	};
}

export function getEnsureRunnerFailureState(
	failuresByKeyRef: React.MutableRefObject<Map<string, EnsureFailureState>>,
	runKey: string | null,
): EnsureFailureState | undefined {
	if (!runKey) return undefined;
	return failuresByKeyRef.current.get(runKey);
}

export function isEnsureRunnerExhausted(
	failuresByKeyRef: React.MutableRefObject<Map<string, EnsureFailureState>>,
	runKey: string | null,
): boolean {
	return isEnsureSetupExhausted(getEnsureRunnerFailureState(failuresByKeyRef, runKey));
}
