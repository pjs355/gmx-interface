import { describe, expect, it } from "vitest";
import {
	calculateFeeMatchingBackend,
	levelUpBuyFeeMicroFromMakerMicro,
	levelUpBuyTotalMicroScwBalanceRequired,
} from "./feeLevelUp";
import { predictionBuyMakerMicroUsdc } from "@/trading/sor/predictionBuyCollateralMicro";

describe("feeLevelUp parity with predictions ensureUsdcApprovalAndBalance buy fee", () => {
	it("3 shares @ 0.52 → maker 1.56 + fee 0.04 = 1.60 USDC on SCW", () => {
		const maker = predictionBuyMakerMicroUsdc(3, 0.52);
		expect(maker).toBe(1_560_000n);
		expect(levelUpBuyFeeMicroFromMakerMicro(maker)).toBe(40_000n);
		expect(levelUpBuyTotalMicroScwBalanceRequired(maker)).toBe(1_600_000n);
		expect(calculateFeeMatchingBackend(1.56)).toBeCloseTo(0.04, 8);
	});

	it("fee rounds up to whole cents in micros (31200 → 40000)", () => {
		expect(levelUpBuyFeeMicroFromMakerMicro(1_560_000n)).toBe(40_000n);
	});
});
