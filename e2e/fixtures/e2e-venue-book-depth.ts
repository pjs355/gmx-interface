/**
 * Shared venue-prices book simulation for E2E. Used by liquidity pre-trade gate
 * and by {@link ../fixtures/matched-market} when choosing per-venue picks.
 *
 * Keeps parity: if this says a clip is not executable at `notionalUsd`, Playwright must not select that market.
 */

/** Best-case round-trip loss cap for the $2 clip (see `e2e-venue-liquidity-at-test.ts`). */
export const MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD = 0.25;

/**
 * Venue-prices snapshots use `status: "live"` when the ingester sees depth, and
 * `"no_liquidity"` in some feeds while bestBid/bestAsk totals are still populated.
 * E2E selection probes TOB / ladders either way; other explicit statuses stay blocked.
 */
export function venueSnapshotStatusAllowsBookProbe(
	status: string | undefined,
): boolean {
	if (status === undefined || String(status).trim() === "") {
		return true;
	}
	const s = String(status).toLowerCase();
	return s === "live" || s === "no_liquidity";
}

export type DepthLevelLite = {
	price: number;
	size: number;
};

export type VenueTeamBookLite = {
	bestBid: number | null;
	bestAsk: number | null;
	bids?: DepthLevelLite[];
	asks?: DepthLevelLite[];
	totalBidLiquidity?: number;
	totalAskLiquidity?: number;
};

export type VenuePriceSnapshotLite = {
	venue?: string;
	teamA: VenueTeamBookLite;
	teamB: VenueTeamBookLite;
	status?: string;
};

const DEPTH_EPS = 1e-12;
const BUDGET_LEFT_COMPLETE = 1e-6;

function sortDepthLevels(
	levels: DepthLevelLite[] | undefined,
	dir: "asc" | "desc",
): DepthLevelLite[] {
	if (!levels?.length) return [];
	return [...levels].sort((a, b) =>
		dir === "asc" ? a.price - b.price : b.price - a.price,
	);
}

export function simulateBuyNotionalUsd(
	asks: ReadonlyArray<DepthLevelLite>,
	usdBudget: number,
): { shares: number; complete: boolean } {
	let remaining = usdBudget;
	let shares = 0;
	for (const lvl of asks) {
		const p = lvl.price;
		const sz = lvl.size;
		if (!(p > DEPTH_EPS && p < 1 - DEPTH_EPS && sz > DEPTH_EPS)) {
			continue;
		}
		const maxCostHere = p * sz;
		if (maxCostHere <= remaining + DEPTH_EPS) {
			shares += sz;
			remaining -= maxCostHere;
		} else {
			const partial = remaining / p;
			shares += partial;
			remaining = 0;
			break;
		}
		if (remaining <= BUDGET_LEFT_COMPLETE) break;
	}
	return {
		shares,
		complete: remaining <= BUDGET_LEFT_COMPLETE,
	};
}

export function simulateSellShares(
	bids: ReadonlyArray<DepthLevelLite>,
	sharesToSell: number,
): { usd: number; complete: boolean } {
	let rem = sharesToSell;
	let usd = 0;
	for (const lvl of bids) {
		const p = lvl.price;
		const sz = lvl.size;
		if (!(p > DEPTH_EPS && p < 1 - DEPTH_EPS && sz > DEPTH_EPS)) {
			continue;
		}
		const take = Math.min(sz, rem);
		usd += take * p;
		rem -= take;
		if (rem <= DEPTH_EPS) {
			return { usd, complete: true };
		}
	}
	return { usd, complete: rem <= 1e-9 };
}

function jsonFiniteNumber(x: unknown): number | null {
	if (typeof x === "number" && Number.isFinite(x)) {
		return x;
	}
	if (typeof x === "string" && x.trim() !== "") {
		const n = Number(x);
		if (Number.isFinite(n)) return n;
	}
	return null;
}

function depthLevelsHaveLiquidity(
	levels: DepthLevelLite[] | undefined,
): boolean {
	if (!levels?.length) return false;
	return levels.some(
		(l) =>
			typeof l.price === "number" &&
			Number.isFinite(l.price) &&
			l.price > DEPTH_EPS &&
			l.price < 1 - DEPTH_EPS &&
			typeof l.size === "number" &&
			Number.isFinite(l.size) &&
			l.size > DEPTH_EPS,
	);
}

function teamHasNonemptyLadders(team: VenueTeamBookLite): boolean {
	return (
		depthLevelsHaveLiquidity(team.asks) &&
		depthLevelsHaveLiquidity(team.bids)
	);
}

function ladderRoundTripUsd(
	team: VenueTeamBookLite,
	notionalUsd: number,
): number | null {
	const asks = sortDepthLevels(team.asks, "asc");
	const bids = sortDepthLevels(team.bids, "desc");
	if (asks.length === 0 || bids.length === 0) {
		return null;
	}
	const buy = simulateBuyNotionalUsd(asks, notionalUsd);
	if (!buy.complete || buy.shares <= DEPTH_EPS) {
		return null;
	}
	const sell = simulateSellShares(bids, buy.shares);
	if (!sell.complete) {
		return null;
	}
	return sell.usd;
}

/** Best ask / best bid only, sizes from venue-prices totals (contracts at TOB). */
function tobTotalsRoundTripUsd(
	team: VenueTeamBookLite,
	notionalUsd: number,
): number | null {
	const ask = jsonFiniteNumber(team.bestAsk);
	const bid = jsonFiniteNumber(team.bestBid);
	const askSz = jsonFiniteNumber(team.totalAskLiquidity);
	const bidSz = jsonFiniteNumber(team.totalBidLiquidity);
	if (
		ask === null ||
		bid === null ||
		askSz === null ||
		bidSz === null ||
		askSz <= DEPTH_EPS ||
		bidSz <= DEPTH_EPS
	) {
		return null;
	}
	const buy = simulateBuyNotionalUsd(
		[{ price: ask, size: askSz }],
		notionalUsd,
	);
	if (!buy.complete || buy.shares <= DEPTH_EPS) return null;
	const sell = simulateSellShares(
		[{ price: bid, size: bidSz }],
		buy.shares,
	);
	if (!sell.complete) return null;
	return sell.usd;
}

function teamRoundTripSellbackUsdRobust(
	team: VenueTeamBookLite,
	notionalUsd: number,
	hasAnyVenueLadder: boolean,
): number | null {
	if (teamHasNonemptyLadders(team)) {
		return ladderRoundTripUsd(team, notionalUsd);
	}
	if (hasAnyVenueLadder) {
		/** Some venues publish bestBid/bestAsk while ladder rows are stale/empty — do not fall back to TOB totals in that band. */
		return null;
	}
	return tobTotalsRoundTripUsd(team, notionalUsd);
}

/**
 * Smallest achievable round-trip LOSS in USD vs `notionalUsd` if we pick the better of teamA vs teamB column,
 * where loss = notional - sellback(proceeds immediately selling bought shares against the ladder).
 *
 * Null when neither outcome column can absorb the full USD clip on asks and offload it on bids (executable depth).
 */
export function smallestRoundTripLossUsdForSnapshot(
	snap: VenuePriceSnapshotLite,
	notionalUsd: number,
): number | null {
	if (!venueSnapshotStatusAllowsBookProbe(snap.status)) {
		return null;
	}
	const teamALad = teamHasNonemptyLadders(snap.teamA);
	const teamBLad = teamHasNonemptyLadders(snap.teamB);
	const hasAnyVenueLadder = teamALad || teamBLad;

	const ra = teamRoundTripSellbackUsdRobust(
		snap.teamA,
		notionalUsd,
		hasAnyVenueLadder,
	);
	const rb = teamRoundTripSellbackUsdRobust(
		snap.teamB,
		notionalUsd,
		hasAnyVenueLadder,
	);
	const backs = [ra, rb].filter((x): x is number => x !== null && Number.isFinite(x));
	if (backs.length === 0) {
		return null;
	}
	const bestSellback = Math.max(...backs);
	return notionalUsd - bestSellback;
}
