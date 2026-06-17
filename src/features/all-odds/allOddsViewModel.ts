import { resolveTeamLogoUrl } from "@/features/markets/assets/teamLogo";
import type { TeamMapping } from "@/features/markets/listing/matchProps";
import { spreadSignedLineFromLabel, totalOutcomeSideLabels } from "@/features/markets/listing/matchProps";
import {
	MAX_VALID_PRICE,
	MIN_VALID_PRICE,
} from "@/features/markets/pricing/venueBooksCells";
import { normalizeEventDateInput } from "@/pages/Predictions/utils/eventDates";
import type { OrderbookData } from "@/types/odds-monitor";
import { ALL_ODDS_ADAPTERS, isVenueLinked } from "./adapters";
import {
	isAllOddsMultiLegMarket,
	MULTI_LEG_PRIMARY_VISIBLE,
	multiLegGroupKey,
	multiLegGroupTitle,
	multiLegLegLabel,
} from "./allOddsMultiLeg";
import { isActiveAllOddsMarket } from "./allOddsFreshness";
import type {
	AllOddsGroup,
	AllOddsMarket,
	AllOddsMoreSection,
	AllOddsOutcomeRow,
	AllOddsVenueCell,
	AllOddsVenueColumn,
} from "./types";

const LEG_ORDER: Record<string, number> = { home: 0, away: 1, draw: 2 };

function touchAsk(book: OrderbookData | null | undefined): number | null {
	const ask = book?.bestAsk;
	return ask != null && Number.isFinite(ask) ? ask : null;
}

function fixtureTeams(m: AllOddsMarket): { home: string; away: string } {
	const mappings = m.teamMappings ?? [];
	const home =
		m.homeTeamName?.trim() ||
		m.pandaTeamA?.trim() ||
		mappings[0]?.displayName?.trim() ||
		"";
	const away =
		m.awayTeamName?.trim() ||
		m.pandaTeamB?.trim() ||
		mappings[1]?.displayName?.trim() ||
		"";
	return { home, away };
}

function fixtureTitle(m: AllOddsMarket): string {
	const { home, away } = fixtureTeams(m);
	if (home && away) return `${home} vs ${away}`;
	return m.displayName.trim() || m.pandaMatchId;
}

function normalizeKeyPart(s: string): string {
	return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function fixtureGroupKey(m: AllOddsMarket): string | null {
	const { home, away } = fixtureTeams(m);
	if (!home || !away) return null;
	return `fixture:${normalizeKeyPart(home)}|${normalizeKeyPart(away)}`;
}

function parseMapSlot(pandaMatchId: string): number | null {
	const m = pandaMatchId.trim().match(/-map-(\d+)$/i);
	if (!m) return null;
	const slot = Number(m[1]);
	return Number.isFinite(slot) && slot >= 1 ? Math.trunc(slot) : null;
}

function isSpreadDisplay(display: string): boolean {
	return /^.+\s[+-]\d+(?:\.\d+)?$/.test(display.trim());
}

function isTotalDisplay(display: string): boolean {
	return /^over\/under/i.test(display.trim()) || /^o\/u\b/i.test(display.trim());
}

function isPropDisplay(display: string): boolean {
	return isSpreadDisplay(display) || isTotalDisplay(display);
}

function propLabelFromDisplay(m: AllOddsMarket): string {
	const display = m.displayName.trim();
	const dash = display.search(/\s+[—–-]\s+/);
	if (dash >= 0) {
		const suffix = display.slice(dash).replace(/^\s+[—–-]\s+/, "").trim();
		if (suffix) return suffix;
	}
	return display;
}

function isTotalMarket(m: AllOddsMarket): boolean {
	if (m.marketType?.trim().toLowerCase() === "total") return true;
	const display = m.displayName.trim();
	if (isTotalDisplay(display)) return true;
	return isTotalDisplay(propLabelFromDisplay(m));
}

function isSpreadMarket(m: AllOddsMarket): boolean {
	if (isTotalMarket(m)) return false;
	const mt = m.marketType?.trim().toLowerCase();
	if (mt === "spread") return true;
	const display = m.displayName.trim();
	if (isSpreadDisplay(display)) return true;
	if (isSpreadDisplay(propLabelFromDisplay(m))) return true;
	const { home, away } = fixtureTeams(m);
	const title = home && away ? `${home} vs ${away}` : "";
	if (title && display !== title && /\b[+-]\d+(?:\.\d+)?\b/.test(display)) return true;
	return false;
}

function propMoreSection(m: AllOddsMarket): { sectionKey: string; sectionTitle: string } {
	if (isTotalMarket(m)) return { sectionKey: "totals", sectionTitle: "" };
	if (isSpreadMarket(m)) return { sectionKey: "spreads", sectionTitle: "" };
	return { sectionKey: "spreads-totals", sectionTitle: "Spreads & totals" };
}

function spreadSortLine(row: AllOddsOutcomeRow): number {
	const raw = (row.market as { line?: unknown }).line;
	if (typeof raw === "number" && Number.isFinite(raw)) return raw;
	const parsed = spreadSignedLineFromLabel(row.label);
	return parsed != null ? Number.parseFloat(parsed) : 0;
}

function spreadSideSortKey(m: AllOddsMarket): number {
	const side = (m as { spreadSide?: unknown }).spreadSide;
	if (side === "home") return 0;
	if (side === "away") return 1;
	return 2;
}

function parseTotalLine(m: AllOddsMarket): number | null {
	const rawLine = (m as { line?: unknown }).line;
	if (typeof rawLine === "number" && Number.isFinite(rawLine)) return rawLine;

	for (const text of [propLabelFromDisplay(m), m.displayName.trim()]) {
		if (!text) continue;
		const labeled = text.match(/(?:over\/under|o\/u|total\s+goals?)\s*(\d+(?:\.\d+)?)/i);
		if (labeled) return Number.parseFloat(labeled[1]!);
		if (isTotalDisplay(text)) {
			const trailing = text.match(/(\d+(?:\.\d+)?)\s*$/);
			if (trailing) return Number.parseFloat(trailing[1]!);
		}
	}
	return null;
}

function totalOutcomeLabels(m: AllOddsMarket): { over: string; under: string } {
	const line = parseTotalLine(m);
	const fromTaxonomy = totalOutcomeSideLabels({
		marketType: "total",
		line: line ?? undefined,
		displayName: m.displayName,
	} as Parameters<typeof totalOutcomeSideLabels>[0]);
	if (fromTaxonomy) {
		return { over: fromTaxonomy.yesLabel, under: fromTaxonomy.noLabel };
	}
	const suffix = line != null ? ` ${line} goals` : "";
	return { over: `Over${suffix}`, under: `Under${suffix}` };
}

function isPropMarket(m: AllOddsMarket): boolean {
	const mt = m.marketType?.trim().toLowerCase();
	if (mt === "spread") return true;
	if (mt === "total") return true;

	const display = m.displayName.trim();
	if (isPropDisplay(display)) return true;

	const suffix = propLabelFromDisplay(m);
	if (suffix !== display && isPropDisplay(suffix)) return true;

	const { home, away } = fixtureTeams(m);
	const title = home && away ? `${home} vs ${away}` : "";
	if (title && display !== title && display.startsWith(title)) return true;
	if (/\b(o\/u|over\/under|total goals?)\b/i.test(display)) return true;
	if (/\b[+-]\d+(?:\.\d+)?\b/.test(display) && display !== title) return true;

	return false;
}

function isTeamNameOnlyRow(m: AllOddsMarket): boolean {
	const { home, away } = fixtureTeams(m);
	const display = normalizeKeyPart(m.displayName);
	if (!display) return false;
	const homeKey = home ? normalizeKeyPart(home) : "";
	const awayKey = away ? normalizeKeyPart(away) : "";
	return (homeKey.length > 0 && display === homeKey) || (awayKey.length > 0 && display === awayKey);
}

interface FixtureBuildContext {
	fixtureHasMoneylineLegs: boolean;
	canonicalMatchRowId: string | null;
}

function resolveCanonicalMatchRowId(markets: AllOddsMarket[], title: string): string | null {
	const titleKey = normalizeKeyPart(title);
	for (const m of markets) {
		if (m.moneylineLeg || parseMapSlot(m.pandaMatchId) != null) continue;
		if (normalizeKeyPart(m.displayName) === titleKey) return m.pandaMatchId;
	}
	for (const m of markets) {
		if (m.moneylineLeg || parseMapSlot(m.pandaMatchId) != null) continue;
		if (isTeamNameOnlyRow(m) || isPropMarket(m)) continue;
		return m.pandaMatchId;
	}
	return null;
}

/** Polymarket per-leg rows keyed by `polymarketMarketId` — not the umbrella series row. */
function isPerLegMarketRow(m: AllOddsMarket, canonicalMatchRowId: string | null): boolean {
	if (!canonicalMatchRowId || m.pandaMatchId === canonicalMatchRowId) return false;
	if (parseMapSlot(m.pandaMatchId) != null || m.moneylineLeg) return false;
	return true;
}

/**
 * Drop unnamed Polymarket mirror binaries (display is exactly home/away team name)
 * when the fixture already has structured moneyline legs or a canonical match row.
 */
function shouldSkipMarketForAllOdds(m: AllOddsMarket, ctx: FixtureBuildContext): boolean {
	if (!isTeamNameOnlyRow(m) || m.moneylineLeg) return false;
	return ctx.fixtureHasMoneylineLegs || ctx.canonicalMatchRowId != null;
}

function isMatchWinnerRow(m: AllOddsMarket, canonicalMatchRowId: string | null): boolean {
	if (m.moneylineLeg || parseMapSlot(m.pandaMatchId) != null || isPropMarket(m)) {
		return false;
	}
	if (isTeamNameOnlyRow(m)) return false;
	if (canonicalMatchRowId) return m.pandaMatchId === canonicalMatchRowId;
	const title = fixtureTitle(m);
	return normalizeKeyPart(m.displayName) === normalizeKeyPart(title);
}

function moneylineLegLabel(m: AllOddsMarket, home: string, away: string): string {
	if (m.moneylineLeg === "draw") return "Draw";
	if (m.moneylineLeg === "home") return home || "Home";
	if (m.moneylineLeg === "away") return away || "Away";
	const display = m.displayName.trim();
	const dash = display.lastIndexOf(" — ");
	if (dash >= 0) {
		const tail = display.slice(dash + 3).trim();
		if (tail) return tail;
	}
	return display || m.pandaMatchId;
}

function logoForTeamLabel(label: string, mappings: TeamMapping[]): string | undefined {
	const target = label.trim().toLowerCase();
	if (!target || target === "draw") return undefined;
	for (const tm of mappings) {
		const name = tm.displayName?.trim().toLowerCase();
		if (name && name === target) return resolveTeamLogoUrl(tm);
	}
	return undefined;
}

function resolvePriceField(
	market: AllOddsMarket,
	col: AllOddsVenueColumn,
	yesSide: "A" | "B",
): keyof AllOddsMarket {
	if (col.id === "kalshi" && market.moneylineLeg === "away") {
		return col.priceFieldB;
	}
	return yesSide === "A" ? col.priceFieldA : col.priceFieldB;
}

function buildVenueCells(market: AllOddsMarket, yesSide: "A" | "B"): AllOddsVenueCell[] {
	return ALL_ODDS_ADAPTERS.map((col) => {
		const linked = isVenueLinked(market, col);
		const field = resolvePriceField(market, col, yesSide);
		const book = market[field] as OrderbookData | null | undefined;
		return {
			id: col.id,
			label: col.label,
			linked,
			ask: touchAsk(book),
			status: book?.snapshotStatus,
		};
	});
}

/** Distinct venues linked on any outcome row in the group (REST mapping or live WS book). */
export function countLinkedVenuesForGroup(group: AllOddsGroup): number {
	const linked = new Set<string>();
	const rows = [
		...group.primaryOutcomes,
		...group.moreSections.flatMap((section) => section.outcomes),
	];
	for (const row of rows) {
		for (const cell of row.venueCells) {
			if (cell.linked) linked.add(cell.id);
		}
	}
	return linked.size;
}

/** Earlier kickoffs first; groups without a known start time sort last. */
export function groupEventStartSortKey(group: AllOddsGroup): number {
	if (!group.eventStartAt) return Number.POSITIVE_INFINITY;
	const start = normalizeEventDateInput(group.eventStartAt);
	if (start === null) return Number.POSITIVE_INFINITY;
	return start.getTime();
}

export function outcomeHasValidAsk(row: AllOddsOutcomeRow): boolean {
	return row.venueCells.some(
		(c) =>
			c.linked &&
			c.ask != null &&
			c.ask >= MIN_VALID_PRICE &&
			c.ask <= MAX_VALID_PRICE,
	);
}

type OutcomeDraft = {
	label: string;
	market: AllOddsMarket;
	yesSide: "A" | "B";
	logoUrl?: string;
	sortKey: number;
};

type OutcomePlacement =
	| { kind: "primary" }
	| { kind: "more"; sectionKey: string; sectionTitle: string };

function outcomePlacement(m: AllOddsMarket, ctx: FixtureBuildContext): OutcomePlacement {
	if (m.moneylineLeg) return { kind: "primary" };

	const mapSlot = parseMapSlot(m.pandaMatchId);
	if (mapSlot != null) {
		return { kind: "more", sectionKey: `map-${mapSlot}`, sectionTitle: `Map ${mapSlot}` };
	}

	if (
		ctx.fixtureHasMoneylineLegs ||
		isPropMarket(m) ||
		isTeamNameOnlyRow(m) ||
		isPerLegMarketRow(m, ctx.canonicalMatchRowId)
	) {
		const section = propMoreSection(m);
		return { kind: "more", sectionKey: section.sectionKey, sectionTitle: section.sectionTitle };
	}

	if (isMatchWinnerRow(m, ctx.canonicalMatchRowId) && !ctx.fixtureHasMoneylineLegs) {
		return { kind: "primary" };
	}

	const section = propMoreSection(m);
	return { kind: "more", sectionKey: section.sectionKey, sectionTitle: section.sectionTitle };
}

function expansionMode(
	m: AllOddsMarket,
	placement: OutcomePlacement,
	ctx: FixtureBuildContext,
): "moneyline" | "twoWay" | "totalTwoWay" | "single" {
	if (m.moneylineLeg) return "moneyline";
	if (parseMapSlot(m.pandaMatchId) != null) return "twoWay";
	if (isTotalMarket(m)) return "totalTwoWay";
	if (
		placement.kind === "primary" &&
		isMatchWinnerRow(m, ctx.canonicalMatchRowId) &&
		!ctx.fixtureHasMoneylineLegs
	) {
		return "twoWay";
	}
	return "single";
}

function expandMarketToOutcomes(
	m: AllOddsMarket,
	mode: "moneyline" | "twoWay" | "totalTwoWay" | "single",
): OutcomeDraft[] {
	const { home, away } = fixtureTeams(m);
	const mappings = m.teamMappings ?? [];
	const display = m.displayName.trim();

	if (mode === "moneyline" && m.moneylineLeg) {
		const label = moneylineLegLabel(m, home, away);
		return [
			{
				label,
				market: m,
				yesSide: "A",
				logoUrl: logoForTeamLabel(label, mappings),
				sortKey: LEG_ORDER[m.moneylineLeg] ?? 99,
			},
		];
	}

	if (mode === "twoWay") {
		const teamA = home || m.pandaTeamA || "Team A";
		const teamB = away || m.pandaTeamB || "Team B";
		return [
			{
				label: teamA,
				market: m,
				yesSide: "A",
				logoUrl: resolveTeamLogoUrl(mappings[0]),
				sortKey: 0,
			},
			{
				label: teamB,
				market: m,
				yesSide: "B",
				logoUrl: resolveTeamLogoUrl(mappings[1]),
				sortKey: 1,
			},
		];
	}

	if (mode === "totalTwoWay") {
		const { over, under } = totalOutcomeLabels(m);
		return [
			{
				label: over,
				market: m,
				yesSide: "A",
				sortKey: 0,
			},
			{
				label: under,
				market: m,
				yesSide: "B",
				sortKey: 1,
			},
		];
	}

	const label = isPropMarket(m) ? propLabelFromDisplay(m) : display || m.pandaMatchId;
	return [
		{
			label,
			market: m,
			yesSide: "A",
			logoUrl: logoForTeamLabel(label.split(/\s[+-]/)[0] ?? label, mappings),
			sortKey: 0,
		},
	];
}

function draftToOutcomeRow(draft: OutcomeDraft): AllOddsOutcomeRow {
	return {
		label: draft.label,
		market: draft.market,
		yesSide: draft.yesSide,
		venueCells: buildVenueCells(draft.market, draft.yesSide),
		logoUrl: draft.logoUrl,
	};
}

function sortOutcomeRows(rows: AllOddsOutcomeRow[]): AllOddsOutcomeRow[] {
	return [...rows].sort((a, b) => {
		const legA = a.market.moneylineLeg ? (LEG_ORDER[a.market.moneylineLeg] ?? 99) : 99;
		const legB = b.market.moneylineLeg ? (LEG_ORDER[b.market.moneylineLeg] ?? 99) : 99;
		if (legA !== legB) return legA - legB;

		const totalA = isTotalMarket(a.market);
		const totalB = isTotalMarket(b.market);
		if (totalA && totalB) {
			const lineA = parseTotalLine(a.market) ?? 0;
			const lineB = parseTotalLine(b.market) ?? 0;
			if (lineA !== lineB) return lineA - lineB;
			if (a.yesSide !== b.yesSide) return a.yesSide === "A" ? -1 : 1;
		}

		const spreadA = isSpreadMarket(a.market);
		const spreadB = isSpreadMarket(b.market);
		if (spreadA && spreadB) {
			const lineA = spreadSortLine(a);
			const lineB = spreadSortLine(b);
			if (lineA !== lineB) return lineA - lineB;
			const sideA = spreadSideSortKey(a.market);
			const sideB = spreadSideSortKey(b.market);
			if (sideA !== sideB) return sideA - sideB;
		}

		return a.label.localeCompare(b.label);
	});
}

function filterVisibleOutcomes(rows: AllOddsOutcomeRow[]): AllOddsOutcomeRow[] {
	return sortOutcomeRows(rows.filter(outcomeHasValidAsk));
}

function countValidVenueAsks(row: AllOddsOutcomeRow): number {
	return row.venueCells.filter(
		(c) =>
			c.linked &&
			c.ask != null &&
			c.ask >= MIN_VALID_PRICE &&
			c.ask <= MAX_VALID_PRICE,
	).length;
}

function bestAskScore(row: AllOddsOutcomeRow): number {
	let best = -1;
	for (const c of row.venueCells) {
		if (
			c.linked &&
			c.ask != null &&
			c.ask >= MIN_VALID_PRICE &&
			c.ask <= MAX_VALID_PRICE
		) {
			best = Math.max(best, c.ask);
		}
	}
	return best;
}

function sortOutcomesByBestAsk(rows: AllOddsOutcomeRow[]): AllOddsOutcomeRow[] {
	return [...rows].sort((a, b) => {
		const pa = bestAskScore(a);
		const pb = bestAskScore(b);
		if (pa !== pb) return pb - pa;
		const sa = a.market.sortOrder ?? 99;
		const sb = b.market.sortOrder ?? 99;
		if (sa !== sb) return sa - sb;
		return a.label.localeCompare(b.label);
	});
}

/** Keep one moneyline row per leg when duplicate API rows exist. */
function dedupeMoneylinePrimary(rows: AllOddsOutcomeRow[]): AllOddsOutcomeRow[] {
	const byLeg = new Map<string, AllOddsOutcomeRow>();
	const nonLeg: AllOddsOutcomeRow[] = [];

	for (const row of rows) {
		const leg = row.market.moneylineLeg;
		if (!leg) {
			nonLeg.push(row);
			continue;
		}
		const prev = byLeg.get(leg);
		if (!prev || countValidVenueAsks(row) > countValidVenueAsks(prev)) {
			byLeg.set(leg, row);
		}
	}

	return sortOutcomeRows([
		...nonLeg,
		...Array.from(byLeg.values()).sort(
			(a, b) =>
				(LEG_ORDER[a.market.moneylineLeg!] ?? 99) - (LEG_ORDER[b.market.moneylineLeg!] ?? 99),
		),
	]);
}

function moreSectionSortKey(sectionKey: string): number {
	const map = /^map-(\d+)$/.exec(sectionKey);
	if (map) return Number(map[1]!);
	if (sectionKey === "spreads") return 1_000;
	if (sectionKey === "totals") return 1_001;
	if (sectionKey === "spreads-totals") return 1_002;
	return 2_000;
}

function sortMoreSections(sections: AllOddsMoreSection[]): AllOddsMoreSection[] {
	return [...sections].sort((a, b) => {
		const orderA = moreSectionSortKey(a.sectionKey);
		const orderB = moreSectionSortKey(b.sectionKey);
		if (orderA !== orderB) return orderA - orderB;
		return a.title.localeCompare(b.title);
	});
}

type GroupAcc = {
	groupKey: string;
	title: string;
	teamMappings: TeamMapping[];
	primaryDrafts: OutcomeDraft[];
	moreDrafts: Map<string, { title: string; drafts: OutcomeDraft[] }>;
};

function fixtureHasMoneylineLegs(markets: AllOddsMarket[]): boolean {
	return markets.some((m) => m.moneylineLeg === "home" || m.moneylineLeg === "draw" || m.moneylineLeg === "away");
}

function resolveFixtureEventStartAt(
	markets: AllOddsMarket[],
	canonicalMatchRowId: string | null,
): string | undefined {
	if (canonicalMatchRowId) {
		for (const m of markets) {
			if (m.pandaMatchId === canonicalMatchRowId && m.eventDate) return m.eventDate;
		}
	}
	for (const m of markets) {
		if (m.eventDate) return m.eventDate;
	}
	return undefined;
}

export function buildAllOddsGroups(
	markets: AllOddsMarket[],
	nowMs = Date.now(),
): AllOddsGroup[] {
	const activeMarkets = markets.filter((m) => isActiveAllOddsMarket(m, nowMs));
	const marketsByFixture = new Map<string, AllOddsMarket[]>();
	for (const market of activeMarkets) {
		if (isAllOddsMultiLegMarket(market)) continue;
		const fk = fixtureGroupKey(market) ?? `row:${market.pandaMatchId}`;
		const list = marketsByFixture.get(fk) ?? [];
		list.push(market);
		marketsByFixture.set(fk, list);
	}

	const fixtureContextByKey = new Map<string, FixtureBuildContext>();
	for (const [groupKey, fixtureMarkets] of marketsByFixture) {
		const sample = fixtureMarkets[0];
		const title = groupKey.startsWith("fixture:") && sample ? fixtureTitle(sample) : "";
		fixtureContextByKey.set(groupKey, {
			fixtureHasMoneylineLegs: fixtureHasMoneylineLegs(fixtureMarkets),
			canonicalMatchRowId: title ? resolveCanonicalMatchRowId(fixtureMarkets, title) : null,
		});
	}

	const byKey = new Map<string, GroupAcc>();

	for (const market of activeMarkets) {
		const mlKey = multiLegGroupKey(market);
		if (mlKey) {
			let acc = byKey.get(mlKey);
			if (!acc) {
				acc = {
					groupKey: mlKey,
					title: multiLegGroupTitle(market),
					teamMappings: market.teamMappings ?? [],
					primaryDrafts: [],
					moreDrafts: new Map(),
				};
				byKey.set(mlKey, acc);
			} else if (acc.teamMappings.length === 0 && (market.teamMappings?.length ?? 0) > 0) {
				acc.teamMappings = market.teamMappings ?? [];
			}

			const label = multiLegLegLabel(market);
			const draft: OutcomeDraft = {
				label,
				market,
				yesSide: "A",
				logoUrl: logoForTeamLabel(label, market.teamMappings ?? []),
				sortKey: market.sortOrder ?? 99,
			};
			const exists = acc.primaryDrafts.some((d) => d.market.pandaMatchId === market.pandaMatchId);
			if (!exists) acc.primaryDrafts.push(draft);
			continue;
		}

		const fixtureKey = fixtureGroupKey(market);
		const groupKey = fixtureKey ?? `row:${market.pandaMatchId}`;
		const title = fixtureKey ? fixtureTitle(market) : market.displayName.trim() || market.pandaMatchId;
		const ctx =
			fixtureContextByKey.get(groupKey) ?? {
				fixtureHasMoneylineLegs: false,
				canonicalMatchRowId: null,
			};

		if (shouldSkipMarketForAllOdds(market, ctx)) continue;

		let acc = byKey.get(groupKey);
		if (!acc) {
			acc = {
				groupKey,
				title,
				teamMappings: market.teamMappings ?? [],
				primaryDrafts: [],
				moreDrafts: new Map(),
			};
			byKey.set(groupKey, acc);
		} else if (acc.teamMappings.length === 0 && (market.teamMappings?.length ?? 0) > 0) {
			acc.teamMappings = market.teamMappings ?? [];
		}

		const placement = outcomePlacement(market, ctx);
		const mode = expansionMode(market, placement, ctx);
		const drafts = expandMarketToOutcomes(market, mode);

		for (const draft of drafts) {
			const target =
				placement.kind === "primary"
					? acc.primaryDrafts
					: (() => {
							let section = acc.moreDrafts.get(placement.sectionKey);
							if (!section) {
								section = { title: placement.sectionTitle, drafts: [] };
								acc.moreDrafts.set(placement.sectionKey, section);
							}
							return section.drafts;
						})();

			const exists = target.some(
				(d) =>
					d.market.pandaMatchId === draft.market.pandaMatchId &&
					d.yesSide === draft.yesSide &&
					d.label === draft.label,
			);
			if (!exists) target.push(draft);
		}
	}

	const groups: AllOddsGroup[] = [];

	for (const acc of byKey.values()) {
		const kind: AllOddsGroup["kind"] = acc.groupKey.startsWith("multileg:")
			? "multileg"
			: acc.groupKey.startsWith("fixture:")
				? "fixture"
				: "standalone";

		let primaryOutcomes: AllOddsOutcomeRow[];
		let moreSections: AllOddsMoreSection[];

		if (kind === "multileg") {
			const sorted = sortOutcomesByBestAsk(
				filterVisibleOutcomes(acc.primaryDrafts.map(draftToOutcomeRow)),
			);
			primaryOutcomes = sorted.slice(0, MULTI_LEG_PRIMARY_VISIBLE);
			const overflow = sorted.slice(MULTI_LEG_PRIMARY_VISIBLE);
			moreSections =
				overflow.length > 0
					? [{ sectionKey: "overflow", title: "", outcomes: overflow }]
					: [];
		} else {
			primaryOutcomes = filterVisibleOutcomes(
				dedupeMoneylinePrimary(acc.primaryDrafts.map(draftToOutcomeRow)),
			);
			moreSections = sortMoreSections(
				Array.from(acc.moreDrafts.entries())
					.map(([sectionKey, section]) => ({
						sectionKey,
						title: section.title,
						outcomes: filterVisibleOutcomes(section.drafts.map(draftToOutcomeRow)),
					}))
					.filter((s) => s.outcomes.length > 0),
			);
		}

		if (primaryOutcomes.length === 0 && moreSections.length === 0) continue;

		const fixtureMarkets = marketsByFixture.get(acc.groupKey) ?? [];
		const ctx = fixtureContextByKey.get(acc.groupKey);
		const eventStartAt =
			kind === "fixture" && ctx
				? resolveFixtureEventStartAt(fixtureMarkets, ctx.canonicalMatchRowId)
				: undefined;

		groups.push({
			groupKey: acc.groupKey,
			title: acc.title,
			teamMappings: acc.teamMappings,
			kind,
			...(eventStartAt ? { eventStartAt } : {}),
			primaryOutcomes,
			moreSections,
		});
	}

	groups.sort((a, b) => {
		const venueDiff = countLinkedVenuesForGroup(b) - countLinkedVenuesForGroup(a);
		if (venueDiff !== 0) return venueDiff;
		const startDiff = groupEventStartSortKey(a) - groupEventStartSortKey(b);
		if (startDiff !== 0) return startDiff;
		return a.title.localeCompare(b.title);
	});
	return groups;
}
