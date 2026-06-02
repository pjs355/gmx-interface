import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { stripUmbrellaDisplayPrefix } from "@/features/markets/presentation/umbrellaDisplayName";
import { parseVsTeamsFromTitle } from "@/features/positions/utils/historyOutcomeWinner";

type MarketLike = Pick<PredictionMarket, "displayName"> & {
	question?: string;
	pandascore_template?: string;
};

type TagLike = { _id: string; label: string };

function normalizeTagKey(label: string): string {
	return label
		.toUpperCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

function normalizeTitleDashes(title: string): string {
	return title
		.replace(/\u2013/g, "-")
		.replace(/\u2014/g, "-")
		.replace(/\u2212/g, "-");
}

/** Split panda long umbrella title: teams line + full tournament suffix after first ` - `. */
export function parseEsportsUmbrellaHeadlineParts(displayName: string): {
	teamsLine: string;
	tournamentLabel: string;
} {
	let stripped = stripUmbrellaDisplayPrefix(displayName).trim();
	stripped = normalizeTitleDashes(stripped);
	stripped = stripped.replace(/\s*-\s*Match Winner\b.*$/i, "").trim();

	const m = stripped.match(/^(.+?\s+vs\.?\s+.+?)(?:\s+-\s+(.+))?$/i);
	if (!m) {
		return { teamsLine: stripped, tournamentLabel: "" };
	}
	return {
		teamsLine: m[1]!.trim(),
		tournamentLabel: (m[2] ?? "").trim(),
	};
}

/** Non-ESPORTS game tag on any child question (Counter-Strike, Dota 2, …). */
export function resolveEsportsGameTagLabel(
	umbrella: Umbrella,
	tags: readonly TagLike[],
): string | null {
	const esportsTagId = tags.find((t) => normalizeTagKey(t.label) === "ESPORTS")?._id;
	const children =
		(umbrella as { originalChildren?: Umbrella["children"] }).originalChildren ??
		umbrella.children ??
		[];

	for (const child of children) {
		const tagIds = child.tagIds;
		if (!Array.isArray(tagIds)) continue;
		for (const tagId of tagIds) {
			if (esportsTagId && tagId === esportsTagId) continue;
			const tag = tags.find((t) => t._id === tagId);
			const label = tag?.label?.trim();
			if (label) return label;
		}
	}
	return null;
}

/**
 * Top line on home esports cards — always the game (Counter-Strike, Dota 2, …),
 * never tournament text from the umbrella displayName.
 */
export function resolveEsportsCardGameHeadline(
	umbrella: Umbrella,
	tags: readonly TagLike[],
): string {
	const game = umbrella.game?.trim();
	if (game) return game;

	const tagLabel = resolveEsportsGameTagLabel(umbrella, tags);
	if (tagLabel) return tagLabel;

	return "Esports Match";
}

function marketTitle(q: MarketLike): string {
	return (q.displayName ?? q.question ?? "").trim();
}

/** True for match-winner / team-vs-team rows — not map/round O/U props. */
export function isMatchWinnerMarketQuestion(q: MarketLike): boolean {
	const template = q.pandascore_template?.trim();
	if (template === "winner-2-way") return true;
	if (template === "map-over-under" || template === "round-over-under") return false;

	const title = marketTitle(q);
	if (!title) return false;
	if (/\bmatch winner\b/i.test(title)) return true;
	if (/^over\s+/i.test(title)) return false;
	if (/\btotal\s+(maps|rounds)\s+o\/u\b/i.test(title)) return false;

	return parseVsTeamsFromTitle(title) !== null;
}

/** Prefer winner-2-way / Match Winner / first vs-style child. */
export function pickMatchWinnerQuestion<T extends MarketLike>(
	questions: readonly T[] | null | undefined,
): T | null {
	if (!questions?.length) return null;
	if (questions.length === 1) return questions[0]!;

	const byTemplate = questions.filter((q) => q.pandascore_template === "winner-2-way");
	if (byTemplate.length > 0) return byTemplate[0]!;

	const byMatchWinnerLabel = questions.filter((q) => /\bmatch winner\b/i.test(marketTitle(q)));
	if (byMatchWinnerLabel.length > 0) return byMatchWinnerLabel[0]!;

	const byVs = questions.filter((q) => parseVsTeamsFromTitle(marketTitle(q)) !== null);
	if (byVs.length > 0) return byVs[0]!;

	return null;
}

export type HomeListingQuestionLookup = {
	singleMarketQuestions: Record<string, PredictionMarket>;
	multiMarketData: Record<
		string,
		{
			questions: PredictionMarket[];
			orderbooks: Record<string, unknown>;
		}
	>;
};

/** Question to show on the home esports card (match winner only). */
export function resolveHomeMatchWinnerQuestion(
	umbrella: Umbrella,
	lookup: HomeListingQuestionLookup,
): PredictionMarket | null {
	const id = umbrella._id;
	const single = lookup.singleMarketQuestions[id];
	if (single) return single;

	const multi = lookup.multiMarketData[id]?.questions;
	const fromMulti = pickMatchWinnerQuestion(multi);
	if (fromMulti) return fromMulti;

	const fromChildren = pickMatchWinnerQuestion(umbrella.children);
	if (fromChildren) return fromChildren as PredictionMarket;

	return null;
}
