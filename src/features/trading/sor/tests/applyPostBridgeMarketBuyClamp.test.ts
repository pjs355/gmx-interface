import { describe, expect, it, vi } from "vitest";
import { resolvePostBridgeMarketBuyWire } from "../prefund/applyPostBridgeMarketBuyClamp";

describe("resolvePostBridgeMarketBuyWire", () => {
	const leg = {
		venue: "polymarket" as const,
		executionAmountUsd: 10.5,
		fee: 0.5,
	};

	it("returns clamped wire when wallet read succeeds", async () => {
		const r = await resolvePostBridgeMarketBuyWire({
			leg,
			venue: "polymarket",
			walletBalanceLogKey: "walletPusdUsd",
			readWalletUsd: async () => 100,
		});
		expect(r.ok).toBe(true);
		if (r.ok) {
			expect(r.amountUsd).toBe(10);
			expect(r.scale).toBe(1);
			expect(r.resized).toBe(false);
			expect(r.plannedWireUsd).toBe(10);
		}
	});

	it("returns formatted error when wallet read throws", async () => {
		const r = await resolvePostBridgeMarketBuyWire({
			leg,
			venue: "predictfun",
			readWalletUsd: async () => {
				throw new Error("rpc down");
			},
		});
		expect(r.ok).toBe(false);
		if (!r.ok) {
			expect(r.error.length).toBeGreaterThan(0);
		}
	});

	it("propagates clamp failure when wallet cannot cover minimum", async () => {
		const r = await resolvePostBridgeMarketBuyWire({
			leg: { venue: "limitless", executionAmountUsd: 5, fee: 0.5 },
			venue: "limitless",
			readWalletUsd: async () => 0.5,
		});
		expect(r.ok).toBe(false);
	});

	it("logs with custom wallet balance key", async () => {
		const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});
		await resolvePostBridgeMarketBuyWire({
			leg,
			venue: "polymarket",
			walletBalanceLogKey: "walletPusdUsd",
			readWalletUsd: async () => 50,
		});
		expect(debugSpy).toHaveBeenCalled();
		const payload = debugSpy.mock.calls[0]?.[1] as Record<string, unknown>;
		expect(payload.walletPusdUsd).toBe(50);
		debugSpy.mockRestore();
	});
});
