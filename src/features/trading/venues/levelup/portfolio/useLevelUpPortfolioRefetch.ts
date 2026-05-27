import { useCallback, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePredictionData } from "context/PredictionDataContext";
import { useAccountData, useVenueAddressChainMap } from "@/context/AccountDataContext";
import { buildLevelUpMarketCatalog } from "./buildLevelUpMarketCatalog";
import { levelUpTokenIdsFromMarketCatalog } from "./levelUpRefreshTokenIds";
import { refetchLevelUpOrders, refetchLevelUpOrdersAndPositions } from "./refetchLevelUpOrders";

export type LevelUpPortfolioRefreshOptions = {
	tokenIds?: readonly string[];
	claimMarketIds?: readonly string[];
};

/** Imperative refresh for LevelUp orders + positions (transfers, fund callbacks, claims). */
export function useLevelUpPortfolioRefetch() {
	const queryClient = useQueryClient();
	const venueAddressChainMap = useVenueAddressChainMap();
	const accountData = useAccountData();
	const { umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella } = usePredictionData();
	const levelUpWallet = venueAddressChainMap?.levelup.walletAddress ?? null;

	const catalog = useMemo(
		() =>
			buildLevelUpMarketCatalog(umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella),
		[umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella],
	);

	const refreshPositionsRef = useRef(accountData.refresh.positions);
	refreshPositionsRef.current = accountData.refresh.positions;
	const refreshByTokenIdsRef = useRef(accountData.refresh.levelUpPositionsByTokenIds);
	refreshByTokenIdsRef.current = accountData.refresh.levelUpPositionsByTokenIds;

	return useCallback(
		async (opts?: LevelUpPortfolioRefreshOptions) => {
			const explicitTokenIds = opts?.tokenIds ?? [];
			const tokenIds =
				explicitTokenIds.length > 0
					? [...explicitTokenIds]
					: opts?.claimMarketIds?.length
						? levelUpTokenIdsFromMarketCatalog(opts.claimMarketIds, catalog)
						: [];

			if (tokenIds.length > 0) {
				await Promise.allSettled([
					refreshByTokenIdsRef.current(tokenIds),
					refetchLevelUpOrders(queryClient, levelUpWallet),
				]);
				return;
			}

			await refetchLevelUpOrdersAndPositions(queryClient, levelUpWallet, () =>
				refreshPositionsRef.current("levelup"),
			);
		},
		[catalog, queryClient, levelUpWallet],
	);
}
