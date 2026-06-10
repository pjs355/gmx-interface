import { useEffect, useState } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { Tag } from "@/services/api/tagService";
import { getHomeGameFilter } from "./gameFilterNavigation";
import { normalizeEventDateInput, resolveUmbrellaEventDate } from "./eventDates";
import { isMatchPropQuestion } from "@/features/markets/listing/matchProps";

export const LIVE_PILL_ID = "__LIVE__";
export const STARTING_SOON_PILL_ID = "__STARTING_SOON__";
/**
 * Synthetic pill for FIFA World Cup (Polymarket-sourced soccer). Like `LIVE` /
 * `STARTING_SOON` it is not backed by a `/tags` Tag — FIFA umbrellas carry no
 * tagIds — so it is matched structurally via {@link isWorldCupUmbrella}. Dev-only:
 * hidden in restricted production mode, where the non-CS pool is already stripped.
 */
export const WORLD_CUP_PILL_ID = "__WORLD_CUP__";

/** Canonical `Umbrella.game` slug set by the FIFA Polymarket create plan. */
export const WORLD_CUP_GAME_SLUG = "soccer-fifwc";

/** True for FIFA World Cup umbrellas (Polymarket 3-way moneyline mirror markets). */
export function isWorldCupUmbrella(umbrella: Umbrella | null | undefined): boolean {
	return (umbrella as { game?: string } | null | undefined)?.game === WORLD_CUP_GAME_SLUG;
}

/**
 * True for a FIFA World Cup "Group X Winner" prop umbrella: its children are
 * binary winner legs (`marketType: "winner"`, `segment: "group_*"`). The other
 * World Cup umbrellas are the 3-way moneyline matches ("Games"). Used to split
 * the World Cup view into Games vs Props sub-sections.
 */
export function isWorldCupPropUmbrella(umbrella: Umbrella | null | undefined): boolean {
	if (!isWorldCupUmbrella(umbrella)) return false;
	const children = (
		umbrella as { children?: Array<{ marketType?: unknown; segment?: unknown }> } | null | undefined
	)?.children;
	if (!Array.isArray(children) || children.length === 0) return false;
	let count = 0;
	for (const child of children) {
		if (
			child?.marketType === "winner" &&
			typeof child?.segment === "string" &&
			child.segment.startsWith("group_")
		) {
			count += 1;
		}
	}
	return count >= 2;
}

/** Sort key for World Cup group-winner umbrellas (`group_a` … `group_l`). */
export function worldCupPropGroupSortKey(umbrella: Umbrella): string {
	const children = (
		umbrella as { children?: Array<{ marketType?: unknown; segment?: unknown }> } | null | undefined
	)?.children;
	if (!Array.isArray(children)) return "\uffff";
	for (const child of children) {
		if (
			child?.marketType === "winner" &&
			typeof child?.segment === "string" &&
			child.segment.startsWith("group_")
		) {
			return child.segment;
		}
	}
	return "\uffff";
}

/**
 * PandaScore match IDs an umbrella needs subscribed on the venue-prices WS to
 * render cross-venue BBO on the listing surfaces. World Cup umbrellas carry
 * venue routing on their per-team child questions (`polymarketMarketId`); every
 * other umbrella uses its own `pandascore_matchId`.
 *
 * Esports listing cards only render the series moneyline (see PredictionCard's
 * `esportsOddsRowSpecs` filter), so subscribing to `${matchId}-map-${slot}` wire
 * keys here is wasted WS work — the detail page subscribes to the full leg set
 * via {@link EsportsLegAccordion}. Dedupes while preserving order.
 */
export function umbrellaVenuePandaIds(umbrella: Umbrella | null | undefined): string[] {
	if (!umbrella) return [];
	const ids: string[] = [];
	const seen = new Set<string>();
	const push = (raw: unknown) => {
		const id = typeof raw === "string" ? raw.trim() : "";
		if (!id || seen.has(id)) return;
		seen.add(id);
		ids.push(id);
	};
	if (isWorldCupUmbrella(umbrella)) {
		// Moneyline legs only: spread / total props (potentially dozens per
		// match) are detail-page-only, so subscribing them here is wasted WS work.
		const children = (
			umbrella as { children?: Array<{ polymarketMarketId?: unknown; marketType?: unknown }> }
		).children;
		for (const child of children ?? []) {
			if (isMatchPropQuestion(child)) continue;
			push(child?.polymarketMarketId);
		}
	} else {
		const raw = (umbrella as { pandascore_matchId?: unknown }).pandascore_matchId;
		const matchId = typeof raw === "string" ? raw.trim() : "";
		if (matchId) push(matchId);
	}
	return ids;
}

/** Home listing only shows tradeable children (`tradeable !== false`). */
export function umbrellaHasTradeableHomeChildren(umbrella: Umbrella): boolean {
	const children = (umbrella as { children?: unknown }).children;
	if (!Array.isArray(children)) return false;
	return children.some((c) => (c as { tradeable?: boolean }).tradeable !== false);
}

/** Horizontal pill bar; vertical sidebar uses `min-width: 1100px` in Predictions.scss. */
export const GAME_FILTER_COMPACT_MEDIA = "(max-width: 1099px)";

export function findEsportsTag(tags: Tag[]): Tag | undefined {
	return tags.find((t) => normalizeTagLabel(t.label) === "ESPORTS");
}

/** ESPORTS meta tag label for the "All" pill, or `null` if tags are not loaded yet. */
export function defaultEsportsTagLabel(tags: Tag[]): string | null {
	return findEsportsTag(tags)?.label ?? null;
}

/**
 * Default sidebar selection on `/` — Live markets on first load.
 */
export function homeDefaultSelectedTagLabel(_tags: Tag[]): string {
	return LIVE_PILL_ID;
}

/**
 * Value to use when resetting the game filter (e.g. header home click).
 */
export function gameFilterResetSelection(_tags: Tag[]): string {
	return LIVE_PILL_ID;
}

/**
 * Validates a stored home filter value against loaded tags.
 * Returns null when the stored pill no longer applies.
 */
export function resolveStoredHomeGameFilter(stored: string | null, tags: Tag[]): string | null {
	if (stored === null || stored.length === 0) return null;
	if (stored === LIVE_PILL_ID || stored === STARTING_SOON_PILL_ID || stored === WORLD_CUP_PILL_ID) {
		return stored;
	}
	if (isEsportsMetaTagLabel(stored)) {
		const esports = findEsportsTag(tags);
		return esports?.label === stored ? stored : null;
	}
	// Stored "FIFA World Cup" pill (back-end Tag) was hidden from the sidebar
	// in favor of the synthetic World Cup block — redirect so the user lands
	// on the equivalent visible entry instead of an unselectable orphan.
	if (isHiddenSidebarTagLabel(stored)) return WORLD_CUP_PILL_ID;
	return tags.some((t) => t.label === stored) ? stored : null;
}

/** Bootstrap selection: stored filter → Live default. */
export function resolveInitialHomeGameFilter(tags: Tag[]): string {
	const stored = getHomeGameFilter();
	const resolved = resolveStoredHomeGameFilter(stored, tags);
	if (resolved !== null) return resolved;
	return homeDefaultSelectedTagLabel(tags);
}

export function isEsportsMetaTagLabel(tagLabel: string): boolean {
	return normalizeTagLabel(tagLabel) === "ESPORTS";
}

/*
 * The backend may carry a "FIFA World Cup" Tag whose pill duplicates the
 * synthetic World Cup block (`WORLD_CUP_PILL_ID` → "World Cup" with Games /
 * Groups children). The synthetic block is the canonical World Cup entry point
 * for the sidebar; hide the duplicate so the user only sees one. Matched on
 * the normalized form (`FIFA_WORLD_CUP`) so spacing/casing drift in the tag
 * label doesn't accidentally re-show it.
 */
export function isHiddenSidebarTagLabel(tagLabel: string): boolean {
	return normalizeTagLabel(tagLabel) === "FIFA_WORLD_CUP";
}

/** Live / Starting Soon / ESPORTS "All" — not a per-game tag pill. */
export function isSpecificGameTagSelection(selectedGame: string | null): boolean {
	if (!selectedGame) return false;
	if (selectedGame === LIVE_PILL_ID || selectedGame === STARTING_SOON_PILL_ID) return false;
	if (isEsportsMetaTagLabel(selectedGame)) return false;
	return true;
}

/** True when any child question carries this tag id. */
export function umbrellaHasTagId(umbrella: Umbrella, tagId: string): boolean {
	const children = (umbrella as { children?: Array<{ tagIds?: string[] }> }).children;
	if (!children?.length) return false;
	return children.some((q) => {
		const tagIds = q?.tagIds;
		return Array.isArray(tagIds) && tagIds.length > 0 && tagIds.includes(tagId);
	});
}

/** Same 4h post-start window as PredictionCard / FilteredPredictions calendar / Home. */
export const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;
export const STARTING_SOON_WINDOW_MS = 6 * 60 * 60 * 1000;

export function normalizeTagLabel(value: string): string {
	return value
		.toUpperCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^A-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "");
}

export function umbrellaHasEsportsChildTag(
	umbrella: Umbrella,
	esportsTagId: string | undefined,
): boolean {
	if (!esportsTagId) return false;
	const children = (umbrella as { children?: unknown }).children as
		| Array<{ tagIds?: string[] }>
		| undefined;
	if (!children?.length) return false;
	return children.some((q) => {
		const tagIds = q?.tagIds;
		if (!Array.isArray(tagIds) || tagIds.length === 0) return false;
		return tagIds.includes(esportsTagId);
	});
}

export type UmbrellaChildTagState = {
	hasEsportsTag: boolean;
	hasAnyTagId: boolean;
};

export function readUmbrellaChildTagState(
	umbrella: Umbrella,
	esportsTagId: string | undefined,
): UmbrellaChildTagState {
	const children = (umbrella as { children?: unknown }).children as
		| Array<{ tagIds?: string[] }>
		| undefined;
	if (!children?.length) {
		return { hasEsportsTag: false, hasAnyTagId: false };
	}

	let hasAnyTagId = false;
	let hasEsportsTag = false;

	for (const q of children) {
		const tagIds = q?.tagIds;
		if (!Array.isArray(tagIds) || tagIds.length === 0) continue;
		hasAnyTagId = true;
		if (esportsTagId && tagIds.includes(esportsTagId)) {
			hasEsportsTag = true;
		}
	}

	return { hasEsportsTag, hasAnyTagId };
}

export function umbrellaMatchesHomeFilterType(
	umbrella: Umbrella,
	filterType: "esports" | "games" | "all",
	esportsTagId: string | undefined,
): boolean {
	const { hasEsportsTag, hasAnyTagId } = readUmbrellaChildTagState(umbrella, esportsTagId);
	if (!hasAnyTagId) return false;
	if (filterType === "games") return !hasEsportsTag;
	if (filterType === "esports") return hasEsportsTag;
	return true;
}

export function isUmbrellaLiveByEventDate(
	umbrella: Umbrella,
	nowMs: number,
	esportsTagId: string | undefined,
): boolean {
	if (!umbrellaHasEsportsChildTag(umbrella, esportsTagId)) return false;
	const eventDate = resolveUmbrellaEventDate(umbrella);
	if (!eventDate) return false;
	const eventMs = eventDate.getTime();
	return nowMs >= eventMs && nowMs <= eventMs + LIVE_WINDOW_MS;
}

export function isUmbrellaStartingSoonByEventDate(
	umbrella: Umbrella,
	nowMs: number,
	esportsTagId: string | undefined,
): boolean {
	if (!umbrellaHasEsportsChildTag(umbrella, esportsTagId)) return false;
	const eventDate = resolveUmbrellaEventDate(umbrella);
	if (!eventDate) return false;
	const eventMs = eventDate.getTime();
	return nowMs < eventMs && eventMs <= nowMs + STARTING_SOON_WINDOW_MS;
}

/**
 * Same ended semantics as {@link PredictionCard} — esports: past the 4h live
 * window; daily/non-esports: `endDate` reached. No event/end date → not ended.
 */
export function isUmbrellaEndedForHomeCatalog(
	umbrella: Umbrella,
	nowMs: number,
	esportsTagId: string | undefined,
): boolean {
	if (umbrellaHasEsportsChildTag(umbrella, esportsTagId)) {
		const eventDate = resolveUmbrellaEventDate(umbrella);
		if (eventDate === null) {
			return false;
		}
		const eventMs = eventDate.getTime();
		if (nowMs < eventMs) {
			return false;
		}
		if (nowMs <= eventMs + LIVE_WINDOW_MS) {
			return false;
		}
		return true;
	}

	const endDate = normalizeEventDateInput((umbrella as { endDate?: unknown }).endDate);
	if (endDate === null) {
		return false;
	}
	return nowMs >= endDate.getTime();
}

export function filterHomeCatalogUmbrellas(
	umbrellas: Umbrella[],
	nowMs: number,
	esportsTagId: string | undefined,
): Umbrella[] {
	return umbrellas.filter(
		(umbrella) => !isUmbrellaEndedForHomeCatalog(umbrella, nowMs, esportsTagId),
	);
}

export function useNowTick(intervalMs = 60_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), intervalMs);
		return () => window.clearInterval(id);
	}, [intervalMs]);
	return now;
}
