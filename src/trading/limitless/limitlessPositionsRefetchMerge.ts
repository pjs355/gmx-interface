import type { VenuePosition } from "@/types/trading/venuePosition";
import { canonicalLimitlessTokenId } from "./limitlessTokenId";

/**
 * Limitless venue positions are keyed by `canonicalLimitlessTokenId(tokenId)`.
 * The proxy `GET /api/limitless/portfolio/positions-venue` lags fills slightly;
 * floors keep the optimistic row visible until the partner endpoint catches up.
 *
 * Floors are stored per "session" (anonymous, since the Limitless query key
 * is fixed and not per-address). The single global key works because the
 * portfolio endpoint is always called for the authenticated user.
 */
const SESSION_KEY = "session" as const;

type FloorEntry = {
	minShares: number;
	expiresAt: number;
	snapshot: VenuePosition;
};

const floorRegistry = new Map<string, Map<string, FloorEntry>>();

const DEFAULT_FLOOR_TTL_MS = 120_000;

function pruneExpired(): void {
	const inner = floorRegistry.get(SESSION_KEY);
	if (!inner) return;
	const now = Date.now();
	for (const [k, e] of inner) {
		if (e.expiresAt <= now) inner.delete(k);
	}
	if (inner.size === 0) floorRegistry.delete(SESSION_KEY);
}

export function registerLimitlessShareFloorFromRow(
	row: VenuePosition,
	ttlMs = DEFAULT_FLOOR_TTL_MS,
): void {
	const tok = canonicalLimitlessTokenId(row.tokenId);
	if (!tok || !(row.shares > 0)) return;

	let inner = floorRegistry.get(SESSION_KEY);
	if (!inner) {
		inner = new Map();
		floorRegistry.set(SESSION_KEY, inner);
	}
	const prev = inner.get(tok);
	const minShares = Math.max(prev?.minShares ?? 0, row.shares);
	inner.set(tok, {
		minShares,
		expiresAt: Date.now() + ttlMs,
		snapshot: { ...row, shares: minShares, tokenId: tok },
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

export function mergeLimitlessFetchWithFloors(
	server: VenuePosition[],
): VenuePosition[] {
	pruneExpired();
	const inner = floorRegistry.get(SESSION_KEY);
	if (!inner || inner.size === 0) return server;

	const out = server.map((r) => ({ ...r }));
	const indexByTok = new Map<string, number>();
	for (let i = 0; i < out.length; i++) {
		const r = out[i]!;
		if (r.venue !== "limitless") continue;
		indexByTok.set(canonicalLimitlessTokenId(r.tokenId), i);
	}

	for (const [tok, entry] of inner) {
		if (entry.expiresAt <= Date.now()) continue;

		const idx = indexByTok.get(tok);
		const serverShares = idx !== undefined ? out[idx]!.shares : 0;
		if (serverShares >= entry.minShares) {
			inner.delete(tok);
			continue;
		}

		if (idx !== undefined) {
			const row = out[idx]!;
			out[idx] = bumpRowShares(row, Math.max(row.shares, entry.minShares));
		} else {
			out.push(bumpRowShares(entry.snapshot, entry.minShares));
			indexByTok.set(tok, out.length - 1);
		}
	}

	if (inner.size === 0) floorRegistry.delete(SESSION_KEY);
	return out;
}

export function _resetLimitlessFloorRegistryForTesting(): void {
	floorRegistry.clear();
}
