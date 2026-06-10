import type { PredictionMarket } from "@/services/api/predictionMarketDataService";

/**
 * Match prop ladders (spreads + totals) for the trading page.
 *
 * Sport-agnostic by design: everything is driven by the shared question
 * taxonomy (`marketType: "spread" | "total"`, `line`, `spreadSide`) plus the
 * umbrella's `teamMappings` (mapping[0] = home, mapping[1] = away), so the
 * same ladders work for soccer, baseball, basketball, … as those sports land.
 *
 * Polymarket spread markets are binary but NOT Yes/No: token A ("yes") is the
 * `spreadSide` team covering `line` (e.g. "Austria -1.5") and token B ("no")
 * is the opponent covering the complementary line ("Algeria +1.5"). Both
 * sides are rendered as their own selectable cell, which is what produces the
 * full sportsbook-style ladder (… -2.5, -1.5, +1.5, +2.5 …) from only the
 * negative-handicap markets the venue lists. Totals map token A = Over,
 * token B = Under.
 */

export type MatchPropPosition = "yes" | "no";

export type PropLadderCell = {
	question: PredictionMarket;
	/** Which side of the binary market this cell trades. */
	position: MatchPropPosition;
	/** Cell text: signed handicap ("-1.5" / "+1.5") or total line ("2.5"). */
	label: string;
	/** Numeric column value (signed for spreads) used for ordering. */
	value: number;
	/**
	 * User-facing bet title for trade box / orderbook headers — always the row
	 * team + signed line (e.g. "Mexico +1.5"), even when the underlying question
	 * is the opponent's negative handicap traded on the No side.
	 */
	selectionTitle: string;
};

export type PropLadderRow = {
	key: string;
	/** Row header: team short code / name for spreads, Over / Under for totals. */
	label: string;
	logoUrl?: string;
	/** Active-cell accent (team color for spreads); undefined = neutral accent. */
	color?: string;
	/** Aligned with the ladder's `columns`; null = no market for that column. */
	cells: (PropLadderCell | null)[];
};

export type PropLadder = {
	kind: "spread" | "total";
	title: string;
	/** Ordered column values; every row's `cells[i]` belongs to `columns[i]`. */
	columns: number[];
	rows: PropLadderRow[];
};

export type TeamMapping = {
	displayName?: string | null;
	slug?: string | null;
	shortCode?: string | null;
	logoUrl?: string | null;
	primaryColor?: string | null;
};

/**
 * Full team label → short code ("Mexico" → "MEX") via the umbrella's
 * teamMappings; falls back to the original label. Mobile surfaces (basic
 * table headers, leg buttons) use this to match the spread ladder rows.
 */
export function abbreviateTeamLabel(
	label: string,
	teamMappings: readonly TeamMapping[] | undefined,
): string {
	const target = label.trim().toLowerCase();
	if (!target || !teamMappings) return label;
	for (const m of teamMappings) {
		const short = m.shortCode?.trim();
		if (!short) continue;
		const name = m.displayName?.trim().toLowerCase();
		if (name === target) return short.toUpperCase();
	}
	return label;
}

/**
 * True for spread / total questions — trading-page-only, never on home cards.
 * Structural param so umbrella children typed as partial shapes pass without casts.
 */
export function isMatchPropQuestion(q: { marketType?: unknown } | null | undefined): boolean {
	const marketType = q?.marketType;
	return marketType === "spread" || marketType === "total";
}

/** Split umbrella children into core (moneyline & friends) vs prop questions. */
export function partitionMatchPropQuestions<T extends PredictionMarket>(
	questions: readonly T[],
): { core: T[]; props: T[] } {
	const core: T[] = [];
	const props: T[] = [];
	for (const q of questions) {
		(isMatchPropQuestion(q) ? props : core).push(q);
	}
	return { core, props };
}

/**
 * Default active question for a match page: Team A's moneyline.
 *
 * Raw question order and volume sorting can both surface a prop (spread/total)
 * or the Draw first; product rule is a fresh page open always lands on the
 * home-team moneyline. Picks, in order: the tradeable non-prop question with
 * `moneylineLeg === "home"` (Team A), then the first tradeable non-prop
 * non-draw question, then the first tradeable non-prop question. Returns null
 * only when there is no core question at all. Sport-agnostic — 2-way sports
 * without `moneylineLeg` fall through to "first non-prop".
 */
export function defaultMatchQuestion<T extends PredictionMarket>(
	questions: readonly T[],
): T | null {
	const core = questions.filter(
		(q) => !isMatchPropQuestion(q) && (q as { tradeable?: boolean }).tradeable !== false,
	);
	if (core.length === 0) return null;
	const legOf = (q: T): unknown => (q as { moneylineLeg?: unknown }).moneylineLeg;
	return (
		core.find((q) => legOf(q) === "home") ?? core.find((q) => legOf(q) !== "draw") ?? core[0]
	);
}

/** "-1.5" / "+1.5" — always signed so spread cells read like sportsbook lines. */
export function formatSignedLine(value: number): string {
	return value > 0 ? `+${value}` : `${value}`;
}

/**
 * User-facing title for a match prop selection, position-aware.
 *
 * Venues only list the negative-handicap side of a spread ("South Africa
 * -1.5"); the "+" cells in the ladder are synthesized as the **No** side of
 * the opponent's question. When such a cell is active the underlying
 * question's `displayName` would read as the opposite bet, so derive the
 * complement title instead: position "no" on a spread returns
 * `"{opponentTeam} +{|line|}"` (e.g. "Mexico +1.5"). Everything else
 * (spread at yes, totals, non-props) returns the question's own title.
 * Sport-agnostic — works for any two-team sport with negative-handicap
 * listings (`teamMappings[0]` = home, `[1]` = away).
 */
/**
 * Yes/No button labels for a spread question — the covering team's signed line
 * on Yes and the opponent's complementary line on No (never generic Yes/No).
 */
export function spreadOutcomeSideLabels(
	question: PredictionMarket,
	teamMappings: readonly TeamMapping[] | undefined,
): { yesLabel: string; noLabel: string } | null {
	const side = (question as { spreadSide?: unknown }).spreadSide;
	const line = questionLine(question);
	if ((side !== "home" && side !== "away") || line === null) return null;

	const ownTeam = teamMappings?.[side === "home" ? 0 : 1];
	const oppTeam = teamMappings?.[side === "home" ? 1 : 0];
	const ownName = teamRowLabel(ownTeam, side === "home" ? "Home" : "Away");
	const oppName = teamRowLabel(oppTeam, side === "home" ? "Away" : "Home");

	return {
		yesLabel: `${ownName} ${formatSignedLine(line)}`,
		noLabel: `${oppName} ${formatSignedLine(-line)}`,
	};
}

/** Yes/No button labels for a total question — Over/Under with the line. */
export function totalOutcomeSideLabels(
	question: PredictionMarket,
): { yesLabel: string; noLabel: string } | null {
	const line = questionLine(question);
	if (line === null) return null;
	return { yesLabel: `Over ${line}`, noLabel: `Under ${line}` };
}

/**
 * Cross-venue Basic tab column headers for spread/total props.
 * Maps yes/no venue columns (askA/askB) to the same labels as the trade box.
 */
export function propVenueColumnHeaders(
	question: PredictionMarket | null | undefined,
	teamMappings: readonly TeamMapping[] | undefined,
): { teamA: string; teamB: string } | null {
	if (!question) return null;
	const marketType = (question as { marketType?: unknown }).marketType;
	if (marketType === "total") {
		const labels = totalOutcomeSideLabels(question);
		return labels ? { teamA: labels.yesLabel, teamB: labels.noLabel } : null;
	}
	if (marketType === "spread") {
		const labels = spreadOutcomeSideLabels(question, teamMappings);
		return labels ? { teamA: labels.yesLabel, teamB: labels.noLabel } : null;
	}
	return null;
}

export function matchPropSelectionTitle(
	question: PredictionMarket,
	position: MatchPropPosition,
	teamMappings: readonly { displayName?: string | null; shortCode?: string | null }[] | undefined,
): string {
	const fallback =
		(question.displayName || (question as { question?: string }).question || "").trim() || "";
	const marketType = (question as { marketType?: unknown }).marketType;

	if (marketType === "total") {
		const line = questionLine(question);
		if (line === null) return fallback;
		const sideLabel = position === "yes" ? "Over" : "Under";
		return `${sideLabel} ${line}`;
	}

	if (marketType !== "spread" || position !== "no") return fallback;

	const side = (question as { spreadSide?: unknown }).spreadSide;
	const line = questionLine(question);
	if ((side !== "home" && side !== "away") || line === null) return fallback;

	const opponent = teamMappings?.[side === "home" ? 1 : 0];
	const opponentName = opponent?.displayName?.trim() || opponent?.shortCode?.trim();
	if (!opponentName) return fallback;

	return `${opponentName} ${formatSignedLine(-line)}`;
}

function questionLine(q: PredictionMarket): number | null {
	const line = (q as { line?: unknown }).line;
	return typeof line === "number" && Number.isFinite(line) ? line : null;
}

function teamRowLabel(mapping: TeamMapping | undefined, fallback: string): string {
	const short = mapping?.shortCode?.trim();
	if (short) return short.toUpperCase();
	const name = mapping?.displayName?.trim();
	return name || fallback;
}

/** Full team name for selection titles (prefer displayName over short code). */
function teamSelectionName(mapping: TeamMapping | undefined, fallback: string): string {
	const name = mapping?.displayName?.trim();
	if (name) return name;
	const short = mapping?.shortCode?.trim();
	if (short) return short.toUpperCase();
	return fallback;
}

function buildSpreadLadder(
	spreads: PredictionMarket[],
	teamMappings: TeamMapping[] | undefined,
): PropLadder | null {
	const bySideLine = new Map<string, PredictionMarket>();
	const columnSet = new Set<number>();
	for (const q of spreads) {
		const side = (q as { spreadSide?: unknown }).spreadSide;
		const line = questionLine(q);
		if ((side !== "home" && side !== "away") || line === null) continue;
		bySideLine.set(`${side}:${line}`, q);
		// Each market yields two ladder columns: the team's own handicap (yes)
		// and the opponent's complementary line (no).
		columnSet.add(line);
		columnSet.add(-line);
	}
	if (bySideLine.size === 0) return null;

	const columns = [...columnSet].sort((a, b) => a - b);
	const home = teamMappings?.[0];
	const away = teamMappings?.[1];

	const cellsFor = (side: "home" | "away"): (PropLadderCell | null)[] => {
		const opposite = side === "home" ? "away" : "home";
		const rowTeam = side === "home" ? home : away;
		const rowName = teamSelectionName(rowTeam, side === "home" ? "Home" : "Away");
		return columns.map((value) => {
			const signedLine = formatSignedLine(value);
			const selectionTitle = `${rowName} ${signedLine}`;
			const own = bySideLine.get(`${side}:${value}`);
			if (own) {
				return {
					question: own,
					position: "yes",
					label: signedLine,
					value,
					selectionTitle,
				};
			}
			const complement = bySideLine.get(`${opposite}:${-value}`);
			if (complement) {
				return {
					question: complement,
					position: "no",
					label: signedLine,
					value,
					selectionTitle,
				};
			}
			return null;
		});
	};

	return {
		kind: "spread",
		title: "Spread",
		columns,
		rows: [
			{
				key: "home",
				label: teamRowLabel(home, "Home"),
				logoUrl: home?.logoUrl ?? undefined,
				color: home?.primaryColor ?? undefined,
				cells: cellsFor("home"),
			},
			{
				key: "away",
				label: teamRowLabel(away, "Away"),
				logoUrl: away?.logoUrl ?? undefined,
				color: away?.primaryColor ?? undefined,
				cells: cellsFor("away"),
			},
		],
	};
}

function buildTotalsLadder(totals: PredictionMarket[], title: string): PropLadder | null {
	const byLine = new Map<number, PredictionMarket>();
	for (const q of totals) {
		const line = questionLine(q);
		if (line === null || byLine.has(line)) continue;
		byLine.set(line, q);
	}
	if (byLine.size === 0) return null;

	const columns = [...byLine.keys()].sort((a, b) => a - b);
	const cellsFor = (position: MatchPropPosition): (PropLadderCell | null)[] =>
		columns.map((value) => {
			const question = byLine.get(value);
			if (!question) return null;
			const sideLabel = position === "yes" ? "Over" : "Under";
			return {
				question,
				position,
				label: `${value}`,
				value,
				selectionTitle: `${sideLabel} ${value}`,
			};
		});

	return {
		kind: "total",
		title,
		columns,
		rows: [
			{ key: "over", label: "Over", cells: cellsFor("yes") },
			{ key: "under", label: "Under", cells: cellsFor("no") },
		],
	};
}

/**
 * Build the ordered ladders (spread first, then totals) for a match's prop
 * questions. Returns [] when the umbrella has no props — callers can gate the
 * whole section on that.
 */
export function buildMatchPropLadders(
	props: readonly PredictionMarket[],
	teamMappings: TeamMapping[] | undefined,
	opts?: { totalsTitle?: string },
): PropLadder[] {
	const spreads: PredictionMarket[] = [];
	const totals: PredictionMarket[] = [];
	for (const q of props) {
		const marketType = (q as { marketType?: unknown }).marketType;
		if (marketType === "spread") spreads.push(q);
		else if (marketType === "total") totals.push(q);
	}
	const ladders: PropLadder[] = [];
	const spreadLadder = buildSpreadLadder(spreads, teamMappings);
	if (spreadLadder) ladders.push(spreadLadder);
	const totalsLadder = buildTotalsLadder(totals, opts?.totalsTitle ?? "Total Goals");
	if (totalsLadder) ladders.push(totalsLadder);
	return ladders;
}
