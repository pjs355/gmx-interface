import { useAccountData } from "@/context/AccountDataContext";
import { walletRolesFromVenueAddressChainMap } from "@/context/accountWallets";

/**
 * @deprecated Use `useAccountData().venueAddressChainMap` and `.walletGate` only.
 * Derives legacy flat role fields from the VACM when ready — do not add new callers.
 */
export function useFundingAddresses() {
	const accountData = useAccountData();
	const vacm = accountData.venueAddressChainMap;
	const roles =
		vacm != null ? walletRolesFromVenueAddressChainMap(vacm) : null;

	return {
		profileId: accountData.readiness.profileId ?? undefined,
		baseSmartWallet: roles?.baseSmartWallet,
		limitlessMakerBase: roles?.limitlessMakerBase,
		embeddedEoa: roles?.embeddedEoa,
		polymarketSafe: roles?.polymarketSafe,
		polygonSigner: roles?.polygonSigner,
		predictMaker: roles?.predictMaker,
		solanaAddress: roles?.solanaAddress,
		fundingGate: accountData.walletGate,
		fundingHydrated: accountData.readiness.hydrated,
		isLoading: accountData.walletIsLoading,
		integrationMode: accountData.polyAccount.integrationMode,
		polymarketAccountNotFound: accountData.polyAccount.notFound,
		accountOverviewNotFound: Boolean(
			accountData.overview.data?._clientAccountOverviewNotFound,
		),
		polymarketAccount: accountData.polyAccount.data ?? undefined,
		accountOverview: accountData.overview.data ?? undefined,
		refetchPolymarket: accountData.refresh.polyAccount,
		refetchOverview: accountData.refresh.overview,
		verifyOnChain: accountData.polyAccount.verifyOnChain,
		polymarketAccountQuery: {
			status: accountData.polyAccount.status,
			isFetched: accountData.polyAccount.isFetched,
			isError: accountData.polyAccount.status === "error",
			errorMessage: accountData.polyAccount.error,
		},
		accountOverviewQuery: {
			status: accountData.overview.status,
			isFetched: accountData.overview.isFetched,
			isError: accountData.overview.status === "error",
			errorMessage: accountData.overview.error,
		},
	};
}

export type { PolymarketBuilderBundle } from "./usePolymarketBuilder";
