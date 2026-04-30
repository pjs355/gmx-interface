import type { VenuePosition } from "@/types/trading/venuePosition";

/** Same normalization as {@link optimisticPolymarketPositionsCache} / polyPositionSide. */
export function normalizePolymarketPositionTokenId(
	tokenId: string | undefined | null,
): string {
	if (tokenId == null) return "";
	const s = String(tokenId).trim();
	if (!s) return "";
	try {
		return BigInt(s).toString();
	} catch {
		return s.toLowerCase();
	}
}

type FloorEntry = {
	minShares: number;
	expiresAt: number;
	/** Used when the API briefly omits the row after a fill */
	snapshot: VenuePosition;
};

/** Per Safe → outcome token → floor (until indexer catches up or TTL) */
const floorRegistry = new Map<string, Map<string, FloorEntry>>();

const DEFAULT_FLOOR_TTL_MS = 120_000;

function pruneExpiredForSafe(safeLower: string): void {
	const inner = floorRegistry.get(safeLower);
	if (!inner) return;
	const now = Date.now();
	for (const [tok, e] of inner) {
		if (e.expiresAt <= now) inner.delete(tok);
	}
	if (inner.size === 0) floorRegistry.delete(safeLower);
}

/**
 * After an optimistic merge (or client-known fill), register a minimum share count per token.
 * Polymarket Data API refetches often return stale rows and would overwrite React Query cache —
 * {@link mergePolymarketFetchWithFloors} applies these floors on every fetch result.
 */
export function registerPolymarketShareFloorFromRow(
	safeAddress: string,
	row: VenuePosition,
	ttlMs = DEFAULT_FLOOR_TTL_MS,
): void {
	const safe = safeAddress.trim().toLowerCase();
	const tok = normalizePolymarketPositionTokenId(row.tokenId);
	if (!safe || !tok || !(row.shares > 0)) return;

	let inner = floorRegistry.get(safe);
	if (!inner) {
		inner = new Map();
		floorRegistry.set(safe, inner);
	}
	const prev = inner.get(tok);
	const minShares = Math.max(prev?.minShares ?? 0, row.shares);
	const now = Date.now();
	inner.set(tok, {
		minShares,
		expiresAt: now + ttlMs,
		snapshot: { ...row, shares: minShares },
	});
}

function bumpRowShares(row: VenuePosition, newShares: number): VenuePosition {
	const avg = row.avgPrice;
	return {
		...row,
		shares: newShares,
		currentValue:
			avg != null && Number.isFinite(avg)
				? avg * newShares
				: row.currentValue,
	};
}

/**
 * Merge indexer/API response with pending floors so UI holdings do not disappear
 * when `invalidateQueries` refetches before Polymarket lists the new position.
 */
export function mergePolymarketFetchWithFloors(
	safeLower: string,
	server: VenuePosition[],
	previous: VenuePosition[] | undefined,
): VenuePosition[] {
	pruneExpiredForSafe(safeLower);
	const inner = floorRegistry.get(safeLower);
	if (!inner || inner.size === 0) return server;

	const out = server.map((r) => ({ ...r }));
	const indexByTok = new Map<string, number>();
	for (let i = 0; i < out.length; i++) {
		indexByTok.set(normalizePolymarketPositionTokenId(out[i]!.tokenId), i);
	}

	for (const [tok, entry] of inner) {
		if (entry.expiresAt <= Date.now()) continue;

		const idx = indexByTok.get(tok);
		const serverShares =
			idx !== undefined ? out[idx]!.shares : 0;

		if (serverShares >= entry.minShares) {
			inner.delete(tok);
			continue;
		}

		if (idx !== undefined) {
			const row = out[idx]!;
			out[idx] = bumpRowShares(row, Math.max(row.shares, entry.minShares));
		} else {
			const snap = entry.snapshot;
			out.push(bumpRowShares(snap, entry.minShares));
			indexByTok.set(tok, out.length - 1);
		}
	}

	if (inner.size === 0) floorRegistry.delete(safeLower);
	return out;
}
