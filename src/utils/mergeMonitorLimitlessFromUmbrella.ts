import type { MatchedMarket } from "@/types/odds-monitor";
import type { MatchedMarketExchange } from "@/services/api/matchDataService";
import type { UmbrellaExchangeMatchingLimitless } from "@/services/api/umbrellaDataService";
import type { LimitlessInferenceWire } from "@/trading/venues/limitless/trade/limitlessCatalogTokenPair";

type LimitlessShape = {
	slug: string;
	tokenIdA: string;
	tokenIdB: string;
	orderbookSlugA?: string;
	orderbookSlugB?: string;
};

function trimStr(v: unknown): string {
	return String(v ?? "").trim();
}

/**
 * Fills missing Limitless token ids (and slug / orderbook slugs when absent) from the
 * umbrella `exchangeMatching.limitless` blob. Used by odds-monitor merge and trade-box
 * YES/NO bucketing so partial WS payloads cannot strand both venue legs on one outcome.
 */
export function resolveLimitlessMapping(
	monitorLx: MatchedMarket["limitless"] | MatchedMarketExchange["limitless"] | null | undefined,
	umbrellaLx: UmbrellaExchangeMatchingLimitless | null | undefined,
): LimitlessShape | null {
	const u = umbrellaLx;
	const m = monitorLx;
	const tokenA = trimStr(m?.tokenIdA) || trimStr(u?.tokenIdA);
	const tokenB = trimStr(m?.tokenIdB) || trimStr(u?.tokenIdB);
	if (!tokenA || !tokenB) return null;
	const finalSlug = trimStr(m?.slug) || trimStr(u?.slug);
	if (!finalSlug) return null;
	return {
		slug: finalSlug,
		tokenIdA: tokenA,
		tokenIdB: tokenB,
		orderbookSlugA: m?.orderbookSlugA ?? u?.orderbookSlugA,
		orderbookSlugB: m?.orderbookSlugB ?? u?.orderbookSlugB,
	};
}

/**
 * Like {@link resolveLimitlessMapping} but does **not** require a group `slug`.
 * Use for portfolio / trade-box inference when only token ids + orderbook slugs exist.
 */
export function coerceLimitlessWireForInference(
	monitorLx: MatchedMarket["limitless"] | MatchedMarketExchange["limitless"] | null | undefined,
	umbrellaLx: UmbrellaExchangeMatchingLimitless | null | undefined,
): LimitlessInferenceWire | null {
	const resolved = resolveLimitlessMapping(monitorLx, umbrellaLx);
	if (resolved) {
		return {
			tokenIdA: resolved.tokenIdA,
			tokenIdB: resolved.tokenIdB,
			orderbookSlugA: resolved.orderbookSlugA,
			orderbookSlugB: resolved.orderbookSlugB,
			groupSlug: resolved.slug,
		};
	}
	const m = monitorLx;
	const u = umbrellaLx;
	const tokenA = trimStr(m?.tokenIdA) || trimStr(u?.tokenIdA);
	const tokenB = trimStr(m?.tokenIdB) || trimStr(u?.tokenIdB);
	if (!tokenA || !tokenB) return null;
	return {
		tokenIdA: tokenA,
		tokenIdB: tokenB,
		orderbookSlugA: m?.orderbookSlugA ?? u?.orderbookSlugA,
		orderbookSlugB: m?.orderbookSlugB ?? u?.orderbookSlugB,
		groupSlug: trimStr(m?.slug) || trimStr(u?.slug),
	};
}

function orderbookSlugRichness(w: LimitlessInferenceWire | null | undefined): number {
	if (!w) return -1;
	let n = 0;
	if (trimStr(w.orderbookSlugA)) n += 1;
	if (trimStr(w.orderbookSlugB)) n += 1;
	return n;
}

/**
 * Prefer the odds-monitor row whose `umbrellaId` matches the page umbrella (portfolio parity),
 * merged with `exchangeMatching.limitless`. When `pageMatchedMonitor` yields a richer wire
 * (e.g. both per-leg orderbook slugs), prefer that so trade-box YES/NO bucketing matches
 * the route-specific monitor when it carries more detail.
 */
export function resolveLimitlessInferenceWireForUmbrella(args: {
	matchedMarkets: MatchedMarket[] | null | undefined;
	umbrellaId: string | undefined;
	umbrellaExchangeLimitless: UmbrellaExchangeMatchingLimitless | null | undefined;
	pageMatchedMonitor?: MatchedMarket | null;
}): LimitlessInferenceWire | null {
	const { matchedMarkets, umbrellaId, umbrellaExchangeLimitless, pageMatchedMonitor } =
		args;
	const monitorForUmbrella =
		matchedMarkets?.find(
			(mm) => String(mm.umbrellaId ?? "").trim() === String(umbrellaId ?? "").trim(),
		) ?? null;
	const wireUmbrella = coerceLimitlessWireForInference(
		monitorForUmbrella?.limitless,
		umbrellaExchangeLimitless,
	);
	const wirePage = coerceLimitlessWireForInference(
		pageMatchedMonitor?.limitless,
		umbrellaExchangeLimitless,
	);
	if (wireUmbrella && wirePage) {
		const ru = orderbookSlugRichness(wireUmbrella);
		const rp = orderbookSlugRichness(wirePage);
		if (rp > ru) return wirePage;
		if (ru > rp) return wireUmbrella;
	}
	return wireUmbrella ?? wirePage ?? null;
}

function limitlessMappingUnchanged(
	prev: MatchedMarket["limitless"] | undefined,
	next: LimitlessShape,
): boolean {
	if (!prev) return false;
	return (
		trimStr(prev.slug) === trimStr(next.slug) &&
		trimStr(prev.tokenIdA) === trimStr(next.tokenIdA) &&
		trimStr(prev.tokenIdB) === trimStr(next.tokenIdB) &&
		prev.orderbookSlugA === next.orderbookSlugA &&
		prev.orderbookSlugB === next.orderbookSlugB
	);
}

/**
 * Odds-monitor rows come from GET /matched-markets + venue-prices WS. Production payloads
 * can omit `exchangeMatching.limitless` while the umbrella document already has it — merge
 * umbrella mapping so Limitless metadata is present (books still come only from venue-prices).
 *
 * Also merges when the monitor sends a **partial** `limitless` (e.g. slug only): umbrella
 * token ids are filled in so token-based YES/NO for portfolio rows stays correct.
 */
export function mergeMonitorLimitlessFromUmbrella(
	matched: MatchedMarket | null,
	umbrellaLimitless: UmbrellaExchangeMatchingLimitless | null | undefined,
): MatchedMarket | null {
	if (!matched) return null;
	const resolved = resolveLimitlessMapping(matched.limitless, umbrellaLimitless);
	if (!resolved) return matched;
	if (limitlessMappingUnchanged(matched.limitless, resolved)) return matched;
	return { ...matched, limitless: resolved };
}

function exchangeLimitlessUnchanged(
	prev: MatchedMarketExchange["limitless"] | undefined,
	next: LimitlessShape,
): boolean {
	if (!prev) return false;
	return (
		trimStr(prev.slug) === trimStr(next.slug) &&
		trimStr(prev.tokenIdA) === trimStr(next.tokenIdA) &&
		trimStr(prev.tokenIdB) === trimStr(next.tokenIdB) &&
		prev.orderbookSlugA === next.orderbookSlugA &&
		prev.orderbookSlugB === next.orderbookSlugB
	);
}

/** Same merge for chart batch `MatchedMarketExchange` from GET /matched-markets. */
export function mergeLimitlessOntoMatchedMarketExchange(
	match: MatchedMarketExchange | undefined,
	umbrellaLimitless: UmbrellaExchangeMatchingLimitless | null | undefined,
): MatchedMarketExchange | undefined {
	if (!match) return match;
	const resolved = resolveLimitlessMapping(match.limitless, umbrellaLimitless);
	if (!resolved) return match;
	if (exchangeLimitlessUnchanged(match.limitless, resolved)) return match;
	return {
		...match,
		limitless: resolved,
	};
}
