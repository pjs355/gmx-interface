import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import { findOddsMatchedMarket } from "@/features/markets/odds-monitor/findOddsMatchedMarket";
import { listingBestYesNoFromMatched } from "@/features/markets/listing/listingVenuePrices";
import { mergeMonitorLimitlessFromUmbrella } from "@/features/markets/odds-monitor/mergeMonitorLimitlessFromUmbrella";
import { buildVenuePriceRows } from "@/features/markets/pricing/buildVenuePriceRows";
import { isValidProbPrice } from "@/features/markets/pricing/orderbookBbo";

/**
 * Match-level YES/NO best asks from OddsMonitor (`MatchedMarket` / venue-prices WS).
 * Used for calendar ordering and anywhere listing preview applied before.
 */
export function getListingYesNoPricesForUmbrella(
	umbrella: Umbrella,
	matchedMarkets: MatchedMarket[] | null | undefined,
): { yes: number | null; no: number | null } {
	const raw = (umbrella as { pandascore_matchId?: unknown }).pandascore_matchId;
	const panda = typeof raw === "string" ? raw.trim() : "";
	if (!panda) return { yes: null, no: null };
	const merged = mergeMonitorLimitlessFromUmbrella(
		findOddsMatchedMarket(matchedMarkets, panda, umbrella._id),
		umbrella.exchangeMatching?.limitless ?? null,
	);
	return listingBestYesNoFromMatched(merged);
}

/**
 * Home / all-markets listing: hide Panda fixtures with no cross-venue liquidity
 * (all linked venues would show "No shares", unlinked "—", or ~0¢/~100¢ settled lean).
 */
export function umbrellaHasListableCrossVenueOdds(
	umbrella: Umbrella,
	matchedMarkets: MatchedMarket[] | null | undefined,
): boolean {
	const raw = (umbrella as { pandascore_matchId?: unknown }).pandascore_matchId;
	const panda = typeof raw === "string" ? raw.trim() : "";
	if (!panda) return true;
	if (matchedMarkets == null) return true;

	const merged = mergeMonitorLimitlessFromUmbrella(
		findOddsMatchedMarket(matchedMarkets, panda, umbrella._id),
		umbrella.exchangeMatching?.limitless ?? null,
	);
	if (!merged) return true;

	const rows = buildVenuePriceRows(merged);
	const linkedRows = rows.filter((row) => row.linked);
	// No venue produced a listable row. Unlike the branches above (catalog still
	// loading / no monitor row yet), this is a PERMANENT priceless state: mapped
	// external venues (Polymarket/Limitless/Predict) always emit an all-null row,
	// so zero rows means the only routing is a LevelUp book that is empty or a
	// DFlow leg that finalized / never initialized. Such a card renders "Live" +
	// "--" and looks broken — hide it. It reappears automatically once a real book
	// exists (a live LevelUp book keeps its row via the adapter's shouldShowRow).
	if (linkedRows.length === 0) return false;

	const hasAnyPriceTick = linkedRows.some(
		(row) =>
			row.askA !== null ||
			row.askB !== null ||
			row.bidA !== null ||
			row.bidB !== null,
	);
	if (!hasAnyPriceTick) return true;

	let hasValidQuote = false;
	for (const row of linkedRows) {
		if (
			(row.askA !== null && isValidProbPrice(row.askA)) ||
			(row.askB !== null && isValidProbPrice(row.askB))
		) {
			hasValidQuote = true;
			break;
		}
	}
	if (!hasValidQuote) return false;

	const { yes, no } = listingBestYesNoFromMatched(merged);
	if (isDeemphasizedSettledLeanOdds(yes, no)) return false;

	return true;
}

/**
 * True when listing odds look "settled" for UX ordering (demote in live lists).
 *
 * Demotion rules (any of these → demote to the bottom of the live list):
 *  - Either side of the book is missing / non-finite. A one-sided book on a
 *    live esports match almost always means the match is over and the
 *    losing side has dried up — nobody wants to lay odds on the winner —
 *    so these are pushed to the bottom regardless of the surviving side's
 *    price (previously we only demoted the missing-side case when the
 *    other side was at the ~0¢ / ~99¢ extremes, which let visibly-dead
 *    markets sit at the top of Live whenever the lone remaining quote
 *    happened to be mid-range).
 *  - Both sides present but at extremes (100-0, 99-1, 0-0, 99-99…), which
 *    means the book has converged on a winner.
 */
export function isDeemphasizedSettledLeanOdds(
	yes: number | null | undefined,
	no: number | null | undefined,
): boolean {
	const yOk = yes !== undefined && yes !== null && Number.isFinite(yes);
	const nOk = no !== undefined && no !== null && Number.isFinite(no);

	// Either side missing → demote.
	if (!yOk || !nOk) return true;

	const y = Math.round(Math.max(0, Math.min(1, Number(yes))) * 100);
	const n = Math.round(Math.max(0, Math.min(1, Number(no))) * 100);

	// One side ~100¢, other ~0¢ (100-0, 99-1, 99-0, inverses, etc.)
	if ((y >= 99 && n <= 1) || (n >= 99 && y <= 1)) return true;

	// Both at or under 1¢ (0-0, 1-1, 0-1, 1-0)
	if (y <= 1 && n <= 1) return true;

	// Both very high (99-99, 100-100 style)
	if (y >= 98 && n >= 98) return true;

	return false;
}
