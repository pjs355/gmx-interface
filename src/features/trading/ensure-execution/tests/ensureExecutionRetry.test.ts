import { describe, it, expect, vi, afterEach } from "vitest";
import {
	ENSURE_EXECUTION_FAILURE_BACKOFF_MS,
	ENSURE_EXECUTION_MAX_FAILURES,
	clearEnsureSetupFailures,
	computeEnsureSetupInProgress,
	getEnsureBackoffDelayMs,
	getEnsureRetryDelayMs,
	isEnsureSetupExhausted,
	markEnsureSetupCompleted,
	recordEnsureSetupFailure,
} from "../ensureExecutionRetry";

describe("ensureExecutionRetry", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("maps attempt numbers to the shared backoff schedule", () => {
		expect(getEnsureBackoffDelayMs(1)).toBe(3_000);
		expect(getEnsureBackoffDelayMs(2)).toBe(10_000);
		expect(getEnsureBackoffDelayMs(3)).toBe(30_000);
		expect(getEnsureBackoffDelayMs(4)).toBe(60_000);
		expect(getEnsureBackoffDelayMs(99)).toBe(60_000);
	});

	it("records failures and clears on completion", () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

		const map = new Map();
		const first = recordEnsureSetupFailure(map, "key-a");
		expect(first.attempts).toBe(1);
		expect(first.backoffMs).toBe(3_000);
		expect(first.nextAllowedAt).toBe(Date.now() + 3_000);

		const second = recordEnsureSetupFailure(map, "key-a");
		expect(second.attempts).toBe(2);
		expect(second.backoffMs).toBe(10_000);

		const completedKeyRef = { current: null as string | null };
		markEnsureSetupCompleted(completedKeyRef, map, "key-a");
		expect(completedKeyRef.current).toBe("key-a");
		expect(map.has("key-a")).toBe(false);

		clearEnsureSetupFailures(map, "missing");
		expect(map.size).toBe(0);
	});

	it("computes retry delay and exhaustion", () => {
		const failState = { attempts: 4, nextAllowedAt: 1_000 };
		expect(getEnsureRetryDelayMs(failState, 500)).toBe(500);
		expect(getEnsureRetryDelayMs(failState, 1_000)).toBe(null);
		expect(isEnsureSetupExhausted({ attempts: 3, nextAllowedAt: 0 })).toBe(false);
		expect(isEnsureSetupExhausted({ attempts: 4, nextAllowedAt: 0 })).toBe(true);
		expect(ENSURE_EXECUTION_FAILURE_BACKOFF_MS.length).toBe(4);
		expect(ENSURE_EXECUTION_MAX_FAILURES).toBe(4);
	});

	it("computes setupInProgress with exhausted error phase", () => {
		expect(
			computeEnsureSetupInProgress({
				enabled: true,
				authenticated: true,
				ready: false,
				phase: "error",
				exhausted: false,
			}),
		).toBe(true);
		expect(
			computeEnsureSetupInProgress({
				enabled: true,
				authenticated: true,
				ready: false,
				phase: "error",
				exhausted: true,
			}),
		).toBe(false);
	});
});
