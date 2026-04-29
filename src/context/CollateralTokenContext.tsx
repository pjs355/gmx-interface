import React, { createContext, useCallback, useContext, useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { useSignerContext } from "context/SignerContext";
import { useFundingAddresses } from "@/trading/hooks/useFundingAddresses";
import {
	readFundingStableBalancesHuman,
	type FundingStableBalancesHuman,
} from "@/trading/sor/fundingStableBalances";

/**
 * Live collateral-token balances (USDC and bridge stables) keyed off the
 * connected wallet + funding addresses. Single owner of these values for the
 * entire app — components must NOT read chain RPC for collateral directly,
 * NOT keep their own `useState` copy, and NOT call setters. Read here, mutate
 * via {@link CollateralTokens.refetch} only.
 *
 * Sources combined into one `Promise.all` (see
 * {@link readFundingStableBalancesHuman}):
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
};

let collateralProviderMissingLogged = false;

function normalizeEvmAddress(input: string | null | undefined): string | undefined {
	if (input === null || input === undefined) return undefined;
	const trimmed = input.trim();
	return /^0x[a-fA-F0-9]{40}$/.test(trimmed) ? trimmed : undefined;
}

function normalizeSolanaAddress(input: string | null | undefined): string | undefined {
	if (input === null || input === undefined) return undefined;
	const trimmed = input.trim();
	return trimmed.length >= 32 && trimmed.length <= 44 ? trimmed : undefined;
}

export function CollateralTokenProvider({ children }: { children: React.ReactNode }) {
	const { account } = useSignerContext();
	const {
		polymarketSafe,
		embeddedEoa,
		solanaAddress,
		limitlessMakerBase,
		fundingHydrated,
	} = useFundingAddresses();

	const baseAddr = normalizeEvmAddress(account);
	const safeAddr = normalizeEvmAddress(polymarketSafe);
	const bnbAddr = normalizeEvmAddress(embeddedEoa);
	const solAddr = normalizeSolanaAddress(solanaAddress);
	const limitlessAddr = normalizeEvmAddress(limitlessMakerBase);

	const enabled =
		Boolean(account) &&
		fundingHydrated &&
		Boolean(baseAddr || safeAddr || bnbAddr || solAddr || limitlessAddr);

	const query: UseQueryResult<FundingStableBalancesHuman> = useQuery({
		queryKey: [
			COLLATERAL_TOKENS_QUERY_KEY,
			baseAddr?.toLowerCase() ?? null,
			safeAddr?.toLowerCase() ?? null,
			bnbAddr?.toLowerCase() ?? null,
			solAddr ?? null,
			limitlessAddr?.toLowerCase() ?? null,
		],
		enabled,
		staleTime: COLLATERAL_TOKENS_STALE_TIME_MS,
		queryFn: () =>
			readFundingStableBalancesHuman({
				baseSmartWallet: baseAddr ?? null,
				polymarketSafe: safeAddr ?? null,
				embeddedEoa: bnbAddr ?? null,
				solanaAddress: solAddr ?? null,
				limitlessMakerBase: limitlessAddr ?? null,
			}),
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
			isFetched: query.isFetched,
			isPending: query.isPending,
			refetch,
		};
	}, [query.data, query.isFetched, query.isPending, refetch]);

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
