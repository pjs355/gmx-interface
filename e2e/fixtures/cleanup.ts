import {
	Tradebox,
	tradeboxRootLocator,
	type TradingVenue,
	type Position,
} from "../page-objects/tradebox";
import { type Page } from "@playwright/test";

const VENUES_TO_SWEEP: TradingVenue[] = [
	"levelup",
	"polymarket",
	"predictfun",
	"limitless",
	"dflow",
];

export async function cleanupOpenPositions(page: Page): Promise<void> {
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

	for (const venue of VENUES_TO_SWEEP) {
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
