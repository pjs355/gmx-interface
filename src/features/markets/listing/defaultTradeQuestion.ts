import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	isGroupWinnerQuestions,
	orderGroupWinnerLegs,
} from "@/features/markets/listing/groupWinner";
import {
	defaultMatchQuestion,
	partitionMatchPropQuestions,
} from "@/features/markets/listing/matchProps";

/**
 * Default active question for a trade surface — never a spread/total prop and
 * never volume-sorted. Match umbrellas land on Team A moneyline; group-winner
 * umbrellas land on the first team in catalog order.
 */
export function resolveDefaultTradeQuestion(
	questions: readonly PredictionMarket[],
): PredictionMarket | null {
	if (questions.length === 0) return null;

	if (isGroupWinnerQuestions([...questions])) {
		const ordered = orderGroupWinnerLegs([...questions]);
		return ordered[0] ?? null;
	}

	const { core } = partitionMatchPropQuestions(questions);
	return defaultMatchQuestion(core) ?? core[0] ?? null;
}
