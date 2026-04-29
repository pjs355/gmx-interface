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
import {
	debugLimitlessPortfolio,
	debugLimitlessPortfolioTable,
} from "@/trading/limitless/limitlessPortfolioDebug";
import {
	getLimitlessVenueBucket,
	splitLimitlessVenuePositions,
} from "@/trading/limitless/splitLimitlessVenuePositions";
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
	predictMarketIdForTokenFromDetailsMap,
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
	logPortfolioLoadState,
	logPortfolioReadySnapshot,
	logPositionsLoadingGateState,
	portfolioPerfEnabled,
	positionsLoadingGateDiagEnabled,
	truncateWallet,
} from "../utils/portfolioPerfLog";
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
	predictUmbrellaDebugEnabled,
	resolvePredictUmbrellaForDisplay,
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import {
	shortPredictFunMarketTitleForPortfolio,
	stripUmbrellaDisplayPrefix,
} from "@/helpers/umbrellaDisplayName";

/** Must stay aligned with server `RESOLVE_EXCHANGE_KEYS_MAX_QUERIES` (resolve-exchange-keys + resolve-venue-history). */
const UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES = 80;

async function postUmbrellaResolveExchangeKeysChunked(
	post: (body: {
		queries: UmbrellaExchangeResolveQuery[];
		includeUmbrellaPayloads?: boolean;
	}) => Promise<{
		success: boolean;
		data?: {
			byClientKey: Record<string, { umbrellaId?: string; displayName?: string }>;
			umbrellasById?: Record<string, Umbrella>;
		};
	}>,
	queries: UmbrellaExchangeResolveQuery[],
): Promise<{
	success: boolean;
	data?: {
		byClientKey: Record<string, { umbrellaId?: string; displayName?: string }>;
		umbrellasById?: Record<string, Umbrella>;
	};
}> {
	if (queries.length <= UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES) {
		return post({ queries, includeUmbrellaPayloads: true });
	}
	const byClientKey: Record<string, { umbrellaId?: string; displayName?: string }> =
		{};
	const umbrellasById: Record<string, Umbrella> = {};
	let anySuccess = false;
	for (let i = 0; i < queries.length; i += UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES) {
		const chunk = queries.slice(i, i + UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES);
		const res = await post({ queries: chunk, includeUmbrellaPayloads: true });
		if (res.success && res.data) {
			anySuccess = true;
			Object.assign(byClientKey, res.data.byClientKey ?? {});
			Object.assign(umbrellasById, res.data.umbrellasById ?? {});
		}
	}
	return {
		success: anySuccess,
		data: { byClientKey, umbrellasById },
	};
}

function mergePredictHistoryFillMaps(
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
		fills.sort(
			(x, y) =>
				Date.parse(x.tradedAt || "0") - Date.parse(y.tradedAt || "0"),
		);
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

/** History rows for Predict tokens from FILLED orders, match events, and/or per-fill maps. */
function predictFilledOrdersToVenueHistoryRows(
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
		const detail =
			marketId != null ? marketDetails.get(marketId) : undefined;
		const outcomeName =
			detail?.outcomes?.find(
				(o) => normalizePredictTokenId(o.onChainId) === tokenId,
			)?.name ?? "Yes";
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
			(shortPredictFunMarketTitleForPortfolio(titleForMatch) ||
				titleForMatch ||
				(marketId != null
					? `Market #${marketId}`
					: `Predict · ${tokenId.slice(0, 10)}…`));

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
			avgPrice =
				buySh > 0 && buyUsdc > 0 ? buyUsdc / buySh : null;
		}

		const outcomeResult = predictOutcomeResultForHistoryToken(detail, tokenId);
		const resolvedLike =
			(detail?.status ?? "").toUpperCase().trim() === "RESOLVED";
		let pnlOut: number | null = null;
		let pnlPct: number | null = null;
		if (outcomeResult === "WON" && costOut != null && Number.isFinite(costOut) && Number.isFinite(sharesOut)) {
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
	const historyFills = (pv as VenuePosition).historyFills;
	const synthOrder: ProcessedOrder[] =
		historyFills && historyFills.length > 0
			? venueHistoryPositionToSyntheticOrders(pv as VenuePosition)
			: pv.shares > 0 && (pv.avgPrice || pv.cost)
			? [
					buildSyntheticOrder(
						qid,
						venueName,
						side,
						pv.shares,
						pv.avgPrice,
						pv.cost,
						pv.historyTradeAt,
					),
				]
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
	const dflowMintLookup =
		venue === "dflow" && catalogUmbrellas.length > 0
			? buildUmbrellaLookupByDflowOutcomeMint(catalogUmbrellas)
			: null;
	const dflowEventTickerLookup =
		venue === "dflow" && catalogUmbrellas.length > 0
			? buildUmbrellaLookupByDflowEventTicker(catalogUmbrellas)
			: null;
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
		let resolvedDflowCatalog: Umbrella | null = null;
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
		if (venue === "dflow") {
			const et =
				typeof first.dflowEventTicker === "string" ? first.dflowEventTicker.trim() : "";
			if (et) {
				resolvedDflowCatalog =
					lookupUmbrellaByDflowEventTicker(et, dflowEventTickerLookup, catalogUmbrellas) ??
					null;
			} else if (dflowMintLookup) {
				const mint = typeof first.tokenId === "string" ? first.tokenId.trim() : "";
				if (mint) resolvedDflowCatalog = dflowMintLookup.get(mint) ?? null;
			}
		}
		const predictSyntheticTitle =
			venue === "predictfun"
				? resolvedPredict?.displayName?.trim() ||
					shortPredictFunMarketTitleForPortfolio(first.marketTitle) ||
					first.marketTitle
				: first.marketTitle;
		const syntheticBlockTitle =
			venue === "predictfun"
				? predictSyntheticTitle
				: venue === "dflow"
					? stripUmbrellaDisplayPrefix(
							resolvedDflowCatalog?.displayName ?? "",
						).trim() ||
						first.marketTitle
					: first.marketTitle;
		const umbrellaForBlock =
			resolvedPredict ??
			resolvedDflowCatalog ??
			buildSyntheticUmbrella(
				`${idPrefix}-${eventKey.slice(0, 20)}`,
				syntheticBlockTitle,
				first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
			);
		const displayOverride =
			resolvedPredict?.displayName?.trim() ||
			resolvedDflowCatalog?.displayName?.trim() ||
			undefined;
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
		cashLoading: portfolioCashLoading,
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
		if (import.meta.env.DEV && allLimitlessVenuePositions.length > 0) {
			const bucketLabel: Record<
				ReturnType<typeof getLimitlessVenueBucket>,
				string
			> = {
				active:
					"limitlessPositions active (open / not History bucket — see splitLimitlessVenuePositions)",
				winnings:
					"limitlessWinnings → merged into venueHistory (resolved + redeemable + currentValue>0)",
				history:
					"limitlessHistory → merged into venueHistory (resolved, not redeemable winner row)",
			};
			const dbgRows = allLimitlessVenuePositions.map((p) => ({
				bucket: bucketLabel[getLimitlessVenueBucket(p)],
				marketStatus: p.marketStatus ?? "(missing)",
				marketClosed: p.marketClosed,
				winningOutcomeIndex: p.winningOutcomeIndex,
				redeemable: p.redeemable,
				currentValue: p.currentValue,
				shares: p.shares,
				outcome: p.outcome,
				title: (p.marketTitle ?? "").slice(0, 72),
				slug: p.eventSlug ?? "",
				tokenTail: (p.tokenId ?? "").slice(-14),
			}));
			debugLimitlessPortfolioTable(
				"GET portfolio positions (venue) — how rows are split for Positions vs History",
				dbgRows,
			);
		}
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
	const isDataFullyLoaded =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettled &&
		(predictMarketIds.length === 0 || !predictMarketsQuery.isLoading);

	/** Positions tab: same shell for header + body — includes DFlow when verified (no second skeleton strip). */
	const isPositionsTabContentReady =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		venueQueriesSettledForPositionsBody &&
		dflowVenueSettled &&
		(predictMarketIds.length === 0 || !predictMarketsQuery.isLoading);

	const dflowPositionsStripPending =
		dflowRpcEnabled && dflowPositionsQuery.isPending;

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
				await refreshViaRpc();
			} catch (e) {
				console.error("[usePositionsData] Post-claim balance refresh failed:", e);
			}
		},
		[acknowledgeClearedPayouts, refreshUserData, refreshViaRpc, queryClient],
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
		let limitlessHistIncludedLog = 0;
		for (const trade of limitlessTrades) {
			const resolvedLike = isVenueMarketResolvedLike(trade.marketStatus);
			// Do not dedupe by `tokenId` alone: open positions already claimed that key,
			// which would hide every Limitless fill for markets you still hold.
			const histKey =
				trade.historySourceId?.trim() ||
				`lxhist:${trade.tokenId}:${trade.shares}:${trade.cost ?? ""}:${trade.marketTitle?.slice(0, 40) ?? ""}`;
			if (seen.has(histKey)) continue;
			seen.add(histKey);
			if (import.meta.env.DEV && limitlessHistIncludedLog < 15) {
				limitlessHistIncludedLog++;
				debugLimitlessPortfolio(
					"GET portfolio/history fills: row merged into venueHistory",
					{
						isVenueMarketResolvedLike: resolvedLike,
						marketStatusRaw: trade.marketStatus,
						title: trade.marketTitle,
						outcome: trade.outcome,
						shares: trade.shares,
						avgPrice: trade.avgPrice,
						cost: trade.cost,
						outcomeResultAfterMerge:
							trade.outcomeResult ??
							(trade.pnl != null && Number.isFinite(trade.pnl)
								? trade.pnl > 0
									? "WON"
									: "LOST"
								: "(undefined — Outcome column shows — )"),
						histKey,
					},
				);
			}
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
		if (import.meta.env.DEV && limitlessTrades.length > 0) {
			debugLimitlessPortfolio("venueHistory limitless trade rows (summary)", {
				totalFromApi: limitlessTrades.length,
				mergedRows: limitlessTrades.length,
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

	const venueHistoryResolveQueries = useMemo(() => {
		const seen = new Set<string>();
		const out: UmbrellaExchangeResolveQuery[] = [];
		for (const item of venueHistoryRawItems) {
			if (!shouldRequestVenueHistoryUmbrellaResolve(item)) continue;
			const k = venueHistoryExchangeResolveKey(item);
			if (!k || seen.has(k)) continue;
			seen.add(k);
			const q = venuePositionToResolveQuery(item, k);
			if (q) out.push(q);
		}
		return out;
	}, [venueHistoryRawItems]);

	/** Order-independent payload fingerprint so query identity does not churn on row order alone. */
	const venueHistoryResolveQueriesKeyStable = useMemo(() => {
		try {
			return JSON.stringify(
				[...venueHistoryResolveQueries].sort((a, b) =>
					String(a.clientKey ?? "").localeCompare(String(b.clientKey ?? "")),
				),
			);
		} catch {
			return String(venueHistoryResolveQueries.length);
		}
	}, [venueHistoryResolveQueries]);

	/**
	 * Opt-in (`VITE_DEBUG_VENUE_HISTORY_SOURCES=1`): merged venue-history source sizes. Fingerprinted
	 * (counts + resolve batch size) — not `venueHistoryRawItems` identity — because Poly/Predict/
	 * Limitless queries often produce a new array reference on each tick while counts are unchanged.
	 */
	const venueHistorySourcesDebugFingerprintRef = useRef("");

	useEffect(() => {
		if (import.meta.env.VITE_DEBUG_VENUE_HISTORY_SOURCES !== "1") return;
		const poly = polyTradeHistoryQuery.data ?? [];
		let polyWon = 0;
		for (const p of poly) {
			if (p.venue === "polymarket" && p.outcomeResult === "WON") polyWon++;
		}
		const mat = predictMatchesQuery.data ?? [];
		const fp = [
			venueHistoryRawItems.length,
			predictFilledOrders.length,
			mat.length,
			poly.length,
			polyWon,
			limitlessTradeHistoryQuery.data?.length ?? 0,
			venueHistoryResolveQueries.length,
		].join(":");
		if (fp === venueHistorySourcesDebugFingerprintRef.current) return;
		venueHistorySourcesDebugFingerprintRef.current = fp;
		console.debug("[venueHistorySources]", {
			rawItemCount: venueHistoryRawItems.length,
			predictFilledOrders: predictFilledOrders.length,
			predictMatchEvents: mat.length,
			polyActivityRows: poly.length,
			polyActivityOutcomeWon: polyWon,
			limitlessHistoryApiRows: limitlessTradeHistoryQuery.data?.length ?? 0,
			historyResolveQueryCount: venueHistoryResolveQueries.length,
		});
	}, [
		venueHistoryRawItems.length,
		predictFilledOrders.length,
		predictMatchesQuery.data,
		polyTradeHistoryQuery.data,
		limitlessTradeHistoryQuery.data,
		venueHistoryResolveQueries.length,
	]);

	const historyVenueUmbrellaResolveQuery = useQuery({
		queryKey: [
			"umbrella-resolve-venue-history",
			"payloads",
			venueHistoryResolveQueriesKeyStable,
		],
		queryFn: async () =>
			postUmbrellaResolveExchangeKeysChunked(
				(body) =>
					privateApi.postUmbrellaResolveVenueHistory({
						queries: body.queries,
					}),
				venueHistoryResolveQueries,
			),
		enabled:
			Boolean(authenticated && effectiveAccount && venueHistoryResolveQueries.length > 0),
		placeholderData: keepPreviousData,
		staleTime: 300_000,
		retry: 1,
	});

	/** Active catalog + resolved inactive umbrellas from History `POST /api/umbrellas/resolve-venue-history` payloads. */
	const historyCatalogUmbrellas = useMemo(() => {
		const byId = new Map<string, Umbrella>();
		for (const u of umbrellas) {
			byId.set(String(u._id), u);
		}
		const raw = historyVenueUmbrellaResolveQuery.data;
		const payloads =
			raw && raw.success && raw.data?.umbrellasById ? raw.data.umbrellasById : undefined;
		if (payloads) {
			for (const [id, doc] of Object.entries(payloads)) {
				if (doc && typeof doc === "object") {
					byId.set(id, doc as Umbrella);
				}
			}
		}
		return Array.from(byId.values());
	}, [umbrellas, historyVenueUmbrellaResolveQuery.data]);

	const umbrellaLookupByConditionIdForHistory = useMemo(
		() => buildUmbrellaLookupByPolymarketConditionId(historyCatalogUmbrellas),
		[historyCatalogUmbrellas],
	);

	/** DFlow outcome mint → umbrella (exchangeMatching.dflow yes/no mints), incl. resolve payloads. */
	const umbrellaLookupByDflowMintForHistory = useMemo(
		() => buildUmbrellaLookupByDflowOutcomeMint(historyCatalogUmbrellas),
		[historyCatalogUmbrellas],
	);

	const umbrellaLookupByDflowEventTickerForHistory = useMemo(
		() => buildUmbrellaLookupByDflowEventTicker(historyCatalogUmbrellas),
		[historyCatalogUmbrellas],
	);

	const predictUmbrellaLookupForHistory = useMemo(
		() => buildPredictUmbrellaLookup(appState?.markets, historyCatalogUmbrellas),
		[appState?.markets, historyCatalogUmbrellas],
	);

	/**
	 * Dev-only FULL_HISTORY_RESOLVE logging: `partial_hits` means some `clientKey`s have no
	 * `umbrellaId` in the resolve response (Mongo / exchangeMatching catalog gap)—not a stuck
	 * resolve or History loading latch; rows still render with synthetic/unmatched grouping.
	 * TanStack refetch-on-window-focus replays the same payload and used to spam `console.warn`,
	 * which Sentry surfaces as errors; we fingerprint identical outcomes and log partials at
	 * `info` so focus refetch does not look like a recurring failure.
	 *
	 * Console output is opt-in: set `VITE_DEBUG_FULL_HISTORY_RESOLVE=1` (errors still log in dev).
	 */
	const fullHistoryResolveDiagFingerprintRef = useRef("");

	useEffect(() => {
		if (!import.meta.env.DEV) return;

		if (historyVenueUmbrellaResolveQuery.isError) {
			// eslint-disable-next-line no-console -- History batch-resolve diagnostic
			console.warn(
				"[FULL_HISTORY_RESOLVE] POST /api/umbrellas/resolve-venue-history failed",
				{
					privateApiBase: getPrivateApiBaseUrl(),
					error: historyVenueUmbrellaResolveQuery.error,
				},
			);
			return;
		}

		if (import.meta.env.VITE_DEBUG_FULL_HISTORY_RESOLVE !== "1") return;

		const d = historyVenueUmbrellaResolveQuery.data;
		const oldGateWouldSkip = venueHistoryRawItems.filter(
			(p) =>
				Boolean(p.levelUpUmbrellaDisplayName?.trim()) &&
				!p.levelUpUmbrellaId?.trim() &&
				venueHistoryExchangeResolveKey(p) != null,
		).length;
		if (d?.success && venueHistoryResolveQueries.length > 0) {
			const by = d.data?.byClientKey ?? {};
			const hits = venueHistoryResolveQueries.filter(
				(x) => by[x.clientKey]?.umbrellaId || by[x.clientKey]?.displayName,
			);
			const missKeys = venueHistoryResolveQueries
				.map((q) => q.clientKey)
				.filter((ck) => !by[ck]?.umbrellaId);
			const umbrellaIdHits = venueHistoryResolveQueries.filter(
				(x) => by[x.clientKey]?.umbrellaId,
			).length;
			const classify =
				umbrellaIdHits === 0
					? "all_miss_or_empty_hits"
					: missKeys.length === 0
						? "all_hits"
						: "partial_hits";
			const diagFp = `${classify}:${venueHistoryResolveQueries.length}:${[...missKeys].sort().join("\0")}`;
			if (diagFp === fullHistoryResolveDiagFingerprintRef.current) return;
			fullHistoryResolveDiagFingerprintRef.current = diagFp;

			const payloads = d.data?.umbrellasById;
			const payloadIdCount = payloads ? Object.keys(payloads).length : 0;
			const predictRowsMissingResolveClientKey = venueHistoryRawItems.filter(
				(p) =>
					p.venue === "predictfun" &&
					!p.levelUpUmbrellaId?.trim() &&
					venueHistoryExchangeResolveKey(p) == null,
			).length;
			const resolveRequestChunkCount = Math.ceil(
				venueHistoryResolveQueries.length / UMBRELLA_RESOLVE_EXCHANGE_MAX_QUERIES,
			);
			// eslint-disable-next-line no-console -- History batch-resolve diagnostic
			console.info("[FULL_HISTORY_RESOLVE]", {
				privateApiBase: getPrivateApiBaseUrl(),
				queryCount: venueHistoryResolveQueries.length,
				resolveRequestChunkCount,
				classify,
				sampleQueries: venueHistoryResolveQueries.slice(0, 8).map((q) => ({
					venue: q.venue,
					clientKey:
						q.clientKey.length > 96 ? `${q.clientKey.slice(0, 96)}…` : q.clientKey,
					conditionId: q.conditionId
						? q.conditionId.length > 22
							? `${q.conditionId.slice(0, 22)}…`
							: q.conditionId
						: undefined,
					numericMarketId: q.numericMarketId,
					dflowEventTicker: q.dflowEventTicker,
					tokenIdPresent: Boolean(q.tokenId?.trim()),
				})),
				byClientKeyEntryCount: Object.keys(by).length,
				rowsWithUmbrellaIdInResponse: umbrellaIdHits,
				missKeyCount: missKeys.length,
				missKeysSample: missKeys.slice(0, 16),
				...(missKeys.length > 0
					? {
							partialHitsNote:
								"Some keys have no umbrellaId in resolve (catalog gap); labels may stay generic.",
							missKeysExtraSample: missKeys.slice(16, 36),
						}
					: {}),
				umbrellasByIdCount: payloadIdCount,
				rawVenueHistoryCount: venueHistoryRawItems.length,
				predictRowsMissingResolveClientKey,
				/** Rows that previously skipped batch resolve when only displayName was set (fixed gate). */
				oldGateWouldSkipDisplayNameWithoutId: oldGateWouldSkip,
			});
			if (hits.length === 0) {
				// eslint-disable-next-line no-console -- History batch-resolve diagnostic
				console.warn(
					"[FULL_HISTORY_RESOLVE] batch OK but zero umbrella hits",
					{
						keyCount: venueHistoryResolveQueries.length,
						sampleKeys: venueHistoryResolveQueries
							.map((x) => x.clientKey)
							.slice(0, 12),
					},
				);
			}
		} else if (d?.success) {
			const predictRowsMissingResolveClientKey = venueHistoryRawItems.filter(
				(p) =>
					p.venue === "predictfun" &&
					!p.levelUpUmbrellaId?.trim() &&
					venueHistoryExchangeResolveKey(p) == null,
			).length;
			if (predictRowsMissingResolveClientKey > 0) {
				// eslint-disable-next-line no-console -- History batch-resolve diagnostic
				console.info(
					"[FULL_HISTORY_RESOLVE] no resolve queries; Predict rows lack numericMarketId+tokenKey for POST",
					{
						predictRowsMissingResolveClientKey,
						rawVenueHistoryCount: venueHistoryRawItems.length,
					},
				);
			}
		}
	}, [
		venueHistoryRawItems,
		historyVenueUmbrellaResolveQuery.data,
		historyVenueUmbrellaResolveQuery.isError,
		historyVenueUmbrellaResolveQuery.error,
		venueHistoryResolveQueries,
	]);

	const venueHistory = useMemo(() => {
		const raw = historyVenueUmbrellaResolveQuery.data;
		const batch =
			raw && typeof raw === "object" && raw.success && raw.data?.byClientKey
				? raw.data.byClientKey
				: undefined;
		const payloads =
			raw && raw.success && raw.data?.umbrellasById ? raw.data.umbrellasById : undefined;

		/** Polymarket wire lookup key → umbrellaId from batch, keyed by resolve `conditionId` (not catalog re-index). */
		const polyWireToUmbrellaIdFromBatch = new Map<string, string>();
		if (batch && venueHistoryResolveQueries.length > 0) {
			for (const q of venueHistoryResolveQueries) {
				if (q.venue !== "polymarket") continue;
				const cid = q.conditionId?.trim();
				if (!cid) continue;
				const hit = batch[q.clientKey];
				const uid = hit?.umbrellaId?.trim();
				if (!uid) continue;
				const wire = polymarketConditionIdForResolveWire(cid);
				const lk = wire ? polymarketConditionLookupKey(wire) : "";
				if (lk) polyWireToUmbrellaIdFromBatch.set(lk, uid);
			}
		}

		let rows = venueHistoryRawItems;
		if (batch && Object.keys(batch).length > 0) {
			rows = venueHistoryRawItems.map((item) => {
				const k = venueHistoryExchangeResolveKey(item);
				if (!k) return item;
				const hit = batch[k];
				if (!hit?.displayName && !hit?.umbrellaId) return item;
				const display = stripUmbrellaDisplayPrefix(hit.displayName ?? "").trim();
				const existingId = item.levelUpUmbrellaId?.trim();
				const hitId = hit.umbrellaId?.trim();
				return {
					...item,
					levelUpUmbrellaId: existingId || hitId || item.levelUpUmbrellaId,
					levelUpUmbrellaDisplayName:
						item.levelUpUmbrellaDisplayName?.trim() || hit.displayName,
					...(display ? { marketTitle: display } : {}),
				};
			});
		}

		if (polyWireToUmbrellaIdFromBatch.size > 0) {
			rows = rows.map((item) => {
				if (item.venue !== "polymarket") return item;
				if (item.levelUpUmbrellaId?.trim()) return item;
				const wire = polymarketConditionIdForResolveWire(item.conditionId ?? "");
				const lk = wire ? polymarketConditionLookupKey(wire) : "";
				const uid = lk ? polyWireToUmbrellaIdFromBatch.get(lk) : undefined;
				if (!uid) return item;
				const doc = payloads?.[uid] as Umbrella | undefined;
				const dn = doc?.displayName
					? stripUmbrellaDisplayPrefix(doc.displayName).trim()
					: "";
				return {
					...item,
					levelUpUmbrellaId: uid,
					...(doc?.displayName && !item.levelUpUmbrellaDisplayName?.trim()
						? { levelUpUmbrellaDisplayName: doc.displayName }
						: {}),
					...(dn && dn !== item.marketTitle ? { marketTitle: dn } : {}),
				};
			});
		}

		return rows.map((item) => {
			if (item.venue === "polymarket" && item.conditionId?.trim()) {
				const wire = polymarketConditionIdForResolveWire(item.conditionId);
				const key = wire ? polymarketConditionLookupKey(wire) : "";
				const u = key ? umbrellaLookupByConditionIdForHistory.get(key) : undefined;
				if (u?.displayName?.trim()) {
					const dn = stripUmbrellaDisplayPrefix(u.displayName).trim();
					const idPatch: Partial<VenuePosition> = {};
					if (!item.levelUpUmbrellaId?.trim()) {
						idPatch.levelUpUmbrellaId = u._id;
						if (!item.levelUpUmbrellaDisplayName?.trim()) {
							idPatch.levelUpUmbrellaDisplayName = u.displayName;
						}
					}
					if (dn && dn !== item.marketTitle) {
						return { ...item, ...idPatch, marketTitle: dn };
					}
					if (Object.keys(idPatch).length > 0) {
						return { ...item, ...idPatch };
					}
				}
			}
			if (item.venue === "dflow") {
				const et = item.dflowEventTicker?.trim();
				if (et) {
					const u = lookupUmbrellaByDflowEventTicker(
						et,
						umbrellaLookupByDflowEventTickerForHistory,
						historyCatalogUmbrellas,
					);
					if (u?.displayName?.trim()) {
						const dn = stripUmbrellaDisplayPrefix(u.displayName).trim();
						const idPatch: Partial<VenuePosition> = {};
						if (!item.levelUpUmbrellaId?.trim()) {
							idPatch.levelUpUmbrellaId = u._id;
							if (!item.levelUpUmbrellaDisplayName?.trim()) {
								idPatch.levelUpUmbrellaDisplayName = u.displayName;
							}
						}
						if (dn && dn !== item.marketTitle) {
							return { ...item, ...idPatch, marketTitle: dn };
						}
						if (Object.keys(idPatch).length > 0) {
							return { ...item, ...idPatch };
						}
						return item;
					}
				} else if (item.tokenId?.trim()) {
					const u = umbrellaLookupByDflowMintForHistory.get(item.tokenId.trim());
					if (u?.displayName?.trim()) {
						const dn = stripUmbrellaDisplayPrefix(u.displayName).trim();
						const idPatch: Partial<VenuePosition> = {};
						if (!item.levelUpUmbrellaId?.trim()) {
							idPatch.levelUpUmbrellaId = u._id;
							if (!item.levelUpUmbrellaDisplayName?.trim()) {
								idPatch.levelUpUmbrellaDisplayName = u.displayName;
							}
						}
						if (dn && dn !== item.marketTitle) {
							return { ...item, ...idPatch, marketTitle: dn };
						}
						if (Object.keys(idPatch).length > 0) {
							return { ...item, ...idPatch };
						}
						return item;
					}
				}
				const apiTitle = stripUmbrellaDisplayPrefix(
					item.levelUpUmbrellaDisplayName ?? "",
				).trim();
				if (apiTitle && apiTitle !== item.marketTitle) {
					return { ...item, marketTitle: apiTitle };
				}
				return item;
			}
			if (item.venue !== "predictfun") return item;
			const apiTitle = stripUmbrellaDisplayPrefix(
				item.levelUpUmbrellaDisplayName ?? "",
			).trim();
			if (apiTitle) {
				if (item.marketTitle === apiTitle && item.levelUpUmbrellaId?.trim()) {
					return item;
				}
				if (item.marketTitle !== apiTitle) {
					return { ...item, marketTitle: apiTitle };
				}
				// Title already matches API label but umbrella id may still be missing — fall through.
			}
			const histDetail =
				item.numericMarketId != null
					? predictMarketDetails.get(item.numericMarketId)
					: undefined;
			const histHint =
				(histDetail?.question ?? histDetail?.title ?? "").trim() || undefined;
			const u = resolvePredictUmbrellaForDisplay(
				item,
				predictUmbrellaLookupForHistory,
				historyCatalogUmbrellas,
				histHint,
			);
			if (!u?.displayName?.trim()) {
				const raw = (histHint ?? item.marketTitle ?? "").trim();
				const short = shortPredictFunMarketTitleForPortfolio(raw);
				if (short && short !== item.marketTitle) return { ...item, marketTitle: short };
				return item;
			}
			const dn = stripUmbrellaDisplayPrefix(u.displayName).trim();
			if (!dn) {
				const raw = (histHint ?? item.marketTitle ?? "").trim();
				const short = shortPredictFunMarketTitleForPortfolio(raw);
				if (short && short !== item.marketTitle) return { ...item, marketTitle: short };
				return item;
			}
			const idPatch: Partial<VenuePosition> = {};
			if (!item.levelUpUmbrellaId?.trim()) {
				idPatch.levelUpUmbrellaId = u._id;
				if (!item.levelUpUmbrellaDisplayName?.trim()) {
					idPatch.levelUpUmbrellaDisplayName = u.displayName;
				}
			}
			if (dn !== item.marketTitle) {
				return { ...item, ...idPatch, marketTitle: dn };
			}
			if (Object.keys(idPatch).length > 0) {
				return { ...item, ...idPatch };
			}
			return item;
		});
	}, [
		venueHistoryRawItems,
		historyVenueUmbrellaResolveQuery.data,
		venueHistoryResolveQueries,
		umbrellaLookupByConditionIdForHistory,
		umbrellaLookupByDflowMintForHistory,
		umbrellaLookupByDflowEventTickerForHistory,
		predictUmbrellaLookupForHistory,
		historyCatalogUmbrellas,
		predictMarketDetails,
	]);

	const historyResolveStage = useMemo(
		() => ({
			batchFetchStatus: historyVenueUmbrellaResolveQuery.fetchStatus,
			batchIsSuccess: historyVenueUmbrellaResolveQuery.isSuccess,
			batchIsError: historyVenueUmbrellaResolveQuery.isError,
			queryCount: venueHistoryResolveQueries.length,
			rowCountTotal: venueHistory.length,
			rowCountWithLevelUpUmbrellaId: venueHistory.filter((p) =>
				Boolean(p.levelUpUmbrellaId?.trim()),
			).length,
		}),
		[
			historyVenueUmbrellaResolveQuery.fetchStatus,
			historyVenueUmbrellaResolveQuery.isSuccess,
			historyVenueUmbrellaResolveQuery.isError,
			venueHistoryResolveQueries.length,
			venueHistory,
		],
	);

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

	const hResolve = historyVenueUmbrellaResolveQuery;
	/** While resolve query key grows, `keepPreviousData` shows prior batch — still `isPending` without counting as “blocking” the History shell. */
	const historyUmbrellaResolveSettled =
		venueHistoryResolveQueries.length === 0 ||
		!Boolean(authenticated && effectiveAccount) ||
		hResolve.isError ||
		!hResolve.isPending ||
		hResolve.isPlaceholderData;

	/** Single gate for History body + header: core data, funding addresses, activity history, batch resolve. */
	const isHistoryTabContentReady =
		isDataFullyLoaded &&
		!fundingAddressesLoading &&
		!venueTradeHistoryLoading &&
		historyUmbrellaResolveSettled;

	const positionsLoadingGateFingerprintRef = useRef("");
	useEffect(() => {
		if (!positionsLoadingGateDiagEnabled() || !effectiveAccount) return;

		const armsBlockers: string[] = [];
		if (predictionLoading) armsBlockers.push("predictionLoading");
		if (userDataLoading) armsBlockers.push("userDataLoading");
		if (portfolioLoading) armsBlockers.push("portfolioLoading");
		if (booksPreviewLoading) armsBlockers.push("booksPreviewLoading");
		if (polyPositionsQuery.isLoading) armsBlockers.push("polyPositionsQuery.isLoading");
		if (predictPositionsQuery.isLoading) armsBlockers.push("predictPositionsQuery.isLoading");
		if (dflowRpcEnabled && dflowPositionsQuery.isPending) {
			armsBlockers.push("dflowPositionsQuery.isPending");
		}
		if (limitlessPortfolioEnabled && limitlessVenuePositionsQuery.isLoading) {
			armsBlockers.push("limitlessVenuePositionsQuery.isLoading");
		}
		if (limitlessPortfolioEnabled && limitlessOpenOrdersQuery.isLoading) {
			armsBlockers.push("limitlessOpenOrdersQuery.isLoading");
		}
		if (predictMarketIds.length > 0 && predictMarketsQuery.isLoading) {
			armsBlockers.push("predictMarketsQuery.isLoading");
		}
		if (
			Boolean(polymarketSafe?.trim()) &&
			!polyTradeHistoryQuery.isFetched &&
			!polyTradeHistoryQuery.isError
		) {
			armsBlockers.push("polyTradeHistoryQuery.awaitingFirstFetch");
		}
		if (
			Boolean(limitlessMakerBase?.trim()) &&
			!limitlessTradeHistoryQuery.isFetched &&
			!limitlessTradeHistoryQuery.isError
		) {
			armsBlockers.push("limitlessTradeHistoryQuery.awaitingFirstFetch");
		}
		if (fundingAddressesLoading) armsBlockers.push("fundingAddressesLoading");
		if (
			venueHistoryResolveQueries.length > 0 &&
			Boolean(authenticated && effectiveAccount) &&
			historyVenueUmbrellaResolveQuery.isPending &&
			!historyVenueUmbrellaResolveQuery.isPlaceholderData
		) {
			armsBlockers.push("historyVenueUmbrellaResolveQuery.isPending");
		}

		/**
		 * `armsBlockers` mixes History-only waits with core venue loads — do not infer Positions-tab
		 * skeleton from `blockerCount` alone. These mirror `isPositionsTabContentReady` /
		 * `isHistoryTabContentReady` in Positions.tsx (`pageShellLoading`).
		 */
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
			armsBlockers.join(","),
			String(isDataFullyLoaded),
			String(isPositionsTabContentReady),
			String(isHistoryTabContentReady),
			polyPositionsQuery.fetchStatus,
			predictPositionsQuery.fetchStatus,
			predictMarketsQuery.fetchStatus,
			polyTradeHistoryQuery.fetchStatus,
			limitlessTradeHistoryQuery.fetchStatus,
			historyVenueUmbrellaResolveQuery.fetchStatus,
		].join("|");

		if (fingerprint === positionsLoadingGateFingerprintRef.current) return;
		positionsLoadingGateFingerprintRef.current = fingerprint;

		const predictIdsMissingDetail =
			predictMarketIds.length > 0 && predictMarketsQuery.isSuccess
				? predictMarketIds.filter((id) => !predictMarketDetails.has(id))
				: [];

		const marketRows = umbrellas.flatMap((u) => {
			const markets = (getQuestionsForUmbrella(u._id) as PredictionMarket[]) || [];
			return markets.map((m) => {
				const balanceId = m._id;
				const priceId = m.questionId || m._id;
				const tb = balanceId ? tokenBalances.get(balanceId) : undefined;
				const preview = priceId ? allBooksPreview[priceId] : undefined;
				const yp = preview?.lowestAsk ?? preview?.bestYesPrice ?? null;
				const np =
					typeof preview?.bestNoPrice === "number"
						? preview.bestNoPrice
						: preview?.highestBid != null && preview?.highestBid !== undefined
							? 1 - preview.highestBid
							: null;
				const priced = typeof yp === "number" || typeof np === "number";
				const yes = tb ? Number(tb.yesBalance) : 0;
				const no = tb ? Number(tb.noBalance) : 0;
				const issues: string[] = [];
				if (yes > 0 || no > 0) {
					if (!priced) issues.push("openPositionNoBookPrice");
				}
				return {
					umbrellaId: String(u._id).slice(0, 10),
					title: String((m as { displayName?: string }).displayName ?? "").slice(0, 56),
					balanceId: String(balanceId ?? "").slice(0, 14),
					priceKey: String(priceId ?? "").slice(0, 16),
					hasTokenBalanceRow: Boolean(tb),
					hasPricedBook: priced,
					yes,
					no,
					issues,
				};
			});
		});

		const marketsWithIssues = marketRows.filter((r) => r.issues.length > 0);

		logPositionsLoadingGateState({
			wallet: truncateWallet(effectiveAccount),
			blockers: armsBlockers,
			blockersText: armsBlockers.join(" · "),
			blockerCount: armsBlockers.length,
			positionsShellBlockers,
			positionsShellBlockersText: positionsShellBlockers.join(" · ") || "(none)",
			historyShellBlockers,
			historyShellBlockersText: historyShellBlockers.join(" · ") || "(none)",
			arms: {
				predictionLoading,
				userDataLoading,
				portfolioLoading,
				booksPreviewLoading,
				polyPositions: {
					isLoading: polyPositionsQuery.isLoading,
					fetchStatus: polyPositionsQuery.fetchStatus,
				},
				predictPositions: {
					isLoading: predictPositionsQuery.isLoading,
					fetchStatus: predictPositionsQuery.fetchStatus,
				},
				dflow: {
					dflowRpcEnabled,
					isPending: dflowPositionsQuery.isPending,
					fetchStatus: dflowPositionsQuery.fetchStatus,
				},
				limitlessVenue: {
					enabled: limitlessPortfolioEnabled,
					isLoading: limitlessVenuePositionsQuery.isLoading,
					fetchStatus: limitlessVenuePositionsQuery.fetchStatus,
				},
				limitlessOpenOrders: {
					enabled: limitlessPortfolioEnabled,
					isLoading: limitlessOpenOrdersQuery.isLoading,
					fetchStatus: limitlessOpenOrdersQuery.fetchStatus,
				},
				predictMarketDetails: {
					idCount: predictMarketIds.length,
					isLoading: predictMarketsQuery.isLoading,
					fetchStatus: predictMarketsQuery.fetchStatus,
					idsMissingFromDetailMap: predictIdsMissingDetail.slice(0, 24),
					idsMissingTruncated: Math.max(0, predictIdsMissingDetail.length - 24),
				},
				predictOrders: {
					filledCount: predictFilledOrders.length,
					filledFetched: predictFilledFetched,
					filledError: Boolean(predictFilledError),
				},
				polyTradeHistory: {
					needed: Boolean(polymarketSafe?.trim()),
					isFetched: polyTradeHistoryQuery.isFetched,
					isPending: polyTradeHistoryQuery.isPending,
					fetchStatus: polyTradeHistoryQuery.fetchStatus,
					isError: polyTradeHistoryQuery.isError,
				},
				limitlessTradeHistory: {
					needed: Boolean(limitlessMakerBase?.trim()),
					isFetched: limitlessTradeHistoryQuery.isFetched,
					isPending: limitlessTradeHistoryQuery.isPending,
					fetchStatus: limitlessTradeHistoryQuery.fetchStatus,
					isError: limitlessTradeHistoryQuery.isError,
				},
				fundingAddressesLoading,
				historyResolve: {
					queryCount: venueHistoryResolveQueries.length,
					isPending: historyVenueUmbrellaResolveQuery.isPending,
					fetchStatus: historyVenueUmbrellaResolveQuery.fetchStatus,
					isSuccess: historyVenueUmbrellaResolveQuery.isSuccess,
					isError: historyVenueUmbrellaResolveQuery.isError,
				},
			},
			gates: {
				isDataFullyLoaded,
				isPositionsTabContentReady,
				isHistoryTabContentReady,
				venueTradeHistoryLoading,
				historyUmbrellaResolveSettled,
			},
			catalogMarkets: {
				totalRows: marketRows.length,
				withBalanceOrPosition: marketRows.filter((r) => r.yes > 0 || r.no > 0).length,
				missingBookForOpenNotional: marketsWithIssues.length,
				marketsWithIssues: marketsWithIssues.slice(0, 40),
				allMarketsSample: marketRows.slice(0, 30),
				allMarketsTruncated: Math.max(0, marketRows.length - 30),
			},
		});
	}, [
		effectiveAccount,
		predictionLoading,
		userDataLoading,
		portfolioLoading,
		booksPreviewLoading,
		polyPositionsQuery.isLoading,
		polyPositionsQuery.fetchStatus,
		predictPositionsQuery.isLoading,
		predictPositionsQuery.fetchStatus,
		dflowRpcEnabled,
		dflowPositionsQuery.isPending,
		dflowPositionsQuery.fetchStatus,
		limitlessPortfolioEnabled,
		limitlessVenuePositionsQuery.isLoading,
		limitlessVenuePositionsQuery.fetchStatus,
		limitlessOpenOrdersQuery.isLoading,
		limitlessOpenOrdersQuery.fetchStatus,
		predictMarketIds,
		predictMarketsQuery.isLoading,
		predictMarketsQuery.isSuccess,
		predictMarketsQuery.fetchStatus,
		predictMarketDetails,
		predictFilledOrders.length,
		predictFilledFetched,
		predictFilledError,
		polymarketSafe,
		polyTradeHistoryQuery.isFetched,
		polyTradeHistoryQuery.isPending,
		polyTradeHistoryQuery.isError,
		polyTradeHistoryQuery.fetchStatus,
		limitlessMakerBase,
		limitlessTradeHistoryQuery.isFetched,
		limitlessTradeHistoryQuery.isPending,
		limitlessTradeHistoryQuery.isError,
		limitlessTradeHistoryQuery.fetchStatus,
		fundingAddressesLoading,
		venueHistoryResolveQueries.length,
		authenticated,
		historyVenueUmbrellaResolveQuery.isPending,
		historyVenueUmbrellaResolveQuery.fetchStatus,
		historyVenueUmbrellaResolveQuery.isSuccess,
		historyVenueUmbrellaResolveQuery.isError,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
		venueTradeHistoryLoading,
		historyUmbrellaResolveSettled,
		umbrellas,
		getQuestionsForUmbrella,
		tokenBalances,
		allBooksPreview,
	]);

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
			isHistoryTabContentReady,
			venueTradeHistoryLoading,
			dflowPositionsStripPending,
			predictMarketIds.length,
			umbrellas.length,
			tokenBalances.size,
			previewKeyCount,
			predictOrdersEnabled,
			truncateWallet(polymarketSafe),
			truncateWallet(limitlessMakerBase),
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
				isHistoryTabContentReady,
				venueTradeHistoryLoading,
				dflowPositionsStripPending,
				polymarketSafe: truncateWallet(polymarketSafe),
				limitlessMakerBase: truncateWallet(limitlessMakerBase),
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
				positionsHeaderTotal: positionsTotalValue,
				openPositionsValue,
				unclaimedWinningsPayout: unclaimedWinningsPayoutTotal,
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
		isHistoryTabContentReady,
		venueTradeHistoryLoading,
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
		openPositionsValue,
		unclaimedWinningsPayoutTotal,
		predictOrdersEnabled,
		polymarketSafe,
		limitlessMakerBase,
	]);

	useEffect(() => {
		portfolioReadyLoggedRef.current = false;
		portfolioPerfFingerprintRef.current = "";
	}, [effectiveAccount]);

	return {
		account,
		effectiveAccount,
		isDebugMode,
		debugAccount,
		realAccount,
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
		dflowPositionsStripPending,
		venueTradeHistoryLoading,
		portfolioLoading,
		portfolioTotalCtx,
		cashBalanceCtx,
		portfolioCashLoading,
		usdcLoading,
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
