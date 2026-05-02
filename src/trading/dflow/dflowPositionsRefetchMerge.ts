import type { VenuePosition } from "@/types/trading/venuePosition";

/**
 * DFlow / Kalshi positions are uniquely identified by Solana outcome **mint**
 * (`tokenId` in our `VenuePosition`). After SOR Token-2022 swaps, on-chain
 * balances are immediately correct, but our `useDflowPositions` queryFn does
 * a multi-step fetch (trades → outcome filter → token balances → markets) that
 * can briefly return an empty list. Floors keep the optimistic row visible
 * until either the queryFn returns the post-trade row or the TTL elapses.
 */
function normalizeMint(mint: string | undefined | null): string {
	return (mint ?? "").trim();
}

type FloorEntry = {
	minShares: number;
	expiresAt: number;
	snapshot: VenuePosition;
};

const floorRegistry = new Map<string, Map<string, FloorEntry>>();

const DEFAULT_FLOOR_TTL_MS = 120_000;

function pruneExpiredForOwner(ownerKey: string): void {
	const inner = floorRegistry.get(ownerKey);
	if (!inner) return;
	const now = Date.now();
	for (const [k, e] of inner) {
		if (e.expiresAt <= now) inner.delete(k);
	}
	if (inner.size === 0) floorRegistry.delete(ownerKey);
}

export function registerDflowShareFloorFromRow(
	solanaAddress: string,
	row: VenuePosition,
	ttlMs = DEFAULT_FLOOR_TTL_MS,
): void {
	const owner = solanaAddress.trim();
	const mint = normalizeMint(row.tokenId);
	if (!owner || !mint || !(row.shares > 0)) return;

	let inner = floorRegistry.get(owner);
	if (!inner) {
		inner = new Map();
		floorRegistry.set(owner, inner);
	}
	const prev = inner.get(mint);
	const minShares = Math.max(prev?.minShares ?? 0, row.shares);
	inner.set(mint, {
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

export function mergeDflowFetchWithFloors(
	ownerKey: string,
	server: VenuePosition[],
): VenuePosition[] {
	pruneExpiredForOwner(ownerKey);
	const inner = floorRegistry.get(ownerKey);
	if (!inner || inner.size === 0) return server;

	const out = server.map((r) => ({ ...r }));
	const indexByMint = new Map<string, number>();
	for (let i = 0; i < out.length; i++) {
		const r = out[i]!;
		if (r.venue !== "dflow") continue;
		indexByMint.set(normalizeMint(r.tokenId), i);
	}

	for (const [mint, entry] of inner) {
		if (entry.expiresAt <= Date.now()) continue;

		const idx = indexByMint.get(mint);
		const serverShares = idx !== undefined ? out[idx]!.shares : 0;
		if (serverShares >= entry.minShares) {
			inner.delete(mint);
			continue;
		}

		if (idx !== undefined) {
			const row = out[idx]!;
			out[idx] = bumpRowShares(row, Math.max(row.shares, entry.minShares));
		} else {
			out.push(bumpRowShares(entry.snapshot, entry.minShares));
			indexByMint.set(mint, out.length - 1);
		}
	}

	if (inner.size === 0) floorRegistry.delete(ownerKey);
	return out;
}

export function _resetDflowFloorRegistryForTesting(): void {
	floorRegistry.clear();
}
