import { resolveLogoByTags } from "@/helpers/gameLogoResolver";
import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { normalizePredictTokenId } from "@/trading/predict/predictOrdersApi";

function predictMarketKeyFromWire(id: string | undefined | null): string | null {
	if (id === undefined || id === null) return null;
	const s = String(id).trim();
	if (!s) return null;
	const n = Number(s);
	if (Number.isFinite(n)) return String(Math.trunc(n));
	return s;
}

/**
 * Odds-monitor row for this Predict position (same `predictFun` token / market ids as umbrella lookup).
 */
export function findMatchedMarketByPredictPosition(
	markets: MatchedMarket[] | null | undefined,
	pos: Pick<VenuePosition, "tokenId" | "numericMarketId">,
): MatchedMarket | null {
	if (!markets?.length) return null;
	const tid = normalizePredictTokenId(pos.tokenId);
	const mid =
		pos.numericMarketId != null && Number.isFinite(pos.numericMarketId)
			? String(Math.trunc(pos.numericMarketId))
			: "";
	for (const m of markets) {
		const pf = m.predictFun;
		if (!pf) continue;
		const tA = pf.tokenIdA != null ? normalizePredictTokenId(pf.tokenIdA) : "";
		const tB = pf.tokenIdB != null ? normalizePredictTokenId(pf.tokenIdB) : "";
		if (tid && (tid === tA || tid === tB)) return m;
		const mkA = predictMarketKeyFromWire(pf.marketIdA ?? undefined);
		const mkB = predictMarketKeyFromWire(pf.marketIdB ?? undefined);
		if (mid && (mid === mkA || mid === mkB)) return m;
	}
	return null;
}

function gameIconFromMatchedMarket(row: MatchedMarket): string | null {
	const tags = [row.videogameSlug, row.game].filter(
		(x): x is string => Boolean(x && String(x).trim()),
	);
	return resolveLogoByTags(tags);
}

/**
 * Icon URL for portfolio blocks (Winnings / History / unmatched Predict): venue `iconUrl` when
 * present, otherwise the same game art as {@link UmbrellaImage} gets from tag labels (e.g. CS2).
 */
export function predictPortfolioUmbrellaIconUrl(
	pos: Pick<VenuePosition, "tokenId" | "numericMarketId" | "iconUrl">,
	oddsMarkets: MatchedMarket[] | null | undefined,
): string | null {
	const fromApi = pos.iconUrl?.trim();
	if (fromApi) return fromApi;
	const row = findMatchedMarketByPredictPosition(oddsMarkets, pos);
	return row ? gameIconFromMatchedMarket(row) : null;
}

export function umbrellaWithPredictPortfolioIcon(
	umbrella: Umbrella,
	pos: Pick<VenuePosition, "tokenId" | "numericMarketId" | "iconUrl">,
	oddsMarkets: MatchedMarket[] | null | undefined,
): Umbrella {
	const icon = predictPortfolioUmbrellaIconUrl(pos, oddsMarkets);
	if (!icon) return umbrella;
	const existing = (umbrella as Umbrella & { _polyIcon?: string })._polyIcon?.trim();
	if (existing) return umbrella;
	return { ...umbrella, _polyIcon: icon } as Umbrella;
}
