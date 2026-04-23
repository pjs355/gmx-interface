import { describe, expect, it, vi } from "vitest";
import {
	ensurePrefundQuoteMeetsDestMin,
	parseLifiQuoteMinToStableHuman,
	prefundQuotedMinDestHuman,
} from "./lifiPrefundQuoteSolve";

describe("parseLifiQuoteMinToStableHuman", () => {
	it("reads estimate.toAmountMin for Base (6dp)", () => {
		const quote = {
			estimate: { toAmountMin: "4770000" },
		};
		expect(parseLifiQuoteMinToStableHuman(quote, 8453)).toBeCloseTo(4.77, 6);
	});

	it("prefers toAmountMin over toAmount", () => {
		const quote = {
			estimate: { toAmountMin: "1000000", toAmount: "2000000" },
		};
		expect(parseLifiQuoteMinToStableHuman(quote, 8453)).toBeCloseTo(1, 6);
	});

	it("falls back to action.toAmount", () => {
		const quote = {
			action: { toAmount: "3000000" },
		};
		expect(parseLifiQuoteMinToStableHuman(quote, 8453)).toBeCloseTo(3, 6);
	});

	it("uses 18 decimals for BSC dest", () => {
		const quote = {
			estimate: { toAmountMin: "1000000000000000000" },
		};
		expect(parseLifiQuoteMinToStableHuman(quote, 56)).toBeCloseTo(1, 8);
	});

	it("returns null when missing", () => {
		expect(parseLifiQuoteMinToStableHuman({}, 8453)).toBeNull();
		expect(parseLifiQuoteMinToStableHuman(null, 8453)).toBeNull();
	});
});

describe("prefundQuotedMinDestHuman", () => {
	it("uses exact toAmountMin when present", () => {
		const quote = { estimate: { toAmountMin: "1000000", toAmount: "2000000" } };
		expect(prefundQuotedMinDestHuman(quote, 8453)).toBeCloseTo(1, 6);
	});

	it("haircuts estimate.toAmount when toAmountMin is absent", () => {
		const quote = { estimate: { toAmount: "1000000" } };
		expect(prefundQuotedMinDestHuman(quote, 8453)).toBeCloseTo(0.98, 6);
		expect(parseLifiQuoteMinToStableHuman(quote, 8453)).toBeCloseTo(1, 6);
	});
});

describe("ensurePrefundQuoteMeetsDestMin", () => {
	it("fails in one quote when capped send cannot reach dest min", async () => {
		const api = {
			postFundingLifiQuote: vi.fn().mockResolvedValue({
				steps: [{}],
				quote: { estimate: { toAmountMin: "1000000" } },
			}),
		};
		await expect(
			ensurePrefundQuoteMeetsDestMin({
				api,
				fromChainLifi: 137,
				toChainLifi: 8453,
				fromAddress: `0x${"1".repeat(40)}`,
				toAddress: `0x${"2".repeat(40)}`,
				destPortionUsd: 5,
				maxFromHuman: 2,
				seedAmountHuman: "2",
			}),
		).rejects.toThrow(/source balance cap/);
		expect(api.postFundingLifiQuote).toHaveBeenCalledTimes(1);
	});
});
