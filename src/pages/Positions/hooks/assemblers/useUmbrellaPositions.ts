import { useMemo } from "react";
import {
	type PredictionMarket,
} from "@/services/api/predictionMarketDataService";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import { getOrderAggregates } from "@/services/api/simplifiedOrderService";
import type { ProcessedOrder } from "@/services/api/simplifiedOrderService";
import {
	buildUmbrellaLookupByPolymarketConditionId,
} from "@/trading/polymarket/polymarketConditionLookup";
import {
	buildUmbrellaLookupByDflowEventTicker,
	buildUmbrellaLookupByDflowOutcomeMint,
} from "@/trading/dflow/dflowUmbrellaLookup";
import {
	findMatchedMarketByPolyConditionId,
	parseVsTeamLabelsFromDisplayTitle,
} from "@/trading/polymarket/polyPositionSide";
import { inferPredictSideFromMarketDetail } from "@/trading/predict/predictPositionSide";
import {
	matchVenuePositionToUmbrella,
	type PredictUmbrellaLookup,
} from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import type { PredictMarketDetail } from "@/trading/predict/predictMarketApi";
import type { MatchedMarket } from "@/types/odds-monitor";
import {
	type VenueId,
	type VenuePosition,
	venueDisplayLabel,
	venuePositionPortfolioDedupeKey,
} from "@/types/trading/venuePosition";
import {
	type MarketPosition,
	type UmbrellaPositions,
	mergeMarketPositions,
} from "../../utils/positionHelpers";
import { buildVenueMarketPosition } from "../venues/shared/buildVenueMarketPosition";
import { buildUnmatchedVenueUmbrellas } from "../venues/shared/buildUnmatchedVenueUmbrellas";
import {
	coerceLimitlessWireForInference,
	resolveLimitlessInferenceWireForUmbrella,
} from "@/utils/mergeMonitorLimitlessFromUmbrella";

type TokenBalanceLike = { yesBalance: string | number; noBalance: string | number };
type BookPreview = { lowestAsk: number | null; highestBid: number | null };

export type UseUmbrellaPositionsArgs = {
	effectiveAccount: string | null;
	umbrellas: Umbrella[];
	getQuestionsForUmbrella: (id: string) => unknown[];
	tokenBalances: Map<string, TokenBalanceLike>;
	orders: ProcessedOrder[] | null | undefined;
	allBooksPreview: Record<string, BookPreview | undefined>;
	polyPositions: VenuePosition[];
	predictPositions: VenuePosition[];
	dflowPositions: VenuePosition[];
	limitlessPositions: VenuePosition[];
	predictUmbrellaLookup: PredictUmbrellaLookup;
	predictMarketDetails: Map<number, PredictMarketDetail>;
	oddsMonitorMarkets: MatchedMarket[] | undefined;
};

export function useUmbrellaPositions({
	effectiveAccount,
	umbrellas,
	getQuestionsForUmbrella,
	tokenBalances,
	orders,
	allBooksPreview,
	polyPositions,
	predictPositions,
	dflowPositions,
	limitlessPositions,
	predictUmbrellaLookup,
	predictMarketDetails,
	oddsMonitorMarkets,
}: UseUmbrellaPositionsArgs): UmbrellaPositions[] {
	// Build conditionId -> umbrella indices for fast venue matching.
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

	return useMemo(() => {
		if (!effectiveAccount) return [];

		const oddsMarkets = oddsMonitorMarkets ?? [];

		const matchedPolyTokenIds = new Set<string>();
		const matchedPredictTokenIds = new Set<string>();
		const matchedDflowTokenIds = new Set<string>();
		const matchedLimitlessTokenIds = new Set<string>();

		const levelUpUmbrellas: UmbrellaPositions[] = umbrellas
			.map((umbrella) => {
				const markets =
					(getQuestionsForUmbrella(umbrella._id) as PredictionMarket[]) || [];
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
							(order) =>
								order.questionId === priceId ||
								order.questionId === balanceId,
						);
						const aggregates = getOrderAggregates(orders || [], balanceId);
						const taggedOrders = marketOrders.map((o) =>
							o.venue ? o : { ...o, venue: "LevelUp" },
						);
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
				const activeMarkets = processedMarkets.filter(
					(mp) => (mp.market as { status?: string }).status !== "resolved",
				);

				const matchVenuePositions = (
					venuePositions: VenuePosition[],
					matchedIds: Set<string>,
					venue: VenueId,
					venueName: string,
					qidPrefix: string,
				) => {
					const matches: MarketPosition[] = [];
					for (const pv of venuePositions) {
						const dedupeKey = venuePositionPortfolioDedupeKey(pv);
						if (matchedIds.has(dedupeKey)) continue;
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
							matchedIds.add(dedupeKey);
							let overrides:
								| { yesPrice: number | null; noPrice: number | null; yesValue: number; noValue: number }
								| undefined;
							const polyMatchedRow =
								venue === "polymarket"
									? findMatchedMarketByPolyConditionId(
											oddsMarkets,
											pv.conditionId,
										)
									: null;
							const polyLabelsForMatch =
								venue === "polymarket"
									? (parseVsTeamLabelsFromDisplayTitle(matched.displayName) ??
										parseVsTeamLabelsFromDisplayTitle(pv.marketTitle))
									: null;
							const polyInferenceForMatch =
								polyMatchedRow && polyLabelsForMatch
									? {
											matched: polyMatchedRow,
											yesTeamLabel: polyLabelsForMatch.yesTeamLabel,
											noTeamLabel: polyLabelsForMatch.noTeamLabel,
										}
									: null;
							const monitorForUmbrella = oddsMarkets.find(
								(mm) =>
									String(mm.umbrellaId ?? "").trim() === String(umbrella._id).trim(),
							);
							const limitlessCatalogWire =
								venue === "limitless"
									? resolveLimitlessInferenceWireForUmbrella({
											matchedMarkets: oddsMarkets,
											umbrellaId: matched._id,
											umbrellaExchangeLimitless: matched.exchangeMatching?.limitless,
											pageMatchedMonitor: monitorForUmbrella,
										})
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
									yP !== null
										? pv.shares * yP
										: isYesForPredict
											? pv.currentValue
											: 0;
								const nV =
									nP !== null
										? pv.shares * nP
										: isYesForPredict
											? 0
											: pv.currentValue;
								overrides = {
									yesPrice: yP,
									noPrice: nP,
									yesValue: yV,
									noValue: nV,
								};
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
									limitlessCatalogWire,
								),
							);
						}
					}
					return matches;
				};

				const polyMatches = matchVenuePositions(
					polyPositions,
					matchedPolyTokenIds,
					"polymarket",
					"Polymarket",
					"poly",
				);
				const predictMatches = matchVenuePositions(
					predictPositions,
					matchedPredictTokenIds,
					"predictfun",
					"Predict",
					"predict",
				);
				const dflowMatches = matchVenuePositions(
					dflowPositions,
					matchedDflowTokenIds,
					"dflow",
					"DFlow",
					"dflow",
				);
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
			polyPositions,
			matchedPolyTokenIds,
			"polymarket",
			"Polymarket",
			"poly",
			(p) => p.eventSlug || p.marketTitle,
			"poly-event",
			null,
			undefined,
			oddsMarkets,
			[],
		);
		const predictUmbrellas = buildUnmatchedVenueUmbrellas(
			predictPositions,
			matchedPredictTokenIds,
			"predictfun",
			"Predict",
			"predict",
			(p) => p.marketTitle || p.tokenId,
			"predict-market",
			predictUmbrellaLookup,
			predictMarketDetails,
			[],
			umbrellas,
		);
		const dflowUmbrellas = buildUnmatchedVenueUmbrellas(
			dflowPositions,
			matchedDflowTokenIds,
			"dflow",
			"DFlow",
			"dflow",
			(p) => p.marketTitle || p.tokenId,
			"dflow-market",
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
			umbrellas,
		);

		return [
			...levelUpUmbrellas,
			...polyUmbrellas,
			...predictUmbrellas,
			...dflowUmbrellas,
			...limitlessUmbrellas,
		];
	}, [
		effectiveAccount,
		umbrellas,
		getQuestionsForUmbrella,
		tokenBalances,
		orders,
		allBooksPreview,
		polyPositions,
		predictPositions,
		dflowPositions,
		limitlessPositions,
		umbrellaLookupByConditionId,
		umbrellaLookupByDflowOutcomeMint,
		umbrellaLookupByDflowEventTicker,
		predictUmbrellaLookup,
		predictMarketDetails,
		oddsMonitorMarkets,
	]);
}
