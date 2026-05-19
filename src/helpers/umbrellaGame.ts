/**
 * Resolves an `Umbrella.game` display label (e.g. `"Counter-Strike"`,
 * `"League of Legends"`) to the canonical PandaScore videogame slug used
 * across the backend (`"cs-go"`, `"league-of-legends"`, `"valorant"`,
 * `"dota-2"`).
 *
 * Mirrors `predictions-api/matching/game-config.ts::UMBRELLA_GAME_LABEL_TO_ID`.
 * If the backend resolver gains a new alias, add it here too.
 *
 * Used by public market lists (`FilteredPredictions`, `GameLinks`) to hide
 * non-Counter-Strike umbrellas. Admin views do not use this — admins keep
 * full visibility of every game's markets.
 */

const UMBRELLA_GAME_LABEL_TO_VIDEOGAME: Readonly<Record<string, string>> = {
	"counter-strike": "cs-go",
	"counter-strike 2": "cs-go",
	"counter strike 2": "cs-go",
	"counter strike": "cs-go",
	cs2: "cs-go",
	"cs-go": "cs-go",
	"league of legends": "league-of-legends",
	lol: "league-of-legends",
	"league-of-legends": "league-of-legends",
	valorant: "valorant",
	"dota 2": "dota-2",
	dota2: "dota-2",
	"dota-2": "dota-2",
};

/**
 * Returns the canonical PandaScore videogame slug for an umbrella's `game`
 * display label, or `null` if the label is missing, empty, or unrecognised.
 *
 * Callers should treat `null` as "unknown / hide on public surfaces". A
 * `console.warn` fires for unknown non-empty labels so new backend values
 * are visible during QA.
 */
export function resolveUmbrellaVideogame(
	game: string | undefined | null,
): string | null {
	if (!game) return null;
	const trimmed = game.trim();
	if (!trimmed) return null;
	const key = trimmed.toLowerCase();
	const slug = UMBRELLA_GAME_LABEL_TO_VIDEOGAME[key];
	if (!slug) {
		console.warn(
			`[umbrellaGame] Unknown Umbrella.game label "${trimmed}" — add to UMBRELLA_GAME_LABEL_TO_VIDEOGAME if it should map to a known PandaScore videogame.`,
		);
		return null;
	}
	return slug;
}

/**
 * True iff the umbrella's `game` label resolves to Counter-Strike.
 * Returns false for unknown / missing labels (fail-safe-hide).
 */
export function isCounterStrikeUmbrella(umbrella: {
	game?: string | null;
}): boolean {
	return resolveUmbrellaVideogame(umbrella.game) === "cs-go";
}
