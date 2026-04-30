import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { type PredictionMarket } from "@/services/api/predictionMarketDataService";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	getOrderAggregates,
	getTradingReturns,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import { useUserData } from "context/UserDataContext";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useRecentSettlementClaim } from "context/RecentSettlementClaimContext";
import { usePredictionData } from "context/PredictionDataContext";
import { useOddsMonitor } from "context/OddsMonitorContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePolymarketTradeHistory } from "@/trading/polymarket/usePolymarketTradeHistory";
import {
	useLimitlessOpenOrders,
	useLimitlessTradeHistory,
	useLimitlessVenuePositions,
} from "@/trading/limitless/useLimitlessPortfolioVenue";
import { limitlessQueryKeys } from "@/trading/limitless/limitlessQueryKeys";
import { splitLimitlessVenuePositions } from "@/trading/limitless/splitLimitlessVenuePositions";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { usePredictOrders } from "@/trading/predict/usePredictOrders";
import { usePredictOrderMatches } from "@/trading/predict/usePredictOrderMatches";
import { usePredictEnsureAuth } from "@/trading/predict/usePredictEnsureAuth";
import {
	buildPredictHistoryFillsFromFilledOrders,
	computePredictCostByToken,
	mergePredictCostMaps,
	getPredictCostForToken,
	mapPredictOrdersToVenueOrders,
	normalizePredictTokenId,
	type PredictOrderRow,
} from "@/trading/predict/predictOrdersApi";
import {
	buildPredictHistoryFillsFromMatches,
	computePredictCostByTokenFromMatches,
	predictMarketIdForTokenFromMatches,
	type PredictMatchEventRow,
} from "@/trading/predict/predictMatchesApi";
import { getPrivateApiBaseUrl } from "@/config/privateApiBase";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import {
	type UmbrellaExchangeResolveQuery,
	shouldRequestVenueHistoryUmbrellaResolve,
	venueHistoryExchangeResolveKey,
	venuePositionToResolveQuery,
} from "@/trading/umbrellaVenueResolveKey";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import { inferPredictSideFromMarketDetail } from "@/trading/predict/predictPositionSide";
import { usePredictMarketDetailsMap } from "@/trading/predict/usePredictMarketDetailsMap";
import type { MatchedMarket } from "@/types/odds-monitor";
import {
	findMatchedMarketByPolyConditionId,
	inferPolymarketYesNoFromToken,
	parseVsTeamLabelsFromDisplayTitle,
} from "@/trading/polymarket/polyPositionSide";
import {
	buildUmbrellaLookupByPolymarketConditionId,
	polymarketConditionIdForResolveWire,
	polymarketConditionLookupKey,
} from "@/trading/polymarket/polymarketConditionLookup";
import {
	buildUmbrellaLookupByDflowEventTicker,
	buildUmbrellaLookupByDflowOutcomeMint,
	lookupUmbrellaByDflowEventTicker,
} from "@/trading/dflow/dflowUmbrellaLookup";
import {
	type VenueHistoryFill,
	type VenueId,
	type VenueOrder,
	type VenuePosition,
	isVenueMarketResolvedLike,
	venueDisplayLabel,
} from "@/types/trading/venuePosition";
import {
	type MarketPosition,
	type UmbrellaPositions,
	buildSyntheticOrder,
	mergeMarketPositions,
	buildSyntheticUmbrella,
	venueHistoryPositionToSyntheticOrders,
} from "../utils/positionHelpers";
import {
	buildPredictUmbrellaLookup,
	logPredictUmbrellaOnce,
	matchVenuePositionToUmbrella,
	resolvePredictUmbrellaForDisplay,
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import {
	shortPredictFunMarketTitleForPortfolio,
	stripUmbrellaDisplayPrefix,
} from "@/helpers/umbrellaDisplayName";
import { useHistoryResolve } from "./useHistoryResolve";
import { buildVenueMarketPosition } from "./venues/shared/buildVenueMarketPosition";
import { buildUnmatchedVenueUmbrellas } from "./venues/shared/buildUnmatchedVenueUmbrellas";
import {
	mergePredictHistoryFillMaps,
	predictFilledOrdersToVenueHistoryRows,
} from "./venues/predict/predictHistoryRows";

export default function usePositionsData() {
	const queryClient = useQueryClient();
	const { account, signerAddress, isDebugMode, debugAccount, realAccount } = useSignerContext();
	const {
		portfolioTotal: portfolioTotalCtx,
		cashBalance: cashBalanceCtx,
		cashLoading: portfolioCashLoading,
		loading: portfolioLoading,
	} = usePortfolio();
	const {
		orders,
		tokenBalances,
		loading: userDataLoading,
		refresh: refreshUserData,
		refreshTokenPositions,
		loadOrders,
	} = useUserData();
	const collateralTokens = useCollateralTokens();
	const { acknowledgeClearedPayouts } = useRecentSettlementClaim();

	// Lazy-load orders when Positions page mounts (deferred from startup)
	useEffect(() => {
		loadOrders();
	}, [loadOrders]);
	const {
		umbrellas,
		getQuestionsForUmbrella,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
		loading: predictionLoading,
		allBooksPreview,
		booksPreviewLoading,
	} = usePredictionData();

	const { appState } = useOddsMonitor();
	const predictUmbrellaLookup = useMemo(
		() => buildPredictUmbrellaLookup(appState?.markets, umbrellas),
		[appState?.markets, umbrellas],
	);

	const {
		polymarketSafe,
		solanaAddress,
		limitlessMakerBase,
		isLoading: fundingAddressesLoading,
	} = useFundingAddresses();
	const { authenticated } = usePrivy();
	const dflowProof = useDflowProofStatus();
	const solanaLinked = Boolean(solanaAddress?.trim());
	const polyPositionsQuery = usePolymarketPositions(polymarketSafe);
	const allPolyPositions = polyPositionsQuery.data ?? [];
	const polyTradeHistoryQuery = usePolymarketTradeHistory(polymarketSafe);

	const limitlessPortfolioEnabled =
		Boolean(authenticated) && Boolean(limitlessMakerBase?.trim());
	const limitlessVenuePositionsQuery =
		useLimitlessVenuePositions(limitlessPortfolioEnabled);
	const limitlessOpenOrdersQuery = useLimitlessOpenOrders(limitlessPortfolioEnabled);
	const limitlessTradeHistoryQuery =
		useLimitlessTradeHistory(limitlessPortfolioEnabled);
	const allLimitlessVenuePositions = limitlessVenuePositionsQuery.data ?? [];

	const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(new Set());
	const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history">("positions");

	const allUmbrellas = useMemo(() => {
		return umbrellas.map((umb) => ({
			umbrella: umb,
			markets: (getAllQuestionsForUmbrella(umb._id) as PredictionMarket[]) || [],
		}));
	}, [umbrellas, getAllQuestionsForUmbrella]);

	const effectiveAccount = account || null;

	/**
	 * After the Positions shell has gone strict-ready once for this `account`, do not drop back
	 * into the full-page skeleton when `predictMarketsQuery` re-keys (e.g. filled orders / matches
	 * widen `predictMarketIds`). Rows reconcile in place instead.
	 */
	const positionsDataFullyLoadedLatchForRef = useRef<string | null>(null);
	const positionsTabReadyLatchForRef = useRef<string | null>(null);
	const historyTabReadyLatchForRef = useRef<string | null>(null);

	const predictPositionsQuery = usePredictPositions(signerAddress ?? effectiveAccount);
	const allPredictPositions = predictPositionsQuery.data ?? [];

	const predictOrdersEnabled =
		(predictPositionsQuery.isSuccess && (predictPositionsQuery.data?.length ?? 0) > 0) ||
		activeTab === "orders" ||
		activeTab === "history";

	const {
		filledOrders: predictFilledOrders,
		openOrders: predictOpenOrders,
		filledError: predictFilledError,
		filledFetched: predictFilledFetched,
	} = usePredictOrders(predictOrdersEnabled);

	const predictSignerRawForMatches = useMemo(
		() =>
			import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS?.trim() ||
			signerAddress ||
			effectiveAccount ||
			null,
		[signerAddress, effectiveAccount],
	);

	const predictMatchesQuery = usePredictOrderMatches({
		signerAddress: predictSignerRawForMatches,
		enabled:
			Boolean(predictSignerRawForMatches?.startsWith("0x")) &&
			predictFilledFetched,
	});

	const predictHistoryFillsByToken = useMemo(() => {
		const fromOrders = buildPredictHistoryFillsFromFilledOrders(
			predictFilledOrders,
		);
		const filter = predictMatchesQuery.filterSigner;
		const matchRows = predictMatchesQuery.data ?? [];
		if (!filter || matchRows.length === 0) return fromOrders;
		return mergePredictHistoryFillMaps(
			fromOrders,
			buildPredictHistoryFillsFromMatches(filter, matchRows),
		);
	}, [
		predictFilledOrders,
		predictMatchesQuery.data,
		predictMatchesQuery.filterSigner,
	]);

	const needsPredictAuth =
		(allPredictPositions.length > 0 || activeTab === "history") &&
		(predictFilledError || predictFilledOrders.length === 0 || !predictFilledFetched);
	usePredictEnsureAuth(needsPredictAuth);

	const predictCostLookup = useMemo(() => {
		const fromOrders = computePredictCostByToken(predictFilledOrders);
		const rows = predictMatchesQuery.data ?? [];
		const filter = predictMatchesQuery.filterSigner;
		if (rows.length === 0 || !filter) return fromOrders;
		const fromMatches = computePredictCostByTokenFromMatches(filter, rows);
		return mergePredictCostMaps(fromOrders, fromMatches);
	}, [predictFilledOrders, predictMatchesQuery.data, predictMatchesQuery.filterSigner]);

	const privateApi = usePrivateApiClient();

	const predictMarketIds = useMemo(() => {
		const ids = new Set<number>();
		for (const p of allPredictPositions) {
			if (p.numericMarketId) ids.add(p.numericMarketId);
		}
		for (const o of predictOpenOrders) {
			ids.add(o.marketId);
		}
		for (const row of predictFilledOrders) {
			ids.add(row.marketId);
		}
		for (const m of predictMatchesQuery.data ?? []) {
			const mid = m.market?.id;
			if (mid != null && Number.isFinite(Number(mid))) {
				ids.add(Number(mid));
			}
		}
		const matchRows = predictMatchesQuery.data ?? [];
		for (const tid of predictCostLookup.keys()) {
			const mid = predictMarketIdForTokenFromMatches(matchRows, tid);
			if (mid != null) ids.add(mid);
		}
		for (const tid of predictHistoryFillsByToken.keys()) {
			const mid = predictMarketIdForTokenFromMatches(matchRows, tid);
			if (mid != null) ids.add(mid);
		}
		return Array.from(ids);
	}, [
		allPredictPositions,
		predictOpenOrders,
		predictFilledOrders,
		predictMatchesQuery.data,
		predictCostLookup,
		predictHistoryFillsByToken,
	]);

	const dflowRpcEnabled =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified;
	const dflowPositionsQuery = useDflowPositions(solanaAddress, privateApi, {
		enabled: dflowRpcEnabled,
	});
	const allDflowPositions = dflowPositionsQuery.data ?? [];

	const { limitlessPositions, limitlessWinnings, limitlessHistory } = useMemo(() => {
		const split = splitLimitlessVenuePositions(allLimitlessVenuePositions);
		return {
			limitlessPositions: split.active,
			limitlessWinnings: split.winnings,
			limitlessHistory: split.history,
		};
	}, [allLimitlessVenuePositions]);

	const predictMarketsQuery = usePredictMarketDetailsMap(
		predictMarketIds,
		predictMarketIds.length > 0,
	);
	const predictMarketDetails = predictMarketsQuery.data ?? new Map<number, PredictMarketDetail>();

	// --- Atomic loading gate: core portfolio + venue positions (not History-only feeds) ---
	// Polymarket activity / Limitless portfolio **history** APIs must not block the global shell —
	// History tab uses `isHistoryTabContentReady` (see Positions.tsx).
	// Match PortfolioContext: only wait on DFlow when `useDflowPositions` is actually enabled.
	const dflowVenueSettled =
		!dflowRpcEnabled || !dflowPositionsQuery.isPending;

	const limitlessVenueSettled =
		!limitlessPortfolioEnabled ||
		(!limitlessVenuePositionsQuery.isLoading &&
			!limitlessOpenOrdersQuery.isLoading);

	const venueQueriesSettled =
		!polyPositionsQuery.isLoading &&
		!predictPositionsQuery.isLoading &&
		dflowVenueSettled &&
		limitlessVenueSettled;

	const venueQueriesSettledForPositionsBody =
		!polyPositionsQuery.isLoading &&
		!predictPositionsQuery.isLoading &&
		(!limitlessPortfolioEnabled || !limitlessVenuePositionsQuery.isLoading);

	// `predictMarketsQuery` stays in this gate on purpose: without market details, Predict rows
	// would all appear under active Positions first, then jump to Winnings when RESOLVED — bad UX.
	// If perf logs show this dominates, prefer backend batching or accept that tradeoff explicitly.
	const strictIsDataFullyLoaded =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettled &&
		(predictMarketIds.length === 0 || !predictMarketsQuery.isLoading);

	/** Positions tab: same shell for header + body — includes DFlow when verified (no second skeleton strip). */
	const strictIsPositionsTabContentReady =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettledForPositionsBody &&
		dflowVenueSettled &&
		(predictMarketIds.length === 0 || !predictMarketsQuery.isLoading);

	/**
	 * Full-page Positions shell bypass (`Positions.tsx`): after this delay with the strict shell
	 * still up, we show partial data so Poly/Predict are not blocked by a slow DFlow stack.
	 *
	 * DFlow path = paginated `GET /api/dflow/onchain-trades` + `filter_outcome_mints` + parallel
	 * (`markets/batch` + batched Solana Token-2022 reads). Public RPC can be slow; keep the
	 * skeleton up longer **only while** `dflowPositionsQuery.isPending` so verified Kalshi users
	 * see fewer empty-state flashes. Other venues stay on the shorter budget.
	 */
	const POSITIONS_SHELL_BYPASS_MS_DEFAULT = 5_000;
	const POSITIONS_SHELL_BYPASS_MS_DFLOW_PENDING = 10_000;
	const positionsShellBypassMaxWaitMs =
		dflowRpcEnabled && dflowPositionsQuery.isPending
			? POSITIONS_SHELL_BYPASS_MS_DFLOW_PENDING
			: POSITIONS_SHELL_BYPASS_MS_DEFAULT;

	// --- Enrich + split venue positions ---
	const { predictPositions, predictWinnings, predictHistory } = useMemo(() => {
		const active: typeof allPredictPositions = [];
		const won: typeof allPredictPositions = [];
		const lost: typeof allPredictPositions = [];

		for (const pos of allPredictPositions) {
			const detail = pos.numericMarketId ? predictMarketDetails.get(pos.numericMarketId) : undefined;
			const costEntry = getPredictCostForToken(predictCostLookup, pos.tokenId);
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
					enriched.historyTradeAt = new Date(
						costEntry.lastTradeAtMs,
					).toISOString();
				}
			}
			const fillsForPredict = predictHistoryFillsByToken.get(
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
				enriched.outcomeResult = (outcomeMatch?.status as "WON" | "LOST") ?? null;
				if (enriched.outcomeResult === "WON") won.push(enriched);
				else lost.push(enriched);
			} else {
				enriched.marketStatus = detail?.status ?? undefined;
				active.push(enriched);
			}
		}
		return { predictPositions: active, predictWinnings: won, predictHistory: lost };
	}, [
		allPredictPositions,
		predictMarketDetails,
		predictCostLookup,
		predictHistoryFillsByToken,
	]);

	const { activePolyPositions, polyWinnings, polyHistory } = useMemo(() => {
		const active: typeof allPolyPositions = [];
		const won: typeof allPolyPositions = [];
		const lost: typeof allPolyPositions = [];
		for (const pos of allPolyPositions) {
			if (pos.redeemable && pos.currentValue > 0) won.push(pos);
			else if (pos.redeemable) lost.push(pos);
			else active.push(pos);
		}
		return { activePolyPositions: active, polyWinnings: won, polyHistory: lost };
	}, [allPolyPositions]);
	const polyPositions = activePolyPositions;

	const { dflowPositions, dflowWinnings, dflowHistory } = useMemo(() => {
		const active: typeof allDflowPositions = [];
		const won: typeof allDflowPositions = [];
		const lost: typeof allDflowPositions = [];
		for (const pos of allDflowPositions) {
			if (pos.marketStatus === "FINALIZED") {
				if (pos.outcomeResult === "WON") won.push(pos);
				else lost.push(pos);
			} else {
				active.push(pos);
			}
		}
		return { dflowPositions: active, dflowWinnings: won, dflowHistory: lost };
	}, [allDflowPositions]);

	const handleClaimSuccess = useCallback(
		async (marketId: string | string[], _umbrellaId: string) => {
			const ids = Array.isArray(marketId) ? marketId : [marketId];
			const payoutKeys = ids
				.map((id) => String(id ?? "").trim())
				.filter((k) => k.length > 0);
			// Same keys as Winnings rows (`predict-win-*`, LevelUp `balanceId`, etc.). PortfolioContext
			// uses this set to drop stale venue MTM until predict/poly queries refetch after redeem.
			if (payoutKeys.length > 0) {
				acknowledgeClearedPayouts(payoutKeys);
			}
			setClaimedMarkets((prev) => {
				const next = new Set(prev);
				for (const id of payoutKeys) next.add(id);
				return next;
			});
			try {
				// Re-fetch venue position APIs (Predict / Poly / DFlow) and mark-to-market data so
				// portfolio total matches fresh cash; cash alone can update while stale mark values double-count.
				await Promise.all([
					refreshUserData(),
					queryClient.invalidateQueries({ queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY] }),
					queryClient.invalidateQueries({ queryKey: ["predict-positions"] }),
					queryClient.invalidateQueries({ queryKey: ["predict-market-details"] }),
					queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] }),
					queryClient.invalidateQueries({ queryKey: ["dflow-positions"] }),
					queryClient.invalidateQueries({ queryKey: limitlessQueryKeys.root }),
				]);
				await Promise.all([
					collateralTokens.refetch(),
					refreshTokenPositions(),
				]);
			} catch (e) {
				console.error("[usePositionsData] Post-claim balance refresh failed:", e);
			}
		},
		[acknowledgeClearedPayouts, refreshUserData, refreshTokenPositions, collateralTokens, queryClient],
	);

	// --- Build conditionId -> umbrella index for fast venue matching ---
	const umbrellaLookupByConditionId = useMemo(
		() => buildUmbrellaLookupByPolymarketConditionId(umbrellas),
		[umbrellas],
	);

	const umbrellaLookupByDflowOutcomeMint = useMemo(
		() => buildUmbrellaLookupByDflowOutcomeMint(umbrellas),
		[umbrellas],
	);

	const umbrellaLookupByDflowEventTicker = useMemo(
		() => buildUmbrellaLookupByDflowEventTicker(umbrellas),
		[umbrellas],
	);

	// --- Active positions grouped by umbrella ---
	const umbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) return [];

		const oddsMonitorMarkets = appState?.markets ?? [];

		const matchedPolyTokenIds = new Set<string>();
		const matchedPredictTokenIds = new Set<string>();
		const matchedDflowTokenIds = new Set<string>();
		const matchedLimitlessTokenIds = new Set<string>();

		const levelUpUmbrellas: UmbrellaPositions[] = umbrellas
			.map((umbrella) => {
				const markets = (getQuestionsForUmbrella(umbrella._id) as PredictionMarket[]) || [];
				const processedMarkets: MarketPosition[] = markets
					.map((market) => {
						const balanceId = market._id;
						const priceId = market.questionId || market._id;
						const tb = balanceId ? tokenBalances.get(balanceId) : undefined;
						const yesBalance = tb ? Number(tb.yesBalance) : 0;
						const noBalance = tb ? Number(tb.noBalance) : 0;
						const preview = priceId ? allBooksPreview[priceId] : undefined;
						const yesPrice = preview?.lowestAsk ?? null;
						const noPrice =
							preview?.highestBid !== null && preview?.highestBid !== undefined
								? 1 - preview.highestBid
								: null;
						const yesValue = yesPrice ? yesBalance * yesPrice : 0;
						const noValue = noPrice ? noBalance * noPrice : 0;
						const marketOrders = (orders || []).filter(
							(order) => order.questionId === priceId || order.questionId === balanceId,
						);
						const aggregates = getOrderAggregates(orders || [], balanceId);
						const taggedOrders = marketOrders.map((o) => (o.venue ? o : { ...o, venue: "LevelUp" }));
						return {
							market,
							yesBalance,
							noBalance,
							yesPrice,
							noPrice,
							yesValue,
							noValue,
							totalValue: yesValue + noValue,
							orders: taggedOrders,
							aggregates,
							venue: "levelup" as VenueId,
						};
					})
					.filter((m) => m.yesBalance > 0 || m.noBalance > 0);
				const activeMarkets = processedMarkets.filter((mp) => (mp.market as any).status !== "resolved");

				const matchVenuePositions = (
					venuePositions: any[],
					matchedIds: Set<string>,
					venue: VenueId,
					venueName: string,
					qidPrefix: string,
				) => {
					const matches: MarketPosition[] = [];
					for (const pv of venuePositions) {
						if (matchedIds.has(pv.tokenId)) continue;
						const predictDetail =
							venue === "predictfun" && pv.numericMarketId != null
								? predictMarketDetails.get(pv.numericMarketId)
								: undefined;
						const predictTitleHint =
							venue === "predictfun"
								? (predictDetail?.question ?? predictDetail?.title ?? "").trim() ||
									undefined
								: undefined;
						const matched = matchVenuePositionToUmbrella(
							pv,
							venue,
							umbrellaLookupByConditionId,
							umbrellas,
							predictUmbrellaLookup,
							predictTitleHint,
							umbrellaLookupByDflowOutcomeMint,
							umbrellaLookupByDflowEventTicker,
						);
						if (matched && matched._id === umbrella._id) {
							matchedIds.add(pv.tokenId);
							let overrides: any = undefined;
							const polyMatchedRow =
								venue === "polymarket"
									? findMatchedMarketByPolyConditionId(
											oddsMonitorMarkets,
											pv.conditionId,
										)
									: null;
							const polyLabelsForMatch =
								venue === "polymarket"
									? parseVsTeamLabelsFromDisplayTitle(matched.displayName) ??
										parseVsTeamLabelsFromDisplayTitle(pv.marketTitle)
									: null;
							const polyInferenceForMatch =
								polyMatchedRow && polyLabelsForMatch
									? {
											matched: polyMatchedRow,
											yesTeamLabel: polyLabelsForMatch.yesTeamLabel,
											noTeamLabel: polyLabelsForMatch.noTeamLabel,
										}
									: null;
							if (venue === "predictfun") {
								let liveYesPrice: number | null = null;
								let liveNoPrice: number | null = null;
								for (const luMarket of markets) {
									const pid = luMarket.questionId || luMarket._id;
									const prev = pid ? allBooksPreview[pid] : undefined;
									if (prev) {
										liveYesPrice = prev.lowestAsk ?? null;
										liveNoPrice =
											prev.highestBid !== null && prev.highestBid !== undefined
												? 1 - prev.highestBid
												: null;
										break;
									}
								}
								const inferredPv = inferPredictSideFromMarketDetail(
									predictDetail ?? undefined,
									pv.tokenId,
								);
								const isYesForPredict = inferredPv
									? inferredPv.side === "Yes"
									: pv.outcome.toLowerCase() === "yes" ||
										(pv.outcome.toLowerCase() !== "no" &&
											(pv.marketTitle?.toLowerCase() ?? "").includes(
												pv.outcome.toLowerCase(),
											));
								const yP = isYesForPredict
									? (liveYesPrice ?? pv.currentPrice)
									: null;
								const nP = isYesForPredict
									? null
									: (liveNoPrice ?? pv.currentPrice);
								const yV =
									yP !== null ? pv.shares * yP : isYesForPredict ? pv.currentValue : 0;
								const nV =
									nP !== null ? pv.shares * nP : isYesForPredict ? 0 : pv.currentValue;
								overrides = { yesPrice: yP, noPrice: nP, yesValue: yV, noValue: nV };
							}
							const displayOverride =
								matched.displayName?.trim() || undefined;
							matches.push(
								buildVenueMarketPosition(
									pv,
									venue,
									venueName,
									qidPrefix,
									overrides,
									displayOverride,
									venue === "predictfun" ? (predictDetail ?? null) : null,
									polyInferenceForMatch,
								),
							);
						}
					}
					return matches;
				};

				const polyMatches = matchVenuePositions(polyPositions, matchedPolyTokenIds, "polymarket", "Polymarket", "poly");
				const predictMatches = matchVenuePositions(predictPositions, matchedPredictTokenIds, "predictfun", "Predict", "predict");
				const dflowMatches = matchVenuePositions(dflowPositions, matchedDflowTokenIds, "dflow", "DFlow", "dflow");
				const limitlessMatches = matchVenuePositions(
					limitlessPositions,
					matchedLimitlessTokenIds,
					"limitless",
					venueDisplayLabel("limitless"),
					"lx",
				);

				const allMarkets = [
					...activeMarkets,
					...polyMatches,
					...predictMatches,
					...dflowMatches,
					...limitlessMatches,
				];
				return { umbrella, markets: mergeMarketPositions(allMarkets) };
			})
			.filter((u) => u.markets.length > 0);

		const polyUmbrellas = buildUnmatchedVenueUmbrellas(
			polyPositions, matchedPolyTokenIds, "polymarket", "Polymarket", "poly",
			(p) => p.eventSlug || p.marketTitle, "poly-event",
			null,
			undefined,
			oddsMonitorMarkets,
			[],
		);
		const predictUmbrellas = buildUnmatchedVenueUmbrellas(
			predictPositions, matchedPredictTokenIds, "predictfun", "Predict", "predict",
			(p) => p.marketTitle || p.tokenId, "predict-market",
			predictUmbrellaLookup,
			predictMarketDetails,
			[],
			umbrellas,
		);
		const dflowUmbrellas = buildUnmatchedVenueUmbrellas(
			dflowPositions, matchedDflowTokenIds, "dflow", "DFlow", "dflow",
			(p) => p.marketTitle || p.tokenId, "dflow-market",
			null,
			undefined,
			[],
			umbrellas,
		);
		const limitlessUmbrellas = buildUnmatchedVenueUmbrellas(
			limitlessPositions,
			matchedLimitlessTokenIds,
			"limitless",
			venueDisplayLabel("limitless"),
			"lx",
			(p) => p.eventSlug || p.marketTitle || p.tokenId,
			"lx-market",
			null,
			undefined,
			[],
			[],
		);

		return [
			...levelUpUmbrellas,
			...polyUmbrellas,
			...predictUmbrellas,
			...dflowUmbrellas,
			...limitlessUmbrellas,
		];
	}, [
		effectiveAccount, umbrellas, getQuestionsForUmbrella, tokenBalances, orders,
		allBooksPreview, polyPositions, predictPositions, dflowPositions, limitlessPositions, umbrellaLookupByConditionId,
		umbrellaLookupByDflowOutcomeMint,
		umbrellaLookupByDflowEventTicker,
		predictUmbrellaLookup,
		predictMarketDetails,
		appState?.markets,
	]);

	// --- Resolved (winnings) ---
	const resolvedUmbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) return [];
		const oddsMonitorMarkets = appState?.markets ?? [];
		const resolved: UmbrellaPositions[] = [];

		Object.entries(resolvedMarketsByUmbrella).forEach(([umbrellaId, resolvedMarkets]) => {
			if (resolvedMarkets.length === 0) return;
			let umbrella = umbrellas.find((u) => u._id === umbrellaId);
			if (!umbrella) {
				const firstMarket = resolvedMarkets[0];
				umbrella = {
					_id: umbrellaId,
					displayName: firstMarket?.umbrellaName || `Umbrella ${umbrellaId.slice(0, 8)}...`,
					children: resolvedMarkets,
					originalChildren: resolvedMarkets,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
					__v: 0,
				} as Umbrella;
			}

			const res = resolvedMarkets
				.map((m) => {
					const balanceId = (m as any)._id;
					const tb = balanceId ? tokenBalances.get(balanceId) : undefined;
					return {
						market: m,
						yesBalance: tb ? Number(tb.yesBalance) : 0,
						noBalance: tb ? Number(tb.noBalance) : 0,
					} as any;
				})
				.filter((mp: any) => {
					const balanceId = (mp.market as any)._id;
					if (claimedMarkets.has(balanceId)) return false;
					const outcome = String((mp.market as any).resolvedOutcome || "").toLowerCase();
					if (
						(outcome === "yes" && mp.yesBalance > 0) ||
						(outcome === "no" && mp.noBalance > 0)
					) {
						return true;
					}
					// On-chain token balance for this market may not be in `tokenBalances` yet after refresh.
					// Don't drop the row until the map actually contains the key (avoids 0/1/2 flapping).
					if (
						userDataLoading &&
						balanceId &&
						!tokenBalances.has(String(balanceId))
					) {
						return true;
					}
					return false;
				})
				.map(
					(mp: any) =>
						({
							market: mp.market,
							yesBalance: mp.yesBalance,
							noBalance: mp.noBalance,
							yesPrice: null, noPrice: null, yesValue: 0, noValue: 0, totalValue: 0,
							orders: [],
							aggregates: {
								Yes: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 },
								No: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 },
							},
						} as MarketPosition),
				);

			if (res.length > 0) resolved.push({ umbrella, markets: res });
		});

		const appendVenueWinnings = (
			winnings: any[],
			venue: VenueId,
			idPrefix: string,
			groupKeyFn: (p: any) => string,
		) => {
			const byGroup = new Map<string, any[]>();
			for (const pv of winnings) {
				const key = groupKeyFn(pv);
				const arr = byGroup.get(key) ?? [];
				arr.push(pv);
				byGroup.set(key, arr);
			}
			for (const [, positions] of byGroup) {
				const first = positions[0];
				const firstWinDetail =
					venue === "predictfun" && first.numericMarketId != null
						? predictMarketDetails.get(first.numericMarketId)
						: undefined;
				const firstWinHint =
					(firstWinDetail?.question ?? firstWinDetail?.title ?? "").trim() || undefined;
				const resolvedPredictWin =
					venue === "predictfun"
						? resolvePredictUmbrellaForDisplay(
								first,
								predictUmbrellaLookup,
								umbrellas,
								firstWinHint,
							)
						: null;
				const predictWinSyntheticLabel =
					venue === "predictfun"
						? resolvedPredictWin?.displayName?.trim() ||
							shortPredictFunMarketTitleForPortfolio(
								firstWinHint || first.marketTitle,
							) ||
							first.marketTitle
						: first.marketTitle;
				const umbrellaForWinBlock =
					resolvedPredictWin ??
					buildSyntheticUmbrella(
						`${idPrefix}-${first.tokenId.slice(0, 10)}`,
						predictWinSyntheticLabel,
						first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
					);
				const blockMarketTitle =
					venue === "predictfun"
						? resolvedPredictWin?.displayName?.trim() ||
							shortPredictFunMarketTitleForPortfolio(
								firstWinHint || first.marketTitle,
							) ||
							first.marketTitle
						: first.marketTitle;
				const markets: MarketPosition[] = positions.map((pv) => {
					const mDetail =
						venue === "predictfun" && pv.numericMarketId != null
							? predictMarketDetails.get(pv.numericMarketId)
							: undefined;
					const inferredW =
						venue === "predictfun"
							? inferPredictSideFromMarketDetail(mDetail ?? undefined, pv.tokenId)
							: null;
					const polyWinRow =
						venue === "polymarket"
							? findMatchedMarketByPolyConditionId(oddsMonitorMarkets, pv.conditionId)
							: null;
					const polyWinLabels =
						venue === "polymarket"
							? parseVsTeamLabelsFromDisplayTitle(pv.marketTitle) ??
								parseVsTeamLabelsFromDisplayTitle(blockMarketTitle)
							: null;
					const polyWinInf =
						venue === "polymarket" && polyWinRow && polyWinLabels
							? inferPolymarketYesNoFromToken(
									pv,
									polyWinRow,
									polyWinLabels.yesTeamLabel,
									polyWinLabels.noTeamLabel,
								)
							: null;
					const isYes =
						venue === "limitless"
							? pv.outcome.trim().toLowerCase() === "yes"
							: venue === "polymarket"
								? polyWinInf
									? polyWinInf.side === "Yes"
									: pv.outcome.toLowerCase() === "yes" ||
										(pv.outcome.toLowerCase() !== "no" &&
											(pv.marketTitle?.toLowerCase() ?? "").includes(
												pv.outcome.toLowerCase(),
											))
								: inferredW != null
									? inferredW.side === "Yes"
									: pv.outcome.toLowerCase() === "yes" ||
										(pv.outcome.toLowerCase() !== "no" &&
											(pv.marketTitle?.toLowerCase() ?? "").includes(
												pv.outcome.toLowerCase(),
											));
					const teamLabel =
						venue === "predictfun"
							? (inferredW?.teamName ?? pv.outcome)
							: pv.outcome;
					return {
						market: {
							_id: `${idPrefix}-${pv.tokenId.slice(0, 12)}`,
							displayName: blockMarketTitle,
							questionId: pv.conditionId ?? pv.tokenId,
							conditionId: pv.conditionId,
							resolvedOutcome: isYes ? "yes" : "no",
							_venue: venue,
							_isNegRisk: mDetail?.isNegRisk ?? false,
							_isYieldBearing: mDetail?.isYieldBearing ?? false,
						} as unknown as PredictionMarket,
						yesBalance: isYes ? pv.shares : 0,
						noBalance: isYes ? 0 : pv.shares,
						yesPrice: null, noPrice: null, yesValue: 0, noValue: 0, totalValue: 0,
						orders: [],
						aggregates: {
							Yes: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 },
							No: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 },
						},
						venue,
						predictOutcomeLabelYes:
							venue === "predictfun" && isYes ? teamLabel : undefined,
						predictOutcomeLabelNo:
							venue === "predictfun" && !isYes ? teamLabel : undefined,
					};
				}).filter((mp) => !claimedMarkets.has((mp.market as any)._id));
				if (markets.length > 0) {
					if (venue === "predictfun" && !resolvedPredictWin) {
						logPredictUmbrellaOnce(
							"winnings-synthetic-block",
							String(first.numericMarketId ?? first.tokenId ?? ""),
							{
								syntheticLabelSample: predictWinSyntheticLabel.slice(0, 220),
								hadMarketDetailsHint: Boolean(firstWinHint),
								hintSample: firstWinHint?.slice(0, 220),
								numericMarketId: first.numericMarketId,
								tokenIdSample: String(first.tokenId ?? "").slice(0, 32),
								positionsInGroup: positions.length,
							},
						);
					}
					resolved.push({ umbrella: umbrellaForWinBlock, markets });
				}
			}
		};

		appendVenueWinnings(predictWinnings, "predictfun", "predict-win", (p) => {
			const d =
				p.numericMarketId != null ? predictMarketDetails.get(p.numericMarketId) : undefined;
			const hint = (d?.question ?? d?.title ?? "").trim() || undefined;
			const u = resolvePredictUmbrellaForDisplay(p, predictUmbrellaLookup, umbrellas, hint);
			return u?._id ?? String(p.numericMarketId ?? p.tokenId);
		});
		appendVenueWinnings(polyWinnings, "polymarket", "poly-win", (p) => p.eventSlug || p.marketTitle);
		appendVenueWinnings(dflowWinnings, "dflow", "dflow-win", (p) => p.marketTitle || p.tokenId);
		appendVenueWinnings(
			limitlessWinnings,
			"limitless",
			"lx-win",
			(p) => p.eventSlug || p.marketTitle || p.tokenId,
		);

		return resolved;
	}, [
		effectiveAccount, resolvedMarketsByUmbrella, umbrellas, tokenBalances,
		userDataLoading, claimedMarkets, predictWinnings, polyWinnings, dflowWinnings, limitlessWinnings, predictMarketDetails,
		predictUmbrellaLookup,
		appState?.markets,
	]);

	// --- Derived values: header "Positions" = open M2M + unclaimed winnings (same as Winnings table) ---
	const openPositionsValue = useMemo(() => {
		return umbrellaPositions.reduce(
			(total, u) => total + u.markets.reduce((s, m) => s + m.totalValue, 0),
			0,
		);
	}, [umbrellaPositions]);

	const unclaimedWinningsPayoutTotal = useMemo(() => {
		if (!resolvedUmbrellaPositions.length) return 0;
		return resolvedUmbrellaPositions.reduce((t, u) => {
			return (
				t +
				u.markets.reduce((s, mp) => {
					const o = String((mp.market as { resolvedOutcome?: string }).resolvedOutcome || "").toLowerCase();
					if (o === "yes" && Number(mp.yesBalance) > 0) {
						return s + Number(mp.yesBalance);
					}
					if (o === "no" && Number(mp.noBalance) > 0) {
						return s + Number(mp.noBalance);
					}
					return s;
				}, 0)
			);
		}, 0);
	}, [resolvedUmbrellaPositions]);

	const positionsTotalValue = useMemo(
		() => openPositionsValue + unclaimedWinningsPayoutTotal,
		[openPositionsValue, unclaimedWinningsPayoutTotal],
	);

	// Includes merged LevelUp + venue rows (`mergeMarketPositions` clears `venue`), so Polymarket
	// marks are not dropped when the primary `market._id` is the LevelUp question.
	const portfolioSidePriceMap = useMemo(() => {
		const map: Record<string, { yesPrice: number | null; noPrice: number | null }> = {};
		for (const up of umbrellaPositions) {
			for (const mp of up.markets) {
				const id = mp.market._id;
				if (!id) continue;
				map[id] = { yesPrice: mp.yesPrice, noPrice: mp.noPrice };
			}
		}
		return map;
	}, [umbrellaPositions]);

	const getCurrentPriceForSide = useCallback(
		(market: PredictionMarket, side: "Yes" | "No"): number | null => {
			const stored = portfolioSidePriceMap[market._id];
			const fromStored =
				stored != null ? (side === "Yes" ? stored.yesPrice : stored.noPrice) : null;
			if (fromStored != null && Number.isFinite(fromStored)) return fromStored;

			const questionId = market.questionId || market._id;
			if (!questionId) return null;
			const preview = allBooksPreview[questionId];
			if (side === "Yes") return preview?.lowestAsk ?? null;
			return preview?.highestBid !== null && preview?.highestBid !== undefined
				? 1 - preview.highestBid
				: null;
		},
		[portfolioSidePriceMap, allBooksPreview],
	);

	const umbrellaBalancesPositions = useMemo(
		() =>
			umbrellaPositions.map((up) => ({
				umbrella: up.umbrella,
				markets: up.markets.map((mp) => ({
					market: mp.market,
					yes: mp.yesBalance.toString(),
					no: mp.noBalance.toString(),
					venue: mp.venue ?? "levelup",
					predictOutcomeLabelYes: mp.predictOutcomeLabelYes,
					predictOutcomeLabelNo: mp.predictOutcomeLabelNo,
				})),
			})),
		[umbrellaPositions],
	);

	const combinedOrders = useMemo(() => {
		const synth: ProcessedOrder[] = [];
		for (const up of umbrellaPositions) {
			for (const mp of up.markets) {
				const qid = mp.market._id || mp.market.questionId || (mp.market as any).marketId;
				for (const order of mp.orders) {
					if (order.venue && order.venue !== "LevelUp") {
						synth.push({ ...order, questionId: qid });
					}
				}
			}
		}
		return [...(orders || []).map((o) => (o.venue ? o : { ...o, venue: "LevelUp" })), ...synth];
	}, [orders, umbrellaPositions]);

	const umbrellaBalancesOrders = useMemo(
		() =>
			allUmbrellas.map(({ umbrella, markets }) => ({
				umbrella,
				markets: markets.map((market) => ({ market, yes: "0", no: "0" })),
			})),
		[allUmbrellas],
	);

	const venueOrders: VenueOrder[] = useMemo(() => {
		const limitlessOrders = limitlessOpenOrdersQuery.data ?? [];
		const titleLookup = new Map<number, string>();
		const outcomeLookup = new Map<string, string>();

		const predictMarketTitleFromMonitor = (marketId: number): string => {
			const fromPos = allPredictPositions.find((p) => p.numericMarketId === marketId);
			const detail = predictMarketDetails.get(marketId);
			const titleForMatch =
				fromPos?.marketTitle?.trim() ||
				detail?.question?.trim() ||
				detail?.title?.trim() ||
				"";
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
					{ tokenId: sampleTok, numericMarketId: marketId, marketTitle: titleForMatch },
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
			if (!titleLookup.has(o.marketId)) titleLookup.set(o.marketId, predictMarketTitleFromMonitor(o.marketId));
		}
		const liveOrders = predictOpenOrders.filter((o) => {
			const detail = predictMarketDetails.get(o.marketId);
			if (!detail) return true;
			return detail.status !== "RESOLVED" && detail.status !== "REMOVED" && detail.tradingStatus !== "CLOSED";
		});
		const predictVenue =
			predictOpenOrders.length === 0
				? []
				: mapPredictOrdersToVenueOrders(liveOrders, titleLookup, outcomeLookup);
		return [...predictVenue, ...limitlessOrders];
	}, [
		predictOpenOrders,
		allPredictPositions,
		predictMarketDetails,
		predictUmbrellaLookup,
		umbrellas,
		limitlessOpenOrdersQuery.data,
	]);

	const venueHistoryRawItems = useMemo(() => {
		const items: typeof allPredictPositions = [];
		const seen = new Set<string>();

		for (const pos of predictWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({ ...pos, outcomeResult: "WON", marketStatus: "RESOLVED" });
			}
		}
		for (const pos of predictHistory) {
			if (!seen.has(pos.tokenId)) { seen.add(pos.tokenId); items.push(pos); }
		}
		for (const pos of polyWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({ ...pos, outcomeResult: "WON", marketStatus: "RESOLVED" });
			}
		}
		for (const pos of polyHistory) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({ ...pos, outcomeResult: "LOST", marketStatus: "RESOLVED" });
			}
		}

		for (const pos of limitlessWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({ ...pos, outcomeResult: "WON", marketStatus: "RESOLVED" });
			}
		}
		for (const pos of limitlessHistory) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({ ...pos, outcomeResult: "LOST", marketStatus: "RESOLVED" });
			}
		}

		for (const pos of polyPositions) seen.add(pos.tokenId);
		for (const pos of predictPositions) seen.add(pos.tokenId);
		for (const pos of dflowPositions) seen.add(pos.tokenId);
		for (const pos of limitlessPositions) seen.add(pos.tokenId);

		const polyTrades = polyTradeHistoryQuery.data ?? [];
		for (const trade of polyTrades) {
			const cid = trade.conditionId?.trim();
			const tok = trade.tokenId?.trim();
			const histKey =
				cid && tok
					? `polyhist:${polymarketConditionLookupKey(cid)}:${tok}:${String(trade.outcome ?? "")}`
					: `polyhist:token:${tok ?? "unknown"}`;
			if (seen.has(histKey)) continue;
			seen.add(histKey);
			items.push({
				...trade,
				outcomeResult: trade.outcomeResult ?? ((trade.pnl !== null && trade.pnl > 0) ? "WON" : "LOST"),
				marketStatus: "RESOLVED",
			});
		}

		const limitlessTrades = limitlessTradeHistoryQuery.data ?? [];
		for (const trade of limitlessTrades) {
			const resolvedLike = isVenueMarketResolvedLike(trade.marketStatus);
			// Do not dedupe by `tokenId` alone: open positions already claimed that key,
			// which would hide every Limitless fill for markets you still hold.
			const histKey =
				trade.historySourceId?.trim() ||
				`lxhist:${trade.tokenId}:${trade.shares}:${trade.cost ?? ""}:${trade.marketTitle?.slice(0, 40) ?? ""}`;
			if (seen.has(histKey)) continue;
			seen.add(histKey);
			items.push({
				...trade,
				outcomeResult:
					trade.outcomeResult ??
					(trade.pnl != null && Number.isFinite(trade.pnl)
						? trade.pnl > 0
							? "WON"
							: "LOST"
						: undefined),
				marketStatus: trade.marketStatus ?? "RESOLVED",
			});
		}

		for (const pos of dflowWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({ ...pos, outcomeResult: "WON", marketStatus: "RESOLVED" });
			}
		}
		for (const pos of dflowHistory) {
			if (!seen.has(pos.tokenId)) { seen.add(pos.tokenId); items.push(pos); }
		}

		const predictFilledHistory = predictFilledOrdersToVenueHistoryRows(
			predictFilledOrders,
			seen,
			predictCostLookup,
			predictMarketDetails,
			predictUmbrellaLookup,
			umbrellas,
			predictHistoryFillsByToken,
			predictMatchesQuery.data ?? [],
		);
		for (const p of predictFilledHistory) {
			seen.add(p.tokenId);
			items.push(p);
		}

		return items;
	}, [
		predictWinnings, predictHistory, polyWinnings, polyHistory,
		polyTradeHistoryQuery.data, limitlessTradeHistoryQuery.data,
		dflowWinnings, dflowHistory,
		polyPositions, predictPositions, dflowPositions, limitlessPositions,
		limitlessWinnings, limitlessHistory,
		predictFilledOrders, predictCostLookup, predictMarketDetails,
		predictUmbrellaLookup,
		umbrellas,
		predictHistoryFillsByToken,
		predictMatchesQuery.data,
	]);

	const {
		venueHistoryResolveQueries,
		historyCatalogUmbrellas,
		venueHistory,
		historyResolveStage,
		historyUmbrellaResolveSettled,
	} = useHistoryResolve({
		venueHistoryRawItems,
		umbrellas,
		appStateMarkets: appState?.markets,
		predictMarketDetails,
		authenticated,
		effectiveAccount,
		privateApi,
		diag: {
			polyTradeHistoryRows: polyTradeHistoryQuery.data,
			limitlessTradeHistoryCount: limitlessTradeHistoryQuery.data?.length ?? 0,
			predictFilledOrdersCount: predictFilledOrders.length,
			predictMatchEventCount: predictMatchesQuery.data?.length ?? 0,
		},
	});

	const returnsByQid = useMemo(() => {
		const map: Record<string, { Yes: number; No: number }> = {};
		umbrellaPositions.forEach((up) => {
			up.markets.forEach((mp) => {
				const balanceId = mp.market._id;
				if (balanceId) {
					try {
						const returns = getTradingReturns(orders || [], balanceId);
						map[balanceId] = { Yes: returns.yesPnL, No: returns.noPnL };
					} catch { /* ignore */ }
				}
			});
		});
		return map;
	}, [umbrellaPositions, orders]);

	const aggregates = useMemo(() => {
		return umbrellaPositions.reduce((acc, up) => {
			up.markets.forEach((mp) => {
				const balanceId = mp.market._id;
				if (balanceId) {
					acc[balanceId] = {
						Yes: { avgPrice: mp.aggregates.Yes.avgPrice, cost: mp.aggregates.Yes.totalValue },
						No: { avgPrice: mp.aggregates.No.avgPrice, cost: mp.aggregates.No.totalValue },
					};
				}
			});
			return acc;
		}, {} as Record<string, any>);
	}, [umbrellaPositions]);

	const spentByQid = useMemo(() => {
		return umbrellaPositions.reduce((acc, up) => {
			up.markets.forEach((mp) => {
				const balanceId = mp.market._id;
				if (balanceId) {
					acc[balanceId] = {
						Yes: mp.aggregates.Yes.totalValue,
						No: mp.aggregates.No.totalValue,
					};
				}
			});
			return acc;
		}, {} as Record<string, { Yes: number; No: number }>);
	}, [umbrellaPositions]);

	/** Trade history streams (Poly + Limitless) for the History tab; not part of global `isDataFullyLoaded`. */
	const venueTradeHistoryLoading =
		(Boolean(polymarketSafe?.trim()) &&
			!polyTradeHistoryQuery.isFetched &&
			!polyTradeHistoryQuery.isError) ||
		(Boolean(limitlessMakerBase?.trim()) &&
			!limitlessTradeHistoryQuery.isFetched &&
			!limitlessTradeHistoryQuery.isError);

	/** Single gate for History body + header: core data, funding addresses, activity history, batch resolve. */
	const strictIsHistoryTabContentReady =
		strictIsDataFullyLoaded &&
		!fundingAddressesLoading &&
		!venueTradeHistoryLoading &&
		historyUmbrellaResolveSettled;

	useEffect(() => {
		positionsDataFullyLoadedLatchForRef.current = null;
		positionsTabReadyLatchForRef.current = null;
		historyTabReadyLatchForRef.current = null;
	}, [account]);

	useEffect(() => {
		if (!account) return;
		if (strictIsDataFullyLoaded) {
			positionsDataFullyLoadedLatchForRef.current = account;
		}
		if (strictIsPositionsTabContentReady) {
			positionsTabReadyLatchForRef.current = account;
		}
		if (strictIsHistoryTabContentReady) {
			historyTabReadyLatchForRef.current = account;
		}
	}, [
		account,
		strictIsDataFullyLoaded,
		strictIsPositionsTabContentReady,
		strictIsHistoryTabContentReady,
	]);

	const isDataFullyLoaded =
		strictIsDataFullyLoaded ||
		positionsDataFullyLoadedLatchForRef.current === account;
	const isPositionsTabContentReady =
		strictIsPositionsTabContentReady ||
		positionsTabReadyLatchForRef.current === account;
	const isHistoryTabContentReady =
		strictIsHistoryTabContentReady ||
		historyTabReadyLatchForRef.current === account;

	/**
	 * Slim DEV-only gate trace: prints the mirrored shell blockers from `Positions.tsx`
	 * (`pageShellLoading`) whenever the readiness fingerprint changes. Mirrors
	 * `isPositionsTabContentReady` / `isHistoryTabContentReady` so a skeleton flash on dev
	 * is easy to attribute to a specific blocker. Production: no-op.
	 */
	const positionsLoadingGateFingerprintRef = useRef("");
	useEffect(() => {
		if (!import.meta.env.DEV) return;
		if (!effectiveAccount) return;

		const positionsShellBlockers: string[] = [];
		if (predictionLoading) positionsShellBlockers.push("predictionLoading");
		if (userDataLoading) positionsShellBlockers.push("userDataLoading");
		if (portfolioLoading) positionsShellBlockers.push("portfolioLoading");
		if (polyPositionsQuery.isLoading) positionsShellBlockers.push("polyPositionsQuery.isLoading");
		if (predictPositionsQuery.isLoading) {
			positionsShellBlockers.push("predictPositionsQuery.isLoading");
		}
		if (limitlessPortfolioEnabled && limitlessVenuePositionsQuery.isLoading) {
			positionsShellBlockers.push("limitlessVenuePositionsQuery.isLoading");
		}
		if (dflowRpcEnabled && dflowPositionsQuery.isPending) {
			// Coupled to `positionsShellBypassMaxWaitMs` (10s shell grace while DFlow loads).
			positionsShellBlockers.push("dflowPositionsQuery.isPending");
		}
		if (predictMarketIds.length > 0 && predictMarketsQuery.isLoading) {
			positionsShellBlockers.push("predictMarketsQuery.isLoading");
		}

		const historyShellBlockers: string[] = [];
		if (!isDataFullyLoaded) historyShellBlockers.push("!isDataFullyLoaded");
		if (fundingAddressesLoading) historyShellBlockers.push("fundingAddressesLoading");
		if (venueTradeHistoryLoading) historyShellBlockers.push("venueTradeHistoryLoading");
		if (!historyUmbrellaResolveSettled) {
			historyShellBlockers.push("!historyUmbrellaResolveSettled");
		}

		const fingerprint = [
			positionsShellBlockers.join(","),
			historyShellBlockers.join(","),
			String(isDataFullyLoaded),
			String(isPositionsTabContentReady),
			String(isHistoryTabContentReady),
		].join("|");

		if (fingerprint === positionsLoadingGateFingerprintRef.current) return;
		positionsLoadingGateFingerprintRef.current = fingerprint;

		const wallet =
			effectiveAccount.length >= 10
				? `${effectiveAccount.slice(0, 6)}…${effectiveAccount.slice(-4)}`
				: effectiveAccount;
		console.log("[positions-gate]", {
			wallet,
			positionsShellBlockers: positionsShellBlockers.join(" · ") || "(none)",
			historyShellBlockers: historyShellBlockers.join(" · ") || "(none)",
			isDataFullyLoaded,
			isPositionsTabContentReady,
			isHistoryTabContentReady,
		});
	}, [
		effectiveAccount,
		predictionLoading,
		userDataLoading,
		portfolioLoading,
		polyPositionsQuery.isLoading,
		predictPositionsQuery.isLoading,
		limitlessPortfolioEnabled,
		limitlessVenuePositionsQuery.isLoading,
		dflowRpcEnabled,
		dflowPositionsQuery.isPending,
		predictMarketIds.length,
		predictMarketsQuery.isLoading,
		fundingAddressesLoading,
		venueTradeHistoryLoading,
		historyUmbrellaResolveSettled,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
	]);

	return {
		account,
		isDebugMode,
		debugAccount,
		realAccount,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
		portfolioLoading,
		portfolioTotalCtx,
		cashBalanceCtx,
		portfolioCashLoading,
		positionsTotalValue,
		umbrellaPositions,
		resolvedUmbrellaPositions,
		umbrellaBalancesPositions,
		umbrellaBalancesOrders,
		combinedOrders,
		venueOrders,
		venueHistory,
		/** Same reference as internal merge input — for History `FULL HISTORY` debug only */
		venueHistoryRawItemsForDebug: venueHistoryRawItems,
		historyCatalogUmbrellas,
		/** History `POST /api/umbrellas/resolve-venue-history` status + row id counts for `FULL HISTORY`.resolveStage */
		historyResolveStage,
		returnsByQid,
		aggregates,
		spentByQid,
		getCurrentPriceForSide,
		handleClaimSuccess,
		orders,
		resolvedMarketsByUmbrella,
		activeTab,
		setActiveTab,
		/** See comment above `POSITIONS_SHELL_BYPASS_MS_*` — consumed by `Positions.tsx` shell timer. */
		positionsShellBypassMaxWaitMs,
	};
}
