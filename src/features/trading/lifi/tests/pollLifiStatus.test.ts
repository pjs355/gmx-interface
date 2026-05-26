import { describe, expect, it, vi } from "vitest";
import { PrivateApiError } from "@/services/privateApi/errors";
import {
	assertLifiTerminalSuccess,
	extractLifiStatus,
	isTransientFundingLifiStatusPollError,
	pollLifiUntilTerminal,
} from "../pollLifiStatus";

describe("isTransientFundingLifiStatusPollError", () => {
	it("is true for 502 lifi_status_failed with 404 detail in body", () => {
		const err = new PrivateApiError("lifi_status_failed", 502, {
			error: "lifi_status_failed",
			detail:
				'lifi_status_http:404:{"message":"Transaction hash \'0xabc\' not found on chain \'8453\'","code":1003}',
		});
		expect(isTransientFundingLifiStatusPollError(err)).toBe(true);
	});

	it("is false for 502 unrelated errors", () => {
		const err = new PrivateApiError("Internal Server Error", 502, {
			error: "database_timeout",
		});
		expect(isTransientFundingLifiStatusPollError(err)).toBe(false);
	});

	it("is true for 429", () => {
		expect(isTransientFundingLifiStatusPollError(new PrivateApiError("Too Many", 429, {}))).toBe(
			true,
		);
	});
});

describe("pollLifiUntilTerminal", () => {
	it("retries when getStatus throws transient PrivateApiError then succeeds", async () => {
		let calls = 0;
		const getStatus = vi.fn(async () => {
			calls++;
			if (calls < 3) {
				throw new PrivateApiError("lifi_status_failed", 502, {
					error: "lifi_status_failed",
					detail: 'lifi_status_http:404:{"message":"not found on chain","code":1003}',
				});
			}
			return { success: true, data: { status: "DONE" } };
		});

		const result = await pollLifiUntilTerminal(getStatus, {
			maxAttempts: 8,
			intervalMs: 5,
		});
		expect(extractLifiStatus(result)).toBe("DONE");
		expect(() => assertLifiTerminalSuccess(result)).not.toThrow();
		expect(getStatus.mock.calls.length).toBe(3);
	});
});
