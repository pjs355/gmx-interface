/** Drop indexer-only seeds after this wall time even if balance RPC stays 0. */
const TTL_MS = 15 * 60 * 1000;

const pendingMintExpiry = new Map<string, number>();

function pruneExpired(now: number): void {
	for (const [mint, exp] of pendingMintExpiry) {
		if (exp <= now) pendingMintExpiry.delete(mint);
	}
}

/**
 * After a successful SOR DFlow fill, seed mints that may not appear in
 * `GET …/onchain-trades` yet so `useDflowPositions` still requests balances.
 */
export function registerPendingDflowOutcomeMints(mints: string[]): void {
	const exp = Date.now() + TTL_MS;
	const now = Date.now();
	for (const raw of mints) {
		const m = raw.trim();
		if (!m) continue;
		pendingMintExpiry.set(m, exp);
	}
	pruneExpired(now);
}

/** Union into mint candidates before `expandDflowMintsWithCoListedLegs`. */
export function getPendingDflowOutcomeMintsForMerge(): string[] {
	const now = Date.now();
	pruneExpired(now);
	return [...pendingMintExpiry.keys()];
}

/** Call when `postDflowTokenBalances` reports a positive balance for this mint. */
export function acknowledgeDflowOutcomeMintBalanceSeen(mint: string): void {
	const k = mint.trim();
	if (!k) return;
	pendingMintExpiry.delete(k);
}
