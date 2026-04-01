/**
 * Human-readable row label for Predict.fun positions on the Positions page.
 * Prefer API outcome name when it’s a real team/title; otherwise map Yes/No to
 * teams parsed from “A vs B … Match Winner” style market titles.
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

	if (outcome && !isGenericOutcome) {
		return outcome;
	}

	if (vsParts.length === 2) {
		return side === "Yes" ? vsParts[0]! : vsParts[1]!;
	}

	if (outcome) return outcome;
	return side;
}

function inferYesNoFromVenueOutcome(outcome: string): "Yes" | "No" | null {
	const o = outcome.trim().toLowerCase();
	if (o === "no") return "No";
	if (o === "yes") return "Yes";
	return null;
}

/**
 * Resolved venue history rows: readable Predict.fun / Polymarket labels (same
 * rules as positions). When several rows share one market header, keep raw
 * `outcome` so rows stay distinct.
 */
export function getVenueHistoryMarketColumnLabel(
	marketTitle: string,
	pos: { outcome: string; venue: string },
	singleInGroup: boolean
): string {
	if (!singleInGroup) return pos.outcome;
	if (pos.venue === "predictfun" || pos.venue === "polymarket") {
		const inferred = inferYesNoFromVenueOutcome(pos.outcome);
		return getPredictPositionRowLabel(
			marketTitle,
			pos.outcome,
			inferred ?? "Yes"
		);
	}
	return pos.outcome;
}
