import { useEffect, useState } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { Tag } from "@/services/api/tagService";
import {
	isRestrictedProductionMode,
	restrictedDefaultTagLabel,
} from "@/config/restrictedMode";
import { resolveUmbrellaEventDate } from "./eventDates";

export const LIVE_PILL_ID = "__LIVE__";
export const STARTING_SOON_PILL_ID = "__STARTING_SOON__";

/** Horizontal pill bar; vertical sidebar uses `min-width: 1100px` in Predictions.scss. */
export const GAME_FILTER_COMPACT_MEDIA = "(max-width: 1099px)";

/** Home dock + umbrella trade rail grid (`Predictions.scss` / `PredictionMarket.scss` @ 1101px). */
export const PREDICTIONS_TRADE_PANEL_DESKTOP_MEDIA = "(min-width: 1101px)";

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
	return (
		nowMs < eventMs && eventMs <= nowMs + STARTING_SOON_WINDOW_MS
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
