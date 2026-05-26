import { useMemo } from "react";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	mapPredictOrdersToVenueOrders,
	normalizePredictTokenId,
	type PredictOrderRow,
} from "@/features/trading/venues/predict/portfolio/predictOrdersApi";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import {
	resolvePredictUmbrellaForDisplay,
	type PredictUmbrellaLookup,
} from "@/features/trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor";
import { shortPredictFunMarketTitleForPortfolio } from "@/features/markets/presentation/umbrellaDisplayName";
import type { VenueOrder, VenuePosition } from "@/types/trading/venuePosition";

export type UseVenueOrdersArgs = {
	predictOpenOrders: PredictOrderRow[];
	allPredictPositions: VenuePosition[];
	predictMarketDetails: Map<number, PredictMarketDetail>;
	predictUmbrellaLookup: PredictUmbrellaLookup;
	umbrellas: Umbrella[];
	limitlessOpenOrders: VenueOrder[];
};

export function useVenueOrders({
	predictOpenOrders,
	allPredictPositions,
	predictMarketDetails,
	predictUmbrellaLookup,
	umbrellas,
	limitlessOpenOrders,
}: UseVenueOrdersArgs): VenueOrder[] {
	return useMemo(() => {
		const titleLookup = new Map<number, string>();
		const outcomeLookup = new Map<string, string>();

		const predictMarketTitleFromMonitor = (marketId: number): string => {
			const fromPos = allPredictPositions.find((p) => p.numericMarketId === marketId);
			const detail = predictMarketDetails.get(marketId);
			const titleForMatch =
				fromPos?.marketTitle?.trim() || detail?.question?.trim() || detail?.title?.trim() || "";
			const detailHint = (detail?.question ?? detail?.title ?? "").trim() || undefined;
			if (fromPos) {
				const u = resolvePredictUmbrellaForDisplay(
					fromPos,
					predictUmbrellaLookup,
					umbrellas,
					detailHint,
				);
				if (u?.displayName?.trim()) return u.displayName.trim();
			}
			const sampleTok = detail?.outcomes?.find((o) => o.onChainId)?.onChainId;
			if (sampleTok) {
				const u = resolvePredictUmbrellaForDisplay(
					{
						tokenId: sampleTok,
						numericMarketId: marketId,
						marketTitle: titleForMatch,
					},
					predictUmbrellaLookup,
					umbrellas,
					detailHint,
				);
				if (u?.displayName?.trim()) return u.displayName.trim();
			}
			return (
				shortPredictFunMarketTitleForPortfolio(titleForMatch) ||
				titleForMatch ||
				`Market #${marketId}`
			);
		};

		for (const p of allPredictPositions) {
			if (p.numericMarketId != null) {
				titleLookup.set(p.numericMarketId, predictMarketTitleFromMonitor(p.numericMarketId));
			}
			outcomeLookup.set(normalizePredictTokenId(p.tokenId), p.outcome);
		}
		for (const [id, detail] of predictMarketDetails) {
			if (!titleLookup.has(id)) titleLookup.set(id, predictMarketTitleFromMonitor(id));
			for (const o of detail.outcomes ?? []) {
				const ok = normalizePredictTokenId(o.onChainId);
				if (!outcomeLookup.has(ok)) outcomeLookup.set(ok, o.name);
			}
		}
		for (const o of predictOpenOrders) {
			if (!titleLookup.has(o.marketId))
				titleLookup.set(o.marketId, predictMarketTitleFromMonitor(o.marketId));
		}
		const liveOrders = predictOpenOrders.filter((o) => {
			const detail = predictMarketDetails.get(o.marketId);
			if (!detail) return true;
			return (
				detail.status !== "RESOLVED" &&
				detail.status !== "REMOVED" &&
				detail.tradingStatus !== "CLOSED"
			);
		});
		const predictVenue =
			predictOpenOrders.length === 0
				? []
				: mapPredictOrdersToVenueOrders(liveOrders, titleLookup, outcomeLookup);
		return [...predictVenue, ...limitlessOpenOrders];
	}, [
		predictOpenOrders,
		allPredictPositions,
		predictMarketDetails,
		predictUmbrellaLookup,
		umbrellas,
		limitlessOpenOrders,
	]);
}
