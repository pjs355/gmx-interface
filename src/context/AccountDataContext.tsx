import React, {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
} from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { usePrivy, useWallets as usePrivyWallets } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { useAccountOverview } from "@/trading/hooks/useAccountOverview";
import {
	usePolymarketBuilder,
	type PolymarketBuilderBundle,
} from "@/trading/hooks/usePolymarketBuilder";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import {
	getAccountWalletGate,
	normalizeWalletRolesFromOverview,
	resolveVenueAddressChainMap,
	type AccountWalletGate,
	type AccountWalletRolesPartial,
	type VenueAddressChainMap,
} from "@/context/accountWallets";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { tradingQueryKeys } from "@/trading/queryKeys";
import { usePolymarketPositions } from "@/trading/venues/polymarket/portfolio/usePolymarketPositions";
import { usePredictPositions } from "@/trading/venues/predict/portfolio/usePredictPositions";
import { useDflowPositions } from "@/trading/venues/dflow/portfolio/useDflowPositions";
import { useLimitlessVenuePositions } from "@/trading/venues/limitless/portfolio/useLimitlessPortfolioVenue";
import {
	CollateralTokenProvider,
	useCollateralTokens,
	type CollateralTokens,
} from "./CollateralTokenContext";

import type { UserProfile } from "@/services/api/userService";
import type {
	AccountOverview,
	PolymarketAccountResponse,
} from "@/types/trading";
import type {
	PredictAccountResponse,
	DflowAccountResponse,
} from "@/services/privateApi";
import type { VenuePosition } from "@/types/trading/venuePosition";

/**
 * `AccountDataContext` is the single source of truth for every per-user data
 * point on the client. It mounts once under `SignerProvider` and re-exposes
 * the existing canonical TanStack queries — no new HTTP, no new caches.
 *
 * Why one context instead of N hooks?
 *   - Boot-time fetches (`/profiles/me`, `/profiles/me/account-overview`,
 *     `/polymarket/account`, `/api/dflow/account`, `/api/predict/account`,
 *     the four venue position endpoints) are now
 *     guaranteed to fire once and only once per session. Imperative call
 *     sites (`apiClient.getPredictAccount()`, raw `fetch('/profiles/me')`,
 *     etc.) MUST go through this provider — see Phase 2 of the cleanup plan.
 *   - Refetch / invalidation lives in one place (`refresh.*`).
 *   - Venue wallet addresses come only from `venueAddressChainMap` (VACM).
 *
 * Reads inside the provider:
 *   - profile        ← `useCurrentProfile`           (key: `tradingQueryKeys.profileMe`)
 *   - overview       ← `useAccountOverview`          (key: `tradingQueryKeys.accountOverview(profileId)`)
 *   - polyAccount    ← `usePolymarketBuilder`        (key: `tradingQueryKeys.polymarketAccount`)
 *   - dflowProof     ← `useDflowProofStatus`         (key: `tradingQueryKeys.dflowAccount`)
 *   - predictAccount ← inline `useQuery`             (key: `tradingQueryKeys.predictAccount(profileId)`)
 *   - cash           ← **`CollateralTokenProvider` only** (`GET /portfolio/cash-summary`);
 *                      `AccountDataContext` maps `useCollateralTokens()` into `AccountData.cash`
 *   - positions      ← `usePolymarketPositions`, `usePredictPositions`, `useDflowPositions`, `useLimitlessVenuePositions`
 *
 * `levelUp` shares are still owned by `UserDataContext` (which depends on
 * `PredictionDataContext` and lives below this provider in the tree). They
 * are intentionally not re-exposed here in this pass — see the plan's
 * "Out of scope" section for the follow-up split.
 */

type SliceStatus = "idle" | "pending" | "success" | "error";

function statusOf<T>(q: Pick<UseQueryResult<T>, "status" | "isFetched" | "fetchStatus">): SliceStatus {
	if (q.status === "pending" && q.fetchStatus === "idle") return "idle";
	if (q.status === "pending") return "pending";
	if (q.status === "error") return "error";
	if (q.status === "success") return "success";
	return "idle";
}

function errorMessageOf(err: unknown): string | null {
	if (!err) return null;
	if (err instanceof Error) return err.message;
	return String(err);
}

export type AccountDataSlice<T> = {
	data: T | null;
	status: SliceStatus;
	error: string | null;
	isFetched: boolean;
	refetch: () => Promise<void>;
};

export type AccountCashSlice = {
	/** Coinbase Smart Wallet USDC on Base — primary spending balance. */
	base: number;
	/** Polymarket Safe combined Polygon stables (pUSD + USDC.e). */
	polygon: number;
	/** Privy embedded EOA USDT on BSC. */
	bnb: number;
	/** Privy embedded Solana wallet USDC. */
	solana: number;
	/** Limitless delegated maker USDC on Base. */
	limitlessMaker: number;
	/** Sum of all five wallets above (display total). */
	total: number;
	isFetched: boolean;
	status: SliceStatus;
	error: string | null;
	refetch: () => Promise<void>;
};

export type AccountDflowProofSlice = {
	data: DflowAccountResponse | null;
	isVerified: boolean;
	solanaAddress: string | null;
	status: SliceStatus;
	error: string | null;
	isFetched: boolean;
	refetch: () => Promise<void>;
};

export type AccountPositionsSlice = {
	rows: VenuePosition[];
	status: SliceStatus;
	error: string | null;
	isFetched: boolean;
	refetch: () => Promise<void>;
};

export type AccountVenueKey =
	| "polymarket"
	| "predict"
	| "dflow"
	| "limitless";

export type AccountPolyAccountSlice = AccountDataSlice<PolymarketAccountResponse> & {
	integrationMode: string | undefined;
	notFound: boolean;
	verifyOnChain: PolymarketBuilderBundle["verifyOnChain"];
};

export type AccountReadiness = {
	/** True after profile resolution + (when profile exists) overview + polymarket settled. */
	hydrated: boolean;
	/** True once any one of the four position queries has settled at least once. */
	anyPositionsFetched: boolean;
	/** Numeric profile id once `/profiles/me` resolves; useful for cache keys. */
	profileId: string | null;
};

export type AccountData = {
	profile: AccountDataSlice<UserProfile>;
	overview: AccountDataSlice<AccountOverview>;
	cash: AccountCashSlice;
	dflowProof: AccountDflowProofSlice;
	predictAccount: AccountDataSlice<PredictAccountResponse>;
	positions: Record<AccountVenueKey, AccountPositionsSlice>;
	/** Venue → chain + collateral + signer; null until wallet gate is ready. */
	venueAddressChainMap: VenueAddressChainMap | null;
	walletGate: AccountWalletGate;
	walletIsLoading: boolean;
	polyAccount: AccountPolyAccountSlice;
	readiness: AccountReadiness;
	/** Bumped after each successful `refresh.account` (weak signal for post-trade reconcile). */
	accountVersion: number;
	lastAccountRefreshAt: number | null;
	isRefreshingAccount: boolean;
	refresh: {
		profile: () => Promise<void>;
		overview: () => Promise<void>;
		cash: () => Promise<void>;
		dflowProof: () => Promise<void>;
		polyAccount: () => Promise<void>;
		predictAccount: () => Promise<void>;
		positions: (venue?: AccountVenueKey) => Promise<void>;
		all: () => Promise<void>;
		/** Broad refetch for post-trade / manual sync (positions + cash + venue accounts + overview). */
		account: (reason: string) => Promise<void>;
	};
};

const AccountDataContext = createContext<AccountData | null>(null);

/** Stable key used when no profile id is available so the disabled query
 *  doesn't churn the cache. */
const PREDICT_ACCOUNT_DISABLED_KEY = [
	"trading",
	"predictAccount",
	"__disabled__",
] as const;

type AccountDataContextInnerProps = {
	children: React.ReactNode;
	authenticated: boolean;
	account: unknown;
	signerAddress: string | null | undefined;
	api: ReturnType<typeof usePrivateApiClient>;
	profileQuery: UseQueryResult<UserProfile>;
	overviewQuery: UseQueryResult<AccountOverview>;
	polyBuilder: PolymarketBuilderBundle;
	walletRoles: AccountWalletRolesPartial;
	walletHydrated: boolean;
	walletIsLoading: boolean;
	profileId: string | null;
};

function AccountDataContextInner({
	children,
	authenticated,
	account,
	signerAddress,
	api,
	profileQuery,
	overviewQuery,
	polyBuilder,
	walletRoles,
	walletHydrated,
	walletIsLoading,
	profileId,
}: AccountDataContextInnerProps) {
	const collateral = useCollateralTokens();
	const dflowProofQ = useDflowProofStatus();

	const walletGate = useMemo(
		() => getAccountWalletGate(walletRoles, walletHydrated),
		[walletRoles, walletHydrated],
	);

	const venueAddressChainMap = useMemo(
		() => resolveVenueAddressChainMap(walletRoles, walletGate),
		[walletRoles, walletGate],
	);

	const predictAccountQuery = useQuery<PredictAccountResponse>({
		queryKey: profileId
			? tradingQueryKeys.predictAccount(profileId)
			: PREDICT_ACCOUNT_DISABLED_KEY,
		enabled: Boolean(authenticated && profileId),
		staleTime: 30_000,
		queryFn: () => api.getPredictAccount(),
	});

	const polyPositionsQuery = usePolymarketPositions(
		venueAddressChainMap?.polymarket.walletAddress ?? null,
	);

	const predictPositionsQuery = usePredictPositions(
		venueAddressChainMap?.predictfun.walletAddress ?? null,
	);

	const solanaLinked = Boolean(
		venueAddressChainMap?.dflow.walletAddress?.trim(),
	);
	const dflowRpcEnabled =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProofQ.isFetched &&
		dflowProofQ.isVerified;
	const dflowPositionsQuery = useDflowPositions(
		venueAddressChainMap?.dflow.walletAddress ?? null,
		api,
		{ enabled: dflowRpcEnabled },
	);

	const limitlessEnabled =
		Boolean(authenticated) &&
		Boolean(venueAddressChainMap?.limitless.walletAddress?.trim());
	const limitlessPositionsQuery = useLimitlessVenuePositions(limitlessEnabled);

	const refreshProfile = useCallback(async () => {
		await profileQuery.refetch();
	}, [profileQuery]);
	const refreshOverview = useCallback(async () => {
		await overviewQuery.refetch();
	}, [overviewQuery]);
	const refreshCash = useCallback(async () => {
		await collateral.refetch();
	}, [collateral]);
	const refreshDflowProof = useCallback(async () => {
		await dflowProofQ.refetch();
	}, [dflowProofQ]);
	const refreshPolyAccount = useCallback(async () => {
		await polyBuilder.refetch();
	}, [polyBuilder]);
	const refreshPredictAccount = useCallback(async () => {
		await predictAccountQuery.refetch();
	}, [predictAccountQuery]);
	const refreshPositions = useCallback(
		async (venue?: AccountVenueKey) => {
			const tasks: Array<Promise<unknown>> = [];
			if (!venue || venue === "polymarket")
				tasks.push(polyPositionsQuery.refetch());
			if (!venue || venue === "predict")
				tasks.push(predictPositionsQuery.refetch());
			if (!venue || venue === "dflow")
				tasks.push(dflowPositionsQuery.refetch());
			if (!venue || venue === "limitless")
				tasks.push(limitlessPositionsQuery.refetch());
			await Promise.all(tasks);
		},
		[
			polyPositionsQuery,
			predictPositionsQuery,
			dflowPositionsQuery,
			limitlessPositionsQuery,
		]
	);
	const refreshAll = useCallback(async () => {
		await Promise.all([
			refreshProfile(),
			refreshOverview(),
			refreshCash(),
			refreshDflowProof(),
			refreshPolyAccount(),
			refreshPredictAccount(),
			refreshPositions(),
		]);
	}, [
		refreshProfile,
		refreshOverview,
		refreshCash,
		refreshDflowProof,
		refreshPolyAccount,
		refreshPredictAccount,
		refreshPositions,
	]);

	const [accountVersion, setAccountVersion] = useState(0);
	const [lastAccountRefreshAt, setLastAccountRefreshAt] = useState<number | null>(
		null,
	);
	const [isRefreshingAccount, setIsRefreshingAccount] = useState(false);
	const accountRefreshDepthRef = useRef(0);

	const refreshAccount = useCallback(
		async (reason: string) => {
			if (import.meta.env.DEV) {
				console.debug("[AccountData] refresh.account", { reason });
			}
			accountRefreshDepthRef.current += 1;
			if (accountRefreshDepthRef.current === 1) {
				setIsRefreshingAccount(true);
			}
			try {
				await Promise.all([
					refreshPositions(),
					refreshCash(),
					refreshOverview(),
					refreshPolyAccount(),
					refreshPredictAccount(),
					refreshDflowProof(),
				]);
				setAccountVersion((v) => v + 1);
				setLastAccountRefreshAt(Date.now());
			} finally {
				accountRefreshDepthRef.current -= 1;
				if (accountRefreshDepthRef.current === 0) {
					setIsRefreshingAccount(false);
				}
			}
		},
		[
			refreshPositions,
			refreshCash,
			refreshOverview,
			refreshPolyAccount,
			refreshPredictAccount,
			refreshDflowProof,
		],
	);

	const value = useMemo<AccountData>(() => {
		const cash: AccountCashSlice = {
			base: collateral.baseUsdc,
			polygon: collateral.polygonStable,
			bnb: collateral.bscUsdt,
			solana: collateral.solanaUsdc,
			limitlessMaker: collateral.limitlessMakerUsdc,
			total: collateral.total,
			isFetched: collateral.isFetched,
			status: collateral.cashStatus,
			error: collateral.cashError,
			refetch: refreshCash,
		};

		const dflowProof: AccountDflowProofSlice = {
			data: dflowProofQ.data,
			isVerified: dflowProofQ.isVerified,
			solanaAddress: dflowProofQ.solanaAddress,
			status: dflowProofQ.isError
				? "error"
				: dflowProofQ.isLoading
					? "pending"
					: dflowProofQ.isFetched
						? "success"
						: "idle",
			error: errorMessageOf(dflowProofQ.error),
			isFetched: dflowProofQ.isFetched,
			refetch: refreshDflowProof,
		};

		const positionsSlice = (
			q: UseQueryResult<VenuePosition[]>,
			refetch: () => Promise<void>
		): AccountPositionsSlice => ({
			rows: q.data ?? [],
			status: statusOf(q),
			error: errorMessageOf(q.error),
			isFetched: q.isFetched,
			refetch,
		});

		const positions: Record<AccountVenueKey, AccountPositionsSlice> = {
			polymarket: positionsSlice(polyPositionsQuery, () =>
				refreshPositions("polymarket")
			),
			predict: positionsSlice(predictPositionsQuery, () =>
				refreshPositions("predict")
			),
			dflow: positionsSlice(dflowPositionsQuery, () =>
				refreshPositions("dflow")
			),
			limitless: positionsSlice(limitlessPositionsQuery, () =>
				refreshPositions("limitless")
			),
		};

		const profileSlice: AccountDataSlice<UserProfile> = {
			data: profileQuery.data ?? null,
			status: statusOf(profileQuery),
			error: errorMessageOf(profileQuery.error),
			isFetched: profileQuery.isFetched,
			refetch: refreshProfile,
		};

		const overviewSlice: AccountDataSlice<AccountOverview> = {
			data: overviewQuery.data ?? null,
			status: statusOf(overviewQuery),
			error: errorMessageOf(overviewQuery.error),
			isFetched: overviewQuery.isFetched,
			refetch: refreshOverview,
		};

		const polySlice: AccountPolyAccountSlice = {
			data: polyBuilder.data ?? null,
			status: statusOf(polyBuilder),
			error: errorMessageOf(polyBuilder.error),
			isFetched: polyBuilder.isFetched,
			refetch: refreshPolyAccount,
			integrationMode:
				polyBuilder.data?.polymarketAccount?.integrationMode ?? undefined,
			notFound: Boolean(polyBuilder.data?._clientPolymarketAccountNotFound),
			verifyOnChain: polyBuilder.verifyOnChain,
		};

		const predictSlice: AccountDataSlice<PredictAccountResponse> = {
			data: predictAccountQuery.data ?? null,
			status: statusOf(predictAccountQuery),
			error: errorMessageOf(predictAccountQuery.error),
			isFetched: predictAccountQuery.isFetched,
			refetch: refreshPredictAccount,
		};

		const readiness: AccountReadiness = {
			hydrated: walletHydrated,
			anyPositionsFetched:
				positions.polymarket.isFetched ||
				positions.predict.isFetched ||
				positions.dflow.isFetched ||
				positions.limitless.isFetched,
			profileId,
		};

		return {
			profile: profileSlice,
			overview: overviewSlice,
			cash,
			dflowProof,
			polyAccount: polySlice,
			predictAccount: predictSlice,
			positions,
			venueAddressChainMap,
			walletGate,
			walletIsLoading,
			readiness,
			accountVersion,
			lastAccountRefreshAt,
			isRefreshingAccount,
			refresh: {
				profile: refreshProfile,
				overview: refreshOverview,
				cash: refreshCash,
				dflowProof: refreshDflowProof,
				polyAccount: refreshPolyAccount,
				predictAccount: refreshPredictAccount,
				positions: refreshPositions,
				all: refreshAll,
				account: refreshAccount,
			},
		};
	}, [
		profileQuery,
		overviewQuery,
		polyBuilder,
		predictAccountQuery,
		collateral.total,
		collateral.isFetched,
		collateral.cashStatus,
		collateral.cashError,
		dflowProofQ,
		polyPositionsQuery,
		predictPositionsQuery,
		dflowPositionsQuery,
		limitlessPositionsQuery,
		venueAddressChainMap,
		walletGate,
		walletIsLoading,
		walletHydrated,
		profileId,
		refreshProfile,
		refreshOverview,
		refreshCash,
		refreshDflowProof,
		refreshPolyAccount,
		refreshPredictAccount,
		refreshPositions,
		refreshAll,
		refreshAccount,
		accountVersion,
		lastAccountRefreshAt,
		isRefreshingAccount,
	]);

	return (
		<AccountDataContext.Provider value={value}>
			{children}
		</AccountDataContext.Provider>
	);
}

export function AccountDataProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const { authenticated } = usePrivy();
	const { account, signerAddress } = useSignerContext();
	const api = usePrivateApiClient();

	const profileQuery = useCurrentProfile();
	const profileId = profileQuery.data?._id ?? null;
	const overviewQuery = useAccountOverview(profileId ?? undefined);
	const polyBuilder = usePolymarketBuilder({
		profileId: profileId ?? undefined,
		enabled: Boolean(profileId && authenticated),
	});
	const { user } = usePrivy();
	const { wallets: privyWallets } = usePrivyWallets();

	const predictAccountQuery = useQuery<PredictAccountResponse>({
		queryKey: profileId
			? tradingQueryKeys.predictAccount(profileId)
			: PREDICT_ACCOUNT_DISABLED_KEY,
		enabled: Boolean(profileId && authenticated),
		staleTime: 30_000,
		queryFn: () => api.getPredictAccount(),
	});

	const walletRoles = useMemo(
		() =>
			normalizeWalletRolesFromOverview({
				user,
				privyWallets: (privyWallets ?? []) as Parameters<
					typeof normalizeWalletRolesFromOverview
				>[0]["privyWallets"],
				accountOverview: overviewQuery.data,
				polymarketAccount: polyBuilder.data,
				predictAccount: predictAccountQuery.data,
			}),
		[
			user,
			privyWallets,
			overviewQuery.data,
			polyBuilder.data,
			predictAccountQuery.data,
		],
	);

	const walletHydrated =
		profileQuery.isFetched &&
		(!profileId ||
			(overviewQuery.isFetched &&
				polyBuilder.isFetched &&
				predictAccountQuery.isFetched));

	const walletIsLoading =
		profileQuery.isLoading ||
		(Boolean(profileId) &&
			(overviewQuery.isLoading ||
				polyBuilder.isFetching ||
				predictAccountQuery.isFetching));

	return (
		<CollateralTokenProvider
			profileId={profileId}
			fundingHydrated={walletHydrated}
		>
			<AccountDataContextInner
				authenticated={authenticated}
				account={account}
				signerAddress={signerAddress}
				api={api}
				profileQuery={profileQuery}
				overviewQuery={overviewQuery}
				polyBuilder={polyBuilder}
				walletRoles={walletRoles}
				walletHydrated={walletHydrated}
				walletIsLoading={walletIsLoading}
				profileId={profileId}
			>
				{children}
			</AccountDataContextInner>
		</CollateralTokenProvider>
	);
}

/** Returns the AccountData snapshot. Throws if mounted outside the provider. */
export function useAccountData(): AccountData {
	const ctx = useContext(AccountDataContext);
	if (!ctx) {
		throw new Error(
			"useAccountData must be used within an <AccountDataProvider>"
		);
	}
	return ctx;
}

// ── Scoped selector hooks (preferred read API for consumers) ──────────────
//
// Importing one of these instead of the full `useAccountData()` keeps the
// caller from re-rendering when unrelated slices change. The selector shape
// is identical to `AccountData[<slice>]` so consumers can grep one symbol.

export function useAccountProfile(): AccountDataSlice<UserProfile> {
	return useAccountData().profile;
}
export function useAccountOverviewSlice(): AccountDataSlice<AccountOverview> {
	return useAccountData().overview;
}
export function useAccountCash(): AccountCashSlice {
	return useAccountData().cash;
}
export function useAccountDflowProof(): AccountDflowProofSlice {
	return useAccountData().dflowProof;
}
export function useAccountPolyAccount(): AccountDataSlice<PolymarketAccountResponse> {
	return useAccountData().polyAccount;
}
export function useAccountPredictAccount(): AccountDataSlice<PredictAccountResponse> {
	return useAccountData().predictAccount;
}
export function useAccountPositions(
	venue: AccountVenueKey
): AccountPositionsSlice {
	return useAccountData().positions[venue];
}
export function useVenueAddressChainMap(): VenueAddressChainMap | null {
	return useAccountData().venueAddressChainMap;
}

export function useAccountWalletGate(): AccountWalletGate {
	return useAccountData().walletGate;
}

/** @deprecated Use {@link useVenueAddressChainMap} and {@link useAccountWalletGate}. */
export function useAccountAddresses(): {
	venueAddressChainMap: VenueAddressChainMap | null;
	walletGate: AccountWalletGate;
	walletIsLoading: boolean;
} {
	const ad = useAccountData();
	return {
		venueAddressChainMap: ad.venueAddressChainMap,
		walletGate: ad.walletGate,
		walletIsLoading: ad.walletIsLoading,
	};
}
export function useAccountReadiness(): AccountReadiness {
	return useAccountData().readiness;
}
export function useAccountRefresh(): AccountData["refresh"] {
	return useAccountData().refresh;
}

// ── Re-export type that consumers need ────────────────────────────────────
export type { CollateralTokens };
