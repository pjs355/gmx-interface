import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";
import { resolveOutcomeSideLabels } from "@/features/markets/presentation/outcomeSideLabels";

/** Prefer umbrella title (e.g. "A vs B - Match Winner"); Over/Under uses market title only. */
export function getYesNoTeamLabels(
	market: PredictionMarket | null | undefined,
	umbrellaDisplayName?: string,
	teamMappings?: UmbrellaTeamMapping[] | null,
): { yesTeamLabel: string; noTeamLabel: string } {
	const { yesLabel, noLabel } = resolveOutcomeSideLabels({
		market,
		umbrellaDisplayName,
		teamMappings: teamMappings ?? undefined,
	});
	return { yesTeamLabel: yesLabel, noTeamLabel: noLabel };
}
