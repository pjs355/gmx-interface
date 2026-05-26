import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { AccountPositionsSlice } from "@/context/AccountDataContext";
import { usePredictOrders } from "@/features/trading/venues/predict/portfolio/usePredictOrders";
import { usePredictOrderMatches } from "@/features/trading/venues/predict/portfolio/usePredictOrderMatches";
import { usePredictAccountActivity } from "@/features/trading/venues/predict/portfolio/usePredictAccountActivity";
import { usePredictEnsureAuth } from "@/features/trading/venues/predict/session/usePredictEnsureAuth";
import { usePredictMarketDetailsMap } from "@/features/trading/venues/predict/portfolio/usePredictMarketDetailsMap";
import {
	buildPredictHistoryFillsFromFilledOrders,
	computePredictCostByToken,
	getPredictCostForToken,
	mergePredictCostMaps,
	normalizePredictTokenId,
	type PredictOrderRow,
} from "@/features/trading/venues/predict/portfolio/predictOrdersApi";
import {
	buildPredictHistoryFillsFromMatches,
	computePredictCostByTokenFromMatches,
	predictMarketIdForTokenFromMatches,
	type PredictMatchEventRow,
} from "@/features/trading/venues/predict/trade/predictMatchesApi";
import {
	buildPredictHistoryFillsFromActivity,
	computePredictCostByTokenFromActivity,
	predictMarketIdForTokenFromActivity,
	predictRedeemEventsByToken,
	sumPredictRedeemPayout,
	type PredictActivityEvent,
} from "@/features/trading/venues/predict/portfolio/predictActivityApi";
import type { PredictMarketDetail } from "@/features/trading/venues/predict/portfolio/predictMarketApi";
import { type VenueHistoryFill, type VenuePosition } from "@/types/trading/venuePosition";
import { mergePredictHistoryFillMaps } from "./predictHistoryRows";
import { shortPredictFunMarketTitleForPortfolio } from "@/features/markets/presentation/umbrellaDisplayName";
import { accountPositionsQueryShim } from "../accountPositionsQueryShim";

export type UsePredictBundleArgs = {
	/** `venueAddressChainMap.predictfun.walletAddress` — sole Predict positions cache key. */
	predictWalletAddress: string | null;
	activeTab: "positions" | "orders" | "history";
	/** Predict.fun venue slice from `useAccountData()` — passed in so this module never calls `useAccountData` (avoids duplicate `AccountDataContext` module under Vite chunking). */
	predictSlice: AccountPositionsSlice;
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
	activity: PredictActivityEvent[];
	costLookup: ReturnType<typeof computePredictCostByToken>;
	historyFillsByToken: Map<string, VenueHistoryFill[]>;
	marketIds: number[];
	marketDetails: Map<number, PredictMarketDetail>;
	positionsQuery: UseQueryResult<VenuePosition[], unknown>;
	marketsQuery: UseQueryResult<Map<number, PredictMarketDetail>, unknown>;
};

export function usePredictBundle({
	predictWalletAddress,
	activeTab,
	predictSlice,
}: UsePredictBundleArgs): UsePredictBundleResult {
	// Rows + fetch state come from `AccountDataProvider` (same TanStack cache as `usePredictPositions`).
	const all = predictSlice.rows;
	const predictQueryAddress = predictWalletAddress?.trim() ?? "";
	const predictPositionsQueryEnabled = predictQueryAddress.toLowerCase().startsWith("0x");

	const positionsQuery = useMemo(
		() => accountPositionsQueryShim(predictSlice, all, predictPositionsQueryEnabled),
		[predictSlice, all, predictPositionsQueryEnabled],
	);

	const ordersEnabled =
		(predictSlice.isFetched && all.length > 0) || activeTab === "orders" || activeTab === "history";

	const { filledOrders, openOrders, filledError, filledFetched } = usePredictOrders(ordersEnabled);

	const signerRawForMatches = predictQueryAddress || null;

	const matchesQuery = usePredictOrderMatches({
		signerAddress: signerRawForMatches,
		enabled: Boolean(signerRawForMatches?.startsWith("0x")) && filledFetched,
	});
	const matches = matchesQuery.data ?? [];
	const matchesFilterSigner = matchesQuery.filterSigner;

	// Account activity (`/v1/account/activity`): includes `MATCH_SUCCESS` (fills) and
	// `REDEEM` (claims). The latter is the only durable record of a winning Predict trade
	// once the user has claimed and the ERC1155 tokens are burned, so it drives the
	// History tab's claimed-winner rows below.
	const activityQuery = usePredictAccountActivity({ enabled: filledFetched });
	const activity = useMemo<PredictActivityEvent[]>(
		() => activityQuery.data ?? [],
		[activityQuery.data],
	);
	const redeemEventsByToken = useMemo(() => predictRedeemEventsByToken(activity), [activity]);

	const historyFillsByToken = useMemo(() => {
		const fromOrders = buildPredictHistoryFillsFromFilledOrders(filledOrders);
		// Activity is per-user (JWT) and supersedes the API-key matches feed when present —
		// using both would double-count the same `MATCH_SUCCESS` events.
		if (activity.length > 0) {
			const fromActivity = buildPredictHistoryFillsFromActivity(activity);
			return mergePredictHistoryFillMaps(fromOrders, fromActivity);
		}
		if (!matchesFilterSigner || matches.length === 0) return fromOrders;
		return mergePredictHistoryFillMaps(
			fromOrders,
			buildPredictHistoryFillsFromMatches(matchesFilterSigner, matches),
		);
	}, [filledOrders, matches, matchesFilterSigner, activity]);

	const needsAuth =
		(all.length > 0 || activeTab === "history") &&
		(filledError || filledOrders.length === 0 || !filledFetched);
	usePredictEnsureAuth(needsAuth);

	const costLookup = useMemo(() => {
		const fromOrders = computePredictCostByToken(filledOrders);
		if (activity.length > 0) {
			const fromActivity = computePredictCostByTokenFromActivity(activity);
			return mergePredictCostMaps(fromOrders, fromActivity);
		}
		if (matches.length === 0 || !matchesFilterSigner) return fromOrders;
		const fromMatches = computePredictCostByTokenFromMatches(matchesFilterSigner, matches);
		return mergePredictCostMaps(fromOrders, fromMatches);
	}, [filledOrders, matches, matchesFilterSigner, activity]);

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
		for (const ev of activity) {
			const mid = ev.market?.id;
			if (mid != null && Number.isFinite(Number(mid))) {
				ids.add(Number(mid));
			}
		}
		for (const tid of costLookup.keys()) {
			const mid =
				predictMarketIdForTokenFromActivity(activity, tid) ??
				predictMarketIdForTokenFromMatches(matches, tid);
			if (mid != null) ids.add(mid);
		}
		for (const tid of historyFillsByToken.keys()) {
			const mid =
				predictMarketIdForTokenFromActivity(activity, tid) ??
				predictMarketIdForTokenFromMatches(matches, tid);
			if (mid != null) ids.add(mid);
		}
		for (const tid of redeemEventsByToken.keys()) {
			const mid =
				predictMarketIdForTokenFromActivity(activity, tid) ??
				predictMarketIdForTokenFromMatches(matches, tid);
			if (mid != null) ids.add(mid);
		}
		return Array.from(ids);
	}, [
		all,
		openOrders,
		filledOrders,
		matches,
		activity,
		costLookup,
		historyFillsByToken,
		redeemEventsByToken,
	]);

	const marketsQuery = usePredictMarketDetailsMap(marketIds, marketIds.length > 0);
	const marketDetails = marketsQuery.data ?? new Map<number, PredictMarketDetail>();

	const { active, winnings, history } = useMemo(() => {
		const a: VenuePosition[] = [];
		const w: VenuePosition[] = [];
		const h: VenuePosition[] = [];
		const seenTokens = new Set<string>();

		for (const pos of all) {
			const detail = pos.numericMarketId ? marketDetails.get(pos.numericMarketId) : undefined;
			const costEntry = getPredictCostForToken(costLookup, pos.tokenId);
			const enriched = { ...pos };
			if (costEntry) {
				enriched.avgPrice = costEntry.avgPrice;
				enriched.cost = costEntry.totalCost;
				enriched.pnl = enriched.currentValue - costEntry.totalCost;
				enriched.pnlPercent =
					costEntry.totalCost > 0
						? ((enriched.currentValue - costEntry.totalCost) / costEntry.totalCost) * 100
						: null;
				if (costEntry.lastTradeAtMs != null) {
					enriched.historyTradeAt = new Date(costEntry.lastTradeAtMs).toISOString();
				}
			}
			const fillsForPredict = historyFillsByToken.get(normalizePredictTokenId(pos.tokenId));
			if (fillsForPredict && fillsForPredict.length > 0) {
				(enriched as VenuePosition).historyFills = fillsForPredict;
			}
			if (detail?.status === "RESOLVED") {
				enriched.marketStatus = "RESOLVED";
				const outcomeMatch = detail.outcomes?.find(
					(o) => normalizePredictTokenId(o.onChainId) === pos.tokenId,
				);
				enriched.outcomeResult = (outcomeMatch?.status as "WON" | "LOST") ?? null;
				if (enriched.outcomeResult === "WON") w.push(enriched);
				else h.push(enriched);
			} else {
				enriched.marketStatus = detail?.status ?? undefined;
				a.push(enriched);
			}
			seenTokens.add(normalizePredictTokenId(pos.tokenId));
		}

		// Claimed-winner rescue: for each REDEEM event whose token is no longer in `all`
		// (ERC1155 burned at claim time), synthesize a History row so won markets do not
		// silently disappear after the user claims.
		for (const [tokenId, redeems] of redeemEventsByToken) {
			if (seenTokens.has(tokenId)) continue;
			if (redeems.length === 0) continue;
			const last = redeems[redeems.length - 1]!;
			const marketId =
				last.market?.id ??
				predictMarketIdForTokenFromActivity(activity, tokenId) ??
				predictMarketIdForTokenFromMatches(matches, tokenId);
			const detail = marketId != null ? marketDetails.get(marketId) : undefined;
			const cost = costLookup.get(tokenId);
			const fills = historyFillsByToken.get(tokenId);
			const payout = sumPredictRedeemPayout(redeems);

			const outcomeNameFromDetail = detail?.outcomes?.find(
				(o) => normalizePredictTokenId(o.onChainId) === tokenId,
			)?.name;
			const outcomeName = last.outcome?.name ?? outcomeNameFromDetail ?? "Yes";

			const titleSrc = (
				detail?.question ??
				detail?.title ??
				last.market?.question ??
				last.market?.title ??
				""
			).trim();
			const marketTitle =
				shortPredictFunMarketTitleForPortfolio(titleSrc) ||
				titleSrc ||
				(marketId != null ? `Market #${marketId}` : `Predict · ${tokenId.slice(0, 10)}…`);

			const sharesOut = cost?.totalShares ?? 0;
			const avgPrice = cost?.avgPrice ?? null;
			const costOut = cost?.totalCost ?? null;
			const pnl = costOut != null && Number.isFinite(costOut) ? payout - costOut : null;
			const pnlPercent =
				costOut != null && costOut > 0 && pnl != null ? (pnl / costOut) * 100 : null;

			const synth: VenuePosition = {
				venue: "predictfun",
				marketTitle,
				outcome: outcomeName,
				shares: sharesOut,
				avgPrice,
				currentPrice: null,
				cost: costOut,
				currentValue: payout,
				pnl,
				pnlPercent,
				tokenId,
				...(marketId != null ? { numericMarketId: marketId } : {}),
				conditionId: detail?.conditionId ?? last.market?.conditionId,
				marketStatus: "RESOLVED",
				outcomeResult: "WON",
				historyTradeAt: last.createdAt,
				...(fills && fills.length > 0 ? { historyFills: fills } : {}),
			};
			h.push(synth);
			seenTokens.add(tokenId);
		}

		return { active: a, winnings: w, history: h };
	}, [all, marketDetails, costLookup, historyFillsByToken, redeemEventsByToken, activity, matches]);

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
		activity,
		costLookup,
		historyFillsByToken,
		marketIds,
		marketDetails,
		positionsQuery,
		marketsQuery,
	};
}
