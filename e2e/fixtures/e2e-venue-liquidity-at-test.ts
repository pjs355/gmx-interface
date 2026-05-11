import { PREDICTIONS_API_URL } from "../playwright.config";
import {
	E2E_TRADE_NOTIONAL_USD,
	MAX_E2E_VENUE_SPREAD_USD,
	tradingVenueSlugForKey,
	type RequiredVenueKey,
} from "./matched-market";

/**
 * Right before trading each venue, call GET `/venue-prices/:panda` once (same
 * snapshots the WS-backed server already aggregates — no change to matched-markets).
 * If bid/ask ladders exist, estimate **best-case** round-trip loss on
 * `E2E_TRADE_NOTIONAL_USD` (smallest loss across the two outcome columns). If that
 * loss exceeds {@link MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD}, skip. If ladders are
 * missing, fall back to top-of-book tightest spread vs {@link MAX_E2E_VENUE_SPREAD_USD}.
 */

/** Skip when best-case synthetic loss exceeds this (e.g. 25¢ on a $2 clip). */
export const MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD = 0.25;

interface DepthLevel {
	price: number;
	size: number;
}

interface VenueTeamBook {
	bestBid: number | null;
	bestAsk: number | null;
	bids?: DepthLevel[];
	asks?: DepthLevel[];
}

interface VenuePriceSnapshot {
	venue: string;
	teamA: VenueTeamBook;
	teamB: VenueTeamBook;
	status?: string;
}

const DEPTH_EPS = 1e-12;
const BUDGET_LEFT_COMPLETE = 1e-6;

function sortDepthLevels(
	levels: DepthLevel[] | undefined,
	dir: "asc" | "desc",
): DepthLevel[] {
	if (!levels?.length) return [];
	return [...levels].sort((a, b) =>
		dir === "asc" ? a.price - b.price : b.price - a.price,
	);
}

function simulateBuyNotional(
	asks: ReadonlyArray<DepthLevel>,
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

function simulateSellShares(
	bids: ReadonlyArray<DepthLevel>,
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

function roundTripSellbackUsd(
	team: VenueTeamBook,
	notionalUsd: number,
): number | null {
	const asks = sortDepthLevels(team.asks, "asc");
	const bids = sortDepthLevels(team.bids, "desc");
	if (asks.length === 0 || bids.length === 0) {
		return null;
	}
	const buy = simulateBuyNotional(asks, notionalUsd);
	if (!buy.complete || buy.shares <= DEPTH_EPS) {
		return null;
	}
	const sell = simulateSellShares(bids, buy.shares);
	if (!sell.complete) {
		return null;
	}
	return sell.usd;
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

function teamSpread(team: VenueTeamBook): number | null {
	const bid = jsonFiniteNumber(team.bestBid);
	const ask = jsonFiniteNumber(team.bestAsk);
	if (bid === null || ask === null) return null;
	const s = ask - bid;
	if (s < -1e-6 || s > 1 + 1e-6) return null;
	return s;
}

function snapshotTightestSpread(snap: VenuePriceSnapshot): number | null {
	if (snap.status && String(snap.status).toLowerCase() !== "live") {
		return null;
	}
	const a = teamSpread(snap.teamA);
	const b = teamSpread(snap.teamB);
	const vals = [a, b].filter((x): x is number => x !== null);
	if (vals.length === 0) return null;
	return Math.min(...vals);
}

function findSnapshotForVenue(
	snaps: VenuePriceSnapshot[],
	slug: string,
): VenuePriceSnapshot | undefined {
	const want = slug.toLowerCase();
	return snaps.find((s) => String(s.venue ?? "").toLowerCase() === want);
}

export type E2eVenueLiquidityGate = {
	skip: boolean;
	reason: string;
	warning: string;
};

/**
 * Fresh HTTP read of the venue book for this panda only, immediately before the
 * venue's browser tests. Re-run for each venue in the suite so books are not
 * pre-baked at pick resolution time.
 */
export async function evaluateVenueLiquidityBeforeTrade(args: {
	venueKey: RequiredVenueKey;
	pandaMatchId: string;
	/** Tightest spread stored on the per-venue pick (from earlier matched-markets pass); used only if ladders are absent. */
	spreadAtPickTime: number;
	apiBaseUrl?: string;
}): Promise<E2eVenueLiquidityGate> {
	const base = (args.apiBaseUrl ?? PREDICTIONS_API_URL).replace(/\/$/, "");
	const url = `${base}/venue-prices/${encodeURIComponent(args.pandaMatchId)}`;
	let snaps: VenuePriceSnapshot[];
	try {
		const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
		if (!res.ok) {
			const w =
				`[e2e liquidity] skipping ${args.venueKey}: GET ${url} → ${res.status} ${res.statusText} ` +
				`(panda ${args.pandaMatchId}).`;
			return {
				skip: true,
				reason: `venue-prices HTTP ${res.status}`,
				warning: w,
			};
		}
		const body = (await res.json()) as unknown;
		if (!Array.isArray(body)) {
			return {
				skip: true,
				reason: "venue-prices response not an array",
				warning:
					`[e2e liquidity] skipping ${args.venueKey}: bad venue-prices body for panda ${args.pandaMatchId}`,
			};
		}
		snaps = body as VenuePriceSnapshot[];
	} catch (err) {
		console.error("error", err);
		return {
			skip: true,
			reason: "venue-prices fetch failed",
			warning:
				`[e2e liquidity] skipping ${args.venueKey}: fetch venue-prices failed for panda ${args.pandaMatchId}`,
		};
	}

	const slug = tradingVenueSlugForKey(args.venueKey);
	const snap = findSnapshotForVenue(snaps, slug);
	if (!snap) {
		return {
			skip: true,
			reason: "no snapshot row for venue",
			warning:
				`[e2e liquidity] skipping ${args.venueKey}: no "${slug}" row in venue-prices for panda ${args.pandaMatchId}`,
		};
	}

	const n = E2E_TRADE_NOTIONAL_USD;
	const ra = roundTripSellbackUsd(snap.teamA, n);
	const rb = roundTripSellbackUsd(snap.teamB, n);
	const sellbacks = [ra, rb].filter((x): x is number => x !== null);

	if (sellbacks.length > 0) {
		const bestSellback = Math.max(...sellbacks);
		const smallestLossUsd = n - bestSellback;
		if (smallestLossUsd + 1e-9 > MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD) {
			const w =
				`[e2e liquidity] skipping ${args.venueKey}: best-case ${n} round-trip loss ≈ $${smallestLossUsd.toFixed(2)} ` +
				`(>${MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD}) on fresh book — panda ${args.pandaMatchId}, umbrella pick spread was ${args.spreadAtPickTime.toFixed(4)}.`;
			return {
				skip: true,
				reason: `best-case round-trip loss ${smallestLossUsd.toFixed(2)} > ${MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD}`,
				warning: w,
			};
		}
		return {
			skip: false,
			reason: "",
			warning: "",
		};
	}

	const topSpread = snapshotTightestSpread(snap);
	if (topSpread === null) {
		return {
			skip: true,
			reason: "no depth and no top-of-book spread",
			warning:
				`[e2e liquidity] skipping ${args.venueKey}: no ladders and no spread for "${slug}" panda ${args.pandaMatchId}`,
		};
	}
	if (topSpread + 1e-9 >= MAX_E2E_VENUE_SPREAD_USD) {
		const w =
			`[e2e liquidity] skipping ${args.venueKey}: no order-book ladders; tightest top-of-book spread ${topSpread.toFixed(4)} ` +
			`≥ ${MAX_E2E_VENUE_SPREAD_USD} — panda ${args.pandaMatchId}.`;
		return {
			skip: true,
			reason: `spread fallback ${topSpread.toFixed(4)} ≥ ${MAX_E2E_VENUE_SPREAD_USD}`,
			warning: w,
		};
	}

	return { skip: false, reason: "", warning: "" };
}
