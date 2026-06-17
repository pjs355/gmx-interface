import { describe, expect, it } from "vitest";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	abbreviateFixtureTitle,
	allOddsOutcomeDisplayLabel,
	buildMatchPropLadders,
	compactAllOddsTotalLabel,
	matchPropSelectionTitle,
	propVenueColumnHeaders,
	spreadOutcomeSideLabels,
	spreadSignedLineFromLabel,
	totalOutcomeSideLabels,
} from "./matchProps";

const teamMappings = [
	{ displayName: "Mexico", shortCode: "MEX" },
	{ displayName: "South Africa", shortCode: "RSA" },
];

function spreadQuestion(input: {
	id: string;
	spreadSide: "home" | "away";
	line: number;
	displayName: string;
}): PredictionMarket {
	return {
		_id: input.id,
		displayName: input.displayName,
		marketType: "spread",
		line: input.line,
		spreadSide: input.spreadSide,
	} as PredictionMarket;
}

describe("abbreviateFixtureTitle", () => {
	it("abbreviates both sides of a fixture title", () => {
		expect(abbreviateFixtureTitle("Mexico vs South Africa", teamMappings)).toBe(
			"MEX vs RSA",
		);
	});

	it("returns non-fixture titles unchanged", () => {
		expect(abbreviateFixtureTitle("World Cup Winner", teamMappings)).toBe("World Cup Winner");
	});
});

describe("matchPropSelectionTitle", () => {
	const mexMinus15 = spreadQuestion({
		id: "mex-15",
		spreadSide: "home",
		line: -1.5,
		displayName: "Mexico -1.5",
	});
	const rsaMinus15 = spreadQuestion({
		id: "rsa-15",
		spreadSide: "away",
		line: -1.5,
		displayName: "South Africa -1.5",
	});

	it("returns the covering team line on Yes", () => {
		expect(matchPropSelectionTitle(mexMinus15, "yes", teamMappings)).toBe("Mexico -1.5");
		expect(matchPropSelectionTitle(rsaMinus15, "yes", teamMappings)).toBe("South Africa -1.5");
	});

	it("returns the opponent complementary line on No", () => {
		expect(matchPropSelectionTitle(mexMinus15, "no", teamMappings)).toBe("South Africa +1.5");
		expect(matchPropSelectionTitle(rsaMinus15, "no", teamMappings)).toBe("Mexico +1.5");
	});

	it("returns Over/Under with line for totals", () => {
		const total = {
			_id: "total-25",
			displayName: "O/U 2.5",
			marketType: "total",
			line: 2.5,
		} as PredictionMarket;
		expect(matchPropSelectionTitle(total, "yes", teamMappings)).toBe("Over 2.5 goals");
		expect(matchPropSelectionTitle(total, "no", teamMappings)).toBe("Under 2.5 goals");
	});
});

describe("totalOutcomeSideLabels", () => {
	it("maps Yes/No to Over/Under with line", () => {
		expect(
			totalOutcomeSideLabels({
				displayName: "O/U 1.5",
				marketType: "total",
				line: 1.5,
			} as PredictionMarket),
		).toEqual({ yesLabel: "Over 1.5 goals", noLabel: "Under 1.5 goals" });
	});
});

describe("spreadOutcomeSideLabels", () => {
	it("maps Yes/No to signed lines for each spread question", () => {
		const mexMinus15 = spreadQuestion({
			id: "mex-15",
			spreadSide: "home",
			line: -1.5,
			displayName: "Mexico -1.5",
		});
		expect(spreadOutcomeSideLabels(mexMinus15, teamMappings)).toEqual({
			yesLabel: "MEX -1.5",
			noLabel: "RSA +1.5",
		});
	});
});

describe("propVenueColumnHeaders", () => {
	it("maps spread yes/no labels to cross-venue column headers", () => {
		const mexMinus15 = spreadQuestion({
			id: "mex-15",
			spreadSide: "home",
			line: -1.5,
			displayName: "Mexico -1.5",
		});
		expect(propVenueColumnHeaders(mexMinus15, teamMappings)).toEqual({
			teamA: "MEX -1.5",
			teamB: "RSA +1.5",
		});
	});

	it("maps total yes/no labels to Over/Under column headers", () => {
		const total = {
			marketType: "total",
			line: 2.5,
			displayName: "Total Goals 2.5",
		} as PredictionMarket;
		expect(propVenueColumnHeaders(total, teamMappings)).toEqual({
			teamA: "Over 2.5 goals",
			teamB: "Under 2.5 goals",
		});
	});
});

describe("allOddsOutcomeDisplayLabel", () => {
	it("shows only the signed line for spread rows on mobile when a flag is present", () => {
		expect(
			allOddsOutcomeDisplayLabel("Mexico -1.5", teamMappings, true, {
				marketType: "spread",
				logoUrl: "https://flag.test/mex.png",
			}),
		).toBe("-1.5");
	});

	it("keeps full spread label on desktop", () => {
		expect(allOddsOutcomeDisplayLabel("Mexico -1.5", teamMappings, false)).toBe("Mexico -1.5");
	});

	it("preserves total labels with goals on mobile using O/U shorthand", () => {
		expect(compactAllOddsTotalLabel("Over 2.5 goals")).toBe("O 2.5 goals");
		expect(compactAllOddsTotalLabel("Under 0.5 goals")).toBe("U 0.5 goals");
		expect(
			allOddsOutcomeDisplayLabel("Over 2.5 goals", teamMappings, true, {
				marketType: "total",
			}),
		).toBe("O 2.5 goals");
	});
});

describe("spreadSignedLineFromLabel", () => {
	it("extracts signed handicaps", () => {
		expect(spreadSignedLineFromLabel("Mexico -1.5")).toBe("-1.5");
		expect(spreadSignedLineFromLabel("South Africa +1.5")).toBe("+1.5");
	});
});

describe("buildSpreadLadder", () => {
	it("maps + cells to the opponent negative-handicap question on No", () => {
		const spreads = [
			spreadQuestion({
				id: "mex-15",
				spreadSide: "home",
				line: -1.5,
				displayName: "Mexico -1.5",
			}),
			spreadQuestion({
				id: "rsa-15",
				spreadSide: "away",
				line: -1.5,
				displayName: "South Africa -1.5",
			}),
		];
		const [ladder] = buildMatchPropLadders(spreads, teamMappings);
		expect(ladder?.kind).toBe("spread");

		const awayRow = ladder?.rows.find((r) => r.key === "away");
		const plusCell = awayRow?.cells.find((c) => c?.value === 1.5);
		expect(plusCell?.position).toBe("no");
		expect(plusCell?.question._id).toBe("mex-15");
		expect(plusCell?.selectionTitle).toBe("South Africa +1.5");

		const minusCell = awayRow?.cells.find((c) => c?.value === -1.5);
		expect(minusCell?.position).toBe("yes");
		expect(minusCell?.question._id).toBe("rsa-15");
		expect(minusCell?.selectionTitle).toBe("South Africa -1.5");
	});
});
