import type { Umbrella } from "@/services/api/umbrellaDataService";
import type { PredictionMarket } from "@/services/api/predictionMarketDataService";
import type { MatchedMarket } from "@/types/odds-monitor";
import type { VenuePosition } from "@/types/trading/venuePosition";
import type { PredictMarketDetail } from "@/trading/venues/predict/portfolio/predictMarketApi";
import { getListingYesNoPricesForUmbrella } from "@/helpers/predictionUtils";
import { inferPredictSideFromMarketDetail } from "@/trading/venues/predict/trade/predictPositionSide";
import {
	buildPredictUmbrellaLookup,
	matchVenuePositionToUmbrella,
} from "@/trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor";

function buildUmbrellaLookup(umbrellas: Umbrella[]) {
	const map = new Map<string, Umbrella>();
	for (const umb of umbrellas) {
		const allChildren =
			(umb as { originalChildren?: unknown[]; children?: unknown[] }).originalChildren ??
			umb.children ??
			[];
		for (const child of allChildren as { conditionId?: string; marketId?: string }[]) {
			if (child.conditionId) map.set(child.conditionId, umb);
			if (child.marketId) map.set(child.marketId, umb);
		}
	}
	return map;
}

/**
 * Open Predict.fun mark with the same overlay as `usePositionsData` (OddsMonitor listing YES/NO).
 * Unmatched rows use `currentValue` like `buildVenueMarketPosition` without overrides.
 */
export function sumPredictPositionMarkValue(
	rows: VenuePosition[] | null | undefined,
	umbrellas: Umbrella[],
	_getQuestionsForUmbrella: (id: string) => PredictionMarket[],
	matchedMarkets?: MatchedMarket[] | null,
	predictMarketDetails?: Map<number, PredictMarketDetail> | null,
): number {
	if (!rows?.length) return 0;
	const conditionLookup = buildUmbrellaLookup(umbrellas);
	const predictLookup = buildPredictUmbrellaLookup(matchedMarkets, umbrellas);
	let sum = 0;
	for (const pv of rows) {
		if (pv.venue !== "predictfun") continue;
		const detail =
			pv.numericMarketId != null
				? predictMarketDetails?.get(pv.numericMarketId)
				: undefined;
		const predictTitleHint =
			(detail?.question ?? detail?.title ?? "").trim() || undefined;
		const u = matchVenuePositionToUmbrella(
			pv,
			"predictfun",
			conditionLookup,
			umbrellas,
			predictLookup,
			predictTitleHint,
		);
		if (!u) {
			sum += pv.currentValue ?? 0;
			continue;
		}
		const { yes: liveYesPrice, no: liveNoPrice } = getListingYesNoPricesForUmbrella(
			u,
			matchedMarkets,
		);
		const inferred = inferPredictSideFromMarketDetail(detail ?? undefined, pv.tokenId);
		const isYes = inferred
			? inferred.side === "Yes"
			: pv.outcome.toLowerCase() === "yes" ||
				(pv.outcome.toLowerCase() !== "no" &&
					(pv.marketTitle?.toLowerCase() ?? "").includes(pv.outcome.toLowerCase()));
		const yP = isYes ? (liveYesPrice ?? pv.currentPrice) : null;
		const nP = isYes ? null : (liveNoPrice ?? pv.currentPrice);
		const yV = yP !== null ? pv.shares * yP : isYes ? (pv.currentValue ?? 0) : 0;
		const nV = nP !== null ? pv.shares * nP : isYes ? 0 : (pv.currentValue ?? 0);
		sum += yV + nV;
	}
	return sum;
}
