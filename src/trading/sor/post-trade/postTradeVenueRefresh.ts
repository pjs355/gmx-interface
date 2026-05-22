/**
 * Per-venue post-trade hydration registry.
 *
 * Each key is one venue's "where do shares / cost / marks come from after a fill?"
 * Call only the venues that filled so changing LevelUp does not touch Polymarket, etc.
 *
 * | Venue       | Share count source              | Avg / cost / trade rows        |
 * |-------------|---------------------------------|--------------------------------|
 * | levelup     | Base CTF `balanceOf` (RPC)      | GET `/orders/:wallet` (API)    |
 * | polymarket  | Polymarket Data API (HTTP)      | same row (avg on position)     |
 * | predictfun  | Predict API via private proxy   | matches + position row       |
 * | dflow       | Private API (server Solana RPC) | on-chain trades API            |
 * | limitless   | Limitless partner API (proxy)   | portfolio / history APIs       |
 *
 * LevelUp RPC vs API: share **counts** are on-chain truth; the browser (or our API)
 * reads CTF `balanceOf`. Fills and avg price are always our order book API. There is
 * a per-market `GET /api/positions/balances` on predictions-api but the client today
 * batch-reads all catalog token IDs via RPC in `UserDataContext.refreshTokenPositions`.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { AccountVenueKey } from "@/context/AccountDataContext";

export type PostTradeAccountRefetch = {
	refreshVenuePositions: (venue?: AccountVenueKey) => Promise<void>;
	refreshCash: () => Promise<void>;
};
import type { VenueId } from "@/types/trading/venuePosition";
import { COLLATERAL_TOKENS_QUERY_KEY } from "@/context/CollateralTokenContext";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/trading/hooks/useBridgeFundingBalances";
import { LIMITLESS_QUERY_ROOT } from "@/trading/venues/limitless/trade/limitlessQueryKeys";
import { debugLimitlessPortfolio } from "@/trading/venues/limitless/portfolio/limitlessPortfolioDebug";

/** Venue keys used in the post-trade refresh registry (matches `VenueId`). */
export type PostTradeVenueRefreshKey = VenueId;

export type PostTradeVenueRefreshContext = {
	queryClient: QueryClient;
	account: PostTradeAccountRefetch;
	/** LevelUp outcome shares — maps RPC balances into `UserDataContext.tokenBalances`. */
	refreshLevelUpTokenPositions: () => Promise<void>;
	/** LevelUp filled orders — `GET /orders/:wallet` → `UserDataContext.orders`. */
	refreshLevelUpOrders: () => Promise<void>;
};

export type PostTradeVenueRefreshRegistry = Record<
	PostTradeVenueRefreshKey,
	() => Promise<void>
>;

/** Map `AccountDataContext` refresh keys to registry keys. */
export function accountVenueKeyToRefreshKey(
	venue: AccountVenueKey,
): PostTradeVenueRefreshKey {
	switch (venue) {
		case "polymarket":
			return "polymarket";
		case "predict":
			return "predictfun";
		case "dflow":
			return "dflow";
		case "limitless":
			return "limitless";
	}
}

/**
 * Human-readable registry: one function per venue, all post-trade hydration for that venue.
 */
export function createPostTradeVenueRefreshRegistry(
	ctx: PostTradeVenueRefreshContext,
): PostTradeVenueRefreshRegistry {
	const { queryClient, account } = ctx;

	return {
		polymarket: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["polymarket-positions"],
			});
			await account.refreshVenuePositions("polymarket");
		},

		predictfun: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["predict-positions"],
			});
			await account.refreshVenuePositions("predict");
			await queryClient.refetchQueries({
				queryKey: ["predict-market"],
				type: "all",
			});
		},

		dflow: async () => {
			await queryClient.invalidateQueries({
				queryKey: ["dflow-positions"],
			});
			await account.refreshVenuePositions("dflow");
			await queryClient.refetchQueries({
				queryKey: ["dflow-outcome-balance"],
				type: "all",
			});
		},

		limitless: async () => {
			await queryClient.invalidateQueries({
				queryKey: [...LIMITLESS_QUERY_ROOT],
			});
			await account.refreshVenuePositions("limitless");
			await queryClient.refetchQueries({
				queryKey: [COLLATERAL_TOKENS_QUERY_KEY],
				type: "all",
			});
			debugLimitlessPortfolio("postTradeVenueRefresh: limitless", {
				queryKey: [...LIMITLESS_QUERY_ROOT],
			});
		},

		levelup: async () => {
			await Promise.all([
				ctx.refreshLevelUpTokenPositions(),
				ctx.refreshLevelUpOrders(),
			]);
		},
	};
}

/** Run one venue refresh in isolation (errors propagate to caller). */
export async function runPostTradeVenueRefresh(
	registry: PostTradeVenueRefreshRegistry,
	venue: PostTradeVenueRefreshKey,
): Promise<void> {
	const fn = registry[venue];
	if (!fn) {
		throw new Error(`postTradeVenueRefresh: unknown venue ${venue}`);
	}
	await fn();
}

/** Run several venue refreshes in parallel (one failure does not cancel others). */
export async function runPostTradeVenueRefreshes(
	registry: PostTradeVenueRefreshRegistry,
	venues: readonly PostTradeVenueRefreshKey[],
): Promise<PromiseSettledResult<void>[]> {
	return Promise.allSettled(
		venues.map((v) => runPostTradeVenueRefresh(registry, v)),
	);
}

/** Collateral / cash caches — not tied to a single share venue. */
export async function runPostTradeCashRefresh(
	queryClient: QueryClient,
	account: PostTradeAccountRefetch,
): Promise<void> {
	await Promise.allSettled([
		queryClient.invalidateQueries({
			queryKey: [BRIDGE_FUNDING_BALANCES_QUERY_KEY],
		}),
		queryClient.invalidateQueries({ queryKey: [COLLATERAL_TOKENS_QUERY_KEY] }),
		account.refreshCash(),
	]);
}
