import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { usePredictOrders } from "@/trading/predict/usePredictOrders";
import { usePredictOrderMatches } from "@/trading/predict/usePredictOrderMatches";
import { usePredictEnsureAuth } from "@/trading/predict/usePredictEnsureAuth";
import { usePredictMarketDetailsMap } from "@/trading/predict/usePredictMarketDetailsMap";
import {
	buildPredictHistoryFillsFromFilledOrders,
	computePredictCostByToken,
	getPredictCostForToken,
	mergePredictCostMaps,
	normalizePredictTokenId,
	type PredictOrderRow,
} from "@/trading/predict/predictOrdersApi";
import {
	buildPredictHistoryFillsFromMatches,
	computePredictCostByTokenFromMatches,
	predictMarketIdForTokenFromMatches,
	type PredictMatchEventRow,
} from "@/trading/predict/predictMatchesApi";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import {
	type VenueHistoryFill,
	type VenuePosition,
} from "@/types/trading/venuePosition";
import { mergePredictHistoryFillMaps } from "./predictHistoryRows";

export type UsePredictBundleArgs = {
	signerAddress: string | null | undefined;
	effectiveAccount: string | null;
	activeTab: "positions" | "orders" | "history";
};

export type UsePredictBundleResult = {
	all: VenuePosition[];
	active: VenuePosition[];
	winnings: VenuePosition[];
	history: VenuePosition[];
	openOrders: PredictOrderRow[];
	filledOrders: PredictOrderRow[];
	filledFetched: boolean;
	filledError: boolean;
	matches: PredictMatchEventRow[];
	matchesFilterSigner: string | null;
	costLookup: ReturnType<typeof computePredictCostByToken>;
	historyFillsByToken: Map<string, VenueHistoryFill[]>;
	marketIds: number[];
	marketDetails: Map<number, PredictMarketDetail>;
	positionsQuery: UseQueryResult<VenuePosition[], unknown>;
	marketsQuery: UseQueryResult<Map<number, PredictMarketDetail>, unknown>;
};

export function usePredictBundle({
	signerAddress,
	effectiveAccount,
	activeTab,
}: UsePredictBundleArgs): UsePredictBundleResult {
	const positionsQuery = usePredictPositions(signerAddress ?? effectiveAccount);
	const all = positionsQuery.data ?? [];

	const ordersEnabled =
		(positionsQuery.isSuccess && (positionsQuery.data?.length ?? 0) > 0) ||
		activeTab === "orders" ||
		activeTab === "history";

	const {
		filledOrders,
		openOrders,
		filledError,
		filledFetched,
	} = usePredictOrders(ordersEnabled);

	const signerRawForMatches = useMemo(
		() =>
			import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS?.trim() ||
			signerAddress ||
			effectiveAccount ||
			null,
		[signerAddress, effectiveAccount],
	);

	const matchesQuery = usePredictOrderMatches({
		signerAddress: signerRawForMatches,
		enabled:
			Boolean(signerRawForMatches?.startsWith("0x")) && filledFetched,
	});
	const matches = matchesQuery.data ?? [];
	const matchesFilterSigner = matchesQuery.filterSigner;

	const historyFillsByToken = useMemo(() => {
		const fromOrders = buildPredictHistoryFillsFromFilledOrders(filledOrders);
		if (!matchesFilterSigner || matches.length === 0) return fromOrders;
		return mergePredictHistoryFillMaps(
			fromOrders,
			buildPredictHistoryFillsFromMatches(matchesFilterSigner, matches),
		);
	}, [filledOrders, matches, matchesFilterSigner]);

	const needsAuth =
		(all.length > 0 || activeTab === "history") &&
		(filledError || filledOrders.length === 0 || !filledFetched);
	usePredictEnsureAuth(needsAuth);

	const costLookup = useMemo(() => {
		const fromOrders = computePredictCostByToken(filledOrders);
		if (matches.length === 0 || !matchesFilterSigner) return fromOrders;
		const fromMatches = computePredictCostByTokenFromMatches(
			matchesFilterSigner,
			matches,
		);
		return mergePredictCostMaps(fromOrders, fromMatches);
	}, [filledOrders, matches, matchesFilterSigner]);

	const marketIds = useMemo(() => {
		const ids = new Set<number>();
		for (const p of all) {
			if (p.numericMarketId) ids.add(p.numericMarketId);
		}
		for (const o of openOrders) {
			ids.add(o.marketId);
		}
		for (const row of filledOrders) {
			ids.add(row.marketId);
		}
		for (const m of matches) {
			const mid = m.market?.id;
			if (mid != null && Number.isFinite(Number(mid))) {
				ids.add(Number(mid));
			}
		}
		for (const tid of costLookup.keys()) {
			const mid = predictMarketIdForTokenFromMatches(matches, tid);
			if (mid != null) ids.add(mid);
		}
		for (const tid of historyFillsByToken.keys()) {
			const mid = predictMarketIdForTokenFromMatches(matches, tid);
			if (mid != null) ids.add(mid);
		}
		return Array.from(ids);
	}, [all, openOrders, filledOrders, matches, costLookup, historyFillsByToken]);

	const marketsQuery = usePredictMarketDetailsMap(marketIds, marketIds.length > 0);
	const marketDetails =
		marketsQuery.data ?? new Map<number, PredictMarketDetail>();

	const { active, winnings, history } = useMemo(() => {
		const a: VenuePosition[] = [];
		const w: VenuePosition[] = [];
		const h: VenuePosition[] = [];

		for (const pos of all) {
			const detail = pos.numericMarketId
				? marketDetails.get(pos.numericMarketId)
				: undefined;
			const costEntry = getPredictCostForToken(costLookup, pos.tokenId);
			const enriched = { ...pos };
			if (costEntry) {
				enriched.avgPrice = costEntry.avgPrice;
				enriched.cost = costEntry.totalCost;
				enriched.pnl = enriched.currentValue - costEntry.totalCost;
				enriched.pnlPercent =
					costEntry.totalCost > 0
						? ((enriched.currentValue - costEntry.totalCost) /
								costEntry.totalCost) *
							100
						: null;
				if (costEntry.lastTradeAtMs != null) {
					enriched.historyTradeAt = new Date(
						costEntry.lastTradeAtMs,
					).toISOString();
				}
			}
			const fillsForPredict = historyFillsByToken.get(
				normalizePredictTokenId(pos.tokenId),
			);
			if (fillsForPredict && fillsForPredict.length > 0) {
				(enriched as VenuePosition).historyFills = fillsForPredict;
			}
			if (detail?.status === "RESOLVED") {
				enriched.marketStatus = "RESOLVED";
				const outcomeMatch = detail.outcomes?.find(
					(o) => normalizePredictTokenId(o.onChainId) === pos.tokenId,
				);
				enriched.outcomeResult =
					(outcomeMatch?.status as "WON" | "LOST") ?? null;
				if (enriched.outcomeResult === "WON") w.push(enriched);
				else h.push(enriched);
			} else {
				enriched.marketStatus = detail?.status ?? undefined;
				a.push(enriched);
			}
		}
		return { active: a, winnings: w, history: h };
	}, [all, marketDetails, costLookup, historyFillsByToken]);

	return {
		all,
		active,
		winnings,
		history,
		openOrders,
		filledOrders,
		filledFetched,
		filledError,
		matches,
		matchesFilterSigner,
		costLookup,
		historyFillsByToken,
		marketIds,
		marketDetails,
		positionsQuery,
		marketsQuery,
	};
}
