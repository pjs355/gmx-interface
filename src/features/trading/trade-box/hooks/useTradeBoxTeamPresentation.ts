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
import { threeWayLegLabel } from "@/features/markets/listing/threeWayMoneyline";
import {
	groupWinnerLegGroupTitle,
	groupWinnerLegColor,
	groupWinnerLegLabel,
	isGroupWinnerLeg,
} from "@/features/markets/listing/groupWinner";
import type { UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";

export function useTradeBoxTeamPresentation(
	market: PredictionMarket,
	umbrellaDisplayName?: string,
	teamMappings?: UmbrellaTeamMapping[] | null,
	gameTeamColorBySlug?: Record<string, string> | null,
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

	const yesTeamColor: string = isGroupWinnerLeg(market)
		? groupWinnerLegColor(market, 0, teamMappings, gameTeamColorBySlug)
		: market.yesColor || "#22c55e";
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
		// Group-winner leg (FIFA): title is the team name ("Czechia").
		if (isGroupWinnerLeg(market)) {
			return groupWinnerLegLabel(market);
		}
		// 3-way moneyline leg (FIFA): title is the short outcome name ("Korea", "Draw").
		if (
			market.moneylineLeg === "home" ||
			market.moneylineLeg === "away" ||
			market.moneylineLeg === "draw"
		) {
			return threeWayLegLabel(market);
		}
		return market.displayName || market.question;
	}, [overUnderMatch, market]);

	/**
	 * Match context for 3-way (FIFA) legs — the "Team A vs Team B" line shown in
	 * grey above the green selected outcome, so it's clear which match the bet
	 * belongs to. Derived from the leg's `displayName` ("<A> vs <B> — <Leg>").
	 */
	const matchTitle = useMemo(() => {
		// Group-winner leg: context line is the group, e.g. "Group A Winner".
		if (isGroupWinnerLeg(market)) {
			return groupWinnerLegGroupTitle(market);
		}
		if (
			market.moneylineLeg !== "home" &&
			market.moneylineLeg !== "away" &&
			market.moneylineLeg !== "draw"
		) {
			return null;
		}
		const display = (market.displayName || "").trim();
		const idx = display.lastIndexOf(" — ");
		if (idx !== -1) {
			const head = display.slice(0, idx).trim();
			if (head) return head;
		}
		return null;
	}, [market]);

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
		matchTitle,
	};
}

export type TradeBoxTeamPresentationSnapshot = ReturnType<typeof useTradeBoxTeamPresentation>;
