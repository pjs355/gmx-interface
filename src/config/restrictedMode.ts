/**
 * Restricted production mode.
 *
 * In production builds the home page shows only three filter pills —
 * `Live`, `Starting Soon`, and `Counter-Strike` — and only Counter-Strike
 * umbrellas everywhere a public market list is rendered (home, search).
 *
 * Dev builds keep the full filter set and every game so we can keep testing
 * dota / league / valorant flows.
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

/** Canonical PandaScore videogame slug for the only game shown in restricted mode. */
export const RESTRICTED_VIDEOGAME_SLUG = "cs-go" as const;

/**
 * True for every label the `/tags` API has been observed publishing for
 * the Counter-Strike family. Used to find the Counter-Strike tag in the
 * `Tag[]` list returned by `tagService.fetchAllTags()`.
 */
export function isCounterStrikeTagLabel(label: string | undefined): boolean {
	if (!label) return false;
	const l = label.trim().toLowerCase();
	return (
		l === "counter-strike" ||
		l === "counter-strike 2" ||
		l === "cs2" ||
		l === "cs-go"
	);
}

/** First Counter-Strike-family tag in `tags`, or undefined. */
export function findCounterStrikeTag(tags: Tag[]): Tag | undefined {
	return tags.find((t) => isCounterStrikeTagLabel(t.label));
}

/**
 * Label to use as the default-selected pill on the home page when
 * {@link isRestrictedProductionMode} is true, or `null` if the Counter-Strike
 * tag has not loaded yet. The home page falls back to its normal ESPORTS
 * default when this returns `null`.
 */
export function restrictedDefaultTagLabel(tags: Tag[]): string | null {
	return findCounterStrikeTag(tags)?.label ?? null;
}
