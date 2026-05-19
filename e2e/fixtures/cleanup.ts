import {
	Tradebox,
	tradeboxRootLocator,
	type TradingVenue,
	type Position,
} from "../page-objects/tradebox";
import { type Page } from "@playwright/test";

/** Default when callers omit `venues`: sweep every venue the smart-routing rows expose. */
const DEFAULT_VENUES_TO_SWEEP: TradingVenue[] = [
	"levelup",
	"polymarket",
	"predictfun",
	"limitless",
	"dflow",
];

/**
 * Optionally restrict which venues to open (e.g. match `REQUESTED_VENUES` in
 * `per-venue-trade-cycle.spec.ts`). Pass a non-empty list; otherwise all defaults run.
 */
export async function cleanupOpenPositions(
	page: Page,
	venues?: readonly TradingVenue[],
): Promise<void> {
	const tradebox = new Tradebox(page);
	const tradeboxVisible = await tradeboxRootLocator(page)
		.isVisible()
		.catch(() => false);
	if (!tradeboxVisible) {
		console.log(
			"[cleanup] tradebox not visible; skipping per-venue cleanup sweep",
		);
		return;
	}

	const sweep: readonly TradingVenue[] =
		venues !== undefined && venues.length > 0 ? venues : DEFAULT_VENUES_TO_SWEEP;

	for (const venue of sweep) {
		try {
			await tradebox.selectVenue(venue);
			for (const position of ["yes", "no"] as Position[]) {
				try {
					const shares = await tradebox.getSellableShares(position);
					if (shares > 0) {
						console.log(
							`[cleanup] selling ${shares} ${position.toUpperCase()} shares on ${venue}`,
						);
						await tradebox.setAmount(shares);
						await tradebox.submit();
						await tradebox.waitForFill();
					}
				} catch (err) {
					console.error("error", err);
					console.error(
						`[cleanup] failed to sell ${position} on ${venue}; continuing`,
					);
				}
			}
		} catch (err) {
			console.error("error", err);
			console.error(
				`[cleanup] failed to select venue ${venue}; continuing sweep`,
			);
		}
	}
}
