import { LIMITLESS_QUERY_ROOT } from "@/features/trading/venues/limitless/trade/limitlessQueryKeys";

export const tradingQueryKeys = {
	all: ["trading"] as const,
	profileMe: ["trading", "profileMe"] as const,
	accountOverview: (profileId: string) => ["trading", "accountOverview", profileId] as const,
	limitlessEnsureAccount: (profileId: string) =>
		[...LIMITLESS_QUERY_ROOT, "ensureAccount", profileId] as const,
	polymarketAccount: ["trading", "polymarketAccount"] as const,
	/**
	 * Canonical cache key for `GET /api/predict/account`. Owned by
	 * `AccountDataProvider`; ensure hooks must read from this key (via
	 * `qc.fetchQuery`) instead of calling `apiClient.getPredictAccount()`
	 * imperatively, otherwise the boot loses cache dedup.
	 */
	predictAccount: (profileId: string) => ["trading", "predictAccount", profileId] as const,
	/**
	 * Canonical cache key for `GET /api/dflow/account`. Matches the legacy
	 * `["dflow","account"]` key already used by `useDflowProofStatus` so the
	 * two queries dedupe through TanStack.
	 */
	dflowAccount: ["dflow", "account"] as const,
	lifiStatus: (txHash: string, tool?: string) =>
		["trading", "lifiStatus", txHash, tool ?? ""] as const,
	tradersLeaderboard: (type: string, sport: string, category: string, limit: number) =>
		["trading", "traders", "leaderboard", type, sport, category, limit] as const,
	tradersDashboard: (sport: string, category: string, limit: number, window: string = "all") =>
		["trading", "traders", "dashboard", sport, category, limit, window] as const,
	traderProfile: (address: string) =>
		["trading", "traders", "profile", address.toLowerCase()] as const,
	traderBets: (address: string, sport: string, limit: number, offset: number) =>
		["trading", "traders", "bets", address.toLowerCase(), sport, limit, offset] as const,
	tradersBigBets: (sport: string, window: string, limit: number, minSizeUsd: number) =>
		["trading", "traders", "big-bets", sport, window, limit, minSizeUsd] as const,
	tradersHotStreaks: (sport: string, category: string, limit: number, minStreak: number) =>
		["trading", "traders", "hot-streaks", sport, category, limit, minStreak] as const,
	traderOpenPositions: (address: string) =>
		["trading", "traders", "open-positions", address.toLowerCase()] as const,
	tradersBiggestWins: (sport: string, window: string, limit: number) =>
		["trading", "traders", "biggest-wins", sport, window, limit] as const,
	tradersBiggestLosses: (sport: string, window: string, limit: number) =>
		["trading", "traders", "biggest-losses", sport, window, limit] as const,
	tradersRanked: (
		metric: string,
		sport: string,
		window: string,
		category: string,
		limit: number,
	) =>
		["trading", "traders", "ranked", metric, sport, window, category, limit] as const,
	tradersNewWhales: (sport: string, limit: number, minVolumeUsd: number, maxAgeDays: number) =>
		["trading", "traders", "new-whales", sport, limit, minVolumeUsd, maxAgeDays] as const,
	tradersComboLeaderboard: (type: string, sport: string, window: string, limit: number) =>
		["trading", "traders", "combo-leaderboard", type, sport, window, limit] as const,
	tradersBiggestComboWins: (sport: string, window: string, limit: number) =>
		["trading", "traders", "biggest-combo-wins", sport, window, limit] as const,
	tradersLiveCombos: (sport: string, limit: number) =>
		["trading", "traders", "live-combos", sport, limit] as const,
	traderClosedLots: (address: string, limit: number) =>
		["trading", "traders", "closed-lots", address.toLowerCase(), limit] as const,
	traderPnlHistory: (address: string, window: string, sport: string) =>
		["trading", "traders", "pnl-history", address.toLowerCase(), window, sport] as const,
	traderStats: (address: string, window: string, sport: string) =>
		["trading", "traders", "stats", address.toLowerCase(), window, sport] as const,
	traderComboPositions: (address: string, limit: number) =>
		["trading", "traders", "combo-positions", address.toLowerCase(), limit] as const,
};
