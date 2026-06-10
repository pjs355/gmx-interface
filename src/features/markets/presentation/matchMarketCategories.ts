import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	defaultMatchQuestion,
	isMatchPropQuestion,
	type PropLadder,
} from "@/features/markets/listing/matchProps";
import { isThreeWayMoneylineQuestions } from "@/features/markets/listing/threeWayMoneyline";

export type MatchMarketCategory = "moneyline" | "spread" | "total";

export const MATCH_MARKET_CATEGORY_IDS = {
	moneyline: "moneyline",
	spread: "spread",
	total: "total",
} as const satisfies Record<MatchMarketCategory, MatchMarketCategory>;

/** Classify a question into moneyline vs spread vs total. */
export function categoryForQuestion(q: PredictionMarket): MatchMarketCategory {
	const marketType = (q as { marketType?: unknown }).marketType;
	if (marketType === "spread") return "spread";
	if (marketType === "total") return "total";
	return "moneyline";
}

export function categoryForActiveMarket(
	activeMarket: PredictionMarket | null | undefined,
): MatchMarketCategory | null {
	if (!activeMarket) return null;
	return categoryForQuestion(activeMarket);
}

/**
 * True when the trading page should render moneyline / spread / total as
 * collapsible category accordions (FIFA matches with props; sport-agnostic).
 */
export function isCategoryAccordionLayout(
	sortedQuestions: PredictionMarket[],
	matchPropLadders: PropLadder[],
	isMultiLegEsports: boolean,
): boolean {
	return (
		!isMultiLegEsports &&
		isThreeWayMoneylineQuestions(sortedQuestions) &&
		matchPropLadders.length > 0
	);
}

/** First selectable market for a category when the global active market is elsewhere. */
export function resolveCategoryDefaultMarket(
	category: MatchMarketCategory,
	moneylineLegs: PredictionMarket[],
	ladders: PropLadder[],
): PredictionMarket | null {
	if (category === "moneyline") {
		return defaultMatchQuestion(moneylineLegs) ?? moneylineLegs[0] ?? null;
	}
	const ladder = ladders.find((l) => l.kind === category);
	if (!ladder) return null;
	for (const row of ladder.rows) {
		for (const cell of row.cells) {
			if (cell) return cell.question;
		}
	}
	return null;
}

export function resolveCategoryDefaultPosition(
	category: MatchMarketCategory,
	ladders: PropLadder[],
): "yes" | "no" {
	if (category === "moneyline") return "yes";
	const ladder = ladders.find((l) => l.kind === category);
	if (!ladder) return "yes";
	for (const row of ladder.rows) {
		for (const cell of row.cells) {
			if (cell) return cell.position;
		}
	}
	return "yes";
}

export type CategoryEffectiveSelection = {
	market: PredictionMarket | null;
	position: "yes" | "no";
	inCategory: boolean;
};

/**
 * Market + side shown inside an expanded category section. Uses the global
 * active selection when it belongs to this category; otherwise the category default.
 */
export function resolveCategoryEffectiveSelection(
	category: MatchMarketCategory,
	activeMarket: PredictionMarket | null,
	activePosition: "yes" | "no",
	moneylineLegs: PredictionMarket[],
	ladders: PropLadder[],
): CategoryEffectiveSelection {
	if (activeMarket && !isMatchPropQuestion(activeMarket) && category === "moneyline") {
		return { market: activeMarket, position: activePosition, inCategory: true };
	}
	if (activeMarket && categoryForQuestion(activeMarket) === category) {
		return { market: activeMarket, position: activePosition, inCategory: true };
	}
	const market = resolveCategoryDefaultMarket(category, moneylineLegs, ladders);
	const position = resolveCategoryDefaultPosition(category, ladders);
	return { market, position, inCategory: false };
}
