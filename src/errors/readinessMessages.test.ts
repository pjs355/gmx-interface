import { describe, expect, it } from "vitest";
import {
	blockingReasonToMessage,
	blockingReasonsToMessages,
	collectBlockingReasonsFromVenueRequirements,
	formatExecutionNotReadyUserMessage,
} from "./readinessMessages";
import { READINESS_BLOCKED_FALLBACK } from "./catalog/readiness";
import { userMessage } from "./messages";

describe("blockingReasonToMessage", () => {
	it("maps server polymarket codes", () => {
		expect(blockingReasonToMessage("polymarket:usdc_approval_required")).toMatch(
			/Approve USDC/i,
		);
	});

	it("returns fallback for unknown codes in production mode", () => {
		const prev = import.meta.env.DEV;
		(import.meta.env as { DEV: boolean }).DEV = false;
		expect(blockingReasonToMessage("unknown:code")).toBe(
			userMessage(READINESS_BLOCKED_FALLBACK),
		);
		(import.meta.env as { DEV: boolean }).DEV = prev;
	});
});

describe("collectBlockingReasonsFromVenueRequirements", () => {
	it("collects codes only from not-ready venues", () => {
		const codes = collectBlockingReasonsFromVenueRequirements({
			polymarket: {
				executionReady: false,
				blockingReasons: ["polymarket:usdc_approval_required"],
			},
			levelup: {
				executionReady: true,
				blockingReasons: ["should:not:appear"],
			},
		});
		expect(codes).toEqual(["polymarket:usdc_approval_required"]);
	});
});

describe("formatExecutionNotReadyUserMessage", () => {
	it("prefers mapped blocking reasons over generic server error", () => {
		const msg = formatExecutionNotReadyUserMessage({
			serverError: "No route you can execute…",
			venueRequirements: {
				polymarket: {
					executionReady: false,
					blockingReasons: ["polymarket:ctf_approval_required"],
				},
			},
		});
		expect(msg).toMatch(/Approve outcome tokens/i);
	});

	it("passes through server error when no venue requirements", () => {
		expect(
			formatExecutionNotReadyUserMessage({
				serverError: "Complete setup for: Polymarket",
			}),
		).toBe("Complete setup for: Polymarket");
	});
});

describe("blockingReasonsToMessages", () => {
	it("dedupes identical codes", () => {
		expect(
			blockingReasonsToMessages([
				"polymarket:usdc_approval_required",
				"polymarket:usdc_approval_required",
			]),
		).toHaveLength(1);
	});
});
