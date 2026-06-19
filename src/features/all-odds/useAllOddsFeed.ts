import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TeamMapping } from "@/features/markets/listing/matchProps";
import { allOddsVenueFieldPairs } from "./adapters";
import type { AllOddsExchangeMatching, AllOddsGroup, AllOddsMarket } from "./types";
import { applyVenueSnapshotsToMarkets } from "./venueSnapshotMerge";
import { isActiveAllOddsMarket } from "./allOddsFreshness";
import { isMlbGameSlug } from "@/pages/Predictions/utils/gameLinkFilters";
import {
	useAllOddsPageQuery,
	type AllOddsSportFilter,
	type MatchedMarketsApiItem,
} from "@/features/markets/queries/matchedMarketsQuery";
import {
	getVenuePricesClient,
	subscribeVenuePricesClient,
	getVenuePricesConnectedSnapshot,
	getVenuePricesLastErrorSnapshot,
} from "@/services/venuePricesClient";
import { useAllOddsVenueSubscription } from "@/context/AllOddsVenueSubscriptionContext";
import { buildAllOddsGroups } from "./allOddsViewModel";
import { useSyncExternalStore } from "react";

function pickPriceFields(m: AllOddsMarket): Partial<AllOddsMarket> {
	return {
		polyPriceA: m.polyPriceA,
		polyPriceB: m.polyPriceB,
		predictFunPriceA: m.predictFunPriceA,
		predictFunPriceB: m.predictFunPriceB,
		limitlessPriceA: m.limitlessPriceA,
		limitlessPriceB: m.limitlessPriceB,
		kalshiPriceA: m.kalshiPriceA,
		kalshiPriceB: m.kalshiPriceB,
		myraidPriceA: m.myraidPriceA,
		myraidPriceB: m.myraidPriceB,
		betdexPriceA: m.betdexPriceA,
		betdexPriceB: m.betdexPriceB,
		forkastPriceA: m.forkastPriceA,
		forkastPriceB: m.forkastPriceB,
		sxbetPriceA: m.sxbetPriceA,
		sxbetPriceB: m.sxbetPriceB,
		hyperliquidPriceA: m.hyperliquidPriceA,
		hyperliquidPriceB: m.hyperliquidPriceB,
	};
}

function apiItemToAllOddsMarket(item: MatchedMarketsApiItem): AllOddsMarket {
	const umbrellaId = item.umbrellaId ? String(item.umbrellaId).trim() : undefined;
	return {
		pandaMatchId: item.pandaMatchId,
		umbrellaId: umbrellaId || undefined,
		displayName: item.displayName,
		game: item.game,
		status: item.status,
		eventDate:
			typeof item.eventDate === "string" && item.eventDate.trim().length > 0
				? item.eventDate.trim()
				: undefined,
		pandaTeamA: item.pandaTeamA,
		pandaTeamB: item.pandaTeamB,
		homeTeamName: item.homeTeamName,
		awayTeamName: item.awayTeamName,
		moneylineLeg: item.moneylineLeg,
		marketType: item.marketType,
		segment: typeof item.segment === "string" ? item.segment.trim() || undefined : undefined,
		sortOrder:
			typeof item.sortOrder === "number" && Number.isFinite(item.sortOrder)
				? item.sortOrder
				: undefined,
		teamMappings: item.teamMappings as TeamMapping[] | undefined,
		exchangeMatching: item.exchangeMatching as AllOddsExchangeMatching | undefined,
		polyPriceA: null,
		polyPriceB: null,
		predictFunPriceA: null,
		predictFunPriceB: null,
		limitlessPriceA: null,
		limitlessPriceB: null,
		kalshiPriceA: null,
		kalshiPriceB: null,
		myraidPriceA: null,
		myraidPriceB: null,
		betdexPriceA: null,
		betdexPriceB: null,
		forkastPriceA: null,
		forkastPriceB: null,
		sxbetPriceA: null,
		sxbetPriceB: null,
		hyperliquidPriceA: null,
		hyperliquidPriceB: null,
	};
}

function buildAllOddsMarketsFromApi(
	items: MatchedMarketsApiItem[],
	prevMap: Map<string, AllOddsMarket>,
): Map<string, AllOddsMarket> {
	const next = new Map<string, AllOddsMarket>();
	for (const item of items) {
		const pid = String(item.pandaMatchId ?? "").trim();
		if (!pid) continue;
		if (isMlbGameSlug(item.game)) continue;
		const prev = prevMap.get(pid);
		const fresh = apiItemToAllOddsMarket(item);
		if (!isActiveAllOddsMarket(fresh)) continue;
		if (prev) {
			next.set(pid, { ...fresh, ...pickPriceFields(prev) });
		} else {
			next.set(pid, fresh);
		}
	}
	return next;
}

export interface UseAllOddsFeedOptions {
	page: number;
	sport: AllOddsSportFilter;
	q: string;
}

export interface UseAllOddsFeedResult {
	markets: AllOddsMarket[];
	groups: AllOddsGroup[];
	connected: boolean;
	error: string | null;
	loading: boolean;
	isFetching: boolean;
	page: number;
	totalPages: number;
	totalGroups: number;
}

export function useAllOddsFeed({ page, sport, q }: UseAllOddsFeedOptions): UseAllOddsFeedResult {
	const { setPagePandaMatchIds } = useAllOddsVenueSubscription();
	const {
		data: pageData,
		isLoading,
		isFetching,
		isError,
		error: queryError,
	} = useAllOddsPageQuery(page, sport, q, true);

	const connected = useSyncExternalStore(
		subscribeVenuePricesClient,
		getVenuePricesConnectedSnapshot,
		getVenuePricesConnectedSnapshot,
	);

	const lastWsError = useSyncExternalStore(
		subscribeVenuePricesClient,
		getVenuePricesLastErrorSnapshot,
		getVenuePricesLastErrorSnapshot,
	);

	const marketsRef = useRef(new Map<string, AllOddsMarket>());
	const [markets, setMarkets] = useState<AllOddsMarket[]>([]);
	const rafSyncRef = useRef<number | null>(null);

	const syncMarketsState = useCallback(() => {
		if (rafSyncRef.current !== null) return;
		rafSyncRef.current = requestAnimationFrame(() => {
			rafSyncRef.current = null;
			setMarkets(Array.from(marketsRef.current.values()));
		});
	}, []);

	useEffect(() => {
		if (!pageData?.rows?.length) {
			marketsRef.current = new Map();
			syncMarketsState();
			return;
		}
		marketsRef.current = buildAllOddsMarketsFromApi(pageData.rows, marketsRef.current);
		syncMarketsState();
	}, [pageData?.rows, syncMarketsState]);

	useEffect(() => {
		setPagePandaMatchIds(pageData?.pandaMatchIds ?? []);
	}, [pageData?.pandaMatchIds, setPagePandaMatchIds]);

	useEffect(() => {
		const client = getVenuePricesClient();
		return client.subscribeRawSnapshots((snapshots) => {
			const changed = applyVenueSnapshotsToMarkets(
				marketsRef.current,
				snapshots.filter((snap) => marketsRef.current.has(snap.pandaMatchId)),
				(venue) => allOddsVenueFieldPairs(venue),
			);
			if (changed) syncMarketsState();
		});
	}, [syncMarketsState]);

	const groups = useMemo(
		() => buildAllOddsGroups(markets.filter((m) => !isMlbGameSlug(m.game))),
		[markets],
	);

	const loading = !pageData && (isLoading || isFetching);

	const error = isError
		? queryError instanceof Error
			? queryError.message
			: String(queryError)
		: lastWsError;

	return {
		markets,
		groups,
		connected,
		error,
		loading,
		isFetching,
		page: pageData?.page ?? page,
		totalPages: pageData?.totalPages ?? 1,
		totalGroups: pageData?.totalGroups ?? 0,
	};
}
