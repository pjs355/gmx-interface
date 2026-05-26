import { describe, expect, it, vi } from "vitest";
import { parseUnits, formatUnits } from "viem";
import {
	ensurePrefundQuoteMeetsDestMin,
	parseLifiQuoteMinToStableHuman,
	prefundDestNeedFloorAtSendCap,
	prefundQuotedMinDestHuman,
} from "../prefund/lifiPrefundQuoteSolve";

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

describe("prefundDestNeedFloorAtSendCap", () => {
	it("is slightly below nominal dest need for typical trade sizes", () => {
		const need = 1.9721;
		const floor = prefundDestNeedFloorAtSendCap(need);
		expect(floor).toBeLessThan(need);
		expect(1.9481).toBeGreaterThanOrEqual(floor - 1e-6);
	});
});

describe("ensurePrefundQuoteMeetsDestMin", () => {
	it("accepts capped send when quoted min dest is within bridge-fee slack", async () => {
		const api = {
			postFundingLifiQuote: vi.fn().mockResolvedValue({
				steps: [{}],
				quote: { estimate: { toAmountMin: "1948100" } },
			}),
		};
		const destNeed = 1.9721;
		const r = await ensurePrefundQuoteMeetsDestMin({
			api,
			fromChainLifi: 8453,
			toChainLifi: 8453,
			fromAddress: `0x${"1".repeat(40)}`,
			toAddress: `0x${"2".repeat(40)}`,
			destPortionUsd: destNeed,
			maxFromHuman: destNeed,
			budgetUsd: destNeed,
			seedAmountHuman: destNeed.toFixed(6),
		});
		expect(parseUnits(r.amountHuman, 6)).toEqual(parseUnits(destNeed.toFixed(6), 6));
		expect(api.postFundingLifiQuote).toHaveBeenCalledTimes(1);
	});

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
				budgetUsd: 5,
				seedAmountHuman: "2",
			}),
		).rejects.toThrow(/source balance cap/);
		expect(api.postFundingLifiQuote).toHaveBeenCalledTimes(1);
	});

	it("caps sendHuman at budgetUsd even when wallet balance is much larger", async () => {
		// Simulate FASTEST under-delivery: LI.FI returns minTo = 0.99 * sendHuman.
		// Wallet has $50, but per-corridor budget is $25. We need to verify the
		// iteration never exceeds $25 send and converges within fee slack.
		const callsSeen: number[] = [];
		const api = {
			postFundingLifiQuote: vi.fn(async (req: { amountHuman: string }) => {
				const send = Number(req.amountHuman);
				callsSeen.push(send);
				const minToAtoms = Math.floor(send * 0.99 * 1_000_000).toString();
				return {
					steps: [{}],
					quote: { estimate: { toAmountMin: minToAtoms } },
				};
			}),
		};

		const destNeed = 24.5;
		const r = await ensurePrefundQuoteMeetsDestMin({
			api,
			fromChainLifi: 137,
			toChainLifi: 8453,
			fromAddress: `0x${"1".repeat(40)}`,
			toAddress: `0x${"2".repeat(40)}`,
			destPortionUsd: destNeed,
			maxFromHuman: 50,
			budgetUsd: 25,
			seedAmountHuman: destNeed.toFixed(6),
		});

		const finalSend = Number(r.amountHuman);
		expect(finalSend).toBeLessThanOrEqual(25 + 1e-9);
		for (const s of callsSeen) {
			expect(s).toBeLessThanOrEqual(25 + 1e-9);
		}
		// Quote-time minTo at $25 send is 24.75 — within `prefundDestNeedFloorAtSendCap`
		// slack of 24.5 → caller accepts.
		expect(finalSend).toBeGreaterThanOrEqual(24.5 - 1e-6);
	});

	it("error message names budget cap when budget < wallet", async () => {
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
				destPortionUsd: 10,
				maxFromHuman: 100,
				budgetUsd: 2,
				seedAmountHuman: "2",
			}),
		).rejects.toThrow(/per-corridor budget cap/);
	});

	it("rejects budgetUsd <= 0 (caller must supply optimizer budget)", async () => {
		const api = { postFundingLifiQuote: vi.fn() };
		await expect(
			ensurePrefundQuoteMeetsDestMin({
				api,
				fromChainLifi: 137,
				toChainLifi: 8453,
				fromAddress: `0x${"1".repeat(40)}`,
				toAddress: `0x${"2".repeat(40)}`,
				destPortionUsd: 5,
				maxFromHuman: 50,
				budgetUsd: 0,
				seedAmountHuman: "5",
			}),
		).rejects.toThrow(/budgetUsd/);
		expect(api.postFundingLifiQuote).not.toHaveBeenCalled();
	});

	it("multi-step: prorated per-step budget keeps Σ sendHuman within corridorBudget under typical LI.FI under-delivery", async () => {
		// Mirrors `useSorLegExecutor`'s prorated allocation across prefund steps.
		// 2 source chains delivering $12 + $8 = $20 to Base; corridorBudget = exec + bridgeCost = $20.15.
		// LI.FI returns minTo = 0.99 * sendHuman (1% fee, within 3.5% prefund slack).
		// Each step's budget = (destPortion / Σdest) * corridorBudget + carry.
		const api = {
			postFundingLifiQuote: vi.fn(async (req: { amountHuman: string }) => {
				const send = Number(req.amountHuman);
				const minToAtoms = Math.floor(send * 0.99 * 1_000_000).toString();
				return {
					steps: [{}],
					quote: { estimate: { toAmountMin: minToAtoms } },
				};
			}),
		};

		const corridorBudget = 20 + 0.15;
		const stepDestNeeds = [12, 8] as const;
		const sumDest = stepDestNeeds.reduce((s, d) => s + d, 0);
		const stepWallets = [50, 50] as const;
		const sentHumans: number[] = [];
		let carry = 0;

		for (let i = 0; i < stepDestNeeds.length; i++) {
			const share = (stepDestNeeds[i]! / sumDest) * corridorBudget;
			const stepBudget = share + carry;
			const r = await ensurePrefundQuoteMeetsDestMin({
				api,
				fromChainLifi: i === 0 ? 137 : 1151111081099710,
				toChainLifi: 8453,
				fromAddress: `0x${"1".repeat(40)}`,
				toAddress: `0x${"2".repeat(40)}`,
				destPortionUsd: stepDestNeeds[i]!,
				maxFromHuman: stepWallets[i]!,
				budgetUsd: stepBudget,
				seedAmountHuman: stepDestNeeds[i]!.toFixed(6),
			});
			const sent = Number(r.amountHuman);
			sentHumans.push(sent);
			carry = Math.max(0, stepBudget - sent);
		}

		const total = sentHumans.reduce((s, n) => s + n, 0);
		expect(total).toBeLessThanOrEqual(corridorBudget + 1e-6);
		expect(sentHumans).toHaveLength(2);
		expect(sentHumans[0]).toBeGreaterThanOrEqual(stepDestNeeds[0]! * 0.99);
		expect(sentHumans[1]).toBeGreaterThanOrEqual(stepDestNeeds[1]! * 0.99);
	});

	it("multi-step: prorated cap fails fast on pathological LI.FI under-delivery (no silent overspend)", async () => {
		// Step 1 has 5% LI.FI under-delivery (above the 3.5% prefund slack).
		// Even with carry from step 1, step 2 still cannot meet destNeed within its
		// per-step share, so the prefund must throw rather than overspending.
		const api = {
			postFundingLifiQuote: vi.fn(async (req: { amountHuman: string }) => {
				const send = Number(req.amountHuman);
				const minToAtoms = Math.floor(send * 0.95 * 1_000_000).toString();
				return {
					steps: [{}],
					quote: { estimate: { toAmountMin: minToAtoms } },
				};
			}),
		};

		const corridorBudget = 20.05;
		const stepDestNeeds = [12, 8] as const;
		const sumDest = stepDestNeeds.reduce((s, d) => s + d, 0);
		const share1 = (stepDestNeeds[0]! / sumDest) * corridorBudget;

		await expect(
			ensurePrefundQuoteMeetsDestMin({
				api,
				fromChainLifi: 137,
				toChainLifi: 8453,
				fromAddress: `0x${"1".repeat(40)}`,
				toAddress: `0x${"2".repeat(40)}`,
				destPortionUsd: stepDestNeeds[0]!,
				maxFromHuman: 50,
				budgetUsd: share1,
				seedAmountHuman: stepDestNeeds[0]!.toFixed(6),
			}),
		).rejects.toThrow(/per-corridor budget cap/);
	});

	it("rejects BNB chain quotes without maxFromWei", async () => {
		await expect(
			ensurePrefundQuoteMeetsDestMin({
				api: { postFundingLifiQuote: vi.fn() },
				fromChainLifi: 56,
				toChainLifi: 8453,
				fromAddress: `0x${"1".repeat(40)}`,
				toAddress: `0x${"2".repeat(40)}`,
				destPortionUsd: 0.5,
				maxFromHuman: 1,
				budgetUsd: 1,
				seedAmountHuman: "0.5",
			}),
		).rejects.toThrow(/maxFromWei is required/);
	});

	it("BNB 18-dec: posts amountHuman whose parsed wei is <= maxFromWei", async () => {
		const maxFromWei = 373117663992041258n;
		const api = {
			postFundingLifiQuote: vi.fn(async (req: { amountHuman: string }) => {
				const atoms = parseUnits(req.amountHuman, 18);
				expect(atoms).toBeLessThanOrEqual(maxFromWei);
				return {
					steps: [{}],
					quote: { estimate: { toAmountMin: "1000000" } },
				};
			}),
		};
		const destNeed = Number(formatUnits(maxFromWei, 18));
		const r = await ensurePrefundQuoteMeetsDestMin({
			api,
			fromChainLifi: 56,
			toChainLifi: 8453,
			fromAddress: `0x${"1".repeat(40)}`,
			toAddress: `0x${"2".repeat(40)}`,
			destPortionUsd: destNeed,
			maxFromHuman: destNeed,
			budgetUsd: destNeed,
			seedAmountHuman: "0.373118",
			maxFromWei,
		});
		expect(parseUnits(r.amountHuman, 18)).toBeLessThanOrEqual(maxFromWei);
		expect(api.postFundingLifiQuote).toHaveBeenCalled();
	});
});
