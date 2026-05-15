import { describe, expect, it } from "vitest";
import {
	DFLOW_OUTCOME_BASE_UNIT_FACTOR,
	humanFromDflowBaseUnits,
} from "./dflowOutcomeAmount";

describe("humanFromDflowBaseUnits", () => {
	it("converts integer base units to human 6dp contracts", () => {
		expect(humanFromDflowBaseUnits(String(7 * DFLOW_OUTCOME_BASE_UNIT_FACTOR))).toBe(
			7,
		);
		expect(humanFromDflowBaseUnits(7 * DFLOW_OUTCOME_BASE_UNIT_FACTOR)).toBe(7);
	});

	it("returns null for missing or non-positive", () => {
		expect(humanFromDflowBaseUnits(undefined)).toBeNull();
		expect(humanFromDflowBaseUnits("0")).toBeNull();
		expect(humanFromDflowBaseUnits("nope")).toBeNull();
	});
});
