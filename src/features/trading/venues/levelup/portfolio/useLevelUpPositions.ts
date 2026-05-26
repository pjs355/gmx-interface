import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePredictionData } from "context/PredictionDataContext";
import { usePrivateApiClient } from "@/features/trading/hooks/usePrivateApiClient";
import type { VenuePosition } from "@/types/trading/venuePosition";
import { buildLevelUpMarketMetaMap, type LevelUpMarketMeta } from "./buildLevelUpMarketMetaMap";
import { getLevelUpMarketBalance, readLevelUpSideShares } from "./levelUpVenuePositionReads";
import { levelUpQueryKeys, LEVELUP_QUERY_ROOT } from "../levelUpQueryKeys";
import type { LevelUpPositionsSource, LevelUpTokenBalance } from "./levelUpTokenBalanceTypes";

export type LevelUpPositionsStatus = "idle" | "pending" | "success" | "error";

export type UseLevelUpPositionsResult = {
	rows: VenuePosition[];
	readSideShares: (marketId: string, side: "yes" | "no") => number;
	getMarketBalance: (marketId: string) => LevelUpTokenBalance | null;
	source: LevelUpPositionsSource;
	status: LevelUpPositionsStatus;
	error: string | null;
	isFetched: boolean;
	isLoading: boolean;
	refetch: (options?: { force?: boolean }) => Promise<void>;
};

function normalizeWalletAddress(walletAddress: string | null | undefined): string | null {
	const trimmed = walletAddress?.trim();
	if (!trimmed) return null;
	return trimmed;
}

function statusOf(
	isFetched: boolean,
	isPending: boolean,
	isError: boolean,
	enabled: boolean,
): LevelUpPositionsStatus {
	if (!enabled) return "idle";
	if (isPending) return "pending";
	if (isError) return "error";
	if (isFetched) return "success";
	return "idle";
}

/**
 * LevelUp outcome shares via predictions-api → Base CTF RPC on server.
 * Owned by `AccountDataContext.positions.levelup`.
 */
export function useLevelUpPositions(
	walletAddress: string | null | undefined,
): UseLevelUpPositionsResult {
	const api = usePrivateApiClient();
	const wallet = normalizeWalletAddress(walletAddress);
	const walletKey = wallet?.toLowerCase() ?? null;

	const { umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella } = usePredictionData();

	const marketMetaById = useMemo(
		() =>
			buildLevelUpMarketMetaMap(
				Array.isArray(umbrellas) ? umbrellas : [],
				getAllQuestionsForUmbrella,
				resolvedMarketsByUmbrella,
			),
		[umbrellas, getAllQuestionsForUmbrella, resolvedMarketsByUmbrella],
	);

	const enabled = Boolean(walletKey);

	const query = useQuery<VenuePosition[]>({
		queryKey: walletKey
			? levelUpQueryKeys.positions(walletKey)
			: ([...LEVELUP_QUERY_ROOT, "positions", "__disabled__"] as const),
		enabled,
		staleTime: 30_000,
		queryFn: async () => api.getLevelUpPositions(),
	});

	const rows = query.data ?? [];

	const readSideShares = useCallback(
		(marketId: string, side: "yes" | "no") => readLevelUpSideShares(rows, marketId, side),
		[rows],
	);

	const getMarketBalance = useCallback(
		(marketId: string) =>
			getLevelUpMarketBalance(
				rows,
				marketMetaById as ReadonlyMap<string, LevelUpMarketMeta>,
				marketId,
			),
		[rows, marketMetaById],
	);

	const refetch = useCallback(
		async (_options?: { force?: boolean }) => {
			await query.refetch();
		},
		[query.refetch],
	);

	const status = statusOf(query.isFetched, query.isPending, query.isError, enabled);
	const source: LevelUpPositionsSource =
		enabled && query.isFetched && !query.isError ? "api" : "none";
	const error = query.error
		? query.error instanceof Error
			? query.error.message
			: String(query.error)
		: null;

	return useMemo(
		() => ({
			rows,
			readSideShares,
			getMarketBalance,
			source,
			status,
			error,
			isFetched: query.isFetched,
			isLoading: query.isPending,
			refetch,
		}),
		[
			rows,
			readSideShares,
			getMarketBalance,
			source,
			status,
			error,
			query.isFetched,
			query.isPending,
			refetch,
		],
	);
}

export type { LevelUpTokenBalance, LevelUpPositionsSource };
