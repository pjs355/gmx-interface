import { describe, expect, it } from "vitest";
import {
	normalizeMakerTakerBuyMakerMicro,
	predictionBuyMakerMicroUsdc,
} from "./predictionBuyCollateralMicro";

describe("predictionBuyCollateralMicro parity with prediction API normalizeMakerTaker", () => {
	it("matches bigint maker micro for whole-share sizes and 2dp prices", () => {
		for (let cents = 1; cents <= 99; cents++) {
			const price = cents / 100;
			for (let shares = 1; shares <= 50; shares++) {
				const client = predictionBuyMakerMicroUsdc(shares, price);
				const server = normalizeMakerTakerBuyMakerMicro(price, shares);
				expect(
					client,
					`mismatch price=${price} shares=${shares} client=${client} server=${server}`,
				).toEqual(server);
			}
		}
	});

	it("matches examples from observed failures", () => {
		const p31 = predictionBuyMakerMicroUsdc(10, 0.31);
		const n31 = normalizeMakerTakerBuyMakerMicro(0.31, 10);
		expect(p31).toEqual(n31);
		expect(p31).toEqual(3_100_000n);
	});
});
