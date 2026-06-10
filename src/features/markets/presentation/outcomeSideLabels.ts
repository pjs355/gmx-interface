import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import {
	inferVenueHistoryYesNoSide,
	parseVsTeamsFromTitle,
	shortTeamDisplayName,
} from "@/features/positions/utils/historyOutcomeWinner";
import { stripUmbrellaDisplayPrefix } from "@/features/markets/presentation/umbrellaDisplayName";
import { isGroupWinnerLeg } from "@/features/markets/listing/groupWinner";
import { isMatchPropQuestion, spreadOutcomeSideLabels, totalOutcomeSideLabels } from "@/features/markets/listing/matchProps";

export type OutcomeLabelKind = "h2h" | "over_under" | "binary";

export type OutcomeSideLabels = {
	yesLabel: string;
	noLabel: string;
	kind: OutcomeLabelKind;
};

export type OutcomeSideLabelsHints = {
	marketTitle?: string;
	outcomeName?: string;
	dflowTradeSideLabel?: string;
	propositionYesLabel?: string;
	propositionNoLabel?: string;
};

export type ResolveOutcomeSideLabelsInput = {
	umbrella?: Umbrella | null;
	/** Trade box / chart callers that only have the umbrella title string. */
	umbrellaDisplayName?: string;
	/** Match props: home/away team names for spread outcome labels. */
	teamMappings?: Umbrella["teamMappings"];
	market?: PredictionMarket | null;
	hints?: OutcomeSideLabelsHints;
};

function readDflowWireTickers(dflow: unknown): { tickerA: string; tickerB: string } {
	if (!dflow || typeof dflow !== "object") {
		return { tickerA: "", tickerB: "" };
	}
	const w = dflow as Record<string, unknown>;
	return {
		tickerA: typeof w.tickerA === "string" ? w.tickerA.trim() : "",
		tickerB: typeof w.tickerB === "string" ? w.tickerB.trim() : "",
	};
}

function pickCatalogH2HTitleString(umbrella: Umbrella): string {
	const children = umbrella.children ?? [];
	for (const c of children) {
		const d = (c.displayName ?? "").trim();
		if (d && /\bmatch winner\b/i.test(d)) return d;
	}
	for (const c of children) {
		const d = (c.displayName ?? "").trim();
		if (d && /\bvs\.?\b/i.test(d)) return d;
	}
	return umbrella.displayName?.trim() ?? "";
}

function marketTitleFromInput(
	market: PredictionMarket | null | undefined,
	hints: OutcomeSideLabelsHints | undefined,
): string {
	if (hints?.marketTitle?.trim()) return hints.marketTitle.trim();
	return (
		market?.displayName ||
		(market as { question?: string } | undefined)?.question ||
		""
	).trim();
}

function umbrellaFromInput(input: ResolveOutcomeSideLabelsInput): Umbrella | null {
	if (input.umbrella) return input.umbrella;
	const dn = input.umbrellaDisplayName?.trim();
	if (!dn) return null;
	return {
		_id: "",
		displayName: dn,
		children: [],
		createdAt: "",
		updatedAt: "",
		__v: 0,
	};
}

function stripMatchWinnerSuffix(title: string): string {
	return title
		.replace(/^umbrella/gi, "")
		.replace(/\s*-\s*Match Winner\b.*$/i, "")
		.trim();
}

function finalizePair(yesRaw: string, noRaw: string): OutcomeSideLabels {
	const yesLabel = shortTeamDisplayName(yesRaw);
	const noLabel = shortTeamDisplayName(noRaw);
	const yl = yesLabel.trim().toLowerCase();
	const nl = noLabel.trim().toLowerCase();
	if (yl === "yes" && nl === "no") {
		return { yesLabel, noLabel, kind: "binary" };
	}
	return { yesLabel, noLabel, kind: "h2h" };
}

function binaryFallback(): OutcomeSideLabels {
	return { yesLabel: "Yes", noLabel: "No", kind: "binary" };
}

/**
 * Single policy for Yes/No display labels (trade box, Positions, History, orderbook).
 * Applies {@link shortTeamDisplayName} once at the boundary.
 */
export function resolveOutcomeSideLabels(input: ResolveOutcomeSideLabelsInput): OutcomeSideLabels {
	const hints = input.hints;
	const marketTitle = marketTitleFromInput(input.market, hints);

	if (marketTitle.match(/^Over\s+([\d,]+)/i)) {
		return { yesLabel: "Over", noLabel: "Under", kind: "over_under" };
	}

	// Spread / total props: each is a binary market on one line ("Korea -1.5?",
	// "O/U 2.5") — sides are Yes/No (Over/Under for totals), never the two team
	// names from the umbrella's teamMappings.
	if (isMatchPropQuestion(input.market)) {
		if (input.market?.marketType === "total") {
			const totalLabels = totalOutcomeSideLabels(input.market);
			if (totalLabels) {
				return { ...totalLabels, kind: "over_under" };
			}
			return { yesLabel: "Over", noLabel: "Under", kind: "over_under" };
		}
		if (input.market?.marketType === "spread") {
			const umbrella = umbrellaFromInput(input);
			const spreadLabels = spreadOutcomeSideLabels(
				input.market,
				input.teamMappings ?? umbrella?.teamMappings,
			);
			if (spreadLabels) {
				return { ...spreadLabels, kind: "binary" };
			}
		}
		return binaryFallback();
	}

	// 3-way moneyline leg (FIFA): each leg is its own binary market, so the sides
	// are plain Yes/No — not the two team names from the umbrella's teamMappings.
	const leg = input.market?.moneylineLeg;
	if (leg === "home" || leg === "away" || leg === "draw") {
		return binaryFallback();
	}

	// Group-winner leg (FIFA): single-team binary ("Will <Team> win Group X?").
	// Force Yes/No — the group umbrella's teamMappings hold all N teams and would
	// otherwise be mistaken for a two-team head-to-head.
	if (isGroupWinnerLeg(input.market)) {
		return binaryFallback();
	}

	const umbrella = umbrellaFromInput(input);

	if (umbrella?.teamMappings && umbrella.teamMappings.length >= 2) {
		const y = umbrella.teamMappings[0]?.displayName?.trim();
		const n = umbrella.teamMappings[1]?.displayName?.trim();
		if (y && n) {
			return finalizePair(y, n);
		}
	}

	const titleCandidates: string[] = [];
	if (umbrella) {
		titleCandidates.push(pickCatalogH2HTitleString(umbrella));
		titleCandidates.push(stripUmbrellaDisplayPrefix(umbrella.displayName));
	}
	if (marketTitle) {
		titleCandidates.push(marketTitle);
	}
	if (hints?.marketTitle?.trim()) {
		titleCandidates.push(hints.marketTitle.trim());
	}

	for (const rawTitle of titleCandidates) {
		const core = stripMatchWinnerSuffix(rawTitle);
		const py = hints?.propositionYesLabel?.trim();
		const pn = hints?.propositionNoLabel?.trim();
		if (py && pn && /^will\s+.+\s+win\b/i.test(core)) {
			return finalizePair(py, pn);
		}
	}

	for (const rawTitle of titleCandidates) {
		const pair = parseVsTeamsFromTitle(rawTitle);
		if (pair) {
			return finalizePair(pair[0]!, pair[1]!);
		}
	}

	if (umbrella) {
		const { tickerA, tickerB } = readDflowWireTickers(umbrella.exchangeMatching?.dflow);
		if (tickerA && tickerB) {
			return finalizePair(tickerA, tickerB);
		}
	}

	return binaryFallback();
}

export function labelForOutcomeSide(labels: OutcomeSideLabels, side: "Yes" | "No"): string {
	return side === "Yes" ? labels.yesLabel : labels.noLabel;
}

/** True when the label is empty or only the literal binary tokens (not a team name). */
export function isGenericBinaryOutcomeLabel(label: string | undefined): boolean {
	const s = (label ?? "").trim().toLowerCase();
	return !s || s === "yes" || s === "no";
}

function isGenericVenueOutcomeName(outcome: string): boolean {
	const outcomeLower = outcome.toLowerCase();
	return (
		outcomeLower === "yes" ||
		outcomeLower === "no" ||
		(outcome.length > 0 && /\bmatch winner\b/i.test(outcome))
	);
}

/**
 * Positions / History: map a portfolio Yes/No bucket to a display label, honoring
 * named venue outcomes when present.
 */
export function labelForPortfolioSide(
	input: ResolveOutcomeSideLabelsInput,
	side: "Yes" | "No",
	outcomeName?: string,
): string {
	const outcome = (outcomeName ?? input.hints?.outcomeName ?? "").trim();
	if (outcome && !isGenericVenueOutcomeName(outcome)) {
		return shortTeamDisplayName(outcome);
	}
	return labelForOutcomeSide(resolveOutcomeSideLabels(input), side);
}

function inferYesNoFromVenueOutcome(outcome: string): "Yes" | "No" | null {
	const o = outcome.trim().toLowerCase();
	if (o === "no") return "No";
	if (o === "yes") return "Yes";
	return null;
}

export type VenueHistoryLabelContext = {
	marketTitle: string;
	outcome: string;
	venue: string;
	dflowTradeSideLabel?: string;
	singleInGroup: boolean;
};

/**
 * History tab market column — preserves venue-specific raw named outcomes in
 * merged multi-row blocks where distinction matters.
 */
export function labelForVenueHistoryOutcome(
	umbrella: Umbrella | null | undefined,
	ctx: VenueHistoryLabelContext,
): string {
	const { marketTitle, outcome, venue, dflowTradeSideLabel, singleInGroup } = ctx;

	if (venue === "dflow") {
		const inferred =
			inferYesNoFromVenueOutcome(outcome) ?? inferVenueHistoryYesNoSide(marketTitle, outcome);
		const label = labelForPortfolioSide(
			{ umbrella, hints: { marketTitle, outcomeName: outcome } },
			inferred,
			outcome,
		);
		const t = label.trim().toLowerCase();
		if ((t === "yes" || t === "no") && dflowTradeSideLabel?.trim()) {
			return shortTeamDisplayName(dflowTradeSideLabel.trim());
		}
		return label;
	}

	if (!singleInGroup) {
		if (venue === "predictfun" || venue === "polymarket" || venue === "limitless") {
			if (!isGenericBinaryOutcomeLabel(outcome)) {
				return outcome;
			}
			const inferred =
				inferYesNoFromVenueOutcome(outcome) ?? inferVenueHistoryYesNoSide(marketTitle, outcome);
			return labelForPortfolioSide(
				{ umbrella, hints: { marketTitle, outcomeName: outcome } },
				inferred,
				outcome,
			);
		}
		return outcome;
	}

	if (venue === "predictfun" || venue === "polymarket" || venue === "limitless") {
		const inferred =
			inferYesNoFromVenueOutcome(outcome) ?? inferVenueHistoryYesNoSide(marketTitle, outcome);
		return labelForPortfolioSide(
			{ umbrella, hints: { marketTitle, outcomeName: outcome } },
			inferred,
			outcome,
		);
	}

	return outcome;
}

/** Portfolio Yes/No column headers — same slots as DFlow mint mapping. */
export function portfolioColumnTeamLabels(umbrella: Umbrella | null | undefined): {
	columnYes: string;
	columnNo: string;
} {
	const { yesLabel, noLabel } = resolveOutcomeSideLabels({ umbrella });
	return { columnYes: yesLabel, columnNo: noLabel };
}
