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

