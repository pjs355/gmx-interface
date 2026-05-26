import { describe, expect, it } from "vitest";
import { formatSorLegAvgForDisplay } from "../route/sorUiUtils";

describe("formatSorLegAvgForDisplay", () => {
	it("caps long decimal-odds strings (~53% implied)", () => {
		expect(formatSorLegAvgForDisplay(0.52677, "decimal")).toBe("1.9");
	});

	it("caps long Hong Kong cell strings", () => {
		expect(formatSorLegAvgForDisplay(0.52677, "hong_kong")).toBe("0.9");
	});

	it("keeps default as short whole-cent label", () => {
		expect(formatSorLegAvgForDisplay(0.52677, "default")).toBe("53¢");
	});

	it("does not rewrite fractional odds", () => {
		expect(formatSorLegAvgForDisplay(0.75, "fractional")).toBe("1/3");
	});
});
