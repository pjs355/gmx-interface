import { describe, expect, it } from "vitest";
import type { MatchedMarket } from "@/types/odds-monitor";
import { pandaOutcomeSide } from "../pandaOutcomeSide";

function matched(overrides: Partial<MatchedMarket> = {}): MatchedMarket {
	return {
		pandaMatchId: "panda-1",
		pandaTeamA: "Team Alpha",
		pandaTeamB: "Team Beta",
		...overrides,
	} as MatchedMarket;
}

describe("pandaOutcomeSide", () => {
	it("maps YES to A when yes label matches pandaTeamA", () => {
		expect(pandaOutcomeSide(matched(), "yes", "Team Alpha", "Team Beta")).toBe("A");
	});

	it("maps NO to B when no label matches pandaTeamB", () => {
		expect(pandaOutcomeSide(matched(), "no", "Team Alpha", "Team Beta")).toBe("B");
	});

	it("is case-insensitive and trims labels", () => {
		expect(pandaOutcomeSide(matched(), "yes", "  team alpha  ", "Team Beta")).toBe("A");
	});

	it("falls back to YES→A NO→B when labels do not match panda teams", () => {
		const row = matched({ pandaTeamA: "Favbet", pandaTeamB: "Navi" });
		expect(pandaOutcomeSide(row, "yes", "Unknown", "Other")).toBe("A");
		expect(pandaOutcomeSide(row, "no", "Unknown", "Other")).toBe("B");
	});
});
