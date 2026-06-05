import { parseVsTeamsFromTitle } from "@/features/positions/utils/historyOutcomeWinner";

export type PandaQuestionRow = {
	displayName?: string;
	question?: string;
	pandascore_template?: string;
	pandascore_eventType?: string;
	pandascore_gamePosition?: number;
};

export function isPandaEsportsUmbrella(umbrella: { pandascore_matchId?: unknown }): boolean {
	const raw = umbrella.pandascore_matchId;
	return typeof raw === "string" && raw.trim().length > 0;
}

function marketTitle(q: PandaQuestionRow): string {
	return (q.displayName ?? q.question ?? "").trim();
}

/**
 * Match-level moneyline for Panda esports umbrellas.
 * Map legs also use winner-2-way — template alone is not sufficient.
 */
export function isPandaMoneylineQuestion(q: PandaQuestionRow): boolean {
	const eventType = String(q.pandascore_eventType ?? "")
		.trim()
		.toLowerCase();
	if (eventType === "game") return false;

	const gamePosition = q.pandascore_gamePosition;
	if (typeof gamePosition === "number" && Number.isFinite(gamePosition) && gamePosition >= 1) {
		return false;
	}

	const template = q.pandascore_template?.trim();
	if (template === "map-over-under" || template === "round-over-under") return false;

	if (eventType === "match") return true;
	if (template === "winner-2-way") return true;

	const title = marketTitle(q);
	if (/\bmatch winner\b/i.test(title)) return true;
	if (/^over\s+/i.test(title)) return false;
	if (/\btotal\s+(maps|rounds)\s+o\/u\b/i.test(title)) return false;

	return parseVsTeamsFromTitle(title) !== null;
}

/** User-facing lists: pass through unchanged unless this is a Panda esports umbrella. */
export function filterPandaMoneylineQuestions<T extends PandaQuestionRow>(
	questions: readonly T[],
	umbrella: { pandascore_matchId?: unknown },
): T[] {
	if (!isPandaEsportsUmbrella(umbrella)) {
		return [...questions];
	}
	return questions.filter((q) => isPandaMoneylineQuestion(q));
}

/**
 * Choose the match moneyline among Panda children.
 * Prefer explicit match-level rows over game-level winner-2-way legs.
 */
export function pickPandaMoneylineQuestion<T extends PandaQuestionRow>(
	questions: readonly T[] | null | undefined,
): T | null {
	if (!questions?.length) return null;

	const moneylineOnly = questions.filter((q) => isPandaMoneylineQuestion(q));
	if (moneylineOnly.length === 0) return null;
	if (moneylineOnly.length === 1) return moneylineOnly[0]!;

	const matchEvent = moneylineOnly.filter(
		(q) =>
			String(q.pandascore_eventType ?? "")
				.trim()
				.toLowerCase() === "match",
	);
	if (matchEvent.length > 0) return matchEvent[0]!;

	const byMatchWinnerLabel = moneylineOnly.filter((q) => /\bmatch winner\b/i.test(marketTitle(q)));
	if (byMatchWinnerLabel.length > 0) return byMatchWinnerLabel[0]!;

	const byTemplate = moneylineOnly.filter((q) => q.pandascore_template === "winner-2-way");
	if (byTemplate.length > 0) return byTemplate[0]!;

	const byVs = moneylineOnly.filter((q) => parseVsTeamsFromTitle(marketTitle(q)) !== null);
	if (byVs.length > 0) return byVs[0]!;

	return moneylineOnly[0] ?? null;
}
