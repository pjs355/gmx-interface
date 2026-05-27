import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/features/trading/hooks/useBridgeFundingBalances";
import { limitlessQueryKeys } from "@/features/trading/venues/limitless/trade/limitlessQueryKeys";
import type { FundingStableBalancesHuman } from "@/features/trading/sor/prefund/fundingStableBalances";
import {
	readTotalCashHumanFromQueryClient,
	usePostTradeAccountSync,
} from "@/features/trading/sor/post-trade/usePostTradeAccountSync";

import type { LevelUpPortfolioRefreshOptions } from "@/features/trading/venues/levelup/portfolio/useLevelUpPortfolioRefetch";

export type UseHandleClaimSuccessArgs = {
	acknowledgeClearedPayouts: (keys: string[]) => void;
	setClaimedMarkets: (updater: (prev: Set<string>) => Set<string>) => void;
	refreshLevelUpPortfolio: (opts?: LevelUpPortfolioRefreshOptions) => Promise<void> | void;
	collateralTokens: {
		refetch: () => Promise<FundingStableBalancesHuman | undefined>;
	};
};

export type HandleClaimSuccess = (
	marketId: string | string[],
	_umbrellaId: string,
) => Promise<void>;

export function useHandleClaimSuccess({
	acknowledgeClearedPayouts,
	setClaimedMarkets,
	refreshLevelUpPortfolio,
	collateralTokens,
}: UseHandleClaimSuccessArgs): HandleClaimSuccess {
	const queryClient = useQueryClient();
	const { startCashAfterClaim } = usePostTradeAccountSync();

	return useCallback<HandleClaimSuccess>(
		async (marketId, _umbrellaId) => {
			const baselineTotalCash = readTotalCashHumanFromQueryClient(queryClient);
			if (baselineTotalCash != null && Number.isFinite(baselineTotalCash)) {
				startCashAfterClaim({
					queryClient,
					refetchCollateral: collateralTokens.refetch,
					baselineTotalCash,
				});
			}

			const ids = Array.isArray(marketId) ? marketId : [marketId];
			const payoutKeys = ids.map((id) => String(id ?? "").trim()).filter((k) => k.length > 0);
			if (import.meta.env.DEV) {
				console.debug("[LimitlessRedeemTrace] handleClaimSuccess payoutKeys", {
					payoutKeys,
					count: payoutKeys.length,
					umbrellaId: _umbrellaId,
				});
			}
			// Same keys as Winnings rows (`predict-win-*`, LevelUp `balanceId`, etc.).
			// PortfolioContext uses this set to drop stale venue MTM until predict/poly
			// queries refetch after redeem.
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
				// portfolio total matches fresh cash; cash alone can update while stale mark values
				// double-count.
				await Promise.all([
					refreshLevelUpPortfolio({ claimMarketIds: payoutKeys }),
					queryClient.invalidateQueries({
						queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
					}),
					queryClient.invalidateQueries({ queryKey: ["predict-positions"] }),
					queryClient.invalidateQueries({
						queryKey: ["predict-market-details"],
					}),
					queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] }),
					queryClient.invalidateQueries({ queryKey: ["dflow-positions"] }),
					queryClient.invalidateQueries({ queryKey: limitlessQueryKeys.root }),
				]);
				await collateralTokens.refetch();
			} catch (err) {
				console.error("[usePositionsData] Post-claim balance refresh failed:", err);
			}
		},
		[
			acknowledgeClearedPayouts,
			setClaimedMarkets,
			refreshLevelUpPortfolio,
			collateralTokens,
			queryClient,
			startCashAfterClaim,
		],
	);
}
