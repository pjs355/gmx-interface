import type { AllOddsMarket } from "./types";

/** Mirrors backend neg-risk-registry segments used on FIFA multi-outcome umbrellas. */
const MULTI_LEG_SEGMENTS = new Set([
	"group_a",
	"group_b",
	"group_c",
	"group_d",
	"group_e",
	"group_f",
	"group_g",
	"group_h",
	"group_i",
	"group_j",
	"group_k",
	"group_l",
	"future_tournament_winner",
	"future_reach_quarterfinals",
	"future_reach_semifinals",
	"future_reach_final",
	"award_golden_boot",
	"award_golden_ball",
	"award_golden_glove",
]);

const MULTI_LEG_PRIMARY_VISIBLE = 2;

export function normalizeKeyPart(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseMultiLegDisplayName(
	displayName: string,
): { title: string; legLabel: string } | null {
	const display = displayName.trim();
	const dashIdx = display.lastIndexOf(" — ");
	if (dashIdx < 0) return null;
	const legLabel = display.slice(dashIdx + 3).trim();
	const title = display.slice(0, dashIdx).trim();
	if (!legLabel || !title) return null;
	return { title, legLabel };
}

function inferSegmentFromTitle(title: string): string | null {
	const key = normalizeKeyPart(title);
	if (key.startsWith("group ") && key.endsWith(" winner")) {
		const letter = key.slice("group ".length, key.length - " winner".length).trim();
		if (/^[a-l]$/.test(letter)) return `group_${letter}`;
	}
	if (key.includes("world cup winner") || key === "fifa world cup winner") {
		return "future_tournament_winner";
	}
	if (key.startsWith("reach quarterfinals")) return "future_reach_quarterfinals";
	if (key.startsWith("reach semifinals")) return "future_reach_semifinals";
	if (key.startsWith("reach final")) return "future_reach_final";
	if (key.startsWith("golden boot")) return "award_golden_boot";
	if (key.startsWith("golden ball")) return "award_golden_ball";
	if (key.startsWith("golden glove")) return "award_golden_glove";
	return null;
}

export function resolveMultiLegSegment(market: AllOddsMarket): string | null {
	const raw = market.segment?.trim();
	if (raw && MULTI_LEG_SEGMENTS.has(raw)) return raw;
	const parsed = parseMultiLegDisplayName(market.displayName);
	if (!parsed) return null;
	return inferSegmentFromTitle(parsed.title);
}

export function isAllOddsMultiLegMarket(market: AllOddsMarket): boolean {
	if (market.moneylineLeg) return false;
	const mt = market.marketType?.trim().toLowerCase();
	if (mt === "spread" || mt === "total" || mt === "moneyline") return false;
	const segment = resolveMultiLegSegment(market);
	if (!segment) return false;
	if (mt !== "winner" && mt !== "prop") {
		// NegRisk legs are winner/prop; allow displayName-only when segment inferred.
		if (mt !== undefined) return false;
	}
	return true;
}

export function multiLegGroupTitle(market: AllOddsMarket): string {
	const parsed = parseMultiLegDisplayName(market.displayName);
	if (parsed?.title) return parsed.title;
	const segment = resolveMultiLegSegment(market);
	if (segment?.startsWith("group_")) {
		const letter = segment.slice("group_".length).toUpperCase();
		return `Group ${letter} Winner`;
	}
	return market.displayName.trim() || market.pandaMatchId;
}

export function multiLegLegLabel(market: AllOddsMarket): string {
	const parsed = parseMultiLegDisplayName(market.displayName);
	if (parsed?.legLabel) return parsed.legLabel;
	return market.displayName.trim() || market.pandaMatchId;
}

export function multiLegGroupKey(market: AllOddsMarket): string | null {
	if (!isAllOddsMultiLegMarket(market)) return null;
	const segment = resolveMultiLegSegment(market);
	if (!segment) return null;
	const title = multiLegGroupTitle(market);
	const umbrellaPart = market.umbrellaId?.trim()
		? normalizeKeyPart(market.umbrellaId)
		: normalizeKeyPart(title);
	return `multileg:${segment}:${umbrellaPart}`;
}

export { MULTI_LEG_PRIMARY_VISIBLE };
