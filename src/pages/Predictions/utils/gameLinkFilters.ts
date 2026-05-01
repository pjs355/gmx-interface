import { useEffect, useState } from "react";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import { resolveUmbrellaEventDate } from "./eventDates";

export const LIVE_PILL_ID = "__LIVE__";
export const STARTING_SOON_PILL_ID = "__STARTING_SOON__";

/** Horizontal pill bar; vertical sidebar uses `min-width: 1100px` in Predictions.scss. */
export const GAME_FILTER_COMPACT_MEDIA = "(max-width: 1099px)";

/** Value to use when clearing the game filter (desktop = all; compact = Live default). */
export function gameFilterResetSelection(): string | null {
	if (typeof window === "undefined") return null;
	return window.matchMedia(GAME_FILTER_COMPACT_MEDIA).matches
		? LIVE_PILL_ID
		: null;
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
