import { useMemo, useState, useCallback, useEffect } from "react";
import { useMedia } from "react-use";
import { useSignerContext } from "context/SignerContext";
import { type PredictionMarket } from "@/services/api/predictionMarketDataService";
import { type Umbrella } from "@/services/api/umbrellaDataService";
import {
	getOrderAggregates,
	getTradingReturns,
	type ProcessedOrder,
	type OrderAggregates,
} from "@/services/api/simplifiedOrderService";
import { useUserData } from "context/UserDataContext";
import { usePredictionData } from "context/PredictionDataContext";
import "./Positions.scss";
import PositionsHeader from "./components/PositionsHeader";
import { usePortfolio } from "context/PortfolioContext";
import PositionsTabs from "./components/PositionsTabs";
import PositionsTableView from "./components/PositionsTableView";
import PositionsCardView from "./components/PositionsCardView";
import ResolvedPositionsTable from "./components/ResolvedPositionsTable";
import ResolvedPositionsCardView from "./components/ResolvedPositionsCardView";
import OrdersView from "./components/OrdersView";
import OrdersCardView from "./components/OrdersCardView";
import HistoryView from "./components/HistoryView";
import HistoryCardView from "./components/HistoryCardView";
import BalanceChecker from "./components/BalanceChecker";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePolymarketTradeHistory } from "@/trading/polymarket/usePolymarketTradeHistory";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
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

type MarketPosition = {
	market: PredictionMarket;
	yesBalance: number;
	noBalance: number;
	yesPrice: number | null;
	noPrice: number | null;
	yesValue: number;
	noValue: number;
	totalValue: number;
	orders: ProcessedOrder[];
	aggregates: OrderAggregates;
	venue?: VenueId;
	/** Predict.fun: API `outcome.name` for the Yes leg (if any shares). */
	predictOutcomeLabelYes?: string;
	/** Predict.fun: API `outcome.name` for the No leg (if any shares). */
	predictOutcomeLabelNo?: string;
};

type UmbrellaPositions = {
	umbrella: Umbrella;
	markets: MarketPosition[];
};

export default function Positions() {
	const isMobile = useMedia("(max-width: 768px)");
	const { account, signerAddress, isDebugMode, debugAccount, realAccount } = useSignerContext();
	// unified balances via PortfolioContext
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
	} = useUserData();
	const {
		umbrellas,
		getQuestionsForUmbrella,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
		loading: predictionLoading,
		allBooksPreview,
		booksPreviewLoading,
	} = usePredictionData();

	const { polymarketSafe } = useFundingAddresses();
	const polyPositionsQuery = usePolymarketPositions(polymarketSafe);
	const allPolyPositions = (polyPositionsQuery.data ?? []);
	const polyTradeHistoryQuery = usePolymarketTradeHistory(polymarketSafe); // active + settled

	// Check if all data is loaded before showing resolved positions
	const isDataFullyLoaded =
		!predictionLoading &&
		!userDataLoading &&
		!portfolioLoading &&
		!booksPreviewLoading;
	// removed setPortfolioTotal – portfolio is computed in context

	const [loading] = useState(false);
	const [error] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<
		"positions" | "orders" | "history"
	>("positions");
	const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(
		new Set()
	);
	const allUmbrellas = useMemo(() => {
		return umbrellas.map((umb) => ({
			umbrella: umb,
			markets:
				(getAllQuestionsForUmbrella(umb._id) as PredictionMarket[]) ||
				[],
		}));
	}, [umbrellas, getAllQuestionsForUmbrella]);

	// Effective account comes from unified resolver (smart -> embedded -> external)
	const effectiveAccount = account || null;

	// Predict.fun positions are tied to the embedded EOA (BNB chain), not the smart wallet
	const predictPositionsQuery = usePredictPositions(signerAddress ?? effectiveAccount);
	const allPredictPositions = predictPositionsQuery.data ?? [];

	// Predict.fun orders (filled for cost basis, open for Orders tab)
	const {
		filledOrders: predictFilledOrders,
		openOrders: predictOpenOrders,
		filledError: predictFilledError,
		filledFetched: predictFilledFetched,
	} = usePredictOrders(true);

	/** Match events use the same signer priority as auth: Predict account env, else embedded EOA. */
	const predictSignerRawForMatches = useMemo(
		() =>
			import.meta.env.VITE_PREDICT_ACCOUNT_ADDRESS?.trim() ||
			signerAddress ||
			effectiveAccount ||
			null,
		[signerAddress, effectiveAccount]
	);

	const predictMatchesQuery = usePredictOrderMatches({
		signerAddress: predictSignerRawForMatches,
		enabled:
			Boolean(predictSignerRawForMatches?.startsWith("0x")) &&
			allPredictPositions.length > 0 &&
			predictFilledFetched &&
			predictFilledOrders.length === 0,
	});

	// Auto-authenticate with Predict.fun when positions exist and we might need
	// order history for cost/avg. Start as soon as positions load — do not wait
	// for `filledFetched`; the first GET /orders can otherwise run before the
	// backend has a Predict session (empty []), then auth runs only after that.
	// Still skip when we already have filled rows (happy path).
	const needsPredictAuth =
		allPredictPositions.length > 0 &&
		(predictFilledError ||
			predictFilledOrders.length === 0 ||
			!predictFilledFetched);
	usePredictEnsureAuth(needsPredictAuth);

	// Cost basis: FILLED orders (JWT), else order match events (API key / signerAddress).
	const predictCostLookup = useMemo(() => {
		const fromOrders = computePredictCostByToken(predictFilledOrders);
		if (fromOrders.size > 0) return fromOrders;
		const rows = predictMatchesQuery.data ?? [];
		const filter = predictMatchesQuery.filterSigner;
		if (rows.length === 0 || !filter) return fromOrders;
		return computePredictCostByTokenFromMatches(filter, rows);
	}, [
		predictFilledOrders,
		predictMatchesQuery.data,
		predictMatchesQuery.filterSigner,
	]);

	// Debug: Predict.fun cost-basis pipeline
	useEffect(() => {
		console.log("[Predict Debug] positions:", allPredictPositions.length,
			"| filledOrders:", predictFilledOrders.length,
			"| matchEvents:", predictMatchesQuery.data?.length ?? 0,
			"| filledError:", predictFilledError,
			"| filledFetched:", predictFilledFetched,
			"| needsAuth:", needsPredictAuth,
			"| costLookup keys:", [...predictCostLookup.keys()]);
		if (predictCostLookup.size > 0) {
			for (const [tokenId, entry] of predictCostLookup) {
				console.log(`  [CostLookup] ${tokenId.slice(0, 10)}… → avg=$${entry.avgPrice.toFixed(4)}, cost=$${entry.totalCost.toFixed(4)}, shares=${entry.totalShares.toFixed(4)}`);
			}
		}
	}, [
		allPredictPositions.length,
		predictFilledOrders.length,
		predictMatchesQuery.data?.length,
		predictFilledError,
		predictFilledFetched,
		needsPredictAuth,
		predictCostLookup,
	]);

	// Fetch market details for each unique Predict.fun marketId (settlement detection)
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
	const predictMarketsQuery = useQuery({
		queryKey: ["predict-market-details", predictMarketIds],
		enabled: predictMarketIds.length > 0,
		staleTime: 60_000,
		queryFn: async () => {
			const results = await Promise.allSettled(
				predictMarketIds.map((id) => privateApi.getPredictMarket(id))
			);
			const map = new Map<number, PredictMarketDetail>();
			results.forEach((r, i) => {
				if (r.status === "fulfilled") map.set(predictMarketIds[i], r.value);
			});
			return map;
		},
	});
	const predictMarketDetails = predictMarketsQuery.data ?? new Map<number, PredictMarketDetail>();

	// Enrich positions with settlement status and cost basis
	const { predictPositions, predictWinnings, predictHistory } = useMemo(() => {
		const active: typeof allPredictPositions = [];
		const won: typeof allPredictPositions = [];
		const lost: typeof allPredictPositions = [];

		for (const pos of allPredictPositions) {
			const detail = pos.numericMarketId
				? predictMarketDetails.get(pos.numericMarketId)
				: undefined;

			// Enrich with cost from filled orders
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
					(o) => normalizePredictTokenId(o.onChainId) === pos.tokenId
				);
				enriched.outcomeResult = (outcomeMatch?.status as "WON" | "LOST") ?? null;

				if (enriched.outcomeResult === "WON") {
					won.push(enriched);
				} else {
					lost.push(enriched);
				}
			} else {
				enriched.marketStatus = detail?.status ?? undefined;
				active.push(enriched);
			}
		}

		return { predictPositions: active, predictWinnings: won, predictHistory: lost };
	}, [allPredictPositions, predictMarketDetails, predictCostLookup]);

	// Polymarket: separate active vs settled positions
	const { activePolyPositions, polyWinnings, polyHistory } = useMemo(() => {
		const active: typeof allPolyPositions = [];
		const won: typeof allPolyPositions = [];
		const lost: typeof allPolyPositions = [];

		for (const pos of allPolyPositions) {
			if (pos.redeemable && pos.currentValue > 0) {
				won.push(pos);
			} else if (pos.redeemable && pos.currentValue <= 0) {
				lost.push(pos);
			} else if (pos.currentPrice !== null && pos.currentPrice <= 0.01 && pos.shares > 0) {
				lost.push(pos);
			} else {
				active.push(pos);
			}
		}

		return { activePolyPositions: active, polyWinnings: won, polyHistory: lost };
	}, [allPolyPositions]);

	const polyPositions = activePolyPositions;

	// Callback to handle successful claims
	const handleClaimSuccess = useCallback(
		(marketId: string, umbrellaId: string) => {
			console.log(
				"🎉 CLAIM SUCCESS CALLBACK: Removing market",
				marketId,
				"from umbrella",
				umbrellaId
			);
			setClaimedMarkets((prev) => {
				const newSet = new Set([...prev, marketId]);
				console.log(
					"📝 CLAIMED MARKETS: Updated set:",
					Array.from(newSet)
				);
				return newSet;
			});

			// Refresh user data to update cash balance
			console.log("💰 REFRESHING: User data to update cash balance");
			refreshUserData();
		},
		[refreshUserData]
	);

	// derive active positions (LevelUp + Polymarket merged under umbrellas)
	const umbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) return [];

		// Track which Polymarket tokenIds got matched to an umbrella
		const matchedPolyTokenIds = new Set<string>();
		const matchedPredictTokenIds = new Set<string>();

		const levelUpUmbrellas: UmbrellaPositions[] = umbrellas
			.map((umbrella) => {
				const markets =
					(getQuestionsForUmbrella(
						umbrella._id
					) as PredictionMarket[]) || [];
				const processedMarkets: MarketPosition[] = markets
					.map((market) => {
						const balanceId = market._id;
						const priceId = market.questionId || market._id;

						const tb = balanceId
							? tokenBalances.get(balanceId)
							: undefined;
						const yesBalance = tb ? Number(tb.yesBalance) : 0;
						const noBalance = tb ? Number(tb.noBalance) : 0;

						const preview = priceId
							? allBooksPreview[priceId]
							: undefined;
						const yesPrice = preview?.lowestAsk ?? null;
						const noPrice =
							preview?.highestBid !== null &&
							preview?.highestBid !== undefined
								? 1 - preview.highestBid
								: null;

						const yesValue = yesPrice ? yesBalance * yesPrice : 0;
						const noValue = noPrice ? noBalance * noPrice : 0;
						const totalValue = yesValue + noValue;

						const marketOrders = (orders || []).filter(
							(order) =>
								order.questionId === priceId ||
								order.questionId === balanceId
						);
						const aggregates = getOrderAggregates(
							orders || [],
							balanceId
						);

						return {
							market,
							yesBalance,
							noBalance,
							yesPrice,
							noPrice,
							yesValue,
							noValue,
							totalValue,
							orders: marketOrders,
							aggregates,
							venue: "levelup" as VenueId,
						};
					})
					.filter(
						(market) =>
							market.yesBalance > 0 || market.noBalance > 0
					);
				const activeMarkets = processedMarkets.filter(
					(mp) => (mp.market as any).status !== "resolved"
				);

				// Try to match Polymarket positions to this umbrella's markets
				const polyMatches: MarketPosition[] = [];
				for (const pv of polyPositions) {
					if (matchedPolyTokenIds.has(pv.tokenId)) continue;
					const matchTitle = umbrella.displayName?.toLowerCase() ?? "";
					const polyTitle = pv.marketTitle?.toLowerCase() ?? "";
					if (
						polyTitle.includes(matchTitle) ||
						matchTitle.includes(polyTitle.replace(/\s*\(.*\)/, ""))
					) {
						matchedPolyTokenIds.add(pv.tokenId);
						const isYes = pv.outcome.toLowerCase() === "yes" ||
							(pv.outcome.toLowerCase() !== "no" && polyTitle.toLowerCase().includes(pv.outcome.toLowerCase()));
						polyMatches.push({
							market: {
								_id: `poly-${pv.tokenId.slice(0, 12)}`,
								displayName: pv.marketTitle,
								questionId: pv.conditionId,
							} as unknown as PredictionMarket,
							yesBalance: isYes ? pv.shares : 0,
							noBalance: isYes ? 0 : pv.shares,
							yesPrice: isYes ? pv.currentPrice : null,
							noPrice: isYes ? null : pv.currentPrice,
							yesValue: isYes ? pv.currentValue : 0,
							noValue: isYes ? 0 : pv.currentValue,
							totalValue: pv.currentValue,
							orders: [],
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
							venue: "polymarket",
						});
					}
				}

				const predictMatches: MarketPosition[] = [];
				for (const pv of predictPositions) {
					if (matchedPredictTokenIds.has(pv.tokenId)) continue;
					const matchTitle = umbrella.displayName?.toLowerCase() ?? "";
					const predTitle = pv.marketTitle?.toLowerCase() ?? "";
					if (
						predTitle.includes(matchTitle) ||
						matchTitle.includes(predTitle.replace(/\s*\(.*\)/, ""))
					) {
						matchedPredictTokenIds.add(pv.tokenId);
						const isYes =
							pv.outcome.toLowerCase() === "yes" ||
							(pv.outcome.toLowerCase() !== "no" &&
								predTitle.includes(pv.outcome.toLowerCase()));

						// Use live prices from the corresponding LevelUp market's orderbook when available
						let liveYesPrice: number | null = null;
						let liveNoPrice: number | null = null;
						for (const luMarket of markets) {
							const priceId = luMarket.questionId || luMarket._id;
							const preview = priceId ? allBooksPreview[priceId] : undefined;
							if (preview) {
								liveYesPrice = preview.lowestAsk ?? null;
								liveNoPrice = preview.highestBid !== null && preview.highestBid !== undefined
									? 1 - preview.highestBid
									: null;
								break;
							}
						}

						const yesPrice = isYes ? (liveYesPrice ?? pv.currentPrice) : null;
						const noPrice = isYes ? null : (liveNoPrice ?? pv.currentPrice);
						const yesValue = yesPrice !== null ? pv.shares * yesPrice : (isYes ? pv.currentValue : 0);
						const noValue = noPrice !== null ? pv.shares * noPrice : (isYes ? 0 : pv.currentValue);

						predictMatches.push({
							market: {
								_id: `predict-${pv.tokenId.slice(0, 12)}`,
								displayName: pv.marketTitle,
								questionId: pv.conditionId ?? pv.tokenId,
							} as unknown as PredictionMarket,
							yesBalance: isYes ? pv.shares : 0,
							noBalance: isYes ? 0 : pv.shares,
							yesPrice,
							noPrice,
							yesValue,
							noValue,
							totalValue: yesValue + noValue,
							orders: [],
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
							venue: "predictfun",
							predictOutcomeLabelYes: isYes ? pv.outcome : undefined,
							predictOutcomeLabelNo: isYes ? undefined : pv.outcome,
						});
					}
				}

				return {
					umbrella,
					markets: [...activeMarkets, ...polyMatches, ...predictMatches],
				};
			})
			.filter((umbrella) => umbrella.markets.length > 0);

		// Unmatched Polymarket positions become their own umbrella groups
		const unmatchedPoly = polyPositions.filter(
			(pv) => !matchedPolyTokenIds.has(pv.tokenId)
		);
		const polyByEvent = new Map<string, typeof unmatchedPoly>();
		for (const pv of unmatchedPoly) {
			const key = pv.eventSlug || pv.marketTitle;
			const arr = polyByEvent.get(key) ?? [];
			arr.push(pv);
			polyByEvent.set(key, arr);
		}

		const polyUmbrellas: UmbrellaPositions[] = [];
		for (const [eventKey, positions] of polyByEvent) {
			const first = positions[0];
			const syntheticUmbrella = {
				_id: `poly-event-${eventKey}`,
				displayName: first.marketTitle,
				children: [],
				originalChildren: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				__v: 0,
				_polyIcon: first.iconUrl,
			} as unknown as Umbrella;

			const markets: MarketPosition[] = positions.map((pv) => {
				const isYes = pv.outcome.toLowerCase() === "yes" ||
					(pv.outcome.toLowerCase() !== "no");
				return {
					market: {
						_id: `poly-${pv.tokenId.slice(0, 12)}`,
						displayName: pv.marketTitle,
						questionId: pv.conditionId,
					} as unknown as PredictionMarket,
					yesBalance: isYes ? pv.shares : 0,
					noBalance: isYes ? 0 : pv.shares,
					yesPrice: isYes ? pv.currentPrice : null,
					noPrice: isYes ? null : pv.currentPrice,
					yesValue: isYes ? pv.currentValue : 0,
					noValue: isYes ? 0 : pv.currentValue,
					totalValue: pv.currentValue,
					orders: [],
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
					venue: "polymarket" as VenueId,
				};
			});

			polyUmbrellas.push({ umbrella: syntheticUmbrella, markets });
		}

		const unmatchedPredict = predictPositions.filter(
			(pv) => !matchedPredictTokenIds.has(pv.tokenId)
		);
		const predictByMarket = new Map<string, typeof unmatchedPredict>();
		for (const pv of unmatchedPredict) {
			const key = pv.marketTitle || pv.tokenId;
			const arr = predictByMarket.get(key) ?? [];
			arr.push(pv);
			predictByMarket.set(key, arr);
		}

		const predictUmbrellas: UmbrellaPositions[] = [];
		for (const [, positions] of predictByMarket) {
			const first = positions[0];
			const syntheticUmbrella = {
				_id: `predict-market-${first.tokenId.slice(0, 10)}`,
				displayName: first.marketTitle,
				children: [],
				originalChildren: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				__v: 0,
			} as unknown as Umbrella;

			const markets: MarketPosition[] = positions.map((pv) => {
				const isYes =
					pv.outcome.toLowerCase() === "yes" ||
					pv.outcome.toLowerCase() !== "no";
				return {
					market: {
						_id: `predict-${pv.tokenId.slice(0, 12)}`,
						displayName: pv.marketTitle,
						questionId: pv.conditionId ?? pv.tokenId,
					} as unknown as PredictionMarket,
					yesBalance: isYes ? pv.shares : 0,
					noBalance: isYes ? 0 : pv.shares,
					yesPrice: isYes ? pv.currentPrice : null,
					noPrice: isYes ? null : pv.currentPrice,
					yesValue: isYes ? pv.currentValue : 0,
					noValue: isYes ? 0 : pv.currentValue,
					totalValue: pv.currentValue,
					orders: [],
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
					venue: "predictfun" as VenueId,
					predictOutcomeLabelYes: isYes ? pv.outcome : undefined,
					predictOutcomeLabelNo: isYes ? undefined : pv.outcome,
				};
			});

			predictUmbrellas.push({ umbrella: syntheticUmbrella, markets });
		}

		return [...levelUpUmbrellas, ...polyUmbrellas, ...predictUmbrellas];
	}, [
		effectiveAccount,
		umbrellas,
		getQuestionsForUmbrella,
		tokenBalances,
		orders,
		allBooksPreview,
		polyPositions,
		predictPositions,
	]);

	// derive resolved winnings using dedicated resolved markets storage
	const resolvedUmbrellaPositions: UmbrellaPositions[] = useMemo(() => {
		if (!effectiveAccount) {
			return [];
		}
		const resolved: UmbrellaPositions[] = [];

		// Process all umbrellas that have resolved markets
		Object.entries(resolvedMarketsByUmbrella).forEach(
			([umbrellaId, resolvedMarkets]) => {
				if (resolvedMarkets.length > 0) {
					// Find the umbrella object for this ID
					let umbrella = umbrellas.find((u) => u._id === umbrellaId);

					// If not found in umbrellas array, create a basic umbrella object from the resolved market data
					if (!umbrella) {
						// Get the first resolved market to extract umbrella info
						const firstMarket = resolvedMarkets[0];
						umbrella = {
							_id: umbrellaId,
							displayName:
								firstMarket?.umbrellaName ||
								`Umbrella ${umbrellaId.slice(0, 8)}...`, // Use umbrella ID, NOT market's displayName
							children: resolvedMarkets,
							originalChildren: resolvedMarkets, // For image resolution
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							__v: 0,
						} as Umbrella;
					}

					const res = resolvedMarkets
						.map((m) => {
							// Use MongoDB _id for balance lookup
							const balanceId = (m as any)._id;
							const tb = balanceId
								? tokenBalances.get(balanceId)
								: undefined;
							const yesBalance = tb ? Number(tb.yesBalance) : 0;
							const noBalance = tb ? Number(tb.noBalance) : 0;
							return { market: m, yesBalance, noBalance } as any;
						})
						// Filter to only show markets where user has winning positions AND haven't been claimed
						.filter((mp: any) => {
							// Use MongoDB _id for claimed check
							const balanceId = (mp.market as any)._id;
							const isClaimed = claimedMarkets.has(balanceId);

							if (isClaimed) {
								return false;
							}

							const outcome = String(
								(mp.market as any).resolvedOutcome || ""
							).toLowerCase();
							const hasWinningYes =
								outcome === "yes" && mp.yesBalance > 0;
							const hasWinningNo =
								outcome === "no" && mp.noBalance > 0;
							const hasWinningPosition =
								hasWinningYes || hasWinningNo;
							return hasWinningPosition;
						})
						.map(
							(mp: any) =>
								({
									market: mp.market,
									yesBalance: mp.yesBalance,
									noBalance: mp.noBalance,
									yesPrice: null,
									noPrice: null,
									yesValue: 0,
									noValue: 0,
									totalValue: 0,
									orders: [],
									aggregates: {
										Yes: {
											totalSize: 0,
											totalValue: 0,
											avgPrice: null,
											count: 0,
										},
										No: {
											totalSize: 0,
											totalValue: 0,
											avgPrice: null,
											count: 0,
										},
									},
								} as MarketPosition)
						);

					// Only add umbrella if it has qualifying markets (user has winning positions)
					if (res.length > 0) {
						resolved.push({ umbrella, markets: res });
					}
				}
			}
		);

		// Append Predict.fun winnings as synthetic umbrella groups
		const predictByMarketTitle = new Map<string, typeof predictWinnings>();
		for (const pv of predictWinnings) {
			const key = pv.marketTitle || pv.tokenId;
			const arr = predictByMarketTitle.get(key) ?? [];
			arr.push(pv);
			predictByMarketTitle.set(key, arr);
		}
		for (const [, positions] of predictByMarketTitle) {
			const first = positions[0];
			const syntheticUmbrella = {
				_id: `predict-win-${first.tokenId.slice(0, 10)}`,
				displayName: first.marketTitle,
				children: [],
				originalChildren: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				__v: 0,
			} as unknown as Umbrella;

			const markets: MarketPosition[] = positions.map((pv) => {
				const isYes =
					pv.outcome.toLowerCase() === "yes" ||
					pv.outcome.toLowerCase() !== "no";
				const mDetail = pv.numericMarketId ? predictMarketDetails.get(pv.numericMarketId) : undefined;
				return {
					market: {
						_id: `predict-win-${pv.tokenId.slice(0, 12)}`,
						displayName: pv.marketTitle,
						questionId: pv.conditionId ?? pv.tokenId,
						conditionId: pv.conditionId,
						resolvedOutcome: isYes ? "yes" : "no",
						_venue: "predictfun",
						_isNegRisk: mDetail?.isNegRisk ?? false,
						_isYieldBearing: mDetail?.isYieldBearing ?? false,
					} as unknown as PredictionMarket,
					yesBalance: isYes ? pv.shares : 0,
					noBalance: isYes ? 0 : pv.shares,
					yesPrice: null,
					noPrice: null,
					yesValue: 0,
					noValue: 0,
					totalValue: 0,
					orders: [],
					aggregates: { Yes: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 }, No: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 } },
					venue: "predictfun" as VenueId,
					predictOutcomeLabelYes: isYes ? pv.outcome : undefined,
					predictOutcomeLabelNo: isYes ? undefined : pv.outcome,
				};
			});
			if (markets.length > 0) resolved.push({ umbrella: syntheticUmbrella, markets });
		}

		// Append Polymarket winnings
		const polyWinByEvent = new Map<string, typeof polyWinnings>();
		for (const pv of polyWinnings) {
			const key = pv.eventSlug || pv.marketTitle;
			const arr = polyWinByEvent.get(key) ?? [];
			arr.push(pv);
			polyWinByEvent.set(key, arr);
		}
		for (const [, positions] of polyWinByEvent) {
			const first = positions[0];
			const syntheticUmbrella = {
				_id: `poly-win-${first.tokenId.slice(0, 10)}`,
				displayName: first.marketTitle,
				children: [],
				originalChildren: [],
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				__v: 0,
				_polyIcon: first.iconUrl,
			} as unknown as Umbrella;

			const markets: MarketPosition[] = positions.map((pv) => {
				const isYes = pv.outcome.toLowerCase() === "yes" ||
					pv.outcome.toLowerCase() !== "no";
				return {
					market: {
						_id: `poly-win-${pv.tokenId.slice(0, 12)}`,
						displayName: pv.marketTitle,
						questionId: pv.conditionId,
						conditionId: pv.conditionId,
						resolvedOutcome: isYes ? "yes" : "no",
						_venue: "polymarket",
					} as unknown as PredictionMarket,
					yesBalance: isYes ? pv.shares : 0,
					noBalance: isYes ? 0 : pv.shares,
					yesPrice: null,
					noPrice: null,
					yesValue: 0,
					noValue: 0,
					totalValue: 0,
					orders: [],
					aggregates: { Yes: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 }, No: { totalSize: 0, totalValue: 0, avgPrice: null, count: 0 } },
					venue: "polymarket" as VenueId,
				};
			});
			if (markets.length > 0) resolved.push({ umbrella: syntheticUmbrella, markets });
		}

		return resolved;
	}, [
		effectiveAccount,
		resolvedMarketsByUmbrella,
		umbrellas,
		tokenBalances,
		claimedMarkets,
		predictWinnings,
		polyWinnings,
		predictMarketDetails,
	]);

	// Calculate totals
	const positionsTotalValue = useMemo(() => {
		return umbrellaPositions.reduce((total, umbrella) => {
			return (
				total +
				umbrella.markets.reduce((umbrellaTotal, market) => {
					return umbrellaTotal + market.totalValue;
				}, 0)
			);
		}, 0);
	}, [umbrellaPositions]);

	// Portfolio totals are sourced from PortfolioContext to avoid flicker/duplication

	// Helper functions for display
	const toCentsString = (value?: number | null): string => {
		if (value === undefined || value === null || !isFinite(value))
			return "--";
		return `${Math.round(value * 100)}¢`;
	};

	// Build a price lookup for Polymarket positions (keyed by synthetic market _id)
	const polyPriceMap = useMemo(() => {
		const map: Record<string, { yesPrice: number | null; noPrice: number | null }> = {};
		for (const up of umbrellaPositions) {
			for (const mp of up.markets) {
				if (mp.venue === "polymarket" || mp.venue === "predictfun") {
					map[mp.market._id] = {
						yesPrice: mp.yesPrice,
						noPrice: mp.noPrice,
					};
				}
			}
		}
		return map;
	}, [umbrellaPositions]);

	const getCurrentPriceForSide = (
		market: PredictionMarket,
		side: "Yes" | "No"
	): number | null => {
		const marketId = market._id;

		// For Polymarket positions, use the pre-computed prices
		const polyPrices = polyPriceMap[marketId];
		if (polyPrices) {
			return side === "Yes" ? polyPrices.yesPrice : polyPrices.noPrice;
		}

		const questionId = market.questionId || market._id;
		if (!questionId) return null;
		const preview = questionId ? allBooksPreview[questionId] : undefined;

		if (side === "Yes") {
			return preview?.lowestAsk ?? null;
		} else {
			return preview?.highestBid !== null &&
				preview?.highestBid !== undefined
				? 1 - preview.highestBid
				: null;
		}
	};

	// Convert to old format for compatibility with existing components
	// For Positions tab (only markets with positions)
	const umbrellaBalancesPositions = umbrellaPositions.map((up) => ({
		umbrella: up.umbrella,
		markets: up.markets.map((mp) => ({
			market: mp.market,
			yes: mp.yesBalance.toString(),
			no: mp.noBalance.toString(),
			venue: mp.venue ?? "levelup",
			predictOutcomeLabelYes: mp.predictOutcomeLabelYes,
			predictOutcomeLabelNo: mp.predictOutcomeLabelNo,
		})),
	}));

	// For Orders tab (all markets under umbrellas; OrdersView will filter to those that have open orders)
	const umbrellaBalancesOrders = allUmbrellas.map(
		({ umbrella, markets }) => ({
			umbrella,
			markets: markets.map((market) => ({
				market,
				yes: "0",
				no: "0",
			})),
		})
	);

	// Build venue orders for the Orders tab (Predict.fun open orders on live markets only)
	const venueOrders: VenueOrder[] = useMemo(() => {
		if (predictOpenOrders.length === 0) return [];

		// Build lookup maps for market titles and outcome names from positions + market details
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

		// Filter to live markets only
		const liveOrders = predictOpenOrders.filter((o) => {
			const detail = predictMarketDetails.get(o.marketId);
			if (!detail) return true; // if we don't have detail, assume live
			return detail.status !== "RESOLVED" && detail.status !== "REMOVED" &&
				detail.tradingStatus !== "CLOSED";
		});

		return mapPredictOrdersToVenueOrders(liveOrders, titleLookup, outcomeLookup);
	}, [predictOpenOrders, allPredictPositions, predictMarketDetails]);

	// Combine Predict.fun + Polymarket resolved positions for the History tab
	const venueHistory = useMemo(() => {
		const items: typeof allPredictPositions = [];
		const seen = new Set<string>();

		// Predict.fun resolved positions (both won and lost)
		for (const pos of predictWinnings) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push({ ...pos, outcomeResult: "WON", marketStatus: "RESOLVED" });
			}
		}
		for (const pos of predictHistory) {
			if (!seen.has(pos.tokenId)) {
				seen.add(pos.tokenId);
				items.push(pos);
			}
		}

		// Polymarket resolved positions from the positions API (both won and lost)
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

		// Polymarket trade history from activity API covers trades that dropped
		// from the positions endpoint after redemption
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

		return items;
	}, [predictWinnings, predictHistory, polyWinnings, polyHistory, polyTradeHistoryQuery.data]);

	// Debug: venue history pipeline
	useEffect(() => {
		console.log("[VenueHistory Debug] polyTradeHistory:", polyTradeHistoryQuery.data?.length ?? 0,
			"| polyWinnings:", polyWinnings.length,
			"| polyHistory:", polyHistory.length,
			"| predictWinnings:", predictWinnings.length,
			"| predictHistory:", predictHistory.length,
			"| total venueHistory:", venueHistory.length);
		for (const pos of venueHistory) {
			console.log(`  [VH] "${pos.marketTitle}" venue=${pos.venue} outcome=${pos.outcome} result=${pos.outcomeResult} cost=${pos.cost} shares=${pos.shares} pnl=${pos.pnl} avgPrice=${pos.avgPrice}`);
		}
	}, [venueHistory, polyTradeHistoryQuery.data, polyWinnings.length, polyHistory.length, predictWinnings.length, predictHistory.length]);

	const returnsByQid = useMemo(() => {
		const map: Record<string, { Yes: number; No: number }> = {};
		umbrellaPositions.forEach((up) => {
			up.markets.forEach((mp) => {
				// Use MongoDB _id for order/return lookups
				const balanceId = mp.market._id;
				if (balanceId) {
					try {
						const returns = getTradingReturns(
							orders || [],
							balanceId
						);
						map[balanceId] = {
							Yes: returns.yesPnL,
							No: returns.noPnL,
						};
					} catch {}
				}
			});
		});

		return map;
	}, [umbrellaPositions, orders]);

	const aggregates = umbrellaPositions.reduce((acc, up) => {
		up.markets.forEach((mp) => {
			// Use MongoDB _id for aggregate lookups
			const balanceId = mp.market._id;
			if (balanceId) {
				// Convert to the format expected by PositionsTableView
				acc[balanceId] = {
					Yes: {
						avgPrice: mp.aggregates.Yes.avgPrice,
						cost: mp.aggregates.Yes.totalValue,
					},
					No: {
						avgPrice: mp.aggregates.No.avgPrice,
						cost: mp.aggregates.No.totalValue,
					},
				};
			}
		});
		return acc;
	}, {} as Record<string, any>);

	const spentByQid = umbrellaPositions.reduce((acc, up) => {
		up.markets.forEach((mp) => {
			// Use MongoDB _id for spent lookups
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

	return (
		<div className="positions-page page-layout">
			{/* Debug Mode Banner */}
			{isDebugMode && (
				<div style={{
					background: 'linear-gradient(90deg, #ff6b35, #f7931a)',
					color: 'white',
					padding: '12px 20px',
					borderRadius: '8px',
					marginBottom: '16px',
					fontWeight: 'bold',
					display: 'flex',
					alignItems: 'center',
					justifyContent: 'space-between',
					flexWrap: 'wrap',
					gap: '8px',
				}}>
					<div>
						<span style={{ fontSize: '16px' }}>🔧 DEBUG MODE</span>
						<span style={{ fontWeight: 'normal', marginLeft: '12px', fontSize: '14px' }}>
							Viewing portfolio for: <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>{debugAccount?.slice(0, 6)}...{debugAccount?.slice(-4)}</code>
						</span>
					</div>
					<div style={{ fontSize: '12px', fontWeight: 'normal', opacity: 0.9 }}>
						{realAccount && <>Your account: {realAccount.slice(0, 6)}...{realAccount.slice(-4)} | </>}
						Run <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '3px' }}>clearSpoof()</code> in console to exit
					</div>
				</div>
			)}
			{/* Balance Checker - Only visible in debug mode */}
			{isDebugMode && debugAccount && (
				<BalanceChecker debugAccount={debugAccount} />
			)}
			<div>
				<div className="positions-header-group">
					<PositionsHeader
						portfolioTotal={
							portfolioTotalCtx ??
							cashBalanceCtx + positionsTotalValue
						}
						positionsTotalValue={positionsTotalValue}
						usdcBalance={Number(cashBalanceCtx)}
						cashLoading={usdcLoading}
						positionsLoading={
							loading ||
							predictionLoading ||
							userDataLoading ||
							booksPreviewLoading
						}
						portfolioLoading={portfolioLoading}
					/>

					<PositionsTabs
						activeTab={activeTab}
						setActiveTab={setActiveTab}
					/>
				</div>

				<div className="positions-content-wrapper">
					{!account && (
						<p className="text-body">Log in to view balances.</p>
					)}
					{account && (
						<>
							{error ? (
								<p className="error-message">{error}</p>
							) : (
								(() => {
									const softLoading =
										loading ||
										predictionLoading ||
										userDataLoading ||
										booksPreviewLoading;
									const hasPositions =
										umbrellaPositions.length > 0;
									const hasWinnings =
										resolvedUmbrellaPositions.length > 0;
									
									// Each tab handles its own empty state independently
									if (activeTab === "positions") {
										return (
											<>
												{isDataFullyLoaded &&
													resolvedUmbrellaPositions.length >
														0 && (
														<div className="mb-24">
															<h3
																className="mb-6 text-20 font-bold"
																style={{
																	color: "#ffffff",
																	fontSize: 34,
																}}
															>
																Winnings
															</h3>
															{(() => {
																const transformedData =
																	resolvedUmbrellaPositions.map(
																		(
																			up
																		) => ({
																			umbrella:
																				up.umbrella,
																			markets:
																				up.markets.map(
																					(
																						mp
																					) => {
																						const outcome =
																							String(
																								(
																									mp.market as any
																								)
																									.resolvedOutcome ||
																									""
																							).toLowerCase();
																						const yes =
																							outcome ===
																							"yes"
																								? mp.yesBalance.toString()
																								: "0";
																						const no =
																							outcome ===
																							"no"
																								? mp.noBalance.toString()
																								: "0";
																						return {
																							market: mp.market,
																							yes,
																							no,
																						};
																					}
																				),
																		})
																	);
																return !isMobile ? (
																	<ResolvedPositionsTable
																		umbrellaBalances={
																			transformedData
																		}
																		toCentsString={
																			toCentsString
																		}
																		softLoading={
																			softLoading
																		}
																		onClaimSuccess={
																			handleClaimSuccess
																		}
																	/>
																) : (
																	<ResolvedPositionsCardView
																		umbrellaBalances={
																			transformedData
																		}
																		toCentsString={
																			toCentsString
																		}
																		softLoading={
																			softLoading
																		}
																		onClaimSuccess={
																			handleClaimSuccess
																		}
																	/>
																);
															})()}
														</div>
													)}
												{isDataFullyLoaded &&
													resolvedUmbrellaPositions.length >
														0 && (
														<h3
															className="mb-6 text-20 font-bold"
															style={{
																color: "#ffffff",
																fontSize: 34,
																marginTop: 40,
															}}
														>
															Positions
														</h3>
													)}
												{/* Show positions table if user has active positions, otherwise show message */}
												{hasPositions ? (
													!isMobile ? (
														<PositionsTableView
															umbrellaBalances={
																umbrellaBalancesPositions
															}
															aggregates={aggregates}
															spentByQid={spentByQid}
															returnsByQid={
																returnsByQid
															}
															getCurrentPriceForSide={
																getCurrentPriceForSide
															}
															toCentsString={
																toCentsString
															}
															softLoading={
																softLoading
															}
															orders={orders || []}
														/>
													) : (
														<PositionsCardView
															umbrellaBalances={
																umbrellaBalancesPositions
															}
															aggregates={aggregates}
															spentByQid={spentByQid}
															returnsByQid={
																returnsByQid
															}
															getCurrentPriceForSide={
																getCurrentPriceForSide
															}
															toCentsString={
																toCentsString
															}
															softLoading={
																softLoading
															}
															orders={orders || []}
														/>
													)
												) : (
													<p className="text-body" style={{ color: '#888', marginTop: '16px' }}>
														No current positions.
													</p>
												)}
											</>
										);
									}
								if (activeTab === "orders") {
									return !isMobile ? (
										<OrdersView
											umbrellaBalances={
												umbrellaBalancesOrders
											}
											orders={orders || []}
											venueOrders={venueOrders}
										/>
									) : (
										<OrdersCardView
											umbrellaBalances={
												umbrellaBalancesOrders
											}
											orders={orders || []}
											venueOrders={venueOrders}
										/>
									);
								}
								return !isMobile ? (
									<HistoryView
										umbrellaBalances={
											umbrellaBalancesPositions
										}
										returnsByQid={returnsByQid}
										orders={orders || []}
										resolvedMarketsByUmbrella={
											resolvedMarketsByUmbrella
										}
										venueHistory={venueHistory}
									/>
								) : (
									<HistoryCardView
										returnsByQid={returnsByQid}
										orders={orders || []}
										resolvedMarketsByUmbrella={
											resolvedMarketsByUmbrella
										}
										venueHistory={venueHistory}
									/>
								);
								})()
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
