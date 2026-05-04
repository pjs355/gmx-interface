import React, { createContext, useCallback, useContext, useMemo } from "react";
import {
	useQuery,
	useQueryClient,
	type UseQueryResult,
} from "@tanstack/react-query";
import { useSignerContext } from "context/SignerContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import { usePrivateApiClient } from "@/trading/hooks/usePrivateApiClient";
import type { FundingStableBalancesHuman } from "@/trading/sor/fundingStableBalances";
import {
	applyCollateralOverlays,
	registerCollateralOverlay,
	type CollateralChainKey,
} from "./collateralTokensOptimisticOverlays";

/**
 * Live collateral-token balances (USDC and bridge stables) keyed off the
 * connected user. Single owner of these values for the entire app —
 * components must NOT read chain RPC for collateral directly, NOT keep their
 * own `useState` copy, and NOT call setters. Read here, mutate via
 * {@link CollateralTokens.refetch} only.
 *
 * Reads now flow through `GET /portfolio/cash-summary`. The server resolves
 * the user's five wallet roles from Privy + persisted venue accounts and
 * dials its private RPCs in parallel, returning the human-decimal snapshot.
 * Sources combined server-side:
 *   - Base USDC                                (`account` smart wallet)
 *   - Polygon USDC.e + pUSD                    (Polymarket Safe)
 *   - BSC USDT                                 (Privy embedded EOA)
 *   - Solana USDC                              (Privy Solana address)
 *   - Base USDC on Limitless maker             (delegated server wallet)
 */
export interface CollateralTokens {
	baseUsdc: number;
	polygonStable: number;
	bscUsdt: number;
	solanaUsdc: number;
	limitlessMakerUsdc: number;
	/** False until the underlying query has settled at least once for the current wallet. */
	isFetched: boolean;
	isPending: boolean;
	/**
	 * Force a re-read of all five chains in parallel.
	 * Resolves to the fresh snapshot (same shape as the underlying query) so callers
	 * can read immediately without waiting for the next render.
	 */
	refetch: () => Promise<FundingStableBalancesHuman | undefined>;
	/**
	 * Register an optimistic post-trade cash change so the displayed balance for
	 * the given chain immediately reflects the trade and won't regress on the
	 * next refetch until the on-chain reading converges (or the overlay TTL
	 * elapses). `direction === "buy"` decreases cash; `direction === "sell"`
	 * increases it.
	 */
	applyOptimisticCashChange: (input: {
		chain: CollateralChainKey;
		baseline: number;
		amountUsd: number;
		direction: "buy" | "sell";
	}) => void;
}

/** TanStack prefix for all collateral balance queries — use with `invalidateQueries`. */
export const COLLATERAL_TOKENS_QUERY_KEY = "collateral-tokens" as const;
/** Matches today's `useBridgeFundingBalances` cadence; balances rarely change between renders. */
const COLLATERAL_TOKENS_STALE_TIME_MS = 15_000;

const CollateralTokenContext = createContext<CollateralTokens | null>(null);

/** Used when a consumer mounts outside the provider (broken tree / duplicate context module under Vite HMR). */
const COLLATERAL_TOKENS_FALLBACK: CollateralTokens = {
	baseUsdc: 0,
	polygonStable: 0,
	bscUsdt: 0,
	solanaUsdc: 0,
	limitlessMakerUsdc: 0,
	isFetched: false,
	isPending: true,
	refetch: async () => undefined,
	applyOptimisticCashChange: () => {},
};

let collateralProviderMissingLogged = false;

export function CollateralTokenProvider({ children }: { children: React.ReactNode }) {
	const queryClient = useQueryClient();
	const { account } = useSignerContext();
	const { fundingHydrated, profileId } = useFundingAddresses();
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
			const fresh: FundingStableBalancesHuman = {
				base: summary.base,
				polygon: summary.polygon,
				bnb: summary.bnb,
				solana: summary.solana,
				limitlessMakerBase: summary.limitlessMakerBase,
			};
			return applyCollateralOverlays(fresh);
		},
	});

	const refetch = useCallback(async () => {
		const r = await query.refetch();
		return r.data;
	}, [query]);

	const applyOptimisticCashChange = useCallback(
		(input: {
			chain: CollateralChainKey;
			baseline: number;
			amountUsd: number;
			direction: "buy" | "sell";
		}) => {
			registerCollateralOverlay(input);
			// Re-apply overlays to the cached snapshot so consumers re-render with
			// the new ceiling/floor without waiting for a refetch.
			queryClient.setQueryData<FundingStableBalancesHuman>(queryKey, (prev) =>
				prev ? applyCollateralOverlays(prev) : prev,
			);
		},
		[queryClient, queryKey],
	);

	const value = useMemo<CollateralTokens>(() => {
		const data = query.data;
		return {
			baseUsdc: data ? data.base : 0,
			polygonStable: data ? data.polygon : 0,
			bscUsdt: data ? data.bnb : 0,
			solanaUsdc: data ? data.solana : 0,
			limitlessMakerUsdc: data ? (data.limitlessMakerBase ?? 0) : 0,
			isFetched: query.isFetched,
			isPending: query.isPending,
			refetch,
			applyOptimisticCashChange,
		};
	}, [
		query.data,
		query.isFetched,
		query.isPending,
		refetch,
		applyOptimisticCashChange,
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
 */
export function useCollateralTokens(): CollateralTokens {
	const ctx = useContext(CollateralTokenContext);
	if (ctx) return ctx;
	if (import.meta.env.DEV && !collateralProviderMissingLogged) {
		collateralProviderMissingLogged = true;
		console.error(
			"[useCollateralTokens] No CollateralTokenProvider in tree. Using loading fallback — verify provider order in src/index.tsx.",
		);
	}
	return COLLATERAL_TOKENS_FALLBACK;
}
