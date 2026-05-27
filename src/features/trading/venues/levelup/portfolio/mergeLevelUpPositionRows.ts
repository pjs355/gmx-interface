import type { VenuePosition } from "@/types/trading/venuePosition";

function levelUpRowKey(row: VenuePosition): string {
	return `${String(row.conditionId ?? "").trim()}:${String(row.outcome ?? "").trim()}`;
}

/**
 * Merge RPC-refreshed LevelUp rows into the positions query cache.
 * Rows with zero shares remove that outcome; untouched markets are preserved.
 */
export function mergeLevelUpPositionRows(
	existing: readonly VenuePosition[],
	fresh: readonly VenuePosition[],
): VenuePosition[] {
	const merged = new Map<string, VenuePosition>();

	for (const row of existing) {
		if (row.venue !== "levelup") continue;
		merged.set(levelUpRowKey(row), row);
	}

	for (const row of fresh) {
		if (row.venue !== "levelup") continue;
		const key = levelUpRowKey(row);
		if (!(row.shares > 0)) {
			merged.delete(key);
			continue;
		}
		merged.set(key, row);
	}

	return Array.from(merged.values());
}
