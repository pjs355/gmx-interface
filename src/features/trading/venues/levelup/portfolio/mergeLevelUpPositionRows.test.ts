import { describe, expect, it } from "vitest";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { mergeLevelUpPositionRows } from "@/features/trading/venues/levelup/portfolio/mergeLevelUpPositionRows";

function levelUpRow(
	conditionId: string,
	outcome: string,
	shares: number,
	tokenId: string,
): VenuePosition {
	return {
		venue: "levelup",
		marketTitle: "Test",
		outcome,
		shares,
		avgPrice: null,
		currentPrice: null,
		cost: null,
		currentValue: 0,
		pnl: null,
		pnlPercent: null,
		tokenId,
		conditionId,
	};
}

describe("mergeLevelUpPositionRows", () => {
	it("updates matching outcome and preserves other markets", () => {
		const existing = [
			levelUpRow("m1", "Yes", 10, "yes-1"),
			levelUpRow("m2", "No", 5, "no-2"),
		];
		const fresh = [levelUpRow("m1", "Yes", 12, "yes-1")];

		const merged = mergeLevelUpPositionRows(existing, fresh);
		expect(merged).toHaveLength(2);
		expect(merged.find((r) => r.conditionId === "m1")?.shares).toBe(12);
		expect(merged.find((r) => r.conditionId === "m2")?.shares).toBe(5);
	});

	it("removes zero-share outcomes from cache", () => {
		const existing = [levelUpRow("m1", "Yes", 10, "yes-1")];
		const fresh = [levelUpRow("m1", "Yes", 0, "yes-1")];

		const merged = mergeLevelUpPositionRows(existing, fresh);
		expect(merged).toHaveLength(0);
	});
});
