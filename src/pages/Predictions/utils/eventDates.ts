import type { Umbrella } from "@/services/api/umbrellaDataService";

export function normalizeEventDateInput(value: unknown): Date | null {
	if (value === null || value === undefined) {
		return null;
	}
	if (value instanceof Date) {
		if (Number.isNaN(value.getTime())) {
			return null;
		}
		return value;
	}
	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			return null;
		}
		return new Date(value);
	}
	if (typeof value === "string") {
		if (value.length === 0) {
			return null;
		}
		const parsed = Date.parse(value);
		if (Number.isNaN(parsed)) {
			return null;
		}
		return new Date(parsed);
	}
	return null;
}

export function resolveUmbrellaEventDate(umbrella: Umbrella): Date | null {
	const normalizedUmbrellaDate = normalizeEventDateInput(umbrella.eventDate);
	if (normalizedUmbrellaDate !== null) {
		return normalizedUmbrellaDate;
	}

	const children = umbrella.children;
	for (let index = 0; index < children.length; index += 1) {
		const child = children[index];
		const normalizedChildDate = normalizeEventDateInput(child?.eventDate);
		if (normalizedChildDate !== null) {
			return normalizedChildDate;
		}
	}

	return null;
}

export function startOfLocalDay(date: Date): Date {
	const result = new Date(date.getTime());
	result.setHours(0, 0, 0, 0);
	return result;
}

/** Below this threshold we show a live countdown; above it we show a static local datetime. */
export const EVENT_START_COUNTDOWN_THRESHOLD_MS = 24 * 60 * 60 * 1000;

/**
 * Kickoff / start time in the viewer's local timezone, e.g. "June 11 3:00pm".
 * Uses Intl formatToParts so month/day/time stay consistent (no UTC drift).
 */
export function formatEventStartDisplay(date: Date): string {
	const formatter = new Intl.DateTimeFormat("en-US", {
		month: "long",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
	const parts = formatter.formatToParts(date);
	const part = (type: Intl.DateTimeFormatPartTypes) =>
		parts.find((p) => p.type === type)?.value ?? "";
	const month = part("month");
	const day = part("day");
	const hour = part("hour");
	const minute = part("minute");
	const dayPeriod = part("dayPeriod").toLowerCase();
	return `${month} ${day} ${hour}:${minute}${dayPeriod}`;
}

export function msUntilEventStart(eventDate: Date, nowMs = Date.now()): number {
	return eventDate.getTime() - nowMs;
}

export function shouldShowEventStartCountdown(eventDate: Date, nowMs = Date.now()): boolean {
	const ms = msUntilEventStart(eventDate, nowMs);
	return ms > 0 && ms <= EVENT_START_COUNTDOWN_THRESHOLD_MS;
}
