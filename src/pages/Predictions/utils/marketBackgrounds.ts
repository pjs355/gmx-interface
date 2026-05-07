import cs2BgRaw from "@/assets/market-backgrounds/cs2.jpg";
import {
	LIVE_PILL_ID,
	normalizeTagLabel,
	STARTING_SOON_PILL_ID,
} from "./gameLinkFilters";

/**
 * Default hero backdrop when no tag-specific art exists yet, or for filters
 * without a dedicated image (Live, Starting Soon, “all”, unmapped tags).
 * Replace or extend {@link MARKET_BACKGROUND_BY_NORMALIZED_TAG} as you add games.
 */
const DEFAULT_MARKET_BACKGROUND: string = cs2BgRaw;

/**
 * Resolved URLs keyed by {@link normalizeTagLabel} output for the tag pill label.
 * Add an entry whenever a game should show a dedicated backdrop image.
 */
const MARKET_BACKGROUND_BY_NORMALIZED_TAG: Record<string, string> = {
	CS2: cs2BgRaw,
	CS_2: cs2BgRaw,
	COUNTER_STRIKE_2: cs2BgRaw,
};

/**
 * Returns a backdrop URL for every filter. Unknown tags reuse
 * {@link DEFAULT_MARKET_BACKGROUND}; map entries override per game later.
 */
export function resolveMarketBackgroundUrl(
	selectedGame: string | null | undefined,
): string {
	if (selectedGame === LIVE_PILL_ID || selectedGame === STARTING_SOON_PILL_ID) {
		return DEFAULT_MARKET_BACKGROUND;
	}
	if (selectedGame === null || selectedGame === undefined) {
		return DEFAULT_MARKET_BACKGROUND;
	}
	const key = normalizeTagLabel(selectedGame);
	const url = MARKET_BACKGROUND_BY_NORMALIZED_TAG[key];
	return typeof url === "string" && url.length > 0
		? url
		: DEFAULT_MARKET_BACKGROUND;
}
