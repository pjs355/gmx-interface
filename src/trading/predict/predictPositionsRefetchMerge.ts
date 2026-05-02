import type { VenuePosition } from "@/types/trading/venuePosition";

/**
 * Predict.fun positions: identity is `(numericMarketId, outcomeName)` — one
 * Predict market typically has Yes/No outcomes and the user's row is keyed by
 * the on-chain `outcome.onChainId` (`tokenId` after normalization). We key
 * floors on `numericMarketId|outcomeName` so the floor survives even if the
 * server's first refetch synthesises a slightly different `tokenId`.
 */
function floorKeyForPredict(
	numericMarketId: number,
	outcomeName: string,
): string {
	return `${numericMarketId}:${outcomeName.trim().toLowerCase()}`;
}

type FloorEntry = {
	minShares: number;
	expiresAt: number;
	/** Used when the API briefly omits the row after a fill */
	snapshot: VenuePosition;
};

const floorRegistry = new Map<string, Map<string, FloorEntry>>();

const DEFAULT_FLOOR_TTL_MS = 120_000;

function pruneExpiredForAddr(addrLower: string): void {
	const inner = floorRegistry.get(addrLower);
	if (!inner) return;
	const now = Date.now();
	for (const [k, e] of inner) {
		if (e.expiresAt <= now) inner.delete(k);
	}
	if (inner.size === 0) floorRegistry.delete(addrLower);
}

/**
 * After a Predict optimistic merge, register a per-(market, outcome) minimum
 * share count so the next indexer refetch cannot regress holdings.
 */
export function registerPredictShareFloorFromRow(
	addr: string,
	row: VenuePosition,
	ttlMs = DEFAULT_FLOOR_TTL_MS,
): void {
	const key = addr.trim().toLowerCase();
	const mid = row.numericMarketId;
	const out = (row.outcome ?? "").trim();
	if (!key || mid == null || !out || !(row.shares > 0)) return;
	const floorKey = floorKeyForPredict(mid, out);

	let inner = floorRegistry.get(key);
	if (!inner) {
		inner = new Map();
		floorRegistry.set(key, inner);
	}
	const prev = inner.get(floorKey);
	const minShares = Math.max(prev?.minShares ?? 0, row.shares);
	inner.set(floorKey, {
		minShares,
		expiresAt: Date.now() + ttlMs,
		snapshot: { ...row, shares: minShares },
	});
}

function bumpRowShares(row: VenuePosition, newShares: number): VenuePosition {
	const cur = row.currentPrice;
	return {
		...row,
		shares: newShares,
		currentValue:
			cur != null && Number.isFinite(cur)
				? cur * newShares
				: row.currentValue,
	};
}

/**
 * Merge server response with pending floors so UI holdings do not disappear
 * when a refetch lands before Predict's positions API reflects the fill.
 */
export function mergePredictFetchWithFloors(
	addrLower: string,
	server: VenuePosition[],
): VenuePosition[] {
	pruneExpiredForAddr(addrLower);
	const inner = floorRegistry.get(addrLower);
	if (!inner || inner.size === 0) return server;

	const out = server.map((r) => ({ ...r }));
	const indexByKey = new Map<string, number>();
	for (let i = 0; i < out.length; i++) {
		const r = out[i]!;
		if (r.venue !== "predictfun" || r.numericMarketId == null || !r.outcome) {
			continue;
		}
		indexByKey.set(floorKeyForPredict(r.numericMarketId, r.outcome), i);
	}

	for (const [key, entry] of inner) {
		if (entry.expiresAt <= Date.now()) continue;

		const idx = indexByKey.get(key);
		const serverShares = idx !== undefined ? out[idx]!.shares : 0;

		if (serverShares >= entry.minShares) {
			inner.delete(key);
			continue;
		}

		if (idx !== undefined) {
			const row = out[idx]!;
			out[idx] = bumpRowShares(row, Math.max(row.shares, entry.minShares));
		} else {
			out.push(bumpRowShares(entry.snapshot, entry.minShares));
			indexByKey.set(key, out.length - 1);
		}
	}

	if (inner.size === 0) floorRegistry.delete(addrLower);
	return out;
}

/** Test/util: forget all floors. */
export function _resetPredictFloorRegistryForTesting(): void {
	floorRegistry.clear();
}
