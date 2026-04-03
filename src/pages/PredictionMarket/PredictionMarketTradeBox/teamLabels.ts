import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

function extractVsLabels(
	title: string
): { yesTeamLabel: string; noTeamLabel: string } | null {
	if (!title) return null;
	const parts = title
		.split(/\s*vs\.?\s*/i)
		.map((s: string) => s.trim())
		.filter(Boolean);
	if (parts.length !== 2) return null;
	return { yesTeamLabel: parts[0], noTeamLabel: parts[1] };
}

export function getYesNoTeamLabels(market: PredictionMarket): {
	yesTeamLabel: string;
	noTeamLabel: string;
} {
	const isSingle =
		(market as { umbrellaChildrenCount?: number }).umbrellaChildrenCount === 1;

	const title = (
		market?.displayName ||
		(market as { question?: string }).question ||
		""
	).trim();

	const overMatch = title.match(/^Over\s+([\d,]+)/i);
	if (overMatch) {
		return { yesTeamLabel: "Over", noTeamLabel: "Under" };
	}

	if (isSingle) {
		const fromTitle = extractVsLabels(title);
		if (fromTitle) return fromTitle;

		const umbrellaName = (
			(market as { umbrellaDisplayName?: string }).umbrellaDisplayName || ""
		).trim();
		const fromUmbrella = extractVsLabels(umbrellaName);
		if (fromUmbrella) return fromUmbrella;
	}

	return { yesTeamLabel: "Yes", noTeamLabel: "No" };
}
