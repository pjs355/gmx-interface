import type { MatchedMarket, OrderbookData } from "@/types/odds-monitor";
import type { MatchedMarketsApiItem } from "@/features/markets/queries/matchedMarketsQuery";
import type { MatchedMarketsDflowWire } from "@/types/matchedMarketsDflowWire";

function bookHasQuotableLiquidity(book: OrderbookData | null | undefined): boolean {
	if (!book) return false;
	if (book.bestAsk != null && Number.isFinite(Number(book.bestAsk))) return true;
	if (book.bestBid != null && Number.isFinite(Number(book.bestBid))) return true;
	if (book.asks?.some((a) => (a.size ?? 0) > 0)) return true;
	if (book.bids?.some((b) => (b.size ?? 0) > 0)) return true;
	return false;
}

export function apiItemToMatchedMarket(
	item: MatchedMarketsApiItem,
	normalizedPandaId: string,
): MatchedMarket {
	const em = item.exchangeMatching;
	return {
		pandaMatchId: normalizedPandaId,
		umbrellaId: item.umbrellaId ? String(item.umbrellaId).trim() : undefined,
		polyConditionId: em.polymarket?.conditionId ?? "",
		pandaTeamA: item.pandaTeamA ?? "",
		pandaTeamB: item.pandaTeamB ?? "",
		polyTokenIdA: em.polymarket?.tokenIdA ?? "",
		polyTokenIdB: em.polymarket?.tokenIdB ?? "",
		sidesSwapped: false,
		status: item.status,
		game: item.game,
		polyTickSize: (em.polymarket?.tickSize as MatchedMarket["polyTickSize"]) ?? null,
		polyNegRisk: em.polymarket?.negRisk ?? null,
		dflow: em.dflow as MatchedMarketsDflowWire | undefined,
		predictFun: em.predictFun
			? {
					marketIdA: em.predictFun.marketIdA,
					marketIdB: em.predictFun.marketIdB,
					tokenIdA: em.predictFun.tokenIdA,
					tokenIdB: em.predictFun.tokenIdB,
					decimalPrecision: (em.predictFun.decimalPrecision ?? 2) as 2 | 3,
					singleMarket: em.predictFun.singleMarket,
				}
			: undefined,
		limitless: em.limitless ?? undefined,
		polyPriceA: null,
		polyPriceB: null,
		dflowPriceA: null,
		dflowPriceB: null,
		predictFunPriceA: null,
		predictFunPriceB: null,
		limitlessPriceA: null,
		limitlessPriceB: null,
		levelUpPriceA: null,
		levelUpPriceB: null,
	};
}

function createStubMatchedMarket(pandaMatchId: string): MatchedMarket {
	const pid = String(pandaMatchId ?? "").trim();
	return apiItemToMatchedMarket(
		{
			pandaMatchId: pid,
			umbrellaId: "",
			displayName: "",
			exchangeMatching: {} as MatchedMarketsApiItem["exchangeMatching"],
		},
		pid,
	);
}

function applyMetadataToMatchedMarket(target: MatchedMarket, item: MatchedMarketsApiItem, pid: string): void {
	const em = item.exchangeMatching;
	const limitlessBefore = target.limitless;
	target.pandaMatchId = pid;
	target.umbrellaId = item.umbrellaId ? String(item.umbrellaId).trim() : undefined;
	target.polyConditionId = em.polymarket?.conditionId ?? "";
	target.pandaTeamA = item.pandaTeamA ?? "";
	target.pandaTeamB = item.pandaTeamB ?? "";
	target.polyTokenIdA = em.polymarket?.tokenIdA ?? "";
	target.polyTokenIdB = em.polymarket?.tokenIdB ?? "";
	target.status = item.status;
	target.game = item.game;
	target.polyTickSize = (em.polymarket?.tickSize as MatchedMarket["polyTickSize"]) ?? null;
	target.polyNegRisk = em.polymarket?.negRisk ?? null;
	target.dflow = em.dflow as MatchedMarketsDflowWire | undefined;
	target.predictFun = em.predictFun
		? {
				marketIdA: em.predictFun.marketIdA,
				marketIdB: em.predictFun.marketIdB,
				tokenIdA: em.predictFun.tokenIdA,
				tokenIdB: em.predictFun.tokenIdB,
				decimalPrecision: (em.predictFun.decimalPrecision ?? 2) as 2 | 3,
				singleMarket: em.predictFun.singleMarket,
			}
		: undefined;
	target.limitless = em.limitless ?? undefined;
	if (
		!target.limitless &&
		limitlessBefore &&
		(bookHasQuotableLiquidity(target.limitlessPriceA as OrderbookData) ||
			bookHasQuotableLiquidity(target.limitlessPriceB as OrderbookData))
	) {
		target.limitless = limitlessBefore;
	}
}

/**
 * Merge GET /matched-markets rows into the live price store, preserving in-flight BBO fields
 * and existing object references (venue_prices updates mutate rows in place).
 */
export function mergeMatchedMarketsIntoStore(
	existing: Map<string, MatchedMarket>,
	items: MatchedMarketsApiItem[],
	activePandaMatchIds: string[],
): { next: Map<string, MatchedMarket>; changed: boolean } {
	const next = new Map<string, MatchedMarket>();
	let changed = false;

	for (const item of items) {
		const pid = String(item.pandaMatchId ?? "").trim();
		if (!pid) continue;
		const prev = existing.get(pid);
		if (prev) {
			applyMetadataToMatchedMarket(prev, item, pid);
			next.set(pid, prev);
		} else {
			changed = true;
			next.set(pid, apiItemToMatchedMarket(item, pid));
		}
	}

	for (const raw of activePandaMatchIds) {
		const key = String(raw ?? "").trim();
		if (!key || next.has(key)) continue;
		const prev = existing.get(key);
		next.set(key, prev ?? createStubMatchedMarket(key));
		if (!prev) changed = true;
	}

	if (!changed && next.size !== existing.size) {
		changed = true;
	} else if (!changed) {
		for (const key of next.keys()) {
			if (!existing.has(key)) {
				changed = true;
				break;
			}
		}
	}

	return { next, changed };
}
