import {
	inferVenueHistoryYesNoSide,
	shortTeamDisplayName,
} from "@/pages/Positions/utils/historyOutcomeWinner";

/** True when the label is empty or only the literal binary tokens (not a team name). */
export function isGenericBinaryOutcomeLabel(label: string | undefined): boolean {
	const s = (label ?? "").trim().toLowerCase();
	return !s || s === "yes" || s === "no";
}

export type PredictPositionRowLabelOptions = {
	/**
	 * Kalshi/DFlow-style "Will X win …" markets: when the portfolio side is generic Yes/No,
	 * show these Metadata subtitles instead of splitting the title on the first `vs`.
	 */
	propositionYesLabel?: string;
	propositionNoLabel?: string;
};

/**
 * Shared **head-to-head** row-label helper for Positions / History (Predict.fun, Polymarket,
 * Limitless, and generic “A vs B … Match Winner” titles). Not tied to the Predict.fun API — only
 * parses display strings and maps portfolio Yes/No to team slots when needed.
 */
export function getPredictPositionRowLabel(
	marketTitle: string,
	outcomeName: string | undefined,
	side: "Yes" | "No",
	options?: PredictPositionRowLabelOptions,
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

	const py = options?.propositionYesLabel?.trim();
	const pn = options?.propositionNoLabel?.trim();
	const willWinProp = /^will\s+.+\s+win\b/i.test(core);
	if (isGenericOutcome && willWinProp && py && pn) {
		return shortTeamDisplayName(side === "Yes" ? py : pn);
	}

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
 * Resolved venue history rows: readable Predict.fun / Polymarket / Limitless labels.
 * **Kalshi (`dflow`)**: always map portfolio Yes/No to team names for match-winner History
 * (multiple mint rows per umbrella used to show literal “Yes”/“No” when `singleInGroup` was false).
 * Other venues: non–team-name outcomes (`Yes`/`No`) still map through `getPredictPositionRowLabel`
 * so merged multi-venue rows do not stick on literal tokens; named outcomes stay raw for distinction.
 */
export function getVenueHistoryMarketColumnLabel(
	marketTitle: string,
	pos: { outcome: string; venue: string; dflowTradeSideLabel?: string },
	singleInGroup: boolean,
): string {
	if (pos.venue === "dflow") {
		const inferred =
			inferYesNoFromVenueOutcome(pos.outcome) ??
			inferVenueHistoryYesNoSide(marketTitle, pos.outcome);
		let label = getPredictPositionRowLabel(marketTitle, pos.outcome, inferred);
		const t = label.trim().toLowerCase();
		if (
			(t === "yes" || t === "no") &&
			pos.dflowTradeSideLabel?.trim()
		) {
			return shortTeamDisplayName(pos.dflowTradeSideLabel.trim());
		}
		return label;
	}
	/**
	 * Multi-row / merged History blocks: still map literal Yes/No outcomes to team names
	 * from the market title so the first venue row (e.g. Limitless) does not pin the
	 * bucket label to "Yes" before Kalshi rows run.
	 */
	if (!singleInGroup) {
		if (
			pos.venue === "predictfun" ||
			pos.venue === "polymarket" ||
			pos.venue === "limitless"
		) {
			if (!isGenericBinaryOutcomeLabel(pos.outcome)) {
				return pos.outcome;
			}
			const inferred =
				inferYesNoFromVenueOutcome(pos.outcome) ??
				inferVenueHistoryYesNoSide(marketTitle, pos.outcome);
			return getPredictPositionRowLabel(marketTitle, pos.outcome, inferred);
		}
		return pos.outcome;
	}
	if (
		pos.venue === "predictfun" ||
		pos.venue === "polymarket" ||
		pos.venue === "limitless"
	) {
		const inferred =
			inferYesNoFromVenueOutcome(pos.outcome) ??
			inferVenueHistoryYesNoSide(marketTitle, pos.outcome);
		return getPredictPositionRowLabel(marketTitle, pos.outcome, inferred);
	}
	return pos.outcome;
}
