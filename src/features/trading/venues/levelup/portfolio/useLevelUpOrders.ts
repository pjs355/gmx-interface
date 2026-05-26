import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePredictionData } from "context/PredictionDataContext";
import {
	fetchUserOrders,
	getFilledOrders,
	getOpenOrders,
	type ProcessedOrder,
} from "@/services/api/simplifiedOrderService";
import { levelUpQueryKeys } from "../levelUpQueryKeys";
import { buildLevelUpMarketCatalog } from "./buildLevelUpMarketCatalog";

/**
 * LevelUp order book + fill history via predictions-api `GET /orders/:wallet`.
 * Share counts live in `useLevelUpPositions` / `AccountData.positions.levelup`.
 */
export function useLevelUpOrders(walletAddress: string | null | undefined, enabled: boolean) {
	const wallet = walletAddress?.trim() ?? "";
	const walletKey = wallet.toLowerCase();
	const queryEnabled = enabled && wallet.startsWith("0x");

	const { umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella } = usePredictionData();

	const marketDataMap = useMemo(
		() =>
			buildLevelUpMarketCatalog(
				Array.isArray(umbrellas) ? umbrellas : [],
				getAllQuestionsForUmbrella,
				resolvedMarketsByUmbrella,
			),
		[umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella],
	);

	const query = useQuery<ProcessedOrder[]>({
		queryKey: levelUpQueryKeys.orders(walletKey),
		enabled: queryEnabled,
		staleTime: 30_000,
		retry: 1,
		queryFn: async () => {
			if (!wallet.startsWith("0x")) {
				throw new Error("useLevelUpOrders: wallet address is required");
			}
			return fetchUserOrders(wallet, marketDataMap);
		},
		meta: { errorMessage: "LevelUp orders" },
	});

	const orders = query.data ?? [];
	const openOrders = useMemo(() => getOpenOrders(orders), [orders]);
	const filledOrders = useMemo(() => getFilledOrders(orders), [orders]);

	return {
		orders,
		openOrders,
		filledOrders,
		isLoading: query.isLoading,
		isFetched: query.isFetched,
		error: query.error,
		refetch: query.refetch,
	};
}
