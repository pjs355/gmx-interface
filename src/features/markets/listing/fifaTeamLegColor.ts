import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { Umbrella, UmbrellaTeamMapping } from "@/services/api/umbrellaDataService";

/**
 * Keep in sync with `predictions/fifa-world-cup-country.ts` (NAME_TO_SLUG + SLUG_TO_COLOR).
 * Frontend copy so group-winner legs resolve the same slug → color as moneyline games.
 */
const NAME_TO_SLUG: Record<string, string> = {
	algeria: "algeria",
	argentina: "argentina",
	australia: "australia",
	austria: "austria",
	belgium: "belgium",
	"bosnia-herzegovina": "bosnia-and-herzegovina",
	"bosnia and herzegovina": "bosnia-and-herzegovina",
	"bosnia & herzegovina": "bosnia-and-herzegovina",
	brazil: "brazil",
	canada: "canada",
	"cabo verde": "cape-verde",
	"cape verde": "cape-verde",
	"cape verde islands": "cape-verde",
	colombia: "colombia",
	"costa rica": "costa-rica",
	"cote d'ivoire": "ivory-coast",
	"côte d'ivoire": "ivory-coast",
	"congo dr": "congo-dr",
	"democratic republic of the congo": "congo-dr",
	"dr congo": "congo-dr",
	croatia: "croatia",
	curaçao: "curacao",
	curacao: "curacao",
	"czech republic": "czechia",
	czechia: "czechia",
	denmark: "denmark",
	draw: "draw",
	ecuador: "ecuador",
	egypt: "egypt",
	england: "england",
	france: "france",
	germany: "germany",
	ghana: "ghana",
	haiti: "haiti",
	"ir iran": "iran",
	iran: "iran",
	iraq: "iraq",
	italy: "italy",
	"ivory coast": "ivory-coast",
	japan: "japan",
	jordan: "jordan",
	"korea republic": "south-korea",
	mexico: "mexico",
	morocco: "morocco",
	netherlands: "netherlands",
	"new zealand": "new-zealand",
	nicaragua: "nicaragua",
	"northern ireland": "northern-ireland",
	norway: "norway",
	panama: "panama",
	paraguay: "paraguay",
	peru: "peru",
	poland: "poland",
	portugal: "portugal",
	qatar: "qatar",
	"republic of ireland": "republic-of-ireland",
	romania: "romania",
	russia: "russia",
	"saudi arabia": "saudi-arabia",
	scotland: "scotland",
	senegal: "senegal",
	"south africa": "south-africa",
	"south korea": "south-korea",
	spain: "spain",
	sweden: "sweden",
	switzerland: "switzerland",
	tie: "draw",
	tunisia: "tunisia",
	turkey: "turkey",
	türkiye: "turkey",
	turkiye: "turkey",
	ukraine: "ukraine",
	uruguay: "uruguay",
	usa: "usa",
	"united states": "usa",
	uzbekistan: "uzbekistan",
	wales: "wales",
};

const SLUG_TO_COLOR: Record<string, string> = {
	algeria: "#d21b3a",
	argentina: "#6cace4",
	australia: "#ffcd00",
	austria: "#cc142c",
	belgium: "#ed2939",
	"bosnia-and-herzegovina": "#fccc04",
	brazil: "#facb04",
	canada: "#fc0404",
	"cape-verde": "#cc2424",
	colombia: "#fccc04",
	"congo-dr": "#047cfc",
	"costa-rica": "#dc2c1c",
	croatia: "#fc0404",
	curacao: "#fcec14",
	czechia: "#d4141c",
	denmark: "#cc142c",
	ecuador: "#fcdc04",
	egypt: "#cc1424",
	england: "#cc142c",
	france: "#002395",
	germany: "#ffcc00",
	ghana: "#f4cf15",
	haiti: "#d31434",
	iran: "#dc0404",
	iraq: "#cc1424",
	italy: "#0068b3",
	"ivory-coast": "#f47c04",
	japan: "#bc042c",
	jordan: "#cc1424",
	mexico: "#006847",
	morocco: "#c4242c",
	netherlands: "#ff6600",
	"new-zealand": "#cc1831",
	nicaragua: "#0464c4",
	"northern-ireland": "#cc0404",
	norway: "#bc0c2c",
	panama: "#dc141c",
	paraguay: "#d42c1c",
	peru: "#dc1424",
	poland: "#dc143c",
	portugal: "#fc0404",
	qatar: "#8c143c",
	"republic-of-ireland": "#008248",
	romania: "#fcd414",
	russia: "#d42c1c",
	"saudi-arabia": "#397c5c",
	scotland: "#045cbc",
	senegal: "#e41c24",
	"south-africa": "#f2b61d",
	"south-korea": "#cb2c3c",
	spain: "#e32219",
	sweden: "#fccc04",
	switzerland: "#fc0404",
	tunisia: "#e40414",
	turkey: "#e40c14",
	ukraine: "#fcd404",
	uruguay: "#f9ce14",
	usa: "#b41c44",
	uzbekistan: "#3685f4",
	wales: "#d30740",
};

export const FIFA_GAME = "soccer-fifwc";
export const FIFA_NEUTRAL_OUTCOME_COLOR = "#9ca3af";
export const FIFA_DEFAULT_TEAM_COLOR = "#22c55e";

function trimHex(value: unknown): string | undefined {
	if (typeof value !== "string") return undefined;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeFifaCountrySlug(rawName: string): string | undefined {
	const trimmed = rawName.trim();
	if (trimmed.length === 0) return undefined;
	const lower = trimmed.toLowerCase();
	if (NAME_TO_SLUG[lower]) return NAME_TO_SLUG[lower];
	const slug = lower
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return slug.length > 0 ? slug : undefined;
}

function teamLabelFromQuestion(q: Record<string, unknown>): string | undefined {
	const display = typeof q.displayName === "string" ? q.displayName.trim() : "";
	const dashIdx = display.lastIndexOf(" — ");
	if (dashIdx !== -1) {
		const tail = display.slice(dashIdx + 3).trim();
		if (tail.length > 0) return tail;
	}
	const question = typeof q.question === "string" ? q.question.trim() : "";
	const winMatch = question.match(/^Will\s+(.+?)\s+win\b/i);
	if (winMatch?.[1]) return winMatch[1].trim();
	return undefined;
}

function colorFromTeamMappingsBySlug(
	slug: string,
	teamMappings?: UmbrellaTeamMapping[] | null,
): string | undefined {
	if (!teamMappings?.length) return undefined;
	for (const mapping of teamMappings) {
		if (mapping.slug !== slug) continue;
		return trimHex(mapping.primaryColor);
	}
	return undefined;
}

/**
 * Build slug → color from FIFA **game** (3-way moneyline) umbrellas so group-winner
 * legs reuse the exact hex shown on match cards for the same country.
 */
export function buildFifaGameTeamColorBySlug(umbrellas: Umbrella[]): Record<string, string> {
	const map: Record<string, string> = {};

	for (const umbrella of umbrellas) {
		if (umbrella.game !== FIFA_GAME) continue;

		const mappings = umbrella.teamMappings ?? [];
		const children =
			(umbrella as { originalChildren?: PredictionMarket[] }).originalChildren ??
			(umbrella.children as PredictionMarket[] | undefined) ??
			[];

		for (const q of children) {
			const leg = q.moneylineLeg;
			if (leg !== "home" && leg !== "away") continue;
			const yesColor = trimHex((q as { yesColor?: unknown }).yesColor);
			if (!yesColor) continue;

			const idx = leg === "home" ? 0 : 1;
			let slug: string | undefined = mappings[idx]?.slug;
			if (typeof slug !== "string" || slug.length === 0) {
				const label = teamLabelFromQuestion(q as unknown as Record<string, unknown>);
				if (label !== undefined) slug = normalizeFifaCountrySlug(label);
			}
			if (typeof slug === "string" && slug.length > 0) {
				map[slug] = yesColor;
			}
		}
	}

	return map;
}

/** Same resolution path for moneyline + group-winner FIFA team legs. */
export function resolveFifaTeamLegColor(input: {
	teamLabel: string;
	yesColor?: string | null;
	teamMappings?: UmbrellaTeamMapping[] | null;
	gameTeamColorBySlug?: Record<string, string> | null;
	neutral?: boolean;
}): string {
	if (input.neutral) return FIFA_NEUTRAL_OUTCOME_COLOR;

	const slug = normalizeFifaCountrySlug(input.teamLabel);

	if (slug && input.gameTeamColorBySlug?.[slug]) {
		return input.gameTeamColorBySlug[slug];
	}

	const explicit = trimHex(input.yesColor);
	if (explicit) return explicit;

	if (slug) {
		const fromMappings = colorFromTeamMappingsBySlug(slug, input.teamMappings);
		if (fromMappings) return fromMappings;
		const fromMap = SLUG_TO_COLOR[slug];
		if (fromMap) return fromMap;
	}

	return FIFA_DEFAULT_TEAM_COLOR;
}
