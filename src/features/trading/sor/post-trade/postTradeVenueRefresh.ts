/**
 * Per-venue post-trade hydration registry.
 *
 * Each key is one venue's "where do shares / cost / marks come from after a fill?"
 * Call only the venues that filled so changing LevelUp does not touch Polymarket, etc.
 *
 * | Venue       | Share count source              | Avg / cost / trade rows        |
 * |-------------|---------------------------------|--------------------------------|
 * | levelup     | GET `/api/levelup/positions` (subgraph on boot) | GET `/orders/:wallet` (API)    |
 * |             | POST `/api/levelup/positions/refresh` (scoped RPC after trade) |                |
 * | polymarket  | Polymarket Data API (HTTP)      | same row (avg on position)     |
 * | predictfun  | Predict API via private proxy   | matches + position row       |
 * | dflow       | Private API (server Solana RPC) | on-chain trades API            |
 * | limitless   | Limitless partner API (proxy)   | portfolio / history APIs       |
 *
 * LevelUp share **counts**: subgraph on full reload (`GET /api/levelup/positions`);
 * after a fill, scoped RPC refresh (`POST /api/levelup/positions/refresh`) when tokenIds are known.
 * Fills and avg price are our order book API.
 */
import type { QueryClient } from "@tanstack/react-query";
import type { AccountVenueKey } from "@/context/AccountDataContext";
import { refetchLevelUpOrders } from "@/features/trading/venues/levelup/portfolio/refetchLevelUpOrders";
import { levelUpQueryKeys } from "@/features/trading/venues/levelup/levelUpQueryKeys";

export type PostTradeAccountRefetch = {
	refreshVenuePositions: (venue?: AccountVenueKey) => Promise<void>;
	refreshCash: () => Promise<void>;
	refreshLevelUpPositionsByTokenIds: (tokenIds: readonly string[]) => Promise<void>;
};
import type { VenueId } from "@/types/trading/venuePosition";
import { COLLATERAL_TOKENS_QUERY_KEY } from "@/context/CollateralTokenContext";
import { BRIDGE_FUNDING_BALANCES_QUERY_KEY } from "@/features/trading/hooks/useBridgeFundingBalances";
import { LIMITLESS_QUERY_ROOT } from "@/features/trading/venues/limitless/trade/limitlessQueryKeys";
import { debugLimitlessPortfolio } from "@/features/trading/venues/limitless/portfolio/limitlessPortfolioDebug";

/** Venue keys used in the post-trade refresh registry (matches `VenueId`). */
export type PostTradeVenueRefreshKey = VenueId;

export type PostTradeVenueRefreshContext = {
	queryClient: QueryClient;
	account: PostTradeAccountRefetch;
	/** VACM LevelUp SCW — `GET /orders/:wallet` cache key. */
	levelUpWallet: string | null;
	/** Outcome token IDs for scoped post-trade RPC refresh (filled LevelUp legs). */
	levelUpRefreshTokenIds?: readonly string[];
};

export type PostTradeVenueRefreshRegistry = Record<PostTradeVenueRefreshKey, () => Promise<void>>;

/** Map `AccountDataContext` refresh keys to registry keys. */
export function accountVenueKeyToRefreshKey(venue: AccountVenueKey): PostTradeVenueRefreshKey {
	switch (venue) {
		case "polymarket":
			return "polymarket";
		case "predict":
			return "predictfun";
		case "dflow":
			return "dflow";
		case "limitless":
			return "limitless";
		case "levelup":
			return "levelup";
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
			const tokenIds = (ctx.levelUpRefreshTokenIds ?? [])
				.map((id) => String(id ?? "").trim())
				.filter((id) => id.length > 0);

			if (tokenIds.length > 0) {
				await Promise.all([
					account.refreshLevelUpPositionsByTokenIds(tokenIds),
					refetchLevelUpOrders(ctx.queryClient, ctx.levelUpWallet),
				]);
				return;
			}

			if (ctx.levelUpWallet) {
				await queryClient.invalidateQueries({
					queryKey: levelUpQueryKeys.positions(ctx.levelUpWallet),
				});
			}
			await Promise.all([
				account.refreshVenuePositions("levelup"),
				refetchLevelUpOrders(ctx.queryClient, ctx.levelUpWallet),
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
	return Promise.allSettled(venues.map((v) => runPostTradeVenueRefresh(registry, v)));
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
