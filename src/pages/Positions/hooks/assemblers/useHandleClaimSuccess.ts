import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import { limitlessQueryKeys } from "@/trading/limitless/limitlessQueryKeys";

export type UseHandleClaimSuccessArgs = {
	acknowledgeClearedPayouts: (keys: string[]) => void;
	setClaimedMarkets: (
		updater: (prev: Set<string>) => Set<string>,
	) => void;
	refreshUserData: () => Promise<void> | void;
	refreshTokenPositions: () => Promise<void> | void;
	collateralTokens: { refetch: () => Promise<unknown> | unknown };
};

export type HandleClaimSuccess = (
	marketId: string | string[],
	_umbrellaId: string,
) => Promise<void>;

export function useHandleClaimSuccess({
	acknowledgeClearedPayouts,
	setClaimedMarkets,
	refreshUserData,
	refreshTokenPositions,
	collateralTokens,
}: UseHandleClaimSuccessArgs): HandleClaimSuccess {
	const queryClient = useQueryClient();

	return useCallback<HandleClaimSuccess>(
		async (marketId, _umbrellaId) => {
			const ids = Array.isArray(marketId) ? marketId : [marketId];
			const payoutKeys = ids
				.map((id) => String(id ?? "").trim())
				.filter((k) => k.length > 0);
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
					refreshUserData(),
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
				await Promise.all([
					collateralTokens.refetch(),
					refreshTokenPositions(),
				]);
			} catch (err) {
				console.error("[usePositionsData] Post-claim balance refresh failed:", err);
			}
		},
		[
			acknowledgeClearedPayouts,
			setClaimedMarkets,
			refreshUserData,
			refreshTokenPositions,
			collateralTokens,
			queryClient,
		],
	);
}
