import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { resolveOutcomeSideLabels } from "@/features/markets/presentation/outcomeSideLabels";

/** Prefer umbrella title (e.g. "A vs B - Match Winner"); Over/Under uses market title only. */
export function getYesNoTeamLabels(
	market: PredictionMarket | null | undefined,
	umbrellaDisplayName?: string,
): { yesTeamLabel: string; noTeamLabel: string } {
	const { yesLabel, noLabel } = resolveOutcomeSideLabels({
		market,
		umbrellaDisplayName,
	});
	return { yesTeamLabel: yesLabel, noTeamLabel: noLabel };
}
