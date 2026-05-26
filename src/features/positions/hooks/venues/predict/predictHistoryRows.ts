import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	type PredictOrderRow,
	normalizePredictTokenId,
} from "@/features/trading/venues/predict/portfolio/predictOrdersApi";
import {
	type PredictMatchEventRow,
	predictMarketIdForTokenFromDetailsMap,
	predictMarketIdForTokenFromMatches,
} from "@/features/trading/venues/predict/trade/predictMatchesApi";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import {
	type PredictUmbrellaLookup,
	resolvePredictUmbrellaForDisplay,
} from "@/features/trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor";
import { type VenueHistoryFill, type VenuePosition } from "@/types/trading/venuePosition";
import {
	shortPredictFunMarketTitleForPortfolio,
	stripUmbrellaDisplayPrefix,
} from "@/features/markets/presentation/umbrellaDisplayName";

/**
 * Merge two `tokenId → VenueHistoryFill[]` maps, sorted by `tradedAt` ascending. The Predict
 * cost-basis pipeline builds two of these (one from filled orders, one from match events) and
 * the History tab needs the combined view per-token.
 */
export function mergePredictHistoryFillMaps(
	a: Map<string, VenueHistoryFill[]>,
	b: Map<string, VenueHistoryFill[]>,
): Map<string, VenueHistoryFill[]> {
	const out = new Map<string, VenueHistoryFill[]>();
	for (const [k, arr] of a) {
		out.set(k, [...arr]);
	}
	for (const [k, arr] of b) {
		const cur = out.get(k) ?? [];
		out.set(k, [...cur, ...arr]);
	}
	for (const fills of out.values()) {
		fills.sort((x, y) => Date.parse(x.tradedAt || "0") - Date.parse(y.tradedAt || "0"));
	}
	return out;
}

/** Resolved Predict markets: map user's outcome token to WON/LOST for History tab labels + PnL. */
function predictOutcomeResultForHistoryToken(
	detail: PredictMarketDetail | undefined,
	tokenId: string,
): "WON" | "LOST" | undefined {
	if (!detail) return undefined;
	const lifecycle = (detail.status ?? "").toUpperCase().trim();
	if (lifecycle === "REMOVED") return undefined;
	if (lifecycle !== "RESOLVED") return undefined;

	const normT = normalizePredictTokenId(tokenId);
	if (!normT) return undefined;

	for (const o of detail.outcomes ?? []) {
		if (normalizePredictTokenId(o.onChainId) !== normT) continue;
		const st = String(o.status ?? "").toUpperCase();
		if (st === "WON") return "WON";
		if (st === "LOST") return "LOST";
	}
	const res = detail.resolution;
	if (res?.onChainId) {
		if (normalizePredictTokenId(res.onChainId) === normT) return "WON";
		return "LOST";
	}
	return undefined;
}

/**
 * History rows for Predict tokens from FILLED orders, match events, and/or per-fill maps. Tokens
 * already covered by the live `VenuePosition` set (`seen`) are skipped so a single token never
 * produces both a Positions row and a History row.
 */
export function predictFilledOrdersToVenueHistoryRows(
	filledOrders: PredictOrderRow[],
	seen: Set<string>,
	costLookup: Map<string, { totalCost: number; totalShares: number; avgPrice: number }>,
	marketDetails: Map<number, PredictMarketDetail>,
	predictLookup: PredictUmbrellaLookup | null,
	umbrellas: Umbrella[],
	fillsByToken: Map<string, VenueHistoryFill[]>,
	matches: PredictMatchEventRow[],
): VenuePosition[] {
	const firstRowByToken = new Map<string, PredictOrderRow>();
	for (const row of filledOrders) {
		if (row.status !== "FILLED" || !row?.order) continue;
		const tid = normalizePredictTokenId(row.order.tokenId);
		if (!tid || seen.has(tid) || firstRowByToken.has(tid)) continue;
		firstRowByToken.set(tid, row);
	}

	const tokenCandidates = new Set<string>();
	for (const tid of firstRowByToken.keys()) tokenCandidates.add(tid);
	for (const [tid, arr] of fillsByToken) {
		if (arr.length > 0) tokenCandidates.add(tid);
	}
	for (const tid of costLookup.keys()) tokenCandidates.add(tid);

	const out: VenuePosition[] = [];
	for (const tokenId of tokenCandidates) {
		if (seen.has(tokenId)) continue;
		const row = firstRowByToken.get(tokenId);
		const fills = fillsByToken.get(tokenId) ?? [];
		const costEntry = costLookup.get(tokenId);
		const allowByCost = Boolean(costEntry && costEntry.totalShares > 0);
		const allowByFills = fills.length > 0;
		if (!allowByCost && !allowByFills) continue;

		let marketId: number | null = row?.marketId ?? null;
		if (marketId == null) {
			marketId = predictMarketIdForTokenFromMatches(matches, tokenId);
		}
		if (marketId == null) {
			marketId = predictMarketIdForTokenFromDetailsMap(marketDetails, tokenId);
		}
		const detail = marketId != null ? marketDetails.get(marketId) : undefined;
		const outcomeName =
			detail?.outcomes?.find((o) => normalizePredictTokenId(o.onChainId) === tokenId)?.name ??
			"Yes";
		const titleForMatch = (detail?.question ?? detail?.title ?? "").trim();
		const resolvedUmbrella = resolvePredictUmbrellaForDisplay(
			{
				tokenId,
				numericMarketId: marketId ?? 0,
				marketTitle: titleForMatch,
			},
			predictLookup,
			umbrellas,
			titleForMatch || undefined,
		);
		const fromOrderUmbrella = stripUmbrellaDisplayPrefix(
			row?.levelUpUmbrellaDisplayName?.trim() ?? "",
		).trim();
		const venueTitle =
			fromOrderUmbrella ||
			resolvedUmbrella?.displayName?.trim() ||
			shortPredictFunMarketTitleForPortfolio(titleForMatch) ||
			titleForMatch ||
			(marketId != null ? `Market #${marketId}` : `Predict · ${tokenId.slice(0, 10)}…`);

		let sharesOut: number;
		let avgPrice: number | null;
		let costOut: number | null;
		if (allowByCost && costEntry) {
			sharesOut = costEntry.totalShares;
			avgPrice = costEntry.avgPrice;
			costOut = costEntry.totalCost;
		} else {
			let buyUsdc = 0;
			let buySh = 0;
			for (const f of fills) {
				if (f.side === "buy") {
					buyUsdc += f.usdc;
					buySh += f.shares;
				}
			}
			sharesOut = buySh > 0 ? buySh : 0;
			costOut = buyUsdc > 0 ? buyUsdc : null;
			avgPrice = buySh > 0 && buyUsdc > 0 ? buyUsdc / buySh : null;
		}

		const outcomeResult = predictOutcomeResultForHistoryToken(detail, tokenId);
		const resolvedLike = (detail?.status ?? "").toUpperCase().trim() === "RESOLVED";
		let pnlOut: number | null = null;
		let pnlPct: number | null = null;
		if (
			outcomeResult === "WON" &&
			costOut != null &&
			Number.isFinite(costOut) &&
			Number.isFinite(sharesOut)
		) {
			pnlOut = sharesOut - costOut;
			pnlPct = costOut > 0 ? (pnlOut / costOut) * 100 : null;
		} else if (outcomeResult === "LOST" && costOut != null && Number.isFinite(costOut)) {
			pnlOut = -costOut;
			pnlPct = costOut > 0 ? -100 : null;
		}

		out.push({
			venue: "predictfun",
			marketTitle: venueTitle,
			outcome: outcomeName,
			shares: sharesOut,
			avgPrice,
			currentPrice: null,
			cost: costOut,
			currentValue: outcomeResult === "WON" ? sharesOut : 0,
			pnl: pnlOut,
			pnlPercent: pnlPct,
			tokenId,
			...(marketId != null ? { numericMarketId: marketId } : {}),
			conditionId: detail?.conditionId,
			marketStatus: resolvedLike ? "RESOLVED" : "CLOSED",
			...(outcomeResult ? { outcomeResult } : {}),
			...(fills.length > 0 ? { historyFills: fills } : {}),
			...(row?.levelUpUmbrellaId?.trim()
				? { levelUpUmbrellaId: row.levelUpUmbrellaId.trim() }
				: {}),
			...(row?.levelUpUmbrellaDisplayName?.trim()
				? { levelUpUmbrellaDisplayName: row.levelUpUmbrellaDisplayName.trim() }
				: {}),
		});
	}
	return out;
}
