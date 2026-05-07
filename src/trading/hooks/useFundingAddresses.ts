import { useMemo } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { useAccountOverview } from "./useAccountOverview";
import { useCurrentProfile } from "./useCurrentProfile";
import { usePolymarketBuilder } from "./usePolymarketBuilder";
import { useTradingWallets } from "@/trading/useWallets";
import type { UserProfile } from "@/services/api/userService";
import type { AccountOverview } from "@/types/trading";

export type PolymarketBuilderBundle = ReturnType<typeof usePolymarketBuilder>;

/**
 * Derives funding / wallet fields from already-mounted profile, overview, and
 * Polymarket queries — does **not** subscribe to those queries again.
 * Use from `AccountDataProvider` so we do not double-call
 * `useCurrentProfile` / `useAccountOverview` / `usePolymarketBuilder` alongside
 * the provider's own observers.
 */
export function useFundingAddressesFromQueries(
	profileQuery: UseQueryResult<UserProfile, Error>,
	overviewQuery: UseQueryResult<AccountOverview, Error>,
	polymarketQuery: PolymarketBuilderBundle
) {
	const profileId = profileQuery.data?._id;
	const wallets = useTradingWallets(
		overviewQuery.data,
		polymarketQuery.data
	);

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
		(Boolean(profileId) &&
			(overviewQuery.isLoading || polymarketQuery.isFetching));

	const fundingHydrated =
		profileQuery.isFetched &&
		(!profileId ||
			(overviewQuery.isFetched && polymarketQuery.isFetched));

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
			fundingHydrated,
			refetchPolymarket: polymarketQuery.refetch,
			refetchOverview: overviewQuery.refetch,
			verifyOnChain: polymarketQuery.verifyOnChain,
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
			fundingHydrated,
			polymarketQuery.refetch,
			overviewQuery.refetch,
			polymarketQuery.verifyOnChain,
		]
	);
}

/**
 * Resolves Base smart wallet + Polymarket trading wallet + signer for LI.FI
 * funding flows. The Polymarket wallet is exposed as `polymarketSafe` for
 * historical reasons; after the deposit-wallet migration that field carries
 * the user's **deposit wallet** address (an ERC-1967 proxy from the deposit
 * wallet factory, owned by the Privy embedded EOA, used as the CLOB funder
 * under `SignatureTypeV2.POLY_1271`).
 */
export function useFundingAddresses() {
	const profileQuery = useCurrentProfile();
	const profileId = profileQuery.data?._id;
	const overviewQuery = useAccountOverview(profileId);
	const polymarketQuery = usePolymarketBuilder({
		profileId,
		enabled: Boolean(profileId),
	});
	return useFundingAddressesFromQueries(
		profileQuery,
		overviewQuery,
		polymarketQuery
	);
}
