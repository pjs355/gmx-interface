import { describe, expect, it } from "vitest";
import { formatUnits, parseUnits } from "viem";
import {
	floorFloatToDecimalString,
	prefundQuoteAmountHuman,
} from "./prefundFromAmountHuman";

describe("prefundQuoteAmountHuman", () => {
	it("floors 6-decimal amounts without trailing-zero padding", () => {
		expect(
			prefundQuoteAmountHuman({
				sendHuman: 1.9721,
				capHuman: 1.9721,
				fromChainLifi: 8453,
			}),
		).toBe("1.9721");
	});

	it("BNB 18-dec: never exceeds wallet wei when sendHuman float rounds up vs balance", () => {
		const maxFromWei = 373117663992041258n;
		const human = parseUnits("0.373118", 18);
		expect(human).toBeGreaterThan(maxFromWei);
		const s = prefundQuoteAmountHuman({
			sendHuman: 0.373118,
			capHuman: 0.373118,
			fromChainLifi: 56,
			maxFromWei,
		});
		const atomic = parseUnits(s, 18);
		expect(atomic).toBeLessThanOrEqual(maxFromWei);
	});

	it("BNB 18-dec: at full wallet+cap spends exact on-chain balance", () => {
		const maxFromWei = 373117663992041258n;
		const walletHuman = Number(formatUnits(maxFromWei, 18));
		const s = prefundQuoteAmountHuman({
			sendHuman: walletHuman,
			capHuman: walletHuman,
			fromChainLifi: 56,
			maxFromWei,
		});
		expect(parseUnits(s, 18)).toEqual(maxFromWei);
	});

	it("throws when 18-dec source chain omits maxFromWei", () => {
		expect(() =>
			prefundQuoteAmountHuman({
				sendHuman: 1,
				capHuman: 1,
				fromChainLifi: 56,
			}),
		).toThrow(/maxFromWei is required/);
	});
});

describe("floorFloatToDecimalString", () => {
	it("floors toward zero (never rounds up)", () => {
		expect(floorFloatToDecimalString(0.373117666, 6)).toBe("0.373117");
	});
});
