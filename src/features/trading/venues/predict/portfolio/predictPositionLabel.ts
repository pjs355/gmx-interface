import type { Umbrella } from "@/services/api/umbrellaDataService";
export { isGenericBinaryOutcomeLabel } from "@/features/markets/presentation/outcomeSideLabels";
import {
	labelForPortfolioSide,
	labelForVenueHistoryOutcome,
} from "@/features/markets/presentation/outcomeSideLabels";

export type PredictPositionRowLabelOptions = {
	/**
	 * Kalshi/DFlow-style "Will X win …" markets: when the portfolio side is generic Yes/No,
	 * show these Metadata subtitles instead of splitting the title on the first `vs`.
	 */
	propositionYesLabel?: string;
	propositionNoLabel?: string;
};

/**
 * Shared row-label helper for Positions / History (Predict.fun, Polymarket,
 * Limitless, and generic “A vs B … Match Winner” titles).
 */
export function getPredictPositionRowLabel(
	marketTitle: string,
	outcomeName: string | undefined,
	side: "Yes" | "No",
	options?: PredictPositionRowLabelOptions,
): string {
	return labelForPortfolioSide(
		{
			hints: {
				marketTitle,
				outcomeName,
				propositionYesLabel: options?.propositionYesLabel,
				propositionNoLabel: options?.propositionNoLabel,
			},
		},
		side,
		outcomeName,
	);
}

/**
 * Resolved venue history rows: readable Predict.fun / Polymarket / Limitless / DFlow labels.
 */
export function getVenueHistoryMarketColumnLabel(
	marketTitle: string,
	pos: { outcome: string; venue: string; dflowTradeSideLabel?: string },
	singleInGroup: boolean,
	umbrella?: Umbrella | null,
): string {
	return labelForVenueHistoryOutcome(umbrella, {
		marketTitle,
		outcome: pos.outcome,
		venue: pos.venue,
		dflowTradeSideLabel: pos.dflowTradeSideLabel,
		singleInGroup,
	});
}
