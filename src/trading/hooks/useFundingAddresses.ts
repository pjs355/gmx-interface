import { useMemo } from "react";
import { useAccountOverview } from "./useAccountOverview";
import { useCurrentProfile } from "./useCurrentProfile";
import { usePolymarketBuilder } from "./usePolymarketBuilder";
import { useTradingWallets } from "@/trading/useWallets";

/**
 * Resolves Base smart wallet + Polymarket Safe + signer for LI.FI funding flows.
 */
export function useFundingAddresses() {
	const profileQuery = useCurrentProfile();
	const profileId = profileQuery.data?._id;
	const overviewQuery = useAccountOverview(profileId);
	const polymarketQuery = usePolymarketBuilder({
		profileId,
		enabled: Boolean(profileId),
	});
	const wallets = useTradingWallets(overviewQuery.data, polymarketQuery.data);

	const integrationMode =
		polymarketQuery.data?.polymarketAccount?.integrationMode ?? undefined;

	const polymarketAccountNotFound = Boolean(
		polymarketQuery.data?._clientPolymarketAccountNotFound
	);

	const accountOverviewNotFound = Boolean(
		overviewQuery.data?._clientAccountOverviewNotFound
	);

	const isLoading =
		profileQuery.isLoading ||
		(Boolean(profileId) && (overviewQuery.isLoading || polymarketQuery.isFetching));

	return useMemo(
		() => ({
			profileId,
			...wallets,
			integrationMode,
			polymarketAccountNotFound,
			accountOverviewNotFound,
			polymarketAccount: polymarketQuery.data,
			accountOverview: overviewQuery.data,
			isLoading,
			refetchPolymarket: polymarketQuery.refetch,
			refetchOverview: overviewQuery.refetch,
			verifyOnChain: polymarketQuery.verifyOnChain,
			/** Dev / support: React Query state for GET /polymarket/account */
			polymarketAccountQuery: {
				status: polymarketQuery.status,
				isFetched: polymarketQuery.isFetched,
				isError: polymarketQuery.isError,
				errorMessage:
					polymarketQuery.error instanceof Error
						? polymarketQuery.error.message
						: polymarketQuery.error
							? String(polymarketQuery.error)
							: null,
			},
			accountOverviewQuery: {
				status: overviewQuery.status,
				isFetched: overviewQuery.isFetched,
				isError: overviewQuery.isError,
				errorMessage:
					overviewQuery.error instanceof Error
						? overviewQuery.error.message
						: overviewQuery.error
							? String(overviewQuery.error)
							: null,
			},
		}),
		[
			profileId,
			wallets,
			integrationMode,
			polymarketAccountNotFound,
			accountOverviewNotFound,
			polymarketQuery.data,
			polymarketQuery.status,
			polymarketQuery.isFetched,
			polymarketQuery.isError,
			polymarketQuery.error,
			overviewQuery.data,
			overviewQuery.status,
			overviewQuery.isFetched,
			overviewQuery.isError,
			overviewQuery.error,
			isLoading,
			polymarketQuery.refetch,
			overviewQuery.refetch,
			polymarketQuery.verifyOnChain,
		]
	);
}
