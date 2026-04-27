/**
 * History tab: "Outcome" column shows who won the market (team / Yes / No),
 * colored green if the user's position won money and red if not.
 */

import type { MatchedMarket } from "@/types/odds-monitor";
import { umbrellaHeaderLabel } from "@/helpers/umbrellaDisplayName";

function stripUmbrellaPrefix(title: string): string {
	return title.replace(/^umbrella/gi, "").trim();
}

/** "A vs B - Match Winner" → ["A","B"]; also finds embedded "X vs Y" in longer questions. */
export function parseVsTeamsFromTitle(title: string): [string, string] | null {
	const stripped = stripUmbrellaPrefix(title);
	const core = stripped.replace(/\s*-\s*Match Winner\b.*$/i, "").trim();
	const parts = core
		.split(/\s*vs\.?\s*/i)
		.map((s) => s.trim())
		.filter(Boolean);
	if (parts.length === 2) return [parts[0]!, parts[1]!];

	const m = stripped.match(/\b(.+?)\s+vs\.?\s+(.+?)(?:\?|$)/i);
	if (m) {
		const a = m[1].trim();
		const b = m[2].trim();
		if (a.length >= 2 && b.length >= 2) return [a, b];
	}
	return null;
}

function normToken(s: string): string {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function outcomeMatchesTeam(outcome: string, team: string): boolean {
	const o = normToken(outcome);
	const t = normToken(team);
	if (!o || !t) return false;
	return o === t || o.includes(t) || t.includes(o);
}

/**
 * Map trade-history `outcome` (Yes/No or team name) to Yes/No buckets for History tables.
 * Avoid `(outcome === "yes") || (outcome !== "no")`, which treats every non-"no" string as Yes.
 */
export function inferVenueHistoryYesNoSide(marketTitle: string, outcome: string): "Yes" | "No" {
	const o = outcome.trim();
	const ol = o.toLowerCase();
	if (ol === "yes") return "Yes";
	if (ol === "no") return "No";

	const pair = parseVsTeamsFromTitle(marketTitle);
	if (!pair) return "Yes";
	const [a, b] = pair;
	const onA = outcomeMatchesTeam(o, a);
	const onB = outcomeMatchesTeam(o, b);
	if (onA && !onB) return "Yes";
	if (onB && !onA) return "No";
	return "Yes";
}

/** LevelUp resolved market: label for the side that won (team name or Yes/No). */
export function winnerLabelFromLevelUpTitle(
	title: string,
	resolvedRaw: string,
	umbrellaDisplayName?: string,
): string {
	const r = String(resolvedRaw || "").toLowerCase();
	if (r !== "yes" && r !== "no") return "—";

	let pair = parseVsTeamsFromTitle(title);
	if (!pair && umbrellaDisplayName) {
		pair = parseVsTeamsFromTitle(umbrellaDisplayName);
	}
	if (pair) {
		return r === "yes" ? pair[0] : pair[1];
	}
	return r === "yes" ? "Yes" : "No";
}

/** External venue resolved row: who actually won the match/event. */
export function winnerLabelFromVenuePosition(pos: {
	marketTitle: string;
	outcome: string;
	outcomeResult?: "WON" | "LOST" | null;
}): string {
	const pair = parseVsTeamsFromTitle(pos.marketTitle);
	const hasResult = pos.outcomeResult === "WON" || pos.outcomeResult === "LOST";
	const isWon = pos.outcomeResult === "WON";
	const o = (pos.outcome || "").trim();
	const oLower = o.toLowerCase();

	if (pair) {
		const [a, b] = pair;
		if (!hasResult) {
			return "—";
		}

		if (oLower === "yes") {
			return isWon ? a : b;
		}
		if (oLower === "no") {
			return isWon ? b : a;
		}

		const onA = outcomeMatchesTeam(o, a);
		const onB = outcomeMatchesTeam(o, b);
		if (onA && !onB) {
			return isWon ? a : b;
		}
		if (onB && !onA) {
			return isWon ? b : a;
		}

		if (isWon) return o || a;
		if (onA) return b;
		if (onB) return a;
		return b;
	}

	if (oLower === "yes" || oLower === "no") {
		if (!hasResult) return "—";
		return isWon ? o : oLower === "yes" ? "No" : "Yes";
	}
	return isWon ? o : "—";
}

/** Collapse venue-specific noise (BO3 tails, tournament names) to a short team label. */
export function shortTeamDisplayName(raw: string): string {
	if (!raw || raw === "—") return raw;
	const lower = raw.trim().toLowerCase();
	if (lower === "yes" || lower === "no") return raw.trim();

	let s = stripUmbrellaPrefix(raw.trim());
	s = s.replace(/^counter-strike:\s*/i, "").trim();
	s = s.replace(/\s*\([^)]*\)/g, "").replace(/\s+/g, " ").trim();

	const segments = s.split(/\s*-\s*/).map((x) => x.trim()).filter(Boolean);
	if (segments.length > 1) {
		const head = segments[0]!;
		const tail = segments.slice(1).join(" - ");
		if (
			tail.length >= 8 ||
			/\b(bo\d|playoff|playoffs|group stage|season|dracula|masters|championship)\b/i.test(
				tail,
			)
		) {
			s = head;
		}
	}
	const out = s.trim();
	return out || raw.trim();
}

function tryResolvedMarketWinnerLabel(
	m: {
		displayName?: string;
		question?: string;
		resolvedOutcome?: string;
	},
	umbrellaDisplayName?: string,
): string | null {
	const ro = String(m?.resolvedOutcome || "").toLowerCase();
	if (ro !== "yes" && ro !== "no") return null;
	const title = String(m?.displayName || m?.question || "").trim();
	const w = winnerLabelFromLevelUpTitle(title, ro, umbrellaDisplayName);
	return w && w !== "—" ? w : null;
}

/** Prefer Match Winner / vs-style resolved LevelUp markets for a stable winner string. */
export function pickResolvedWinnerFromMarkets(
	markets: any[] | undefined,
	umbrellaDisplayName?: string,
): string | null {
	if (!Array.isArray(markets) || markets.length === 0) return null;

	const matchWinnerM = markets.find((m) =>
		/\bmatch winner\b/i.test(String(m?.displayName || m?.question || "")),
	);
	if (matchWinnerM) {
		const w = tryResolvedMarketWinnerLabel(
			matchWinnerM,
			umbrellaDisplayName,
		);
		if (w) return w;
	}

	for (const m of markets) {
		const title = String(m?.displayName || m?.question || "");
		if (parseVsTeamsFromTitle(title)) {
			const w = tryResolvedMarketWinnerLabel(m, umbrellaDisplayName);
			if (w) return w;
		}
	}

	for (const m of markets) {
		const w = tryResolvedMarketWinnerLabel(m, umbrellaDisplayName);
		if (w) return w;
	}
	return null;
}

function winnerFromPropQuestion(title: string, resolvedRaw: string): string | null {
	const r = String(resolvedRaw || "").toLowerCase();
	const trimmed = title.trim();
	const m = trimmed.match(/^will\s+(.+?)\s+win\b/i);
	if (!m) return null;
	const subject = m[1]!.trim();
	if (r === "yes") return subject;
	if (r === "no") {
		const pair = parseVsTeamsFromTitle(trimmed);
		if (pair) {
			const [a, b] = pair;
			if (outcomeMatchesTeam(subject, a)) return b;
			if (outcomeMatchesTeam(subject, b)) return a;
		}
	}
	return null;
}

function winnerFromOddsMonitorRow(
	pandaId: string | undefined,
	matchedMarkets: MatchedMarket[] | null | undefined,
): string | null {
	const id = pandaId?.trim();
	if (!id || !matchedMarkets?.length) return null;
	const row = matchedMarkets.find((m) => String(m.pandaMatchId) === id);
	const w = row?.winner?.name || row?.winner?.acronym;
	return w?.trim() ? w.trim() : null;
}

export type UmbrellaForHistoryWinner = {
	pandascore_matchId?: string;
	/** e.g. "A vs B - Match Winner" — used when market titles omit team names. */
	displayName?: string;
	teamMappings?: Array<{ displayName?: string }>;
};

/**
 * Single canonical winner label for a history block: monitor Panda winner → LevelUp
 * resolved markets → prop-style title → optional teamMappings for yes/no when title has no "vs".
 */
export function resolveCanonicalMatchWinner(args: {
	umbrella: UmbrellaForHistoryWinner;
	matchedMarkets?: MatchedMarket[] | null;
	resolvedMarketsForUmbrella: any[];
	luSampleMarket?: {
		displayName?: string;
		question?: string;
		resolvedOutcome?: string;
	} | null;
}): string | null {
	const fromMonitor = winnerFromOddsMonitorRow(
		args.umbrella.pandascore_matchId,
		args.matchedMarkets,
	);
	if (fromMonitor) return fromMonitor;

	const umbrellaTitle = umbrellaHeaderLabel(args.umbrella);
	const fromResolved = pickResolvedWinnerFromMarkets(
		args.resolvedMarketsForUmbrella,
		umbrellaTitle,
	);
	if (fromResolved) return fromResolved;

	const sample = args.luSampleMarket;
	if (sample) {
		const title = String(sample.displayName || sample.question || "").trim();
		const ro = String(sample.resolvedOutcome || "");
		const prop = winnerFromPropQuestion(title, ro);
		if (prop) return prop;

		const pair =
			parseVsTeamsFromTitle(title) ||
			(umbrellaTitle ? parseVsTeamsFromTitle(umbrellaTitle) : null);
		const rLower = ro.toLowerCase();
		if (pair && (rLower === "yes" || rLower === "no")) {
			return winnerLabelFromLevelUpTitle(title, rLower, umbrellaTitle);
		}

		const tm = args.umbrella.teamMappings;
		if (tm && tm.length >= 2 && (rLower === "yes" || rLower === "no")) {
			const yesName = tm[0]?.displayName?.trim();
			const noName = tm[1]?.displayName?.trim();
			if (yesName && noName) {
				return rLower === "yes" ? yesName : noName;
			}
		}
	}

	return null;
}
