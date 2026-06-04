import type { SnapshotStatus } from "@/types/odds-monitor";

/**
 * Shared cell formatting for cross-venue BBO tables (2-way esports + 3-way FIFA).
 * Single source so both tables render identical "73¢" / "No shares" / best-ask
 * styling. See `EsportsVenueBooksPanel` (2 outcomes) and `ThreeWayVenueBooksPanel`
 * (3 outcomes).
 */

export const MIN_VALID_PRICE = 0.005;
export const MAX_VALID_PRICE = 0.995;

export function isLimitlessVenueRow(venueId?: string): boolean {
	return String(venueId ?? "").toLowerCase() === "limitless";
}

/** Display text for a single outcome ask cell. */
export function formatAskCell(
	linked: boolean,
	prob: number | null,
	status: SnapshotStatus | undefined,
	venueId: string | undefined,
	formatProbDisplay: (p: number) => string,
): string {
	if (!linked) return "—";
	if (prob !== null && prob >= MIN_VALID_PRICE && prob <= MAX_VALID_PRICE) {
		return formatProbDisplay(prob);
	}
	if (prob !== null || status === "no_liquidity") return "No shares";
	if (status === "awaiting_data") return "Connecting…";
	/** Limitless row is linked from matched-markets; empty book is “no offers”, not a broken UI. */
	if (isLimitlessVenueRow(venueId)) return "No shares";
	return "—";
}

/** CSS class for an ask cell (best / status / empty / numeric). */
export function askCellClass(
	linked: boolean,
	prob: number | null,
	status?: SnapshotStatus,
	isBest?: boolean,
	venueId?: string,
): string {
	const base = "esports-venue-books__td esports-venue-books__td--num";
	const limitlessLinkedNoQuote = isLimitlessVenueRow(venueId) && linked && prob === null && !status;
	if (!linked || (prob === null && !status && !limitlessLinkedNoQuote)) {
		return `${base} esports-venue-books__td--empty`;
	}
	const outOfRange = prob !== null && (prob < MIN_VALID_PRICE || prob > MAX_VALID_PRICE);
	if (
		outOfRange ||
		limitlessLinkedNoQuote ||
		(prob === null && (status === "no_liquidity" || status === "awaiting_data"))
	) {
		return `${base} esports-venue-books__td--status`;
	}
	if (isBest) {
		return `${base} esports-venue-books__td--best`;
	}
	return base;
}

/** Row indices at the numerically best (lowest) valid ask for a column accessor. */
export function indicesAtBestAsk<T>(rows: T[], getAsk: (row: T) => number | null): Set<number> {
	const ASK_BEST_EPS = 1e-10;
	let minP = Infinity;
	for (const r of rows) {
		const p = getAsk(r);
		if (p !== null && p >= MIN_VALID_PRICE && p <= MAX_VALID_PRICE) {
			minP = Math.min(minP, p);
		}
	}
	if (!Number.isFinite(minP)) return new Set();
	const out = new Set<number>();
	rows.forEach((r, i) => {
		const p = getAsk(r);
		if (
			p !== null &&
			p >= MIN_VALID_PRICE &&
			p <= MAX_VALID_PRICE &&
			Math.abs(p - minP) <= ASK_BEST_EPS
		) {
			out.add(i);
		}
	});
	return out;
}
