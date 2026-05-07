import {
	inferVenueHistoryYesNoSide,
	shortTeamDisplayName,
} from "@/pages/Positions/utils/historyOutcomeWinner";

/** True when the label is empty or only the literal binary tokens (not a team name). */
export function isGenericBinaryOutcomeLabel(label: string | undefined): boolean {
	const s = (label ?? "").trim().toLowerCase();
	return !s || s === "yes" || s === "no";
}

/**
 * Shared **head-to-head** row-label helper for Positions / History (Predict.fun, Polymarket,
 * Limitless, and generic “A vs B … Match Winner” titles). Not tied to the Predict.fun API — only
 * parses display strings and maps portfolio Yes/No to team slots when needed.
 */
export function getPredictPositionRowLabel(
	marketTitle: string,
	outcomeName: string | undefined,
	side: "Yes" | "No"
): string {
	const title = (marketTitle || "").trim();
	const normalizedTitle = title.replace(/^umbrella/gi, "").trim();
	const core = normalizedTitle
		.replace(/\s*-\s*Match Winner\b.*$/i, "")
		.trim();
	const vsParts = core
		.split(/\s*vs\.?\s*/i)
		.map((s) => s.trim())
		.filter(Boolean);

	const outcome = (outcomeName || "").trim();
	const outcomeLower = outcome.toLowerCase();
	const isGenericOutcome =
		outcomeLower === "yes" ||
		outcomeLower === "no" ||
		(outcome.length > 0 && /\bmatch winner\b/i.test(outcome));

	let raw: string;
	if (outcome && !isGenericOutcome) {
		raw = outcome;
	} else if (vsParts.length === 2) {
		raw = side === "Yes" ? vsParts[0]! : vsParts[1]!;
	} else if (outcome) {
		raw = outcome;
	} else {
		raw = side;
	}
	return shortTeamDisplayName(raw);
}

function inferYesNoFromVenueOutcome(outcome: string): "Yes" | "No" | null {
	const o = outcome.trim().toLowerCase();
	if (o === "no") return "No";
	if (o === "yes") return "Yes";
	return null;
}

/**
 * Resolved venue history rows: readable Predict.fun / Polymarket / DFlow / Limitless labels
 * (same rules as positions). When several rows share one market header, keep raw `outcome`
 * so rows stay distinct.
 */
export function getVenueHistoryMarketColumnLabel(
	marketTitle: string,
	pos: { outcome: string; venue: string },
	singleInGroup: boolean
): string {
	if (!singleInGroup) return pos.outcome;
	if (
		pos.venue === "predictfun" ||
		pos.venue === "polymarket" ||
		pos.venue === "limitless" ||
		pos.venue === "dflow"
	) {
		const inferred =
			inferYesNoFromVenueOutcome(pos.outcome) ??
			inferVenueHistoryYesNoSide(marketTitle, pos.outcome);
		return getPredictPositionRowLabel(marketTitle, pos.outcome, inferred);
	}
	return pos.outcome;
}
