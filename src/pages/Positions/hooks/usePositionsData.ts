import { useMemo, useState, useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { usePredictionData } from "context/PredictionDataContext";
import { useOddsMonitor } from "context/OddsMonitorContext";
import { usePortfolio } from "context/PortfolioContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePolymarketTradeHistory } from "@/trading/polymarket/usePolymarketTradeHistory";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { usePredictOrders } from "@/trading/predict/usePredictOrders";
import { usePredictOrderMatches } from "@/trading/predict/usePredictOrderMatches";
import { usePredictEnsureAuth } from "@/trading/predict/usePredictEnsureAuth";
import {
	computePredictCostByToken,
	getPredictCostForToken,
	mapPredictOrdersToVenueOrders,
	normalizePredictTokenId,
	type PredictOrderRow,
} from "@/trading/predict/predictOrdersApi";
import { computePredictCostByTokenFromMatches } from "@/trading/predict/predictMatchesApi";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
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
import type { VenueId, VenueOrder, VenuePosition } from "@/types/trading/venuePosition";
import {
	logPortfolioLoadState,
	logPortfolioReadySnapshot,
	portfolioPerfEnabled,
	truncateWallet,
} from "../utils/portfolioPerfLog";
import {
	type MarketPosition,
	type UmbrellaPositions,
	buildSyntheticOrder,
	mergeMarketPositions,
	buildSyntheticUmbrella,
} from "../utils/positionHelpers";
import {
	buildPredictUmbrellaLookup,
	logPredictUmbrellaOnce,
	matchVenuePositionToUmbrella,
	predictUmbrellaDebugEnabled,
	resolvePredictUmbrellaForDisplay,
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import { shortPredictFunMarketTitleForPortfolio } from "@/helpers/umbrellaDisplayName";

/** History rows for Predict tokens that only appear in FILLED orders (no current position). */
function predictFilledOrdersToVenueHistoryRows(
	filledOrders: PredictOrderRow[],
	seen: Set<string>,
	costLookup: Map<string, { totalCost: number; totalShares: number; avgPrice: number }>,
	marketDetails: Map<number, PredictMarketDetail>,
	predictLookup: PredictUmbrellaLookup | null,
	umbrellas: Umbrella[],
): VenuePosition[] {
	const firstRowByToken = new Map<string, PredictOrderRow>();
	for (const row of filledOrders) {
		if (row.status !== "FILLED" || !row?.order) continue;
		const tid = normalizePredictTokenId(row.order.tokenId);
		if (!tid || seen.has(tid) || firstRowByToken.has(tid)) continue;
		firstRowByToken.set(tid, row);
	}
	const out: VenuePosition[] = [];
	for (const [tokenId, row] of firstRowByToken) {
		const costEntry = costLookup.get(tokenId);
		if (!costEntry || costEntry.totalShares <= 0) continue;
		const detail = marketDetails.get(row.marketId);
		const outcomeName =
			detail?.outcomes?.find(
				(o) => normalizePredictTokenId(o.onChainId) === tokenId,
			)?.name ?? "Yes";
		const titleForMatch = (detail?.question ?? detail?.title ?? "").trim();
		const resolvedUmbrella = resolvePredictUmbrellaForDisplay(
			{ tokenId, numericMarketId: row.marketId, marketTitle: titleForMatch },
			predictLookup,
			umbrellas,
			titleForMatch || undefined,
		);
		const venueTitle =
			resolvedUmbrella?.displayName?.trim() ??
			(shortPredictFunMarketTitleForPortfolio(titleForMatch) ||
				titleForMatch ||
				`Market #${row.marketId}`);
		out.push({
			venue: "predictfun",
			marketTitle: venueTitle,
			outcome: outcomeName,
			shares: costEntry.totalShares,
			avgPrice: costEntry.avgPrice,
			currentPrice: null,
			cost: costEntry.totalCost,
			currentValue: 0,
			pnl: null,
			pnlPercent: null,
			tokenId,
			numericMarketId: row.marketId,
			conditionId: detail?.conditionId,
			marketStatus: "CLOSED",
		});
	}
	return out;
}

function buildVenueMarketPosition(
	pv: any,
	venue: VenueId,
	venueName: string,
	qidPrefix: string,
	overrides?: {
		yesPrice?: number | null;
		noPrice?: number | null;
		yesValue?: number;
		noValue?: number;
	},
	marketDisplayName?: string,
	predictMarketDetail?: PredictMarketDetail | null,
	polyTeamInference?: {
		matched: MatchedMarket;
		yesTeamLabel: string;
		noTeamLabel: string;
	} | null,
): MarketPosition {
	const predictInferred =
		venue === "predictfun"
			? inferPredictSideFromMarketDetail(
					predictMarketDetail ?? undefined,
					pv.tokenId,
				)
			: null;
	const polyInferredSide =
		venue === "polymarket" && polyTeamInference
			? inferPolymarketYesNoFromToken(
					pv,
					polyTeamInference.matched,
					polyTeamInference.yesTeamLabel,
					polyTeamInference.noTeamLabel,
				)
			: null;
	const isYes = polyInferredSide
		? polyInferredSide.side === "Yes"
		: predictInferred
			? predictInferred.side === "Yes"
			: pv.outcome.toLowerCase() === "yes" ||
				(pv.outcome.toLowerCase() !== "no" &&
					(pv.marketTitle?.toLowerCase() ?? "").includes(pv.outcome.toLowerCase()));
	const qid = `${qidPrefix}-${pv.tokenId.slice(0, 12)}`;
	const side: "Yes" | "No" = isYes ? "Yes" : "No";
	const synthOrder =
		pv.shares > 0 && (pv.avgPrice || pv.cost)
			? [buildSyntheticOrder(qid, venueName, side, pv.shares, pv.avgPrice, pv.cost)]
			: [];

	const yesPrice = overrides?.yesPrice !== undefined
		? (isYes ? overrides.yesPrice : null)
		: (isYes ? pv.currentPrice : null);
	const noPrice = overrides?.noPrice !== undefined
		? (isYes ? null : overrides.noPrice)
		: (isYes ? null : pv.currentPrice);
	const yesValue = overrides?.yesValue !== undefined
		? overrides.yesValue
		: (isYes ? pv.currentValue : 0);
	const noValue = overrides?.noValue !== undefined
		? overrides.noValue
		: (isYes ? 0 : pv.currentValue);

	return {
		market: {
			_id: qid,
			displayName: marketDisplayName?.trim() || pv.marketTitle,
			questionId: pv.conditionId ?? pv.tokenId,
		} as unknown as PredictionMarket,
		yesBalance: isYes ? pv.shares : 0,
		noBalance: isYes ? 0 : pv.shares,
		yesPrice,
		noPrice,
		yesValue,
		noValue,
		totalValue: (yesValue ?? 0) + (noValue ?? 0),
		orders: synthOrder,
		aggregates: {
			Yes: {
				totalSize: isYes ? pv.shares : 0,
				totalValue: isYes ? (pv.cost ?? 0) : 0,
				avgPrice: isYes ? pv.avgPrice : null,
				count: 0,
			},
			No: {
				totalSize: isYes ? 0 : pv.shares,
				totalValue: isYes ? 0 : (pv.cost ?? 0),
				avgPrice: isYes ? null : pv.avgPrice,
				count: 0,
			},
		},
		venue,
		predictOutcomeLabelYes:
			venue === "predictfun" && isYes
				? (predictInferred?.teamName ?? pv.outcome)
				: undefined,
		predictOutcomeLabelNo:
			venue === "predictfun" && !isYes
				? (predictInferred?.teamName ?? pv.outcome)
				: undefined,
	};
}

function buildUnmatchedVenueUmbrellas(
	positions: any[],
	matchedIds: Set<string>,
	venue: VenueId,
	venueName: string,
	qidPrefix: string,
	groupKeyFn: (p: any) => string,
	idPrefix: string,
	predictLookup: PredictUmbrellaLookup | null = null,
	predictMarketDetails?: Map<number, PredictMarketDetail>,
	matchedOddsMarkets: MatchedMarket[] = [],
	catalogUmbrellas: Umbrella[] = [],
): UmbrellaPositions[] {
	const unmatched = positions.filter((p) => !matchedIds.has(p.tokenId));
	const byGroup = new Map<string, any[]>();
	for (const p of unmatched) {
		const key = groupKeyFn(p);
		const arr = byGroup.get(key) ?? [];
		arr.push(p);
		byGroup.set(key, arr);
	}

	const umbrellas: UmbrellaPositions[] = [];
	for (const [eventKey, group] of byGroup) {
		const first = group[0];
		let resolvedPredict: Umbrella | null = null;
		if (venue === "predictfun") {
			const fd =
				first.numericMarketId != null && predictMarketDetails
					? predictMarketDetails.get(first.numericMarketId)
					: undefined;
			const hint = (fd?.question ?? fd?.title ?? "").trim() || undefined;
			resolvedPredict = resolvePredictUmbrellaForDisplay(
				first,
				predictLookup,
				catalogUmbrellas,
				hint,
			);
		}
		const predictSyntheticTitle =
			venue === "predictfun"
				? resolvedPredict?.displayName?.trim() ||
					shortPredictFunMarketTitleForPortfolio(first.marketTitle) ||
					first.marketTitle
				: first.marketTitle;
		const umbrellaForBlock =
			resolvedPredict ??
			buildSyntheticUmbrella(
				`${idPrefix}-${eventKey.slice(0, 20)}`,
				predictSyntheticTitle,
				first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
			);
		const displayOverride =
			resolvedPredict?.displayName?.trim() || undefined;
		const rawMarkets = group.map((p) => {
			const polyRow =
				venue === "polymarket"
					? findMatchedMarketByPolyConditionId(matchedOddsMarkets, p.conditionId)
					: null;
			const polyLabels =
				venue === "polymarket"
					? parseVsTeamLabelsFromDisplayTitle(displayOverride) ??
						parseVsTeamLabelsFromDisplayTitle(p.marketTitle)
					: null;
			const polyInference =
				polyRow && polyLabels
					? {
							matched: polyRow,
							yesTeamLabel: polyLabels.yesTeamLabel,
							noTeamLabel: polyLabels.noTeamLabel,
						}
					: null;
			return buildVenueMarketPosition(
				p,
				venue,
				venueName,
				qidPrefix,
				undefined,
				displayOverride,
				venue === "predictfun" && predictMarketDetails && p.numericMarketId != null
					? predictMarketDetails.get(p.numericMarketId) ?? null
					: null,
				polyInference,
			);
		});
		umbrellas.push({ umbrella: umbrellaForBlock, markets: mergeMarketPositions(rawMarkets) });
	}
	return umbrellas;
}

export default function usePositionsData() {
	const queryClient = useQueryClient();
	const { account, signerAddress, isDebugMode, debugAccount, realAccount } = useSignerContext();
	const {
		portfolioTotal: portfolioTotalCtx,
		cashBalance: cashBalanceCtx,
		loading: portfolioLoading,
	} = usePortfolio();
	const {
		orders,
		tokenBalances,
		usdcLoading,
		loading: userDataLoading,
		refresh: refreshUserData,
		refreshViaRpc,
		loadOrders,
	} = useUserData();

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

	useEffect(() => {
		if (!predictUmbrellaDebugEnabled) return;
		const marketKeys = [...predictUmbrellaLookup.byMarketId.keys()].sort((a, b) => {
			const na = Number(a);
			const nb = Number(b);
			if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
			return a.localeCompare(b);
		});
		const tokenKeys = [...predictUmbrellaLookup.byToken.keys()].sort((a, b) =>
			a.length !== b.length ? a.length - b.length : a.localeCompare(b),
		);
		const dedupeId = `mk:${marketKeys.join("|")}|tok:${tokenKeys.length}`;
		logPredictUmbrellaOnce("lookup-snapshot", dedupeId, {
			monitorRowCount: appState?.markets?.length ?? 0,
			catalogUmbrellaCount: umbrellas.length,
			lookupByTokenSize: predictUmbrellaLookup.byToken.size,
			lookupByMarketIdSize: predictUmbrellaLookup.byMarketId.size,
			lookupMarketIdKeysSorted: marketKeys,
			lookupTokenIdKeysSample: tokenKeys.slice(0, 24),
			lookupTokenIdKeysTruncated: Math.max(0, tokenKeys.length - 24),
			hint: "If Predict `numericMarketId` (e.g. 205021) is missing from `lookupMarketIdKeysSorted`, predictions-api / matched-markets `predictFun.marketId*` do not match Predict REST. Compare `lookupTokenIdKeysSample` prefixes to position `tokenId`.",
		});
	}, [appState?.markets, umbrellas.length, predictUmbrellaLookup]);

	const { polymarketSafe, solanaAddress } = useFundingAddresses();
	const { authenticated } = usePrivy();
	const dflowProof = useDflowProofStatus();
	const solanaLinked = Boolean(solanaAddress?.trim());
	const polyPositionsQuery = usePolymarketPositions(polymarketSafe);
	const allPolyPositions = polyPositionsQuery.data ?? [];
	const polyTradeHistoryQuery = usePolymarketTradeHistory(polymarketSafe);

	const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(new Set());
	const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history">("positions");

	const allUmbrellas = useMemo(() => {
		return umbrellas.map((umb) => ({
			umbrella: umb,
			markets: (getAllQuestionsForUmbrella(umb._id) as PredictionMarket[]) || [],
		}));
	}, [umbrellas, getAllQuestionsForUmbrella]);

	const effectiveAccount = account || null;

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
			allPredictPositions.length > 0 &&
			predictFilledFetched &&
			predictFilledOrders.length === 0,
	});

	const needsPredictAuth =
		(allPredictPositions.length > 0 || activeTab === "history") &&
		(predictFilledError || predictFilledOrders.length === 0 || !predictFilledFetched);
	usePredictEnsureAuth(needsPredictAuth);

	const predictCostLookup = useMemo(() => {
		const fromOrders = computePredictCostByToken(predictFilledOrders);
		if (fromOrders.size > 0) return fromOrders;
		const rows = predictMatchesQuery.data ?? [];
		const filter = predictMatchesQuery.filterSigner;
		if (rows.length === 0 || !filter) return fromOrders;
		return computePredictCostByTokenFromMatches(filter, rows);
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
		return Array.from(ids);
	}, [allPredictPositions, predictOpenOrders, predictFilledOrders]);

	const dflowRpcEnabled =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified;
	const dflowPositionsQuery = useDflowPositions(solanaAddress, privateApi, {
		enabled: dflowRpcEnabled,
	});
	const allDflowPositions = dflowPositionsQuery.data ?? [];

	const predictMarketsQuery = usePredictMarketDetailsMap(
		predictMarketIds,
		predictMarketIds.length > 0,
	);
	const predictMarketDetails = predictMarketsQuery.data ?? new Map<number, PredictMarketDetail>();

	// --- Atomic loading gate: wait for ALL data including enrichment ---
	// Polymarket activity API can paginate many pages — do not block Positions/Orders skeleton on it.
	// History tab waits separately via `polyTradeHistoryLoading` (see Positions.tsx).
	const dflowVenueSettled =
		!solanaLinked ||
		!Boolean(authenticated) ||
		(dflowProof.isFetched &&
			(!dflowProof.isVerified || !dflowPositionsQuery.isLoading));

	const venueQueriesSettled =
		!polyPositionsQuery.isLoading &&
		!predictPositionsQuery.isLoading &&
		dflowVenueSettled;

	const venueQueriesSettledForPositionsBody =
		!polyPositionsQuery.isLoading && !predictPositionsQuery.isLoading;

	// `predictMarketsQuery` stays in this gate on purpose: without market details, Predict rows
	// would all appear under active Positions first, then jump to Winnings when RESOLVED — bad UX.
	// If perf logs show this dominates, prefer backend batching or accept that tradeoff explicitly.
	const isDataFullyLoaded =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettled &&
		(predictMarketIds.length === 0 || !predictMarketsQuery.isLoading);

	/** Positions tab body can render without waiting on DFlow RPC; header stays on `isDataFullyLoaded`. */
	const isPositionsTabContentReady =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettledForPositionsBody &&
		(predictMarketIds.length === 0 || !predictMarketsQuery.isLoading);

	const dflowPositionsStripPending =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProof.isFetched &&
		dflowProof.isVerified &&
		dflowPositionsQuery.isLoading;

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
	}, [allPredictPositions, predictMarketDetails, predictCostLookup]);

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
			setClaimedMarkets((prev) => {
				const next = new Set(prev);
				for (const id of ids) next.add(id);
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
				]);
				await refreshViaRpc();
			} catch (e) {
				console.error("[usePositionsData] Post-claim balance refresh failed:", e);
			}
		},
		[refreshUserData, refreshViaRpc, queryClient],
	);

	// --- Build conditionId -> umbrella index for fast venue matching ---
	const umbrellaLookupByConditionId = useMemo(() => {
		const map = new Map<string, Umbrella>();
		for (const umb of umbrellas) {
			const allChildren = (umb as any).originalChildren ?? umb.children ?? [];
			for (const child of allChildren) {
				if (child.conditionId) map.set(child.conditionId, umb);
				if (child.marketId) map.set(child.marketId, umb);
			}
		}
		return map;
	}, [umbrellas]);

	// --- Active positions grouped by umbrella ---
	const umbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) return [];

		const oddsMonitorMarkets = appState?.markets ?? [];

		const matchedPolyTokenIds = new Set<string>();
		const matchedPredictTokenIds = new Set<string>();
		const matchedDflowTokenIds = new Set<string>();

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

				const allMarkets = [...activeMarkets, ...polyMatches, ...predictMatches, ...dflowMatches];
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
			[],
		);

		return [...levelUpUmbrellas, ...polyUmbrellas, ...predictUmbrellas, ...dflowUmbrellas];
	}, [
		effectiveAccount, umbrellas, getQuestionsForUmbrella, tokenBalances, orders,
		allBooksPreview, polyPositions, predictPositions, dflowPositions, umbrellaLookupByConditionId,
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
					return (outcome === "yes" && mp.yesBalance > 0) || (outcome === "no" && mp.noBalance > 0);
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
						venue === "polymarket"
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

		return resolved;
	}, [
		effectiveAccount, resolvedMarketsByUmbrella, umbrellas, tokenBalances,
		claimedMarkets, predictWinnings, polyWinnings, dflowWinnings, predictMarketDetails,
		predictUmbrellaLookup,
		appState?.markets,
	]);

	// --- Derived values ---
	const positionsTotalValue = useMemo(() => {
		return umbrellaPositions.reduce(
			(total, u) => total + u.markets.reduce((s, m) => s + m.totalValue, 0),
			0,
		);
	}, [umbrellaPositions]);

	const portfolioPerfFingerprintRef = useRef("");
	const portfolioReadyLoggedRef = useRef(false);

	useEffect(() => {
		if (!portfolioPerfEnabled() || !effectiveAccount) return;

		const previewKeyCount = Object.keys(allBooksPreview).length;
		const fingerprint = [
			predictionLoading,
			userDataLoading,
			portfolioLoading,
			booksPreviewLoading,
			polyPositionsQuery.isLoading,
			predictPositionsQuery.isLoading,
			dflowPositionsQuery.isLoading,
			predictMarketsQuery.isLoading,
			isDataFullyLoaded,
			isPositionsTabContentReady,
			dflowPositionsStripPending,
			predictMarketIds.length,
			umbrellas.length,
			tokenBalances.size,
			previewKeyCount,
			predictOrdersEnabled,
		].join("|");

		if (fingerprint !== portfolioPerfFingerprintRef.current) {
			portfolioPerfFingerprintRef.current = fingerprint;
			logPortfolioLoadState({
				predictionLoading,
				userDataLoading,
				portfolioLoading,
				booksPreviewLoading,
				polyLoading: polyPositionsQuery.isLoading,
				predictLoading: predictPositionsQuery.isLoading,
				dflowLoading: dflowPositionsQuery.isLoading,
				predictMarketsLoading: predictMarketsQuery.isLoading,
				isDataFullyLoaded,
				umbrellaCount: umbrellas.length,
				tokenBalancesSize: tokenBalances.size,
				previewKeys: previewKeyCount,
				polyPos: allPolyPositions.length,
				predictPos: allPredictPositions.length,
				dflowPos: allDflowPositions.length,
				predictMarketIds: predictMarketIds.length,
				predictOrdersEnabled,
				isPositionsTabContentReady,
				dflowPositionsStripPending,
			});
		}

		if (isDataFullyLoaded && !portfolioReadyLoggedRef.current) {
			portfolioReadyLoggedRef.current = true;

			const previewSampleKeys = Object.keys(allBooksPreview).slice(0, 3);
			const previewSample = Object.fromEntries(
				previewSampleKeys.map((k) => [k.slice(0, 12) + "…", allBooksPreview[k]]),
			);

			const polyVenueSum = allPolyPositions.reduce((s, p) => s + (p.currentValue ?? 0), 0);
			const predictVenueSum = allPredictPositions.reduce((s, p) => s + (p.currentValue ?? 0), 0);
			const dflowVenueSum = allDflowPositions.reduce((s, p) => s + (p.currentValue ?? 0), 0);

			let levelUpBookSum = 0;
			const levelUpSamples: Array<Record<string, unknown>> = [];
			for (const u of umbrellas) {
				const markets = (getQuestionsForUmbrella(u._id) as PredictionMarket[]) || [];
				for (const m of markets) {
					const balanceId = m._id;
					const priceId = m.questionId || m._id;
					if (!balanceId || !priceId) continue;
					const tb = tokenBalances.get(balanceId);
					if (!tb) continue;
					const yes = Number(tb.yesBalance) || 0;
					const no = Number(tb.noBalance) || 0;
					if (yes === 0 && no === 0) continue;
					const preview = allBooksPreview[priceId] as
						| {
								lowestAsk?: number | null;
								bestYesPrice?: number | null;
								bestNoPrice?: number | null;
								highestBid?: number | null;
						  }
						| undefined;
					const yp = preview?.lowestAsk ?? preview?.bestYesPrice ?? null;
					const np =
						typeof preview?.bestNoPrice === "number"
							? preview.bestNoPrice
							: preview?.highestBid != null && preview?.highestBid !== undefined
								? 1 - preview.highestBid
								: null;
					const rowVal =
						(typeof yp === "number" ? yes * yp : 0) + (typeof np === "number" ? no * np : 0);
					levelUpBookSum += rowVal;
					if (levelUpSamples.length < 2) {
						levelUpSamples.push({
							priceIdShort: String(priceId).slice(0, 10) + "…",
							yes,
							no,
							yp,
							np,
							rowVal,
							previewKeys: preview ? Object.keys(preview) : [],
						});
					}
				}
			}

			logPortfolioReadySnapshot({
				wallet: truncateWallet(effectiveAccount),
				portfolioTotalCtx,
				cashBalanceCtx,
				positionsTotalValue,
				venueNotional: { polyVenueSum, predictVenueSum, dflowVenueSum },
				levelUpBookSumFromPreview: levelUpBookSum,
				levelUpSamples,
				previewSample,
			});
		}

		if (!isDataFullyLoaded) {
			portfolioReadyLoggedRef.current = false;
		}
	}, [
		effectiveAccount,
		predictionLoading,
		userDataLoading,
		portfolioLoading,
		booksPreviewLoading,
		polyPositionsQuery.isLoading,
		predictPositionsQuery.isLoading,
		dflowPositionsQuery.isLoading,
		predictMarketsQuery.isLoading,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		dflowPositionsStripPending,
		predictMarketIds.length,
		umbrellas,
		tokenBalances,
		allBooksPreview,
		allPolyPositions,
		allPredictPositions,
		allDflowPositions,
		getQuestionsForUmbrella,
		portfolioTotalCtx,
		cashBalanceCtx,
		positionsTotalValue,
		predictOrdersEnabled,
	]);

	useEffect(() => {
		portfolioReadyLoggedRef.current = false;
		portfolioPerfFingerprintRef.current = "";
	}, [effectiveAccount]);

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
		if (predictOpenOrders.length === 0) return [];
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
		return mapPredictOrdersToVenueOrders(liveOrders, titleLookup, outcomeLookup);
	}, [predictOpenOrders, allPredictPositions, predictMarketDetails, predictUmbrellaLookup, umbrellas]);

	const venueHistory = useMemo(() => {
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

		for (const pos of polyPositions) seen.add(pos.tokenId);
		for (const pos of predictPositions) seen.add(pos.tokenId);
		for (const pos of dflowPositions) seen.add(pos.tokenId);

		const polyTrades = polyTradeHistoryQuery.data ?? [];
		for (const trade of polyTrades) {
			if (seen.has(trade.tokenId)) continue;
			seen.add(trade.tokenId);
			items.push({
				...trade,
				outcomeResult: trade.outcomeResult ?? ((trade.pnl !== null && trade.pnl > 0) ? "WON" : "LOST"),
				marketStatus: "RESOLVED",
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
		);
		for (const p of predictFilledHistory) {
			seen.add(p.tokenId);
			items.push(p);
		}

		return items.map((item) => {
			if (item.venue !== "predictfun") return item;
			const histDetail =
				item.numericMarketId != null
					? predictMarketDetails.get(item.numericMarketId)
					: undefined;
			const histHint =
				(histDetail?.question ?? histDetail?.title ?? "").trim() || undefined;
			const u = resolvePredictUmbrellaForDisplay(
				item,
				predictUmbrellaLookup,
				umbrellas,
				histHint,
			);
			if (!u?.displayName?.trim()) {
				const raw = (histHint ?? item.marketTitle ?? "").trim();
				const short = shortPredictFunMarketTitleForPortfolio(raw);
				if (short && short !== item.marketTitle) return { ...item, marketTitle: short };
				return item;
			}
			const dn = u.displayName.trim();
			if (item.marketTitle === dn) return item;
			return { ...item, marketTitle: dn };
		});
	}, [
		predictWinnings, predictHistory, polyWinnings, polyHistory,
		polyTradeHistoryQuery.data, dflowWinnings, dflowHistory,
		polyPositions, predictPositions, dflowPositions,
		predictFilledOrders, predictCostLookup, predictMarketDetails,
		predictUmbrellaLookup,
		umbrellas,
	]);

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

	const polyTradeHistoryLoading =
		Boolean(polymarketSafe) && polyTradeHistoryQuery.isPending;

	return {
		account,
		effectiveAccount,
		isDebugMode,
		debugAccount,
		realAccount,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		dflowPositionsStripPending,
		polyTradeHistoryLoading,
		portfolioLoading,
		portfolioTotalCtx,
		cashBalanceCtx,
		usdcLoading,
		positionsTotalValue,
		umbrellaPositions,
		resolvedUmbrellaPositions,
		umbrellaBalancesPositions,
		umbrellaBalancesOrders,
		combinedOrders,
		venueOrders,
		venueHistory,
		returnsByQid,
		aggregates,
		spentByQid,
		getCurrentPriceForSide,
		handleClaimSuccess,
		orders,
		resolvedMarketsByUmbrella,
		activeTab,
		setActiveTab,
	};
}
