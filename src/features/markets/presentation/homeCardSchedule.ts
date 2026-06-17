import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { isMultiLegBinaryUmbrella } from "@/features/markets/listing/multiLegMarket";

export type HomeCardScheduleInput = {
	isDailyUmbrella: boolean;
	isThreeWayMoneyline: boolean;
	useEsportsMatchWinnerCard: boolean;
	questions: PredictionMarket[] | null | undefined;
};

/**
 * Head-to-head sports matches (Team A vs Team B, optionally Draw) use kickoff
 * time / countdown on the home card. Prop ladders, futures, awards, and other
 * non-match umbrellas use the market title instead — event time is often unknown
 * or not meaningful.
 */
export function isPropOrNonMatchHomeCard(input: HomeCardScheduleInput): boolean {
	if (input.isDailyUmbrella) {
		return false;
	}
	if (isMultiLegBinaryUmbrella(input.questions)) {
		return true;
	}
	if (input.isThreeWayMoneyline) {
		return false;
	}
	if (input.useEsportsMatchWinnerCard) {
		return false;
	}
	// Future non-sports / non-H2H listings: title on the card, not kickoff time.
	return true;
}

/** Whether the home card should show live / countdown / formatted kickoff time. */
export function shouldShowHomeCardKickoffSchedule(input: HomeCardScheduleInput): boolean {
	if (input.isDailyUmbrella) {
		return false;
	}
	if (isPropOrNonMatchHomeCard(input)) {
		return false;
	}
	return input.isThreeWayMoneyline || input.useEsportsMatchWinnerCard;
}
