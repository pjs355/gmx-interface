import type { OrderbookData } from "@/types/odds-monitor";
import { bestAskProbKalshiDflow } from "@/features/markets/pricing/orderbookBbo";

export type MoneylineLegWire = "home" | "draw" | "away";

/** Books container for Kalshi/dflow wire columns (monitor or All Odds field names). */
export type KalshiWireBooks = {
	dflowPriceA?: OrderbookData | null;
	dflowPriceB?: OrderbookData | null;
	kalshiPriceA?: OrderbookData | null;
	kalshiPriceB?: OrderbookData | null;
};

/**
 * Mirror backend `pandaSideForDflowTickerSlot` for single-ticker per-leg rows.
 * Must stay aligned with predictions/domain/exchange-matching/dflow-panda-side.ts
 */
export function kalshiDflowWireSideForLeg(
	moneylineLeg?: MoneylineLegWire | null,
): "A" | "B" {
	return moneylineLeg === "away" ? "B" : "A";
}

export type KalshiDflowTickerWire = {
	tickerA?: string;
	tickerB?: string;
};

/** True when A/B wire columns are independent outcome books (esports 2-way), not complement pair. */
export function kalshiDflowHasDistinctTickerB(dflow?: KalshiDflowTickerWire | null): boolean {
	const tickerA = dflow?.tickerA?.trim() ?? "";
	const tickerB = dflow?.tickerB?.trim() ?? "";
	return Boolean(tickerB) && tickerB !== tickerA;
}

/**
 * Map wire columns to display YES/NO books for orderbooks + trade box.
 * Single-ticker per-leg rows (FIFA/MLB away): swap so bookA = leg YES, bookB = complement.
 * Dual-ticker rows (esports H2H): keep raw wire A/B (team columns).
 */
export function kalshiLegDisplayBooks(
	m: KalshiWireBooks & {
		moneylineLeg?: MoneylineLegWire | null;
		dflow?: KalshiDflowTickerWire | null;
	},
	legHint?: MoneylineLegWire | null,
): { bookA: OrderbookData | null | undefined; bookB: OrderbookData | null | undefined } {
	if (kalshiDflowHasDistinctTickerB(m.dflow)) {
		return { bookA: m.dflowPriceA, bookB: m.dflowPriceB };
	}
	const leg = legHint ?? m.moneylineLeg ?? null;
	const yesSide = kalshiDflowWireSideForLeg(leg);
	if (yesSide === "B") {
		return { bookA: m.dflowPriceB, bookB: m.dflowPriceA };
	}
	return { bookA: m.dflowPriceA, bookB: m.dflowPriceB };
}

function wireBook(
	books: KalshiWireBooks,
	side: "A" | "B",
): OrderbookData | null | undefined {
	if (side === "A") {
		return books.dflowPriceA ?? books.kalshiPriceA;
	}
	return books.dflowPriceB ?? books.kalshiPriceB;
}

/** Raw YES book for this leg's Kalshi/dflow outcome (not the complement column). */
export function kalshiLegYesBook(
	books: KalshiWireBooks,
	moneylineLeg?: MoneylineLegWire | null,
): OrderbookData | null {
	const side = kalshiDflowWireSideForLeg(moneylineLeg);
	const book = wireBook(books, side);
	return book ?? null;
}

export function kalshiWireBooksFromMarket(
	m: KalshiWireBooks & { moneylineLeg?: MoneylineLegWire | null },
): KalshiWireBooks {
	return {
		dflowPriceA: m.dflowPriceA,
		dflowPriceB: m.dflowPriceB,
		kalshiPriceA: m.kalshiPriceA,
		kalshiPriceB: m.kalshiPriceB,
	};
}

/** YES book from a monitor row (uses row moneylineLeg when present). */
export function kalshiLegYesBookFromMarket(
	m: KalshiWireBooks & { moneylineLeg?: MoneylineLegWire | null },
): OrderbookData | null {
	return kalshiLegYesBook(kalshiWireBooksFromMarket(m), m.moneylineLeg ?? null);
}

/** Best YES ask prob for this leg via Kalshi/dflow ladder-first policy. */
export function kalshiLegYesAskProb(
	books: KalshiWireBooks,
	moneylineLeg?: MoneylineLegWire | null,
): number | null {
	return bestAskProbKalshiDflow(kalshiLegYesBook(books, moneylineLeg));
}
