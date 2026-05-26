import { useMemo, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { useCollateralTokens } from "context/CollateralTokenContext";
import { useRecentSettlementClaim } from "context/RecentSettlementClaimContext";
import { usePredictionData } from "context/PredictionDataContext";
import { useOddsMonitor } from "context/OddsMonitorContext";
import { useAccountData, useVenueAddressChainMap } from "@/context/AccountDataContext";
import { levelUpTokenBalancesMapFromRows } from "@/features/trading/venues/levelup/portfolio/levelUpVenuePositionReads";
import { useLevelUpOrders } from "@/features/trading/venues/levelup/portfolio/useLevelUpOrders";
import { useLevelUpPortfolioRefetch } from "@/features/trading/venues/levelup/portfolio/useLevelUpPortfolioRefetch";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import { buildPredictUmbrellaLookup } from "@/features/trading/venues/predict/trade/resolvePredictUmbrellaFromMonitor";
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
import { limitlessVenueRowsForWinningsTab } from "@/features/trading/venues/limitless/portfolio/splitLimitlessVenuePositions";
import { usePolymarketBundle } from "./venues/polymarket/usePolymarketBundle";
import { usePredictBundle } from "./venues/predict/usePredictBundle";

export default function usePositionsData() {
	const { account, isDebugMode, debugAccount, realAccount } = useSignerContext();
	const collateralTokens = useCollateralTokens();
	const refreshLevelUpPortfolio = useLevelUpPortfolioRefetch();
	const { acknowledgeClearedPayouts } = useRecentSettlementClaim();
	const {
		umbrellas,
		getQuestionsForUmbrella,
		getAllQuestionsForUmbrella,
		resolvedMarketsByUmbrella,
		loading: predictionLoading,
		allBooksPreview,
	} = usePredictionData();

	const { appState } = useOddsMonitor();
	const predictUmbrellaLookup = useMemo(
		() => buildPredictUmbrellaLookup(appState?.markets, umbrellas),
		[appState?.markets, umbrellas],
	);

	const venueAddressChainMap = useVenueAddressChainMap();
	const polymarketSafe = venueAddressChainMap?.polymarket.walletAddress ?? null;
	const solanaAddress = venueAddressChainMap?.dflow.walletAddress ?? null;
	const limitlessMakerBase = venueAddressChainMap?.limitless.walletAddress ?? null;
	const predictWalletAddress = venueAddressChainMap?.predictfun.walletAddress ?? null;
	/** LevelUp SCW — sole wallet for umbrella positions / history resolve gates. */
	const levelupWalletAddress = venueAddressChainMap?.levelup.walletAddress ?? null;
	const accountData = useAccountData();
	const levelUpPositions = accountData.positions.levelup;
	const tokenBalances = useMemo(
		() => levelUpTokenBalancesMapFromRows(levelUpPositions.rows),
		[levelUpPositions.rows],
	);
	const levelUpPositionsLoading =
		!levelUpPositions.isFetched && levelUpPositions.status === "pending";
	const fundingAddressesLoading = accountData.walletIsLoading;
	const fundingHydrated = accountData.readiness.hydrated;
	const { authenticated } = usePrivy();
	const { positions: accountPositions, dflowProof } = accountData;
	const {
		active: polyPositions,
		winnings: polyWinnings,
		history: polyHistory,
		positionsQuery: polyPositionsQuery,
		tradeHistoryQuery: polyTradeHistoryQuery,
	} = usePolymarketBundle({
		polymarketSafe,
		poly: accountPositions.polymarket,
	});

	const {
		active: limitlessPositions,
		winnings: limitlessWinnings,
		history: limitlessHistory,
		positionsQuery: limitlessVenuePositionsQuery,
		openOrdersQuery: limitlessOpenOrdersQuery,
		tradeHistoryQuery: limitlessTradeHistoryQuery,
		limitlessPortfolioEnabled,
	} = useLimitlessBundle({
		authenticated,
		limitlessMakerBase,
		limitless: accountPositions.limitless,
	});

	const limitlessWinningsForResolvedTab = useMemo(
		() => limitlessVenueRowsForWinningsTab(limitlessWinnings, limitlessHistory),
		[limitlessWinnings, limitlessHistory],
	);

	const [claimedMarkets, setClaimedMarkets] = useState<Set<string>>(new Set());
	const [activeTab, setActiveTab] = useState<"positions" | "orders" | "history">("positions");

	const levelUpOrdersEnabled =
		(levelUpPositions.isFetched && levelUpPositions.rows.length > 0) ||
		activeTab === "orders" ||
		activeTab === "history";
	const {
		orders,
		isLoading: levelUpOrdersLoading,
		isFetched: levelUpOrdersFetched,
	} = useLevelUpOrders(levelupWalletAddress, levelUpOrdersEnabled);
	const levelUpUserDataLoading =
		levelUpPositionsLoading ||
		(levelUpOrdersEnabled && levelUpOrdersLoading && !levelUpOrdersFetched);

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
	} = usePredictBundle({
		predictWalletAddress,
		activeTab,
		predictSlice: accountPositions.predict,
	});

	const privateApi = usePrivateApiClient();

	const {
		active: dflowPositions,
		winnings: dflowWinnings,
		history: dflowHistory,
		positionsQuery: dflowPositionsQuery,
		dflowRpcEnabled,
	} = useDflowBundle({
		solanaAddress,
		authenticated,
		dflow: accountPositions.dflow,
		dflowProof,
	});

	const handleClaimSuccess = useHandleClaimSuccess({
		acknowledgeClearedPayouts,
		setClaimedMarkets,
		refreshLevelUpPortfolio,
		collateralTokens,
	});

	const umbrellaPositions = useUmbrellaPositions({
		effectiveAccount: levelupWalletAddress,
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
		effectiveAccount: levelupWalletAddress,
		privateApi,
		diag: {
			polyTradeHistoryRows: polyTradeHistoryQuery.data,
			limitlessTradeHistoryCount: limitlessTradeHistoryQuery.data?.length ?? 0,
			predictFilledOrdersCount: predictFilledOrders.length,
			predictMatchEventCount: predictMatches.length,
		},
	});

	const resolvedUmbrellaPositions = useResolvedUmbrellaPositions({
		effectiveAccount: levelupWalletAddress,
		resolvedMarketsByUmbrella,
		umbrellas: historyCatalogUmbrellas,
		tokenBalances,
		userDataLoading: levelUpUserDataLoading,
		claimedMarkets,
		predictWinnings,
		polyWinnings,
		dflowWinnings,
		limitlessWinnings: limitlessWinningsForResolvedTab,
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

	const cashLoading = Boolean(account) && !collateralTokens.isFetched;
	const dflowBlockingPositionsSummary =
		Boolean(account) &&
		Boolean(authenticated) &&
		dflowRpcEnabled &&
		accountPositions.dflow.status === "pending";
	const positionsSummaryLoading =
		Boolean(account) &&
		(cashLoading ||
			(levelUpPositionsLoading && !levelUpPositions.isFetched) ||
			dflowBlockingPositionsSummary);

	const { isDataFullyLoaded, isPositionsTabContentReady, isHistoryTabContentReady } =
		useReadinessGates({
			account,
			effectiveAccount: levelupWalletAddress,
			authenticated,
			solanaLinked: Boolean(solanaAddress?.trim()),
			dflowProofIsFetched: dflowProof.isFetched,
			fundingHydrated,
			predictionLoading,
			userDataLoading: levelUpUserDataLoading,
			positionsSummaryLoading,
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
		positionsSummaryLoading,
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
