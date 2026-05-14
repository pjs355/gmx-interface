import { PREDICTIONS_API_URL } from "../playwright.config";
import {
	E2E_TRADE_NOTIONAL_USD,
	tradingVenueSlugForKey,
	type RequiredVenueKey,
} from "./matched-market";
import {
	smallestRoundTripLossUsdForSnapshot,
	type VenuePriceSnapshotLite,
	MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD,
} from "./e2e-venue-book-depth";

/**
 * Immediately before trading each venue, GET `/venue-prices/:panda` and require **executable**
 * clip depth for {@link E2E_TRADE_NOTIONAL_USD}: full simulated buy→sell loop on ladders or,
 * only when nowhere on the snapshot has ladders, best-ask/best-bid **`totalAskLiquidity` /
 * `totalBidLiquidity`** (TOB totals). Thin top-of-book without sizes is rejected.
 *
 * Spread-only fallback was removed — it drove “quotes” without fillable contracts.
 */

export { MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD };

interface VenuePriceSnapshotRaw {
	venue: string;
	teamA: VenuePriceSnapshotLite["teamA"];
	teamB: VenuePriceSnapshotLite["teamB"];
	status?: string;
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
	/** Legacy field from pick bookkeeping; retained for log lines only. */
	spreadAtPickTime: number;
	apiBaseUrl?: string;
}): Promise<E2eVenueLiquidityGate> {
	const base = (args.apiBaseUrl ?? PREDICTIONS_API_URL).replace(/\/$/, "");
	const url = `${base}/venue-prices/${encodeURIComponent(args.pandaMatchId)}`;
	let snaps: VenuePriceSnapshotRaw[];
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
		snaps = body as VenuePriceSnapshotRaw[];
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
	const snap = snaps.find((s) => String(s.venue ?? "").toLowerCase() === slug);
	if (!snap) {
		return {
			skip: true,
			reason: "no snapshot row for venue",
			warning:
				`[e2e liquidity] skipping ${args.venueKey}: no "${slug}" row in venue-prices for panda ${args.pandaMatchId}`,
		};
	}

	const n = E2E_TRADE_NOTIONAL_USD;
	const snapLite = snap as VenuePriceSnapshotLite;

	const smallestLoss = smallestRoundTripLossUsdForSnapshot(snapLite, n);
	if (smallestLoss === null) {
		const w =
			`[e2e liquidity] skipping ${args.venueKey}: insufficient depth — cannot simulate full $${n} buy + sell-through ` +
			`(ladders incomplete or missing TOB totalAskLiquidity/totalBidLiquidity pairs) — panda ${args.pandaMatchId}, spreadAtPick=${args.spreadAtPickTime.toFixed(4)}.`;
		return {
			skip: true,
			reason:
				"no executable ladder or TOB-total liquidity for configured notional",
			warning: w,
		};
	}

	if (smallestLoss + 1e-9 > MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD) {
		const w =
			`[e2e liquidity] skipping ${args.venueKey}: executable best-case round-trip loss ≈ $${smallestLoss.toFixed(2)} ` +
			`(>${MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD}) on fresh book — panda ${args.pandaMatchId}.`;
		return {
			skip: true,
			reason: `best-case round-trip loss ${smallestLoss.toFixed(2)} > ${MAX_E2E_ACCEPTABLE_SMALLEST_LOSS_USD}`,
			warning: w,
		};
	}

	return { skip: false, reason: "", warning: "" };
}
