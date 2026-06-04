import { useEffect, useState } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { Tag } from "@/services/api/tagService";
import { isRestrictedProductionMode, restrictedDefaultTagLabel } from "@/config/restrictedMode";
import { resolveUmbrellaEventDate } from "./eventDates";

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
 * render cross-venue BBO. World Cup umbrellas carry venue routing on their
 * per-team child questions (`polymarketMarketId`); every other umbrella uses its
 * own `pandascore_matchId`. Dedupes while preserving order.
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
		const children = (umbrella as { children?: Array<{ polymarketMarketId?: unknown }> }).children;
		for (const child of children ?? []) push(child?.polymarketMarketId);
	} else {
		push((umbrella as { pandascore_matchId?: unknown }).pandascore_matchId);
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

/**
 * Default sidebar selection on `/` — the ESPORTS tag label, or `null` if
 * not loaded yet. In restricted production mode this is overridden to the
 * Counter-Strike tag label by {@link homeDefaultSelectedTagLabel}.
 */
export function defaultEsportsTagLabel(tags: Tag[]): string | null {
	return findEsportsTag(tags)?.label ?? null;
}

/**
 * Tag label to use as the home page's default-selected pill on first load.
 * Counter-Strike in restricted production mode (the "All" pill is hidden
 * there), ESPORTS otherwise.
 */
export function homeDefaultSelectedTagLabel(tags: Tag[]): string | null {
	if (isRestrictedProductionMode()) {
		return restrictedDefaultTagLabel(tags);
	}
	return defaultEsportsTagLabel(tags);
}

/**
 * Value to use when resetting the game filter (e.g. header home click).
 * Returns Counter-Strike in restricted production mode, ESPORTS otherwise.
 */
export function gameFilterResetSelection(tags: Tag[]): string | null {
	return homeDefaultSelectedTagLabel(tags);
}

export function isEsportsMetaTagLabel(tagLabel: string): boolean {
	return normalizeTagLabel(tagLabel) === "ESPORTS";
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

export function useNowTick(intervalMs = 60_000): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const id = window.setInterval(() => setNow(Date.now()), intervalMs);
		return () => window.clearInterval(id);
	}, [intervalMs]);
	return now;
}
