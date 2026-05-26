import cs2Background from "@/assets/market-backgrounds/cs2.jpg";
import dota2Background from "@/assets/market-backgrounds/dota2.jpg";
import esportsBackground from "@/assets/market-backgrounds/esports.jpg";
import leagueBackground from "@/assets/market-backgrounds/league.jpg";
import valorantBackground from "@/assets/market-backgrounds/valorant.jpg";
import { LIVE_PILL_ID, normalizeTagLabel, STARTING_SOON_PILL_ID } from "./gameLinkFilters";

/** Fallback when no tag-specific art matches (Live / Starting Soon pills). */
const DEFAULT_MARKET_BACKGROUND: string = esportsBackground;

/**
 * Hero backdrop per tag label or slug ({@link normalizeTagLabel}).
 * Keys must match normalized tag labels from the API (e.g. ESPORTS, CS2)
 * and normalized tag slugs (e.g. CS_GO, LEAGUE_OF_LEGENDS).
 */
const MARKET_BACKGROUND_BY_NORMALIZED_TAG: Record<string, string> = {
	ESPORTS: esportsBackground,
	CS2: cs2Background,
	CS_2: cs2Background,
	CS_GO: cs2Background,
	COUNTER_STRIKE: cs2Background,
	COUNTER_STRIKE_2: cs2Background,
	COUNTERSTRIKE: cs2Background,
	COUNTERSTRIKE2: cs2Background,
	LEAGUE_OF_LEGENDS: leagueBackground,
	LOL: leagueBackground,
	LEAGUE: leagueBackground,
	DOTA_2: dota2Background,
	DOTA2: dota2Background,
	DOTA: dota2Background,
	VALORANT: valorantBackground,
	VAL: valorantBackground,
};

export function resolveMarketBackgroundUrl(selectedGame: string | null | undefined): string {
	if (selectedGame === LIVE_PILL_ID || selectedGame === STARTING_SOON_PILL_ID) {
		return DEFAULT_MARKET_BACKGROUND;
	}
	if (selectedGame === null || selectedGame === undefined) {
		return esportsBackground;
	}
	const key = normalizeTagLabel(selectedGame);
	const url = MARKET_BACKGROUND_BY_NORMALIZED_TAG[key];
	return typeof url === "string" && url.length > 0 ? url : DEFAULT_MARKET_BACKGROUND;
}
