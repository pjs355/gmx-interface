/**
 * Cross-venue best YES/NO asks for home listing cards from OddsMonitor `MatchedMarket` (venue-prices WS).
 * Mirrors trading-strip logic without direct browser books or LevelUp REST orderbook.
 */

import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import { getDflowKalshiMonitorLink } from "@/trading/dflow/monitorDflowBooks";

const MIN_VALID = 0.005;
const MAX_VALID = 0.995;

function isValidPrice(p: number): boolean {
	return p >= MIN_VALID && p <= MAX_VALID;
}

function bestAskProb(book: OrderbookData | null | undefined): number | null {
	if (!book) return null;
	if (book.bestAsk !== null && book.bestAsk !== undefined) {
		const p = typeof book.bestAsk === "number" ? book.bestAsk : Number(book.bestAsk);
		if (Number.isFinite(p) && isValidPrice(p)) return p;
	}
	if (book.asks?.length) {
		let min = Infinity;
		for (const a of book.asks) {
			if ((a.size ?? 0) > 0 && isValidPrice(a.price) && a.price < min) min = a.price;
		}
		if (min !== Infinity) return min;
	}
	return null;
}

export function listingBestYesNoFromMatched(
	m: MatchedMarket | null,
): { yes: number | null; no: number | null } {
	if (!m) return { yes: null, no: null };

	const rows: { askA: number | null; askB: number | null }[] = [];

	const polyLinked = Boolean(m.polyConditionId || m.polyTokenIdA);
	if (polyLinked) {
		rows.push({
			askA: bestAskProb(m.polyPriceA),
			askB: bestAskProb(m.polyPriceB),
		});
	}

	const dflowLinked = Boolean(getDflowKalshiMonitorLink(m));
	if (dflowLinked) {
		rows.push({
			askA: bestAskProb(m.dflowPriceA ?? m.kalshiPriceA),
			askB: bestAskProb(m.dflowPriceB ?? m.kalshiPriceB),
		});
	}

	if (m.limitless) {
		rows.push({
			askA: bestAskProb(m.limitlessPriceA),
			askB: bestAskProb(m.limitlessPriceB),
		});
	}

	if (m.predictFun) {
		rows.push({
			askA: bestAskProb(m.predictFunPriceA),
			askB: bestAskProb(m.predictFunPriceB),
		});
	}

	const luA = bestAskProb(m.levelUpPriceA);
	const luB = bestAskProb(m.levelUpPriceB);
	if (luA !== null || luB !== null) {
		rows.push({ askA: luA, askB: luB });
	}

	let bestYes = Infinity;
	let bestNo = Infinity;
	for (const r of rows) {
		if (r.askA !== null && r.askA < bestYes) bestYes = r.askA;
		if (r.askB !== null && r.askB < bestNo) bestNo = r.askB;
	}

	return {
		yes: bestYes === Infinity ? null : bestYes,
		no: bestNo === Infinity ? null : bestNo,
	};
}
