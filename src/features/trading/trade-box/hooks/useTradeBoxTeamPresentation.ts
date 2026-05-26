/**
 * Team labels, colors, and display title for the trade box header/outcome buttons.
 *
 * Derives "Team A vs Team B" from umbrella title + market question, Over/Under
 * copy, and contrasting text colors for branded outcome buttons.
 */
import { useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import { getContrastingTextColor, mixHexOnBlack } from "@/features/markets/presentation/teamColors";
import { getYesNoTeamLabels } from "../teamLabels";
import { resolveOutcomeSideLabels } from "@/features/markets/presentation/outcomeSideLabels";

export function useTradeBoxTeamPresentation(
	market: PredictionMarket,
	umbrellaDisplayName?: string,
) {
	const { yesTeamLabel, noTeamLabel } = useMemo(
		() => getYesNoTeamLabels(market, umbrellaDisplayName),
		[market, umbrellaDisplayName],
	);

	const isVsSingle = useMemo(() => {
		if (!market) return false;
		const mt = (market?.displayName || (market as { question?: string }).question || "").trim();
		if (mt.match(/^Over\s+/i)) return false;
		return resolveOutcomeSideLabels({ market, umbrellaDisplayName }).kind === "h2h";
	}, [market, umbrellaDisplayName]);

	const yesTeamColor: string = (market as { yesColor?: string }).yesColor || "#22c55e";
	const noTeamColor: string = (market as { noColor?: string }).noColor || "#ef4444";

	const yesTeamTextSolid = useMemo(() => getContrastingTextColor(yesTeamColor), [yesTeamColor]);
	const yesTeamTextTint = useMemo(
		() => getContrastingTextColor(mixHexOnBlack(yesTeamColor, 0.35)),
		[yesTeamColor],
	);
	const noTeamTextSolid = useMemo(() => getContrastingTextColor(noTeamColor), [noTeamColor]);
	const noTeamTextTint = useMemo(
		() => getContrastingTextColor(mixHexOnBlack(noTeamColor, 0.35)),
		[noTeamColor],
	);

	const overUnderMatch = useMemo(() => {
		const title = (market?.displayName || (market as { question?: string }).question || "").trim();
		const match = title.match(/^Over\s+([\d,]+)/i);
		return match ? match[1] : null;
	}, [market?.displayName, market]);

	const displayMarketTitle = useMemo(() => {
		if (overUnderMatch) {
			return `${overUnderMatch} Players`;
		}
		return market.displayName || market.question;
	}, [overUnderMatch, market.displayName, market.question]);

	return {
		yesTeamLabel,
		noTeamLabel,
		isVsSingle,
		yesTeamColor,
		noTeamColor,
		yesTeamTextSolid,
		yesTeamTextTint,
		noTeamTextSolid,
		noTeamTextTint,
		displayMarketTitle,
	};
}

export type TradeBoxTeamPresentationSnapshot = ReturnType<typeof useTradeBoxTeamPresentation>;
