import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/**
 * FIFA World Cup "Group X Winner" props: one Umbrella per group, one binary
 * Question per team (`marketType: "winner"`, `segment: "group_a"`). Unlike the
 * 3-way moneyline there is no Draw leg and there can be N teams (4 for the World
 * Cup). The home card + basic table show each team's YES price; the trade box
 * and orderbook expose YES/NO per team.
 */

const GROUP_SEGMENT_PREFIX = "group_";

function isWinnerLeg(q: PredictionMarket | null | undefined): boolean {
	if (q === null || q === undefined) return false;
	if (q.marketType !== "winner") return false;
	return typeof q.segment === "string" && q.segment.startsWith(GROUP_SEGMENT_PREFIX);
}

/** True when a single question is a group-winner team leg (no array context). */
export function isGroupWinnerLeg(question: PredictionMarket | null | undefined): boolean {
	return isWinnerLeg(question);
}

/** Group label for a single leg, e.g. `group_a` → "Group A Winner" (trade box context line). */
export function groupWinnerLegGroupTitle(question: PredictionMarket): string | null {
	if (!isWinnerLeg(question)) return null;
	const seg = (question.segment || "").trim();
	const letter = seg.slice(GROUP_SEGMENT_PREFIX.length).trim();
	if (letter.length === 0) return null;
	return `Group ${letter.toUpperCase()} Winner`;
}

/** True when an umbrella's display questions form a group-winner prop (≥2 team legs). */
export function isGroupWinnerQuestions(
	questions: PredictionMarket[] | null | undefined,
): boolean {
	if (!Array.isArray(questions)) return false;
	let count = 0;
	for (const q of questions) {
		if (isWinnerLeg(q)) count += 1;
	}
	return count >= 2;
}

/** Return the team legs in stable order (backend `sortOrder`, then label). */
export function orderGroupWinnerLegs(questions: PredictionMarket[]): PredictionMarket[] {
	return questions
		.filter((q) => isWinnerLeg(q))
		.slice()
		.sort((a, b) => {
			const sa = typeof a.sortOrder === "number" ? a.sortOrder : 99;
			const sb = typeof b.sortOrder === "number" ? b.sortOrder : 99;
			if (sa !== sb) return sa - sb;
			return groupWinnerLegLabel(a).localeCompare(groupWinnerLegLabel(b));
		});
}

/**
 * Distinct, stable palette for team legs when the question carries no `yesColor`
 * (group-winner data has no per-team colors). Indexed by leg position so the 4
 * teams in a group always render with the same 4 colors across card/table/chart.
 */
export const GROUP_WINNER_LEG_PALETTE = [
	"#22c55e", // green
	"#3b82f6", // blue
	"#f59e0b", // amber
	"#ec4899", // pink
	"#8b5cf6", // violet
] as const;

/** Neutral grey for an "Other"/catch-all leg (not a team). */
export const GROUP_WINNER_OTHER_COLOR = "#9ca3af";

/** True when a leg is the "Other"/catch-all outcome rather than a named team. */
export function isGroupWinnerOtherLeg(question: PredictionMarket): boolean {
	if (typeof question.segment === "string" && /(_other|_field)$/i.test(question.segment)) {
		return true;
	}
	return /\bother\b/i.test(groupWinnerLegLabel(question));
}

/** YES color for a team leg: explicit `yesColor`, else a stable palette slot; grey for "Other". */
export function groupWinnerLegColor(question: PredictionMarket, index: number): string {
	if (isGroupWinnerOtherLeg(question)) return GROUP_WINNER_OTHER_COLOR;
	const raw = (question as { yesColor?: unknown })?.yesColor;
	if (typeof raw === "string" && raw.trim() !== "") return raw.trim();
	const slot = GROUP_WINNER_LEG_PALETTE[index % GROUP_WINNER_LEG_PALETTE.length];
	return slot ?? "#22c55e";
}

/** Team name for a leg, e.g. "Czechia". */
export function groupWinnerLegLabel(question: PredictionMarket): string {
	// Polymarket question reads "Will <Team> win Group A in the 2026 FIFA World Cup?".
	const q = (question.question || "").trim();
	const winMatch = q.match(/^Will\s+(.+?)\s+win\b/i);
	if (winMatch?.[1]) return winMatch[1].trim();
	// Fallback: displayName "Group A Winner — Czechia" → tail after the last " — ".
	const display = (question.displayName || "").trim();
	const dashIdx = display.lastIndexOf(" — ");
	if (dashIdx !== -1) {
		const tail = display.slice(dashIdx + 3).trim();
		if (tail) return tail;
	}
	return display || q;
}

/** Group label from a leg segment, e.g. `group_a` → "Group A". */
export function groupWinnerGroupLabel(
	questions: PredictionMarket[] | null | undefined,
): string | null {
	if (!Array.isArray(questions)) return null;
	for (const q of questions) {
		if (!isWinnerLeg(q)) continue;
		const seg = (q.segment || "").trim();
		const letter = seg.slice(GROUP_SEGMENT_PREFIX.length).trim();
		if (letter.length > 0) return `Group ${letter.toUpperCase()}`;
	}
	return null;
}
