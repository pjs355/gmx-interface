import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

export function getYesNoTeamLabels(market: PredictionMarket): {
	yesTeamLabel: string;
	noTeamLabel: string;
} {
	const title = (
		market?.displayName ||
		(market as { question?: string }).question ||
		""
	).trim();

	const overMatch = title.match(/^Over\s+([\d,]+)/i);
	if (overMatch) {
		return { yesTeamLabel: "Over", noTeamLabel: "Under" };
	}

	if (!title) return { yesTeamLabel: "Yes", noTeamLabel: "No" };
	const parts = title
		.split(/\s*vs\.?\s*/i)
		.map((s: string) => s.trim())
		.filter(Boolean);
	if (
		parts.length === 2 &&
		(market as { umbrellaChildrenCount?: number }).umbrellaChildrenCount === 1
	) {
		return { yesTeamLabel: parts[0], noTeamLabel: parts[1] };
	}
	return { yesTeamLabel: "Yes", noTeamLabel: "No" };
}
