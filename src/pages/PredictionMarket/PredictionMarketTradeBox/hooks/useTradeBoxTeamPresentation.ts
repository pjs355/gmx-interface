import { useMemo } from "react";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import {
	getContrastingTextColor,
	mixHexOnBlack,
} from "@/helpers/predictionUtils";
import { getYesNoTeamLabels } from "../teamLabels";

export function getBorderColorForSelected(backgroundColor: string): string {
	if (!backgroundColor) return "#ffffff";
	const cleaned = backgroundColor.replace("#", "").toLowerCase();
	if (
		cleaned === "000000" ||
		cleaned === "000" ||
		backgroundColor.toLowerCase() === "rgb(0, 0, 0)" ||
		backgroundColor.toLowerCase() === "black"
	) {
		return "#ffffff";
	}
	if (
		cleaned === "ffffff" ||
		cleaned === "fff" ||
		backgroundColor.toLowerCase() === "rgb(255, 255, 255)" ||
		backgroundColor.toLowerCase() === "white"
	) {
		return "#000000";
	}
	const full =
		cleaned.length === 3
			? cleaned
					.split("")
					.map((c) => c + c)
					.join("")
			: cleaned;
	const r = parseInt(full.substring(0, 2), 16) || 0;
	const g = parseInt(full.substring(2, 4), 16) || 0;
	const b = parseInt(full.substring(4, 6), 16) || 0;
	const brightness = (r * 299 + g * 587 + b * 114) / 1000;
	return brightness < 128 ? "#ffffff" : "#000000";
}

export function useTradeBoxTeamPresentation(
	market: PredictionMarket,
	umbrellaDisplayName?: string,
) {
	const { yesTeamLabel, noTeamLabel } = useMemo(
		() => getYesNoTeamLabels(market, umbrellaDisplayName),
		[market, umbrellaDisplayName],
	);

	const isVsSingle = useMemo(() => {
		if (!market || (market as { umbrellaChildrenCount?: number }).umbrellaChildrenCount !== 1) {
			return false;
		}
		const mt = (market?.displayName || (market as { question?: string }).question || "").trim();
		if (mt.match(/^Over\s+/i)) return false;
		const raw =
			(umbrellaDisplayName || "")
				.replace(/\s*-\s*Match Winner$/i, "")
				.trim() || mt;
		const parts = raw
			.split(/\s*vs\.?\s*/i)
			.map((s: string) => s.trim())
			.filter(Boolean);
		return parts.length === 2;
	}, [market, umbrellaDisplayName]);

	const yesTeamColor: string = (market as { yesColor?: string }).yesColor || "#22c55e";
	const noTeamColor: string = (market as { noColor?: string }).noColor || "#ef4444";

	const yesTeamTextSolid = useMemo(
		() => getContrastingTextColor(yesTeamColor),
		[yesTeamColor],
	);
	const yesTeamTextTint = useMemo(
		() => getContrastingTextColor(mixHexOnBlack(yesTeamColor, 0.35)),
		[yesTeamColor],
	);
	const noTeamTextSolid = useMemo(
		() => getContrastingTextColor(noTeamColor),
		[noTeamColor],
	);
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
