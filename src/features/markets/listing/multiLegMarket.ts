import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";
import { resolveFifaTeamLegColor } from "@/features/markets/listing/fifaTeamLegColor";
import { isMatchPropQuestion } from "@/features/markets/listing/matchProps";

/**
 * NegRisk multi-outcome umbrellas: one Polymarket event → N binary legs (group winners,
 * tournament futures, player awards). Layout profiles mirror backend neg-risk-registry.
 */

export type MultiLegLayoutProfile = {
	homeTopN: number | "all";
	chartTopN: number | "all";
	sortBy: "yesPrice" | "sortOrder";
	imageMode: "countryFlag" | "outcomeImage" | "none";
};

export type WorldCupMultiLegSection = "groups" | "futures" | "awards";

type SegmentDef = {
	layout: MultiLegLayoutProfile;
	worldCupSection: WorldCupMultiLegSection;
};

const GROUP_LAYOUT: MultiLegLayoutProfile = {
	homeTopN: "all",
	chartTopN: "all",
	sortBy: "sortOrder",
	imageMode: "countryFlag",
};

const FUTURES_LAYOUT: MultiLegLayoutProfile = {
	homeTopN: 2,
	chartTopN: 3,
	sortBy: "yesPrice",
	imageMode: "countryFlag",
};

const AWARD_LAYOUT: MultiLegLayoutProfile = {
	homeTopN: 2,
	chartTopN: 3,
	sortBy: "yesPrice",
	imageMode: "none",
};

const GROUP_LETTERS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"] as const;

function groupSegmentDefs(): Record<string, SegmentDef> {
	const out: Record<string, SegmentDef> = {};
	for (const letter of GROUP_LETTERS) {
		out[`group_${letter}`] = {
			layout: GROUP_LAYOUT,
			worldCupSection: "groups",
		};
	}
	return out;
}

const SEGMENT_REGISTRY: Record<string, SegmentDef> = {
	...groupSegmentDefs(),
	future_tournament_winner: { layout: FUTURES_LAYOUT, worldCupSection: "futures" },
	future_reach_quarterfinals: { layout: FUTURES_LAYOUT, worldCupSection: "futures" },
	future_reach_semifinals: { layout: FUTURES_LAYOUT, worldCupSection: "futures" },
	future_reach_final: { layout: FUTURES_LAYOUT, worldCupSection: "futures" },
	award_golden_boot: { layout: AWARD_LAYOUT, worldCupSection: "awards" },
	award_golden_ball: { layout: AWARD_LAYOUT, worldCupSection: "awards" },
	award_golden_glove: { layout: AWARD_LAYOUT, worldCupSection: "awards" },
};

export const MULTI_LEG_OTHER_COLOR = "#9ca3af";

function isMoneylineLeg(q: PredictionMarket): boolean {
	const leg = (q as { moneylineLeg?: unknown }).moneylineLeg;
	return leg === "home" || leg === "away" || leg === "draw";
}

export function isMultiLegBinaryQuestion(question: PredictionMarket | null | undefined): boolean {
	if (question === null || question === undefined) return false;
	if (isMoneylineLeg(question)) return false;
	if (isMatchPropQuestion(question)) return false;
	const marketId = question.polymarketMarketId;
	if (typeof marketId !== "string" || marketId.trim().length === 0) return false;
	const segment = typeof question.segment === "string" ? question.segment.trim() : "";
	if (segment.length === 0) return false;
	if (question.marketType !== "winner" && question.marketType !== "prop") return false;
	return segment in SEGMENT_REGISTRY;
}

export const isGroupWinnerLeg = isMultiLegBinaryQuestion;

export function isMultiLegBinaryUmbrella(
	questions: PredictionMarket[] | null | undefined,
): boolean {
	if (!Array.isArray(questions)) return false;
	let count = 0;
	for (const q of questions) {
		if (isMultiLegBinaryQuestion(q)) count += 1;
	}
	return count >= 2;
}

export const isGroupWinnerQuestions = isMultiLegBinaryUmbrella;

export function resolveMultiLegLayout(segment: string): MultiLegLayoutProfile | undefined {
	return SEGMENT_REGISTRY[segment]?.layout;
}

export function multiLegSegmentFromQuestions(
	questions: PredictionMarket[] | null | undefined,
): string | null {
	if (!Array.isArray(questions)) return null;
	for (const q of questions) {
		if (!isMultiLegBinaryQuestion(q)) continue;
		const seg = typeof q.segment === "string" ? q.segment.trim() : "";
		if (seg.length > 0) return seg;
	}
	return null;
}

/** Group winners, tournament futures, and player awards — not kickoff-scheduled H2H matches. */
export function isNonMatchHomeListing(umbrella: Umbrella | null | undefined): boolean {
	return worldCupSectionForUmbrella(umbrella) !== null;
}

export function worldCupSectionForUmbrella(
	umbrella: Umbrella | null | undefined,
): WorldCupMultiLegSection | null {
	const children = (
		umbrella as { children?: Array<{ marketType?: unknown; segment?: unknown }> } | null | undefined
	)?.children;
	if (!Array.isArray(children)) return null;
	for (const child of children) {
		const segment = typeof child?.segment === "string" ? child.segment.trim() : "";
		const def = SEGMENT_REGISTRY[segment];
		if (def !== undefined) return def.worldCupSection;
	}
	return null;
}

export function resolveTopN(topN: number | "all", total: number): number {
	if (topN === "all") return total;
	return Math.min(topN, total);
}

export function multiLegLegLabel(question: PredictionMarket): string {
	const q = (question.question || "").trim();
	const winMatch = q.match(/^Will\s+(.+?)\s+win\b/i);
	if (winMatch?.[1]) return winMatch[1].trim();
	const reachMatch = q.match(/^Will\s+(.+?)\s+(?:reach|advance|make)\b/i);
	if (reachMatch?.[1]) return reachMatch[1].trim();
	const display = (question.displayName || "").trim();
	const dashIdx = display.lastIndexOf(" — ");
	if (dashIdx !== -1) {
		const tail = display.slice(dashIdx + 3).trim();
		if (tail) return tail;
	}
	return display || q;
}

export const groupWinnerLegLabel = multiLegLegLabel;

export function isMultiLegOtherLeg(question: PredictionMarket): boolean {
	if (typeof question.segment === "string" && /(_other|_field)$/i.test(question.segment)) {
		return true;
	}
	return /\bother\b/i.test(multiLegLegLabel(question));
}

export const isGroupWinnerOtherLeg = isMultiLegOtherLeg;

export function multiLegLegImage(
	question: PredictionMarket,
	profile: MultiLegLayoutProfile,
): string | null {
	if (profile.imageMode === "none") return null;
	const image = (question as { image?: unknown }).image;
	if (typeof image === "string" && image.trim().length > 0) return image.trim();
	return null;
}

export function multiLegLegColor(
	question: PredictionMarket,
	_index: number,
	teamMappings?: UmbrellaTeamMapping[] | null,
	gameTeamColorBySlug?: Record<string, string> | null,
): string {
	if (isMultiLegOtherLeg(question)) return MULTI_LEG_OTHER_COLOR;
	return resolveFifaTeamLegColor({
		teamLabel: multiLegLegLabel(question),
		yesColor: (question as { yesColor?: unknown }).yesColor as string | undefined,
		teamMappings,
		gameTeamColorBySlug,
	});
}

export const groupWinnerLegColor = multiLegLegColor;

export function orderMultiLegs(
	questions: PredictionMarket[],
	profile: MultiLegLayoutProfile,
	yesPriceByMarketId?: ReadonlyMap<string, number>,
): PredictionMarket[] {
	const legs = questions.filter((q) => isMultiLegBinaryQuestion(q)).slice();
	legs.sort((a, b) => {
		if (profile.sortBy === "yesPrice" && yesPriceByMarketId !== undefined) {
			const idA = typeof a.polymarketMarketId === "string" ? a.polymarketMarketId : "";
			const idB = typeof b.polymarketMarketId === "string" ? b.polymarketMarketId : "";
			const pa = yesPriceByMarketId.get(idA) ?? -1;
			const pb = yesPriceByMarketId.get(idB) ?? -1;
			if (pa !== pb) return pb - pa;
		}
		const sa = typeof a.sortOrder === "number" ? a.sortOrder : 99;
		const sb = typeof b.sortOrder === "number" ? b.sortOrder : 99;
		if (sa !== sb) return sa - sb;
		return multiLegLegLabel(a).localeCompare(multiLegLegLabel(b));
	});
	return legs;
}

export function orderGroupWinnerLegs(questions: PredictionMarket[]): PredictionMarket[] {
	const segment = multiLegSegmentFromQuestions(questions);
	const profile = segment ? resolveMultiLegLayout(segment) : GROUP_LAYOUT;
	return orderMultiLegs(questions, profile ?? GROUP_LAYOUT);
}

export function multiLegUmbrellaShortTitle(
	questions: PredictionMarket[] | null | undefined,
): string | null {
	const segment = multiLegSegmentFromQuestions(questions);
	if (segment === null) return null;
	if (segment.startsWith("group_")) {
		const letter = segment.slice("group_".length).trim();
		if (letter.length > 0) return `Group ${letter.toUpperCase()}`;
	}
	if (segment === "future_tournament_winner") return "World Cup Winner";
	if (segment === "future_reach_quarterfinals") return "Reach Quarterfinals";
	if (segment === "future_reach_semifinals") return "Reach Semifinals";
	if (segment === "future_reach_final") return "Reach Final";
	if (segment === "award_golden_boot") return "Golden Boot";
	if (segment === "award_golden_ball") return "Golden Ball";
	if (segment === "award_golden_glove") return "Golden Glove";
	return null;
}

export const groupWinnerGroupLabel = multiLegUmbrellaShortTitle;

export function multiLegLegContextTitle(question: PredictionMarket): string | null {
	if (!isMultiLegBinaryQuestion(question)) return null;
	const short = multiLegUmbrellaShortTitle([question]);
	if (short === null) return null;
	if (question.segment?.startsWith("group_")) return `${short} Winner`;
	return short;
}

export const groupWinnerLegGroupTitle = multiLegLegContextTitle;

export function worldCupPropGroupSortKey(umbrella: Umbrella): string {
	const children = (
		umbrella as { children?: Array<{ marketType?: unknown; segment?: unknown }> } | null | undefined
	)?.children;
	if (!Array.isArray(children)) return "\uffff";
	for (const child of children) {
		const segment = typeof child?.segment === "string" ? child.segment.trim() : "";
		if (segment.startsWith("group_")) return segment;
	}
	return "\uffff";
}

export function worldCupMultiLegSortKey(umbrella: Umbrella): string {
	const section = worldCupSectionForUmbrella(umbrella);
	if (section === "groups") return worldCupPropGroupSortKey(umbrella);
	const children = (umbrella as { children?: Array<{ segment?: unknown }> } | null | undefined)
		?.children;
	const segment =
		typeof children?.[0]?.segment === "string" ? children[0].segment.trim() : "\uffff";
	return `${section ?? "z"}:${segment}`;
}
