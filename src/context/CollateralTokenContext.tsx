import React, { createContext, useCallback, useContext, useMemo } from "react";
import {
	useQuery,
	type UseQueryResult,
} from "@tanstack/react-query";
import { useSignerContext } from "context/SignerContext";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type { FundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";

/**
 * Live collateral-token balances (USDC and bridge stables) keyed off the
 * connected user. **Single HTTP owner** for `GET /portfolio/cash-summary`.
 * Mount only under `AccountDataProvider`, which passes `profileId` and
 * `fundingHydrated` and maps this context into `useAccountData().cash`.
 *
 * Components must NOT read chain RPC for collateral directly, NOT keep their
 * own `useState` copy, and NOT call setters. Read here, mutate via
 * {@link CollateralTokens.refetch} only.
 *
 * The server resolves the user's five wallet roles from Privy + persisted
 * venue accounts and dials its private RPCs in parallel, returning the
 * human-decimal snapshot. Sources combined server-side:
 *   - Base USDC                                (`account` smart wallet)
 *   - Polygon USDC.e + pUSD                    (Polymarket Safe)
 *   - BSC USDT                                 (Privy embedded EOA)
 *   - Solana USDC                              (Privy Solana address)
 *   - Base USDC on Limitless maker             (delegated server wallet)
 */
/** Aligns with `AccountDataContext` `SliceStatus` for the cash-summary query. */
export type CollateralCashSliceStatus =
	| "idle"
	| "pending"
	| "success"
	| "error";

export interface CollateralTokens {
	baseUsdc: number;
	polygonStable: number;
	bscUsdt: number;
	solanaUsdc: number;
	limitlessMakerUsdc: number;
	/** TanStack state for `GET /portfolio/cash-summary` (exposed for `AccountDataContext.cash`). */
	cashStatus: CollateralCashSliceStatus;
	cashError: string | null;
	/** False until the underlying query has settled at least once for the current wallet. */
	isFetched: boolean;
	isPending: boolean;
	/**
	 * Force a re-read of all five chains in parallel.
	 * Resolves to the fresh snapshot (same shape as the underlying query) so callers
	 * can read immediately without waiting for the next render.
	 */
	refetch: () => Promise<FundingStableBalancesHuman | undefined>;
}

/** TanStack prefix for all collateral balance queries — use with `invalidateQueries`. */
export const COLLATERAL_TOKENS_QUERY_KEY = "collateral-tokens" as const;
/** Matches today's `useBridgeFundingBalances` cadence; balances rarely change between renders. */
const COLLATERAL_TOKENS_STALE_TIME_MS = 15_000;

function cashStatusOf(
	q: Pick<
		UseQueryResult<FundingStableBalancesHuman>,
		"status" | "isFetched" | "fetchStatus"
	>
): CollateralCashSliceStatus {
	if (q.status === "pending" && q.fetchStatus === "idle") return "idle";
	if (q.status === "pending") return "pending";
	if (q.status === "error") return "error";
	if (q.status === "success") return "success";
	return "idle";
}

function cashErrorMessageOf(err: unknown): string | null {
	if (!err) return null;
	if (err instanceof Error) return err.message;
	return String(err);
}

const CollateralTokenContext = createContext<CollateralTokens | null>(null);

/** Used when a consumer mounts outside the provider (broken tree / duplicate context module under Vite HMR). */
const COLLATERAL_TOKENS_FALLBACK: CollateralTokens = {
	baseUsdc: 0,
	polygonStable: 0,
	bscUsdt: 0,
	solanaUsdc: 0,
	limitlessMakerUsdc: 0,
	cashStatus: "idle",
	cashError: null,
	isFetched: false,
	isPending: true,
	refetch: async () => undefined,
};

let collateralProviderMissingLogged = false;

export function CollateralTokenProvider({
	children,
	profileId,
	fundingHydrated,
}: {
	children: React.ReactNode;
	/** From `AccountDataProvider` funding gate — must match TanStack cash key segment. */
	profileId: string | null;
	fundingHydrated: boolean;
}) {
	const { account } = useSignerContext();
	const privateApi = usePrivateApiClient();

	const accountKey = typeof account === "string" ? account.toLowerCase() : null;

	const enabled = Boolean(account) && fundingHydrated;

	const queryKey = useMemo(
		() => [COLLATERAL_TOKENS_QUERY_KEY, profileId ?? null, accountKey],
		[profileId, accountKey],
	);

	const query: UseQueryResult<FundingStableBalancesHuman> = useQuery({
		queryKey,
		enabled,
		staleTime: COLLATERAL_TOKENS_STALE_TIME_MS,
		queryFn: async () => {
			const summary = await privateApi.getCashSummary();
			return {
				base: summary.base,
				polygon: summary.polygon,
				bnb: summary.bnb,
				solana: summary.solana,
				limitlessMakerBase: summary.limitlessMakerBase,
			} satisfies FundingStableBalancesHuman;
		},
	});

	const refetch = useCallback(async () => {
		const r = await query.refetch();
		return r.data;
	}, [query]);

	const value = useMemo<CollateralTokens>(() => {
		const data = query.data;
		return {
			baseUsdc: data ? data.base : 0,
			polygonStable: data ? data.polygon : 0,
			bscUsdt: data ? data.bnb : 0,
			solanaUsdc: data ? data.solana : 0,
			limitlessMakerUsdc: data ? (data.limitlessMakerBase ?? 0) : 0,
			cashStatus: cashStatusOf(query),
			cashError: cashErrorMessageOf(query.error),
			isFetched: query.isFetched,
			isPending: query.isPending,
			refetch,
		};
	}, [
		query.data,
		query.error,
		query.status,
		query.fetchStatus,
		query.isFetched,
		query.isPending,
		refetch,
	]);

	return (
		<CollateralTokenContext.Provider value={value}>
			{children}
		</CollateralTokenContext.Provider>
	);
}

/**
 * Read live collateral-token balances. Returns the latest snapshot from the
 * single in-app query. Always check `isFetched` before treating numbers as
 * authoritative — until then they are zero placeholders.
 *
 * In dev we log + return a loading fallback so HMR / accidentally-detached
 * components don't crash the page. In production a missing provider is a
 * tree bug that must surface — return-and-fallback would mask broken cash
 * displays for real users.
 */
export function useCollateralTokens(): CollateralTokens {
	const ctx = useContext(CollateralTokenContext);
	if (ctx) return ctx;
	if (import.meta.env.DEV) {
		if (!collateralProviderMissingLogged) {
			collateralProviderMissingLogged = true;
			console.error(
				"[useCollateralTokens] No CollateralTokenProvider in tree. Using loading fallback — verify <AccountDataProvider> wraps the app.",
			);
		}
		return COLLATERAL_TOKENS_FALLBACK;
	}
	throw new Error(
		"useCollateralTokens must be used within a <CollateralTokenProvider>",
	);
}
