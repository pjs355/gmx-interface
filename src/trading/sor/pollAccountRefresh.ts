import { sleep } from "@/trading/sor/performPostTradeDataRefresh";

export type PollWithMaxAttemptsParams = {
	maxAttempts: number;
	delayMs: number;
	signal?: AbortSignal;
	/** When true, stop immediately (e.g. superseded trade op or unmount). */
	isStale: () => boolean;
	step: (attemptIndex: number) => Promise<void>;
	/** Return true to stop polling early. */
	done: () => boolean;
};

/**
 * Bounded polling: fixed max attempts, fixed delay, cancellable via `signal` or `isStale`.
 */
export async function pollWithMaxAttempts(
	params: PollWithMaxAttemptsParams,
): Promise<{ completedEarly: boolean; attempts: number }> {
	const { maxAttempts, delayMs, signal, isStale, step, done } = params;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (signal?.aborted || isStale()) {
			return { completedEarly: false, attempts: attempt };
		}
		await step(attempt);
		if (signal?.aborted || isStale()) {
			return { completedEarly: false, attempts: attempt + 1 };
		}
		if (done()) {
			return { completedEarly: true, attempts: attempt + 1 };
		}
		if (attempt < maxAttempts - 1) {
			await sleep(delayMs);
		}
	}
	return { completedEarly: done(), attempts: maxAttempts };
}
