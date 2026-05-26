/** Retry schedule for venue ensure-execution setup; resets once setup succeeds. */
export const ENSURE_EXECUTION_FAILURE_BACKOFF_MS = [3_000, 10_000, 30_000, 60_000] as const;

/** Failed attempts at which ensure-execution stops retrying / reporting in-progress. */
export const ENSURE_EXECUTION_MAX_FAILURES = ENSURE_EXECUTION_FAILURE_BACKOFF_MS.length;

export type EnsureFailureState = {
	attempts: number;
	nextAllowedAt: number;
};

export type EnsureFailureRecordResult = EnsureFailureState & {
	backoffMs: number;
};

export function getEnsureBackoffDelayMs(attemptNumber: number): number {
	const idx = Math.min(attemptNumber - 1, ENSURE_EXECUTION_FAILURE_BACKOFF_MS.length - 1);
	return ENSURE_EXECUTION_FAILURE_BACKOFF_MS[idx];
}

export function recordEnsureSetupFailure(
	failuresByKey: Map<string, EnsureFailureState>,
	runKey: string,
): EnsureFailureRecordResult {
	const prev = failuresByKey.get(runKey) ?? {
		attempts: 0,
		nextAllowedAt: 0,
	};
	const attempts = prev.attempts + 1;
	const backoffMs = getEnsureBackoffDelayMs(attempts);
	const next: EnsureFailureRecordResult = {
		attempts,
		nextAllowedAt: Date.now() + backoffMs,
		backoffMs,
	};
	failuresByKey.set(runKey, next);
	return next;
}

export function clearEnsureSetupFailures(
	failuresByKey: Map<string, EnsureFailureState>,
	runKey: string,
): void {
	failuresByKey.delete(runKey);
}

export function markEnsureSetupCompleted(
	completedKeyRef: { current: string | null },
	failuresByKey: Map<string, EnsureFailureState>,
	runKey: string,
): void {
	completedKeyRef.current = runKey;
	clearEnsureSetupFailures(failuresByKey, runKey);
}

export function isEnsureSetupExhausted(failState: EnsureFailureState | undefined): boolean {
	return !!failState && failState.attempts >= ENSURE_EXECUTION_FAILURE_BACKOFF_MS.length;
}

export function getEnsureRetryDelayMs(
	failState: EnsureFailureState | undefined,
	now: number,
): number | null {
	if (!failState || now >= failState.nextAllowedAt) {
		return null;
	}
	return failState.nextAllowedAt - now;
}

export function computeEnsureSetupInProgress(args: {
	enabled: boolean;
	authenticated: boolean;
	ready: boolean;
	phase: string;
	exhausted: boolean;
}): boolean {
	const { enabled, authenticated, ready, phase, exhausted } = args;
	return enabled && authenticated && !ready && !(phase === "error" && exhausted);
}
