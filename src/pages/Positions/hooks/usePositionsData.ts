import { useEffect, useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { useUserData } from "context/UserDataContext";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useRecentSettlementClaim } from "context/RecentSettlementClaimContext";
import { usePredictionData } from "context/PredictionDataContext";
import { useOddsMonitor } from "context/OddsMonitorContext";
import { usePortfolio } from "@/context/PortfolioContext";
import { useAccountData } from "@/context/AccountDataContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { buildPredictUmbrellaLookup } from "@/trading/predict/resolvePredictUmbrellaFromMonitor";
import { useHandleClaimSuccess } from "./assemblers/useHandleClaimSuccess";
import { useHistoryResolve } from "./assemblers/useHistoryResolve";
import { usePortfolioDerivations } from "./assemblers/usePortfolioDerivations";
import { useReadinessGates } from "./assemblers/useReadinessGates";
import { useResolvedUmbrellaPositions } from "./assemblers/useResolvedUmbrellaPositions";
import { useUmbrellaPositions } from "./assemblers/useUmbrellaPositions";
import { useVenueHistoryRawItems } from "./assemblers/useVenueHistoryRawItems";
import { useVenueOrders } from "./assemblers/useVenueOrders";
import { useDflowBundle } from "./venues/dflow/useDflowBundle";
import { useLimitlessBundle } from "./venues/limitless/useLimitlessBundle";
import { usePolymarketBundle } from "./venues/polymarket/usePolymarketBundle";
import { usePredictBundle } from "./venues/predict/usePredictBundle";

export default function usePositionsData() {
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
		marketsByUmbrella,
		loading: predictionLoading,
		allBooksPreview,
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
		fundingHydrated,
	} = useFundingAddresses();
	const { authenticated } = usePrivy();
	const { dflowProof } = useAccountData();
	const {
		active: polyPositions,
		winnings: polyWinnings,
		history: polyHistory,
		positionsQuery: polyPositionsQuery,
		tradeHistoryQuery: polyTradeHistoryQuery,
	} = usePolymarketBundle({ polymarketSafe });

	const {
		active: limitlessPositions,
		winnings: limitlessWinnings,
		history: limitlessHistory,
		positionsQuery: limitlessVenuePositionsQuery,
		openOrdersQuery: limitlessOpenOrdersQuery,
		tradeHistoryQuery: limitlessTradeHistoryQuery,
		limitlessPortfolioEnabled,
	} = useLimitlessBundle({ authenticated, limitlessMakerBase });

	const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(new Set());
	const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history">("positions");

	const effectiveAccount = account || null;

	const {
		all: allPredictPositions,
		active: predictPositions,
		winnings: predictWinnings,
		history: predictHistory,
		openOrders: predictOpenOrders,
		filledOrders: predictFilledOrders,
		matches: predictMatches,
		costLookup: predictCostLookup,
		historyFillsByToken: predictHistoryFillsByToken,
		marketIds: predictMarketIds,
		marketDetails: predictMarketDetails,
		positionsQuery: predictPositionsQuery,
		marketsQuery: predictMarketsQuery,
	} = usePredictBundle({ signerAddress, effectiveAccount, activeTab });

	const privateApi = usePrivateApiClient();

	const {
		active: dflowPositions,
		winnings: dflowWinnings,
		history: dflowHistory,
		positionsQuery: dflowPositionsQuery,
		dflowRpcEnabled,
	} = useDflowBundle({ solanaAddress, authenticated });

	const handleClaimSuccess = useHandleClaimSuccess({
		acknowledgeClearedPayouts,
		setClaimedMarkets,
		refreshUserData,
		refreshTokenPositions,
		collateralTokens,
	});

	const umbrellaPositions = useUmbrellaPositions({
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
		oddsMonitorMarkets: appState?.markets,
	});

	const venueOrders = useVenueOrders({
		predictOpenOrders,
		allPredictPositions,
		predictMarketDetails,
		predictUmbrellaLookup,
		umbrellas,
		limitlessOpenOrders: limitlessOpenOrdersQuery.data ?? [],
	});

	const venueHistoryRawItems = useVenueHistoryRawItems({
		predictPositions,
		predictWinnings,
		predictHistory,
		predictFilledOrders,
		predictMatches,
		predictCostLookup,
		predictHistoryFillsByToken,
		predictMarketDetails,
		predictUmbrellaLookup,
		polyPositions,
		polyWinnings,
		polyHistory,
		polyTrades: polyTradeHistoryQuery.data,
		dflowPositions,
		dflowWinnings,
		dflowHistory,
		limitlessPositions,
		limitlessWinnings,
		limitlessHistory,
		limitlessTrades: limitlessTradeHistoryQuery.data,
		umbrellas,
		marketsByUmbrella,
	});

	/**
	 * History resolve runs first now: it posts `/api/umbrellas/resolve-venue-history`,
	 * fetches inactive-umbrella docs, and patches each venue row with `levelUpUmbrellaId`
	 * + `levelUpUmbrellaDisplayName`. Winnings then reuses the same patched rows + catalog
	 * (`historyCatalogUmbrellas`) so the umbrella display name and side label that already
	 * work on History also work on Winnings — no second resolve, no extra request.
	 */
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
			predictMatchEventCount: predictMatches.length,
		},
	});

	const resolvedUmbrellaPositions = useResolvedUmbrellaPositions({
		effectiveAccount,
		resolvedMarketsByUmbrella,
		umbrellas: historyCatalogUmbrellas,
		tokenBalances,
		userDataLoading,
		claimedMarkets,
		predictWinnings,
		polyWinnings,
		dflowWinnings,
		limitlessWinnings,
		predictMarketDetails,
		predictUmbrellaLookup,
		oddsMonitorMarkets: appState?.markets,
		venueHistory,
	});

	const {
		positionsTotalValue,
		getCurrentPriceForSide,
		umbrellaBalancesPositions,
		umbrellaBalancesOrders,
		combinedOrders,
		returnsByQid,
		aggregates,
		spentByQid,
	} = usePortfolioDerivations({
		umbrellaPositions,
		resolvedUmbrellaPositions,
		umbrellas,
		getAllQuestionsForUmbrella,
		orders,
		allBooksPreview,
	});

	const {
		isDataFullyLoaded,
		isPositionsTabContentReady,
		isHistoryTabContentReady,
	} = useReadinessGates({
		account,
		effectiveAccount,
		authenticated,
		solanaLinked: Boolean(solanaAddress?.trim()),
		dflowProofIsFetched: dflowProof.isFetched,
		fundingHydrated,
		predictionLoading,
		userDataLoading,
		portfolioLoading,
		fundingAddressesLoading,
		polyPositionsQueryIsLoading: polyPositionsQuery.isLoading,
		predictPositionsQueryIsLoading: predictPositionsQuery.isLoading,
		predictMarketIdsLength: predictMarketIds.length,
		predictMarketsQueryIsLoading: predictMarketsQuery.isLoading,
		dflowRpcEnabled,
		dflowPositionsQueryIsPending: dflowPositionsQuery.isPending,
		limitlessPortfolioEnabled,
		limitlessVenuePositionsQueryIsLoading: limitlessVenuePositionsQuery.isLoading,
		limitlessOpenOrdersQueryIsLoading: limitlessOpenOrdersQuery.isLoading,
		polymarketSafe,
		polyTradeHistoryQueryIsFetched: polyTradeHistoryQuery.isFetched,
		polyTradeHistoryQueryIsError: polyTradeHistoryQuery.isError,
		limitlessMakerBase,
		limitlessTradeHistoryQueryIsFetched: limitlessTradeHistoryQuery.isFetched,
		limitlessTradeHistoryQueryIsError: limitlessTradeHistoryQuery.isError,
		historyUmbrellaResolveSettled,
		venueHistoryResolveQueryCount: venueHistoryResolveQueries.length,
	});

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
	};
}
