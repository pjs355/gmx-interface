import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/** Prefer umbrella title (e.g. "A vs B - Match Winner"); Over/Under uses market title only. */
export function getYesNoTeamLabels(
	market: PredictionMarket,
	umbrellaDisplayName?: string,
): { yesTeamLabel: string; noTeamLabel: string } {
	const marketTitle = (
		market?.displayName ||
		(market as { question?: string }).question ||
		""
	).trim();
	if (marketTitle.match(/^Over\s+([\d,]+)/i)) {
		return { yesTeamLabel: "Over", noTeamLabel: "Under" };
	}
	const raw =
		(umbrellaDisplayName || "")
			.replace(/\s*-\s*Match Winner$/i, "")
			.trim() || marketTitle;
	if (!raw) return { yesTeamLabel: "Yes", noTeamLabel: "No" };
	const parts = raw
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
