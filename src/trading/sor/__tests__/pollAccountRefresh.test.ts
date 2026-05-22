import { describe, expect, it, vi } from "vitest";
import { pollWithMaxAttempts } from "../post-trade/pollAccountRefresh";

describe("pollWithMaxAttempts", () => {
	it("stops early when done() is true", async () => {
		const step = vi.fn();
		const r = await pollWithMaxAttempts({
			maxAttempts: 5,
			delayMs: 1,
			isStale: () => false,
			step,
			done: () => true,
		});
		expect(r.completedEarly).toBe(true);
		expect(r.attempts).toBe(1);
		expect(step).toHaveBeenCalledTimes(1);
	});

	it("respects isStale and stops without completing", async () => {
		let n = 0;
		const r = await pollWithMaxAttempts({
			maxAttempts: 5,
			delayMs: 1,
			isStale: () => n >= 2,
			step: async () => {
				n += 1;
			},
			done: () => false,
		});
		expect(r.completedEarly).toBe(false);
		expect(r.attempts).toBeLessThanOrEqual(2);
	});

	it("runs at most maxAttempts when never done", async () => {
		const step = vi.fn();
		const r = await pollWithMaxAttempts({
			maxAttempts: 4,
			delayMs: 1,
			isStale: () => false,
			step,
			done: () => false,
		});
		expect(r.attempts).toBe(4);
		expect(step).toHaveBeenCalledTimes(4);
	});
});
