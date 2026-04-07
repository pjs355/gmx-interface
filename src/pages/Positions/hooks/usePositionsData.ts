import { useMemo, useState, useCallback, useEffect } from "react";
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
import { usePortfolio } from "context/PortfolioContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
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
} from "@/trading/predict/predictOrdersApi";
import { computePredictCostByTokenFromMatches } from "@/trading/predict/predictMatchesApi";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { useQuery } from "@tanstack/react-query";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import type { VenueId, VenueOrder } from "@/types/trading/venuePosition";
import { titlesMatchVenue } from "@/helpers/umbrellaDisplayName";
import {
	type MarketPosition,
	type UmbrellaPositions,
	isGenericSubMarketTitle,
	buildSyntheticOrder,
	mergeMarketPositions,
	buildSyntheticUmbrella,
} from "../utils/positionHelpers";

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
): MarketPosition {
	const isYes =
		pv.outcome.toLowerCase() === "yes" ||
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
			displayName: pv.marketTitle,
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
		predictOutcomeLabelYes: venue === "predictfun" && isYes ? pv.outcome : undefined,
		predictOutcomeLabelNo: venue === "predictfun" && !isYes ? pv.outcome : undefined,
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
		const synth = buildSyntheticUmbrella(
			`${idPrefix}-${eventKey.slice(0, 20)}`,
			first.marketTitle,
			first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
		);
		const rawMarkets = group.map((p) =>
			buildVenueMarketPosition(p, venue, venueName, qidPrefix),
		);
		umbrellas.push({ umbrella: synth, markets: mergeMarketPositions(rawMarkets) });
	}
	return umbrellas;
}

export default function usePositionsData() {
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

	const { polymarketSafe, solanaAddress } = useFundingAddresses();
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

	const {
		filledOrders: predictFilledOrders,
		openOrders: predictOpenOrders,
		filledError: predictFilledError,
		filledFetched: predictFilledFetched,
	} = usePredictOrders(true);

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
		allPredictPositions.length > 0 &&
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

	const predictMarketIds = useMemo(() => {
		const ids = new Set<number>();
		for (const p of allPredictPositions) {
			if (p.numericMarketId) ids.add(p.numericMarketId);
		}
		for (const o of predictOpenOrders) {
			ids.add(o.marketId);
		}
		return Array.from(ids);
	}, [allPredictPositions, predictOpenOrders]);

	const privateApi = usePrivateApiClient();

	const dflowPositionsQuery = useDflowPositions(solanaAddress, privateApi);
	const allDflowPositions = dflowPositionsQuery.data ?? [];

	const predictMarketsQuery = useQuery({
		queryKey: ["predict-market-details", predictMarketIds],
		enabled: predictMarketIds.length > 0,
		staleTime: 60_000,
		queryFn: async () => {
			const results = await Promise.allSettled(
				predictMarketIds.map((id) => privateApi.getPredictMarket(id)),
			);
			const map = new Map<number, PredictMarketDetail>();
			results.forEach((r, i) => {
				if (r.status === "fulfilled") map.set(predictMarketIds[i], r.value);
			});
			return map;
		},
	});
	const predictMarketDetails = predictMarketsQuery.data ?? new Map<number, PredictMarketDetail>();

	// --- Atomic loading gate: wait for ALL data including enrichment ---
	// Polymarket activity API can paginate many pages — do not block Positions/Orders skeleton on it.
	// History tab waits separately via `polyTradeHistoryLoading` (see Positions.tsx).
	const venueQueriesSettled =
		!polyPositionsQuery.isLoading &&
		!predictPositionsQuery.isLoading &&
		!dflowPositionsQuery.isLoading;

	const isDataFullyLoaded =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		!booksPreviewLoading &&
		venueQueriesSettled &&
		(predictMarketIds.length === 0 || !predictMarketsQuery.isLoading);

	// --- Enrich + split venue positions ---
	const { predictPositions, predictWinnings, predictHistory } = useMemo(() => {
		const active: typeof allPredictPositions = [];
		const won: typeof allPredictPositions = [];
		const lost: typeof allPredictPositions = [];

		for (const pos of allPredictPositions) {
			const detail = pos.numericMarketId ? predictMarketDetails.get(pos.numericMarketId) : undefined;
			const costEntry = getPredictCostForToken(predictCostLookup, pos.tokenId);
			const enriched = { ...pos };
			if (detail?.question && isGenericSubMarketTitle(enriched.marketTitle)) {
				enriched.marketTitle = detail.question;
			}
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
		(marketId: string | string[], _umbrellaId: string) => {
			const ids = Array.isArray(marketId) ? marketId : [marketId];
			setClaimedMarkets((prev) => {
				const next = new Set(prev);
				for (const id of ids) next.add(id);
				return next;
			});
			refreshUserData();
		},
		[refreshUserData],
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

	function matchVenueToUmbrella(pos: any): Umbrella | null {
		if (pos.conditionId && umbrellaLookupByConditionId.has(pos.conditionId)) {
			return umbrellaLookupByConditionId.get(pos.conditionId)!;
		}
		return umbrellas.find((u) =>
			titlesMatchVenue(u.displayName ?? "", pos.marketTitle ?? ""),
		) ?? null;
	}

	// --- Active positions grouped by umbrella ---
	const umbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) return [];

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
						const matched = matchVenueToUmbrella(pv);
						if (matched && matched._id === umbrella._id) {
							matchedIds.add(pv.tokenId);
							let overrides: any = undefined;
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
								const isYes =
									pv.outcome.toLowerCase() === "yes" ||
									(pv.outcome.toLowerCase() !== "no" &&
										(pv.marketTitle?.toLowerCase() ?? "").includes(pv.outcome.toLowerCase()));
								const yP = isYes ? (liveYesPrice ?? pv.currentPrice) : null;
								const nP = isYes ? null : (liveNoPrice ?? pv.currentPrice);
								const yV = yP !== null ? pv.shares * yP : (isYes ? pv.currentValue : 0);
								const nV = nP !== null ? pv.shares * nP : (isYes ? 0 : pv.currentValue);
								overrides = { yesPrice: yP, noPrice: nP, yesValue: yV, noValue: nV };
							}
							matches.push(buildVenueMarketPosition(pv, venue, venueName, qidPrefix, overrides));
						}
					}
					return matches;
				};

				const polyMatches = matchVenuePositions(polyPositions, matchedPolyTokenIds, "polymarket", "Polymarket", "poly");
				const predictMatches = matchVenuePositions(predictPositions, matchedPredictTokenIds, "predictfun", "Predict.fun", "predict");
				const dflowMatches = matchVenuePositions(dflowPositions, matchedDflowTokenIds, "dflow", "DFlow", "dflow");

				const allMarkets = [...activeMarkets, ...polyMatches, ...predictMatches, ...dflowMatches];
				return { umbrella, markets: mergeMarketPositions(allMarkets) };
			})
			.filter((u) => u.markets.length > 0);

		const polyUmbrellas = buildUnmatchedVenueUmbrellas(
			polyPositions, matchedPolyTokenIds, "polymarket", "Polymarket", "poly",
			(p) => p.eventSlug || p.marketTitle, "poly-event",
		);
		const predictUmbrellas = buildUnmatchedVenueUmbrellas(
			predictPositions, matchedPredictTokenIds, "predictfun", "Predict.fun", "predict",
			(p) => p.marketTitle || p.tokenId, "predict-market",
		);
		const dflowUmbrellas = buildUnmatchedVenueUmbrellas(
			dflowPositions, matchedDflowTokenIds, "dflow", "DFlow", "dflow",
			(p) => p.marketTitle || p.tokenId, "dflow-market",
		);

		return [...levelUpUmbrellas, ...polyUmbrellas, ...predictUmbrellas, ...dflowUmbrellas];
	}, [
		effectiveAccount, umbrellas, getQuestionsForUmbrella, tokenBalances, orders,
		allBooksPreview, polyPositions, predictPositions, dflowPositions, umbrellaLookupByConditionId,
	]);

	// --- Resolved (winnings) ---
	const resolvedUmbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) return [];
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
				const synth = buildSyntheticUmbrella(
					`${idPrefix}-${first.tokenId.slice(0, 10)}`,
					first.marketTitle,
					first.iconUrl ? { _polyIcon: first.iconUrl } : undefined,
				);
				const markets: MarketPosition[] = positions.map((pv) => {
					const isYes = pv.outcome.toLowerCase() === "yes" || pv.outcome.toLowerCase() !== "no";
					const mDetail = pv.numericMarketId ? predictMarketDetails.get(pv.numericMarketId) : undefined;
					return {
						market: {
							_id: `${idPrefix}-${pv.tokenId.slice(0, 12)}`,
							displayName: pv.marketTitle,
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
						predictOutcomeLabelYes: venue === "predictfun" && isYes ? pv.outcome : undefined,
						predictOutcomeLabelNo: venue === "predictfun" && !isYes ? pv.outcome : undefined,
					};
				}).filter((mp) => !claimedMarkets.has((mp.market as any)._id));
				if (markets.length > 0) resolved.push({ umbrella: synth, markets });
			}
		};

		appendVenueWinnings(predictWinnings, "predictfun", "predict-win", (p) => p.marketTitle || p.tokenId);
		appendVenueWinnings(polyWinnings, "polymarket", "poly-win", (p) => p.eventSlug || p.marketTitle);
		appendVenueWinnings(dflowWinnings, "dflow", "dflow-win", (p) => p.marketTitle || p.tokenId);

		return resolved;
	}, [
		effectiveAccount, resolvedMarketsByUmbrella, umbrellas, tokenBalances,
		claimedMarkets, predictWinnings, polyWinnings, dflowWinnings, predictMarketDetails,
	]);

	// --- Derived values ---
	const positionsTotalValue = useMemo(() => {
		return umbrellaPositions.reduce(
			(total, u) => total + u.markets.reduce((s, m) => s + m.totalValue, 0),
			0,
		);
	}, [umbrellaPositions]);

	const polyPriceMap = useMemo(() => {
		const map: Record<string, { yesPrice: number | null; noPrice: number | null }> = {};
		for (const up of umbrellaPositions) {
			for (const mp of up.markets) {
				if (mp.venue === "polymarket" || mp.venue === "predictfun" || mp.venue === "dflow") {
					map[mp.market._id] = { yesPrice: mp.yesPrice, noPrice: mp.noPrice };
				}
			}
		}
		return map;
	}, [umbrellaPositions]);

	const getCurrentPriceForSide = useCallback(
		(market: PredictionMarket, side: "Yes" | "No"): number | null => {
			const polyPrices = polyPriceMap[market._id];
			if (polyPrices) return side === "Yes" ? polyPrices.yesPrice : polyPrices.noPrice;
			const questionId = market.questionId || market._id;
			if (!questionId) return null;
			const preview = allBooksPreview[questionId];
			if (side === "Yes") return preview?.lowestAsk ?? null;
			return preview?.highestBid !== null && preview?.highestBid !== undefined
				? 1 - preview.highestBid
				: null;
		},
		[polyPriceMap, allBooksPreview],
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
		for (const p of allPredictPositions) {
			if (p.numericMarketId) titleLookup.set(p.numericMarketId, p.marketTitle);
			outcomeLookup.set(normalizePredictTokenId(p.tokenId), p.outcome);
		}
		for (const [id, detail] of predictMarketDetails) {
			if (!titleLookup.has(id)) titleLookup.set(id, detail.title);
			for (const o of detail.outcomes ?? []) {
				const ok = normalizePredictTokenId(o.onChainId);
				if (!outcomeLookup.has(ok)) outcomeLookup.set(ok, o.name);
			}
		}
		const liveOrders = predictOpenOrders.filter((o) => {
			const detail = predictMarketDetails.get(o.marketId);
			if (!detail) return true;
			return detail.status !== "RESOLVED" && detail.status !== "REMOVED" && detail.tradingStatus !== "CLOSED";
		});
		return mapPredictOrdersToVenueOrders(liveOrders, titleLookup, outcomeLookup);
	}, [predictOpenOrders, allPredictPositions, predictMarketDetails]);

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

		return items;
	}, [
		predictWinnings, predictHistory, polyWinnings, polyHistory,
		polyTradeHistoryQuery.data, dflowWinnings, dflowHistory,
		polyPositions, predictPositions, dflowPositions,
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
