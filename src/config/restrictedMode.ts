/**
 * Restricted production mode.
 *
 * In production builds the home page shows Live, Starting Soon, and only
 * allowlisted game pills (Counter-Strike, League of Legends, Valorant, Dota 2). Public
 * market lists (home, search) hide every other videogame.
 *
 * Dev builds keep the full filter set and every game so we can keep testing
 * FIFA and other flows not yet on the production allowlist.
 *
 * Gate semantics: this looks at whether the BUILD is production
 * (`import.meta.env.PROD`), NOT whether the build is talking to production
 * APIs. `yarn dev:live` (which is `vite dev` against the production API
 * base) still gets the full filter set.
 *
 * Companion helper module — keeps the restriction logic out of feature
 * components so it can be unit-tested and grep-audited from a single file.
 */

import type { Tag } from "@/services/api/tagService";
import { isProduction } from "./env";

/** Single source of truth for the production restriction. */
export function isRestrictedProductionMode(): boolean {
	return isProduction();
}

/** PandaScore videogame slugs shown on public surfaces in restricted production. */
export const RESTRICTED_VIDEOGAME_SLUGS = [
	"cs-go",
	"league-of-legends",
	"valorant",
	"dota-2",
] as const;

export type RestrictedVideogameSlug = (typeof RESTRICTED_VIDEOGAME_SLUGS)[number];

const RESTRICTED_VIDEOGAME_SLUG_SET: ReadonlySet<string> = new Set(RESTRICTED_VIDEOGAME_SLUGS);

/** @deprecated Use {@link RESTRICTED_VIDEOGAME_SLUGS}. Kept for grep/back-compat. */
export const RESTRICTED_VIDEOGAME_SLUG = "cs-go" as const;

export function isRestrictedProductionVideogameSlug(slug: string | null | undefined): boolean {
	if (slug === null || slug === undefined) return false;
	const trimmed = slug.trim();
	if (trimmed.length === 0) return false;
	return RESTRICTED_VIDEOGAME_SLUG_SET.has(trimmed);
}

/**
 * True for every label the `/tags` API has been observed publishing for
 * the Counter-Strike family.
 */
export function isCounterStrikeTagLabel(label: string | undefined): boolean {
	if (!label) return false;
	const l = label.trim().toLowerCase();
	return l === "counter-strike" || l === "counter-strike 2" || l === "cs2" || l === "cs-go";
}

/** True for League of Legends tag labels from `/tags`. */
export function isLeagueOfLegendsTagLabel(label: string | undefined): boolean {
	if (!label) return false;
	const l = label.trim().toLowerCase();
	return l === "league of legends" || l === "lol" || l === "league-of-legends";
}

/** True for Valorant tag labels from `/tags`. */
export function isValorantTagLabel(label: string | undefined): boolean {
	if (!label) return false;
	const l = label.trim().toLowerCase();
	return l === "valorant";
}

/** True for Dota 2 tag labels from `/tags`. */
export function isDota2TagLabel(label: string | undefined): boolean {
	if (!label) return false;
	const l = label.trim().toLowerCase();
	return l === "dota 2" || l === "dota2" || l === "dota-2";
}

/** Game pills visible in restricted production (CS2 + LoL + Valorant + Dota 2). */
export function isRestrictedProductionTagLabel(label: string | undefined): boolean {
	return (
		isCounterStrikeTagLabel(label) ||
		isLeagueOfLegendsTagLabel(label) ||
		isValorantTagLabel(label) ||
		isDota2TagLabel(label)
	);
}

/** First Counter-Strike-family tag in `tags`, or undefined. */
export function findCounterStrikeTag(tags: Tag[]): Tag | undefined {
	return tags.find((t) => isCounterStrikeTagLabel(t.label));
}

/**
 * Default-selected pill on first home load in restricted production.
 * Counter-Strike when present; otherwise first allowlisted game tag.
 */
export function restrictedDefaultTagLabel(tags: Tag[]): string | null {
	const cs2 = findCounterStrikeTag(tags);
	if (cs2) return cs2.label;
	return tags.find((t) => isRestrictedProductionTagLabel(t.label))?.label ?? null;
}
