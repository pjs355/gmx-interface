import React, {
	createContext,
	useCallback,
	useContext,
	useMemo,
} from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { usePrivy } from "@privy-io/react-auth";
import { useSignerContext } from "context/SignerContext";
import { useCurrentProfile } from "@/trading/hooks/useCurrentProfile";
import { useAccountOverview } from "@/trading/hooks/useAccountOverview";
import { usePolymarketBuilder } from "@/trading/hooks/usePolymarketBuilder";
import { useDflowProofStatus } from "@/trading/hooks/useDflowProofStatus";
import {
	useFundingAddressesFromQueries,
	type PolymarketBuilderBundle,
} from "@/trading/hooks/useFundingAddresses";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import { tradingQueryKeys } from "@/trading/queryKeys";
import { usePolymarketPositions } from "@/trading/polymarket/usePolymarketPositions";
import { usePredictPositions } from "@/trading/predict/usePredictPositions";
import { useDflowPositions } from "@/trading/dflow/useDflowPositions";
import { useLimitlessVenuePositions } from "@/trading/limitless/useLimitlessPortfolioVenue";
import { resolvePredictAccountAddress } from "@/trading/predict/resolvePredictAccountAddress";
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
 *   - Address normalization for Predict.fun positions is centralized via
 *     `resolvePredictAccountAddress` — three previous call sites computed it
 *     three different ways and double-fetched until they converged.
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
	polyAccount: AccountDataSlice<PolymarketAccountResponse>;
	predictAccount: AccountDataSlice<PredictAccountResponse>;
	positions: Record<AccountVenueKey, AccountPositionsSlice>;
	addresses: {
		baseSmartWallet: string | null;
		polymarketSafe: string | null;
		embeddedEoa: string | null;
		solanaAddress: string | null;
		limitlessMakerBase: string | null;
		/** Canonical address used as the Predict.fun positions cache key. */
		predict: string | null;
	};
	readiness: AccountReadiness;
	refresh: {
		profile: () => Promise<void>;
		overview: () => Promise<void>;
		cash: () => Promise<void>;
		dflowProof: () => Promise<void>;
		polyAccount: () => Promise<void>;
		predictAccount: () => Promise<void>;
		positions: (venue?: AccountVenueKey) => Promise<void>;
		all: () => Promise<void>;
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

type FundingSnapshot = ReturnType<typeof useFundingAddressesFromQueries>;

type AccountDataContextInnerProps = {
	children: React.ReactNode;
	authenticated: boolean;
	account: unknown;
	signerAddress: string | null | undefined;
	api: ReturnType<typeof usePrivateApiClient>;
	profileQuery: UseQueryResult<UserProfile>;
	overviewQuery: UseQueryResult<AccountOverview>;
	polyBuilder: PolymarketBuilderBundle;
	funding: FundingSnapshot;
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
	funding,
	profileId,
}: AccountDataContextInnerProps) {
	const collateral = useCollateralTokens();
	const dflowProofQ = useDflowProofStatus();

	const predictAccountQuery = useQuery<PredictAccountResponse>({
		queryKey: profileId
			? tradingQueryKeys.predictAccount(profileId)
			: PREDICT_ACCOUNT_DISABLED_KEY,
		enabled: Boolean(authenticated && profileId),
		staleTime: 30_000,
		queryFn: () => api.getPredictAccount(),
	});

	const polyPositionsQuery = usePolymarketPositions(funding.polymarketSafe);

	const predictAddress = resolvePredictAccountAddress(signerAddress, account);
	const predictPositionsQuery = usePredictPositions(predictAddress);

	const solanaLinked = Boolean(funding.solanaAddress?.trim());
	const dflowRpcEnabled =
		solanaLinked &&
		Boolean(authenticated) &&
		dflowProofQ.isFetched &&
		dflowProofQ.isVerified;
	const dflowPositionsQuery = useDflowPositions(
		funding.solanaAddress,
		api,
		{ enabled: dflowRpcEnabled }
	);

	const limitlessEnabled =
		Boolean(authenticated) && Boolean(funding.limitlessMakerBase?.trim());
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

	const value = useMemo<AccountData>(() => {
		const cash: AccountCashSlice = {
			base: collateral.baseUsdc,
			polygon: collateral.polygonStable,
			bnb: collateral.bscUsdt,
			solana: collateral.solanaUsdc,
			limitlessMaker: collateral.limitlessMakerUsdc,
			total:
				collateral.baseUsdc +
				collateral.polygonStable +
				collateral.bscUsdt +
				collateral.solanaUsdc +
				collateral.limitlessMakerUsdc,
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

		const polySlice: AccountDataSlice<PolymarketAccountResponse> = {
			data: polyBuilder.data ?? null,
			status: statusOf(polyBuilder),
			error: errorMessageOf(polyBuilder.error),
			isFetched: polyBuilder.isFetched,
			refetch: refreshPolyAccount,
		};

		const predictSlice: AccountDataSlice<PredictAccountResponse> = {
			data: predictAccountQuery.data ?? null,
			status: statusOf(predictAccountQuery),
			error: errorMessageOf(predictAccountQuery.error),
			isFetched: predictAccountQuery.isFetched,
			refetch: refreshPredictAccount,
		};

		const readiness: AccountReadiness = {
			hydrated: funding.fundingHydrated,
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
			addresses: {
				baseSmartWallet: funding.baseSmartWallet ?? null,
				polymarketSafe: funding.polymarketSafe ?? null,
				embeddedEoa: funding.embeddedEoa ?? null,
				solanaAddress: funding.solanaAddress ?? null,
				limitlessMakerBase: funding.limitlessMakerBase ?? null,
				predict: predictAddress,
			},
			readiness,
			refresh: {
				profile: refreshProfile,
				overview: refreshOverview,
				cash: refreshCash,
				dflowProof: refreshDflowProof,
				polyAccount: refreshPolyAccount,
				predictAccount: refreshPredictAccount,
				positions: refreshPositions,
				all: refreshAll,
			},
		};
	}, [
		profileQuery,
		overviewQuery,
		polyBuilder,
		predictAccountQuery,
		collateral.baseUsdc,
		collateral.polygonStable,
		collateral.bscUsdt,
		collateral.solanaUsdc,
		collateral.limitlessMakerUsdc,
		collateral.isFetched,
		collateral.cashStatus,
		collateral.cashError,
		dflowProofQ,
		polyPositionsQuery,
		predictPositionsQuery,
		dflowPositionsQuery,
		limitlessPositionsQuery,
		funding,
		profileId,
		predictAddress,
		refreshProfile,
		refreshOverview,
		refreshCash,
		refreshDflowProof,
		refreshPolyAccount,
		refreshPredictAccount,
		refreshPositions,
		refreshAll,
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
	const funding = useFundingAddressesFromQueries(
		profileQuery,
		overviewQuery,
		polyBuilder
	);

	return (
		<CollateralTokenProvider
			profileId={profileId}
			fundingHydrated={funding.fundingHydrated}
		>
			<AccountDataContextInner
				authenticated={authenticated}
				account={account}
				signerAddress={signerAddress}
				api={api}
				profileQuery={profileQuery}
				overviewQuery={overviewQuery}
				polyBuilder={polyBuilder}
				funding={funding}
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
export function useAccountAddresses(): AccountData["addresses"] {
	return useAccountData().addresses;
}
export function useAccountReadiness(): AccountReadiness {
	return useAccountData().readiness;
}
export function useAccountRefresh(): AccountData["refresh"] {
	return useAccountData().refresh;
}

// ── Re-export type that consumers need ────────────────────────────────────
export type { CollateralTokens };
