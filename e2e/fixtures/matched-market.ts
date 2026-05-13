import { PREDICTIONS_API_URL } from "../playwright.config";
import {
	MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD,
	smallestRoundTripLossUsdForSnapshot,
	type VenuePriceSnapshotLite,
} from "./e2e-venue-book-depth";

export type RequiredVenueKey =
	| "polymarket"
	| "levelup"
	| "predictFun"
	| "limitless"
	| "dflow";

export const REQUIRED_VENUE_KEYS: RequiredVenueKey[] = [
	"polymarket",
	"levelup",
	"predictFun",
	"limitless",
	"dflow",
];

/** Slug on `VenuePriceSnapshot.venue` from predictions-api venue-prices store. */
const EXCHANGE_KEY_TO_VENUE_SLUG: Record<RequiredVenueKey, string> = {
	polymarket: "polymarket",
	levelup: "levelup",
	predictFun: "predictfun",
	limitless: "limitless",
	dflow: "dflow",
};

/** Tightest live bid–ask (probability space). Used by spread-cap preflight warnings only (`00-spread-cap.spec.ts`). */
export const MAX_E2E_VENUE_SPREAD_USD = 0.25;

/**
 * Playwright trade size. Keep **≥** app `SOR_MIN_MARKET_BUY_USD` (`src/trading/sor/sorPreflight.ts`, currently $2).
 */
export const E2E_TRADE_NOTIONAL_USD = 2;

export type E2eTradingVenueSlug =
	| "polymarket"
	| "levelup"
	| "predictfun"
	| "limitless"
	| "dflow";

export function tradingVenueSlugForKey(
	key: RequiredVenueKey,
): E2eTradingVenueSlug {
	const s = EXCHANGE_KEY_TO_VENUE_SLUG[key];
	return s as E2eTradingVenueSlug;
}

export interface ExchangeMatching {
	matchedAt?: number;
	matchConfidence?: number;
	matchMethod?: string;
	polymarket?: {
		conditionId: string;
		slug?: string;
		tokenIdA: string;
		tokenIdB: string;
		negRisk: boolean;
		tickSize: string;
	};
	dflow?: {
		tickerA: string;
		tickerB?: string;
		eventTicker: string;
		yesMintA?: string;
		yesMintB?: string;
		accountsInitializedA?: boolean;
		accountsInitializedB?: boolean;
	};
	predictFun?: {
		marketIdA?: string;
		marketIdB?: string;
		tokenIdA?: string;
		tokenIdB?: string;
		decimalPrecision: number;
		singleMarket?: boolean;
	};
	limitless?: {
		slug: string;
		tokenIdA: string;
		tokenIdB: string;
		orderbookSlugA?: string;
		orderbookSlugB?: string;
	};
	levelup?: {
		questionId: string;
		conditionId?: string;
		tokenIdA: string;
		tokenIdB: string;
		negRisk: boolean;
		tickSize: string;
	};
}

export interface MatchedMarketRow {
	pandaMatchId: string;
	umbrellaId: string;
	displayName: string;
	game?: string;
	status?: string;
	eventDate?: string;
	pandaTeamA?: string;
	pandaTeamB?: string;
	teamMappings?: unknown[];
	exchangeMatching: ExchangeMatching;
}

interface VenueTeam {
	bestBid: number | null;
	bestAsk: number | null;
	indicativeMid?: number | null;
	bids?: { price: number; size: number }[];
	asks?: { price: number; size: number }[];
	totalBidLiquidity?: number;
	totalAskLiquidity?: number;
}

interface VenuePriceSnapshot {
	pandaMatchId: string;
	venue: string;
	teamA: VenueTeam;
	teamB: VenueTeam;
	status?: string;
}

function missingVenues(row: MatchedMarketRow): RequiredVenueKey[] {
	return REQUIRED_VENUE_KEYS.filter(
		(key) => row.exchangeMatching[key] === undefined,
	);
}

export function hasFutureEventDate(row: MatchedMarketRow): boolean {
	if (row.eventDate === undefined) return false;
	const t = Date.parse(row.eventDate);
	if (!Number.isFinite(t)) return false;
	return t > Date.now();
}

export async function fetchMatchedMarkets(
	apiBaseUrl: string = PREDICTIONS_API_URL,
): Promise<MatchedMarketRow[]> {
	const base = apiBaseUrl.replace(/\/$/, "");
	const url = `${base}/matched-markets`;
	const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
	if (!res.ok) {
		throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`);
	}
	const body = (await res.json()) as unknown;
	if (!Array.isArray(body)) {
		throw new Error(`GET ${url} did not return an array; got ${typeof body}`);
	}
	return body as MatchedMarketRow[];
}

async function fetchVenueSnapshots(
	apiBaseUrl: string,
	pandaMatchId: string,
): Promise<VenuePriceSnapshot[]> {
	const base = apiBaseUrl.replace(/\/$/, "");
	const url = `${base}/venue-prices/${encodeURIComponent(pandaMatchId)}`;
	const res = await fetch(url, { signal: AbortSignal.timeout(25_000) });
	if (!res.ok) {
		throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`);
	}
	const body = (await res.json()) as unknown;
	if (!Array.isArray(body)) {
		throw new Error(`GET ${url} expected array; got ${typeof body}`);
	}
	return body as VenuePriceSnapshot[];
}

export function createVenueSnapshotGetter(
	apiBaseUrl: string,
): (panda: string) => Promise<VenuePriceSnapshot[]> {
	const cache = new Map<string, VenuePriceSnapshot[]>();
	return async (panda: string): Promise<VenuePriceSnapshot[]> => {
		const id = panda?.trim();
		if (!id) {
			return [];
		}
		const hit = cache.get(id);
		if (hit) {
			return hit;
		}
		try {
			const sn = await fetchVenueSnapshots(apiBaseUrl, id);
			cache.set(id, sn);
			return sn;
		} catch (err) {
			console.error("error", err);
			cache.set(id, []);
			return [];
		}
	};
}

/** When venue-prices has no computable LevelUp tightest spread pick a row aligned with anchors; liquidity still gates on executable depth (`e2e-venue-book-depth.ts`). */
const LEVELUP_SYNTHETIC_SPREAD_WHEN_NO_VENUE_PRICES_BOOK = 0.1;

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

function findVenueSnapshot(
	snaps: VenuePriceSnapshot[],
	slug: string,
): VenuePriceSnapshot | undefined {
	const want = slug.toLowerCase();
	return snaps.find((s) => String(s.venue ?? "").toLowerCase() === want);
}

function teamSpread(team: VenueTeam): number | null {
	const bid = jsonFiniteNumber(team.bestBid);
	const ask = jsonFiniteNumber(team.bestAsk);
	if (bid === null || ask === null) {
		return null;
	}
	const s = ask - bid;
	if (s < -1e-6 || s > 1 + 1e-6) {
		return null;
	}
	return s;
}

function snapshotTightestSpread(snap: VenuePriceSnapshot): number | null {
	if (snap.status && String(snap.status).toLowerCase() !== "live") {
		return null;
	}
	const a = teamSpread(snap.teamA);
	const b = teamSpread(snap.teamB);
	const vals = [a, b].filter((x): x is number => x !== null);
	if (vals.length === 0) {
		return null;
	}
	return Math.min(...vals);
}

function spreadForVenueOnRow(
	row: MatchedMarketRow,
	key: RequiredVenueKey,
	snaps: VenuePriceSnapshot[],
): number | null {
	if (row.exchangeMatching[key] === undefined) {
		return null;
	}
	const slug = EXCHANGE_KEY_TO_VENUE_SLUG[key];
	const snap = findVenueSnapshot(snaps, slug);
	return snap ? snapshotTightestSpread(snap) : null;
}

interface BottleneckLiveBooks {
	maxSpread: number;
	liveVenueCount: number;
}

function bottleneckAmongLiveBooks(
	row: MatchedMarketRow,
	snaps: VenuePriceSnapshot[],
): BottleneckLiveBooks {
	const spreads: number[] = [];
	for (const key of REQUIRED_VENUE_KEYS) {
		if (row.exchangeMatching[key] === undefined) {
			return { maxSpread: Number.POSITIVE_INFINITY, liveVenueCount: 0 };
		}
		const sp = spreadForVenueOnRow(row, key, snaps);
		if (sp !== null) {
			spreads.push(sp);
		}
	}
	if (spreads.length === 0) {
		return { maxSpread: Number.POSITIVE_INFINITY, liveVenueCount: 0 };
	}
	return {
		maxSpread: Math.max(...spreads),
		liveVenueCount: spreads.length,
	};
}

function eventTime(row: MatchedMarketRow): number {
	if (row.eventDate === undefined) {
		return Number.POSITIVE_INFINITY;
	}
	const t = Date.parse(row.eventDate);
	return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function isBetterAllFiveCandidate(
	next: BottleneckLiveBooks,
	nextEvent: number,
	nextUmbrellaId: string,
	cur: BottleneckLiveBooks,
	curEvent: number,
	curUmbrellaId: string,
): boolean {
	if (next.liveVenueCount !== cur.liveVenueCount) {
		return next.liveVenueCount > cur.liveVenueCount;
	}
	if (next.maxSpread !== cur.maxSpread) {
		return next.maxSpread < cur.maxSpread;
	}
	if (nextEvent !== curEvent) {
		return nextEvent < curEvent;
	}
	return nextUmbrellaId < curUmbrellaId;
}

export interface PerVenueBestPick {
	venueKey: RequiredVenueKey;
	umbrellaId: string;
	pandaMatchId: string;
	spread: number;
	displayName: string;
	pandaTeamA?: string;
	pandaTeamB?: string;
}

/**
 * Split API picks by an operator-defined venue list (e.g. full-venue-cycle `REQUESTED_VENUES`).
 * `withBook` preserves first-seen order from `requested`; duplicates in `requested` are ignored.
 */
export function partitionRequestedVenuePicks(
	requested: readonly RequiredVenueKey[],
	picks: readonly PerVenueBestPick[],
): { withBook: PerVenueBestPick[]; missingBook: RequiredVenueKey[] } {
	const pickByKey = new Map(picks.map((p) => [p.venueKey, p]));
	const seen = new Set<RequiredVenueKey>();
	const missingBook: RequiredVenueKey[] = [];
	const withBook: PerVenueBestPick[] = [];
	for (const key of requested) {
		if (seen.has(key)) {
			continue;
		}
		seen.add(key);
		const p = pickByKey.get(key);
		if (p === undefined) {
			missingBook.push(key);
		} else {
			withBook.push(p);
		}
	}
	return { withBook, missingBook };
}

export async function computePerVenueBestPicks(
	future: MatchedMarketRow[],
	getSnaps: (panda: string) => Promise<VenuePriceSnapshot[]>,
): Promise<PerVenueBestPick[]> {
	const picks: PerVenueBestPick[] = [];
	for (const key of REQUIRED_VENUE_KEYS) {
		let best: { sp: number; row: MatchedMarketRow } | null = null;
		for (const row of future) {
			if (row.exchangeMatching[key] === undefined) {
				continue;
			}
			const snaps = await getSnaps(row.pandaMatchId);
			const slug = EXCHANGE_KEY_TO_VENUE_SLUG[key];
			const snap = findVenueSnapshot(snaps, slug);
			if (!snap) {
				continue;
			}
			const lossProbe = smallestRoundTripLossUsdForSnapshot(
				snap as unknown as VenuePriceSnapshotLite,
				E2E_TRADE_NOTIONAL_USD,
			);
			if (
				lossProbe === null ||
				lossProbe > MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD
			) {
				continue;
			}
			const sp = spreadForVenueOnRow(row, key, snaps);
			if (sp === null || !Number.isFinite(sp)) {
				continue;
			}
			if (
				best === null ||
				sp < best.sp ||
				(sp === best.sp && eventTime(row) < eventTime(best.row)) ||
				(sp === best.sp &&
					eventTime(row) === eventTime(best.row) &&
					row.umbrellaId < best.row.umbrellaId)
			) {
				best = { sp, row };
			}
		}
		if (best !== null) {
			const r = best.row;
			picks.push({
				venueKey: key,
				umbrellaId: String(r.umbrellaId),
				pandaMatchId: String(r.pandaMatchId),
				spread: best.sp,
				displayName: r.displayName,
				pandaTeamA: r.pandaTeamA,
				pandaTeamB: r.pandaTeamB,
			});
			continue;
		}

		// LevelUp: matched-markets often lists `exchangeMatching.levelup` before venue-prices
		// has a live bid/ask row (ingest / linking lag). Without a pick, per-venue E2E dies in
		// `partitionRequestedVenuePicks` before any browser work. Fall back to an upcoming row
		// that still has LevelUp matching metadata so the suite can run.
		//
		// Prefer pandas where `GET /venue-prices` actually includes a `venue` row for LevelUp
		// (even when bid/ask are missing so spread is null) over rows where the feed omits
		// LevelUp entirely — better odds the trade box still gets a quote.
		if (key === "levelup") {
			const candidates = future.filter(
				(r) => r.exchangeMatching.levelup !== undefined,
			);

			function rowForPanda(panda: string): MatchedMarketRow | null {
				const hit = candidates.find((r) => String(r.pandaMatchId) === panda);
				return hit ?? null;
			}

			let fallbackRow: MatchedMarketRow | null = null;

			// Prefer the same sports match as another venue that already had a live book in
			// venue-prices — LevelUp liquidity is much more likely there than on an arbitrary
			// LevelUp-only umbrella when the feed omits bid/ask for LevelUp.
			const anchorOrder: RequiredVenueKey[] = [
				"polymarket",
				"predictFun",
				"dflow",
			];
			for (const anchorKey of anchorOrder) {
				const anchor = picks.find((p) => p.venueKey === anchorKey);
				if (!anchor) continue;
				const hit = rowForPanda(anchor.pandaMatchId);
				if (hit) {
					fallbackRow = hit;
					console.warn(
						`[matched-market] levelup: aligning synthetic pick with ${anchorKey} ` +
							`umbrella (panda ${anchor.pandaMatchId}) — shared match row.`,
					);
					break;
				}
			}

			if (fallbackRow === null) {
				type Scored = { score: number; row: MatchedMarketRow };
				let bestFb: Scored | null = null;
				for (const row of candidates) {
					const snaps = await getSnaps(row.pandaMatchId);
					const snap = findVenueSnapshot(
						snaps,
						EXCHANGE_KEY_TO_VENUE_SLUG.levelup,
					);
					const score = snap ? 1 : 0;
					const t = eventTime(row);
					if (
						bestFb === null ||
						score > bestFb.score ||
						(score === bestFb.score && t < eventTime(bestFb.row)) ||
						(score === bestFb.score &&
							t === eventTime(bestFb.row) &&
							String(row.umbrellaId) < String(bestFb.row.umbrellaId))
					) {
						bestFb = { score, row };
					}
				}
				fallbackRow = bestFb?.row ?? null;
			}

			if (fallbackRow !== null) {
				const fr = fallbackRow;
				const fbSnaps = await getSnaps(fr.pandaMatchId);
				const luSnap = findVenueSnapshot(
					fbSnaps,
					EXCHANGE_KEY_TO_VENUE_SLUG.levelup,
				);
				if (luSnap) {
					const lossProbe = smallestRoundTripLossUsdForSnapshot(
						luSnap as unknown as VenuePriceSnapshotLite,
						E2E_TRADE_NOTIONAL_USD,
					);
					if (
						lossProbe !== null &&
						lossProbe <= MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD
					) {
						const sp =
							LEVELUP_SYNTHETIC_SPREAD_WHEN_NO_VENUE_PRICES_BOOK;
						console.warn(
							`[matched-market] levelup: no computable venue-prices tightest spread — using synthetic spread=${sp} ` +
								`for logging only; depth gate passed (umbrella ${fr.umbrellaId}, panda ${fr.pandaMatchId}).`,
						);
						picks.push({
							venueKey: "levelup",
							umbrellaId: String(fr.umbrellaId),
							pandaMatchId: String(fr.pandaMatchId),
							spread: sp,
							displayName: fr.displayName,
							pandaTeamA: fr.pandaTeamA,
							pandaTeamB: fr.pandaTeamB,
						});
					}
				}
			}
		}
	}
	return picks;
}

/** Warn-only: per-venue trade cycle may skip venues with wide top-of-book spread when ladders are absent (see `e2e-venue-liquidity-at-test.ts` for the live gate). */
export function warnPerVenueSpreadsAboveE2eCap(picks: readonly PerVenueBestPick[]): void {
	for (const p of picks) {
		if (p.spread + 1e-9 >= MAX_E2E_VENUE_SPREAD_USD) {
			console.warn(
				`[e2e spread cap] ${p.venueKey} best tightest spread is ${p.spread.toFixed(4)} ` +
					`(umbrella ${p.umbrellaId}, panda ${p.pandaMatchId}) — ≥ ${MAX_E2E_VENUE_SPREAD_USD} when no depth; ` +
					`per-venue block may skip on fresh read.`,
			);
		}
	}
}

export async function resolvePerVenueBestPicks(
	apiBaseUrl: string = PREDICTIONS_API_URL,
): Promise<PerVenueBestPick[]> {
	const all = await fetchMatchedMarkets(apiBaseUrl);
	const future = all.filter(hasFutureEventDate);
	const getSnaps = createVenueSnapshotGetter(apiBaseUrl);
	const picks = await computePerVenueBestPicks(future, getSnaps);
	return picks;
}

export interface AllVenuesResolution {
	chosen: MatchedMarketRow;
	totalCandidates: number;
}

export async function resolveAllVenuesUmbrella(
	apiBaseUrl: string = PREDICTIONS_API_URL,
): Promise<AllVenuesResolution> {
	const all = await fetchMatchedMarkets(apiBaseUrl);
	const future = all.filter(hasFutureEventDate);
	const getSnaps = createVenueSnapshotGetter(apiBaseUrl);
	const perVenuePicks = await computePerVenueBestPicks(future, getSnaps);

	const allFive = future.filter((row) => missingVenues(row).length === 0);

	if (allFive.length > 0) {
		let chosen: MatchedMarketRow | undefined;
		let bestBottle: BottleneckLiveBooks | undefined;

		for (const row of allFive) {
			const snaps = await getSnaps(row.pandaMatchId);
			const b = bottleneckAmongLiveBooks(row, snaps);
			const t = eventTime(row);
			if (
				chosen === undefined ||
				bestBottle === undefined ||
				isBetterAllFiveCandidate(b, t, row.umbrellaId, bestBottle, eventTime(chosen), chosen.umbrellaId)
			) {
				chosen = row;
				bestBottle = b;
			}
		}

		if (
			chosen === undefined ||
			bestBottle === undefined ||
			bestBottle.liveVenueCount === 0 ||
			!Number.isFinite(bestBottle.maxSpread)
		) {
			chosen = [...allFive].sort((a, b) => eventTime(a) - eventTime(b))[0];
			const fbSnaps = await getSnaps(chosen.pandaMatchId);
			bestBottle = bottleneckAmongLiveBooks(chosen, fbSnaps);
			console.log(
				`[matched-market] no comparable live books among all-5 candidates; ` +
					`falling back to earliest event among ${allFive.length} umbrellas.`,
			);
		}

		console.log(
			`[matched-market] picked umbrella ${chosen.umbrellaId} (${chosen.displayName}); ` +
				`event ${chosen.eventDate}; ${allFive.length} all-5 candidates; ` +
				`bookScore=max among live venues=${Number.isFinite(bestBottle.maxSpread) ? bestBottle.maxSpread.toFixed(4) : "∞"} ` +
				`(${bestBottle.liveVenueCount}/5 venues had live bid/ask).`,
		);

		return { chosen, totalCandidates: allFive.length };
	}

	const ranked = future
		.map((row) => ({
			row,
			missing: missingVenues(row),
		}))
		.sort((a, b) => a.missing.length - b.missing.length)
		.slice(0, 5);

	const lines = [
		"No upcoming Umbrella has all 5 venues populated.",
		`Searched ${all.length} matched markets; ${future.length} are upcoming.`,
		"Top 5 candidates by venue coverage (fewest missing first):",
	];
	for (const entry of ranked) {
		lines.push(
			`  - ${entry.row.displayName} (${entry.row.umbrellaId}) event=${entry.row.eventDate}; missing: ${entry.missing.join(", ") || "(none)"}`,
		);
	}
	console.error("error", lines.join("\n"));
	throw new Error(lines.join(" | "));
}
