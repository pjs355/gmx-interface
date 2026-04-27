import type { Umbrella } from "@/services/api/umbrellaDataService";

/** Polymarket CTF condition id: `0x` + 64 hex chars (66 total). */
export function isPolymarketConditionIdShape(id: string): boolean {
	return /^0x[0-9a-fA-F]{64}$/i.test(id.trim());
}

/** Map key for conditionId lookups (lowercase hex for standard Polymarket ids). */
export function polymarketConditionLookupKey(
	id: string | undefined | null,
): string {
	const t = (id ?? "").trim();
	if (!t) return "";
	if (isPolymarketConditionIdShape(t)) return t.toLowerCase();
	return t;
}

/**
 * Canonical Poly condition id for API `clientKey` / `conditionId` body (matches server Mongo lookup):
 * `0x` + 64 lowercase hex, or bare 64 hex normalized to `0x` + lower.
 */
export function polymarketConditionIdForResolveWire(raw: string): string {
	const t = raw.trim();
	if (!t) return "";
	const lower = t.toLowerCase();
	if (/^0x[0-9a-f]{64}$/.test(lower)) return lower;
	if (/^[0-9a-f]{64}$/.test(lower)) return `0x${lower}`;
	return lower;
}

/**
 * Umbrella → Polymarket market: index child `conditionId` / hex `marketId` and
 * `exchangeMatching.polymarket.conditionId` (often present when children omit Poly ids).
 */
export function buildUmbrellaLookupByPolymarketConditionId(
	umbrellas: Umbrella[],
): Map<string, Umbrella> {
	const map = new Map<string, Umbrella>();
	for (const umb of umbrellas) {
		const allChildren =
			(umb as { originalChildren?: typeof umb.children; children?: typeof umb.children })
				.originalChildren ?? umb.children ?? [];
		for (const child of allChildren as Array<{ conditionId?: string; marketId?: string }>) {
			if (child.conditionId) {
				const k = polymarketConditionLookupKey(child.conditionId);
				if (k) map.set(k, umb);
			}
			if (child.marketId) {
				const mid = String(child.marketId).trim();
				if (mid) {
					const k = polymarketConditionLookupKey(mid);
					if (k) map.set(k, umb);
				}
			}
		}
		const exPoly = (
			umb.exchangeMatching?.polymarket as { conditionId?: string } | undefined
		)?.conditionId;
		if (typeof exPoly === "string" && exPoly.trim()) {
			const k = polymarketConditionLookupKey(exPoly);
			if (k) map.set(k, umb);
		}
	}
	return map;
}
