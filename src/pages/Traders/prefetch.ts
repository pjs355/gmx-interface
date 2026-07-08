import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { tradingQueryKeys } from "@/features/trading/queryKeys";
import {
	whaleTrackerService,
	type TraderMetric,
	type TraderSportFilter,
	type TraderWindow,
} from "@/services/api/whaleTrackerService";

/**
 * Returns a callback that prefetches the trader profile + open positions
 * for a given wallet. Wire to `onMouseEnter` / `onFocus` on leaderboard row
 * links so the profile page is warm by the time the user actually clicks.
 *
 * React Query dedupes in-flight fetches, so calling this on every hover is
 * cheap — no throttling needed.
 */
const ALL_WINDOWS: TraderWindow[] = ["today", "week", "month", "all"];
const ALL_METRICS: TraderMetric[] = ["pnl", "roi", "volume"];
const PREFETCH_LIMIT = 50;
const PREFETCH_STALE_MS = 10 * 60_000;

type PrefetchLensKey =
	| "traders"
	| "bigBets"
	| "hotStreaks"
	| "newWhales"
	| "comboTraders"
	| "bestCombos"
	| "biggestLosers"
	| "biggestLosses";

const COMBO_TYPE_BY_METRIC = {
	pnl: "combo-top-winners",
	roi: "combo-top-roi",
	volume: "combo-biggest-bettors",
} as const;

/**
 * Background-warm every leaderboard combo that is exactly one click away
 * from the current view, so window / metric / lens tab changes hit the
 * React Query cache and render instantly (the Polymarket-leaderboard feel).
 *
 * Fired only once the ACTIVE query has data (`ready`), so prefetches never
 * compete with the fetch the user is waiting on. prefetchQuery dedupes
 * against fresh cache entries, so re-running on every state change is free.
 */
export function usePrefetchSiblingCombos(args: {
	sport: TraderSportFilter;
	window: TraderWindow;
	lensKey: PrefetchLensKey;
	metric: TraderMetric;
	ready: boolean;
}) {
	const qc = useQueryClient();
	const { sport, window, lensKey, metric, ready } = args;

	useEffect(() => {
		if (!ready) return;
		const timers: ReturnType<typeof setTimeout>[] = [];

		const prefetchCombo = (lens: PrefetchLensKey, w: TraderWindow, m: TraderMetric) => {
			if (lens === "traders") {
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersRanked(m, sport, w, "trader", PREFETCH_LIMIT),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchRanked(
							{ metric: m, sport, window: w, category: "trader", limit: PREFETCH_LIMIT },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			} else if (lens === "bigBets") {
				// Both sub-views: live trades + won lots.
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersBigBets(sport, w, PREFETCH_LIMIT, 1000),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchBigBets(
							{ sport, window: w, limit: PREFETCH_LIMIT, minSizeUsd: 1000 },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersBiggestWins(sport, w, PREFETCH_LIMIT),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchBiggestWins(
							{ sport, window: w, limit: PREFETCH_LIMIT },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			} else if (lens === "hotStreaks") {
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersHotStreaks(sport, "trader", PREFETCH_LIMIT, 3),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchHotStreaks(
							{ sport, category: "trader", limit: PREFETCH_LIMIT, minStreak: 3 },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			} else if (lens === "newWhales") {
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersNewWhales(sport, PREFETCH_LIMIT, 10_000, 30),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchNewWhales(
							{ sport, limit: PREFETCH_LIMIT, minVolumeUsd: 10_000, maxAgeDays: 30 },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			} else if (lens === "comboTraders") {
				const type = COMBO_TYPE_BY_METRIC[m];
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersComboLeaderboard(type, sport, w, PREFETCH_LIMIT),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchComboLeaderboard(
							{ type, sport, window: w, limit: PREFETCH_LIMIT },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			} else if (lens === "bestCombos") {
				// Both sub-views: live combos (windowless) + won combos.
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersLiveCombos(sport, PREFETCH_LIMIT),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchBiggestLiveCombos(
							{ sport, limit: PREFETCH_LIMIT },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersBiggestComboWins(sport, w, PREFETCH_LIMIT),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchBiggestComboWins(
							{ sport, window: w, limit: PREFETCH_LIMIT },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			} else if (lens === "biggestLosers") {
				// Trader-level losers — same dashboard payload the lens reads.
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersDashboard(sport, "trader", PREFETCH_LIMIT, w),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchDashboard(
							{ sport, category: "trader", limit: PREFETCH_LIMIT, window: w },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			} else {
				void qc.prefetchQuery({
					queryKey: tradingQueryKeys.tradersBiggestLosses(sport, w, PREFETCH_LIMIT),
					queryFn: ({ signal }) =>
						whaleTrackerService.fetchBiggestLosses(
							{ sport, window: w, limit: PREFETCH_LIMIT },
							signal,
						),
					staleTime: PREFETCH_STALE_MS,
				});
			}
		};

		// Priority order — the most likely next click warms first so it never
		// competes for bandwidth with long-shot combos:
		// 1. Other windows for the current lens (window tab clicks) — NOW.
		//    Today/Week/Month/All must be instant the moment the page settles.
		for (const w of ALL_WINDOWS) {
			if (w !== window) prefetchCombo(lensKey, w, metric);
		}
		// 2. Other metrics for the metric-tabbed lenses — shortly after.
		if (lensKey === "traders" || lensKey === "comboTraders") {
			timers.push(
				setTimeout(() => {
					for (const m of ALL_METRICS) {
						if (m !== metric) prefetchCombo(lensKey, window, m);
					}
				}, 250),
			);
		}
		// 3. Every other lens at the current sport+window (lens tab clicks),
		//    staggered so they trickle in behind the window/metric warms.
		const lenses: PrefetchLensKey[] = [
			"traders",
			"bigBets",
			"hotStreaks",
			"newWhales",
			"comboTraders",
			"bestCombos",
			"biggestLosers",
			"biggestLosses",
		];
		lenses
			.filter((l) => l !== lensKey)
			.forEach((l, i) => {
				timers.push(setTimeout(() => prefetchCombo(l, window, metric), 600 + i * 150));
			});
		return () => timers.forEach(clearTimeout);
	}, [qc, sport, window, lensKey, metric, ready]);
}

/**
 * Warm everything the profile page renders for one wallet: the profile doc
 * (header, stats, live positions — open positions ride along on it) plus
 * closed lots and combo positions for the bets tabs. MUST mirror the query
 * keys + fetch params in `useTraderProfile` / `useTraderClosedLots` /
 * `useTraderComboPositions` or the prefetch silently warms nothing.
 */
const PROFILE_LOTS_LIMIT = 50;

function prefetchWalletBundle(
	qc: ReturnType<typeof useQueryClient>,
	lowered: string,
	options?: { retry?: false },
): void {
	void qc.prefetchQuery({
		queryKey: tradingQueryKeys.traderProfile(lowered),
		queryFn: ({ signal }) => whaleTrackerService.fetchProfile(lowered, signal),
		staleTime: 10 * 60_000,
		...(options ?? {}),
	});
	// MUST be prefetchInfiniteQuery: `useTraderClosedLots` is an infinite
	// query, so its cache entry has to be `{ pages, pageParams }`. Warming
	// this key with a plain prefetchQuery stores the raw response instead,
	// and the profile page then crashes inside getNextPageParam on first
	// navigation ("Cannot read properties of undefined (reading 'length')").
	void qc.prefetchInfiniteQuery({
		queryKey: tradingQueryKeys.traderClosedLots(lowered, PROFILE_LOTS_LIMIT),
		queryFn: ({ pageParam, signal }) =>
			whaleTrackerService.fetchWalletClosedLots(
				{
					address: lowered,
					sport: "all",
					window: "all",
					kind: "all",
					limit: PROFILE_LOTS_LIMIT,
					offset: pageParam,
				},
				signal,
			),
		initialPageParam: 0,
		staleTime: 10 * 60_000,
		...(options ?? {}),
	});
	void qc.prefetchQuery({
		queryKey: tradingQueryKeys.traderComboPositions(lowered, PROFILE_LOTS_LIMIT),
		queryFn: ({ signal }) =>
			whaleTrackerService.fetchWalletComboPositions(
				{ address: lowered, status: "all", sport: "all", limit: PROFILE_LOTS_LIMIT },
				signal,
			),
		staleTime: 10 * 60_000,
		...(options ?? {}),
	});
}

/**
 * Eagerly warm the full profile-page bundle for every wallet currently
 * visible in the leaderboard, staggered ~100ms apart so we never stampede
 * the API. By the time a user reads a row and decides to click it, the
 * whole page is cached and renders with zero loading states.
 */
export function usePrefetchVisibleProfiles(wallets: string[]) {
	const qc = useQueryClient();
	// Join for a stable dependency — the wallet list identity changes on
	// every render but its contents rarely do.
	const key = wallets.join(",");
	useEffect(() => {
		if (!key) return;
		let cancelled = false;
		const timers: ReturnType<typeof setTimeout>[] = [];
		key.split(",").forEach((wallet, i) => {
			if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return;
			const t = setTimeout(() => {
				if (cancelled) return;
				prefetchWalletBundle(qc, wallet.toLowerCase(), { retry: false });
			}, 200 + i * 100);
			timers.push(t);
		});
		return () => {
			cancelled = true;
			timers.forEach(clearTimeout);
		};
	}, [qc, key]);
}

export function usePrefetchTraderProfile() {
	const qc = useQueryClient();
	return (wallet: string) => {
		if (!wallet || !/^0x[0-9a-fA-F]{40}$/.test(wallet)) return;
		prefetchWalletBundle(qc, wallet.toLowerCase());
	};
}
