import { LIMITLESS_QUERY_ROOT } from "@/trading/venues/limitless/trade/limitlessQueryKeys";

export const tradingQueryKeys = {
	all: ["trading"] as const,
	profileMe: ["trading", "profileMe"] as const,
	accountOverview: (profileId: string) =>
		["trading", "accountOverview", profileId] as const,
	limitlessEnsureAccount: (profileId: string) =>
		[...LIMITLESS_QUERY_ROOT, "ensureAccount", profileId] as const,
	polymarketAccount: ["trading", "polymarketAccount"] as const,
	/**
	 * Canonical cache key for `GET /api/predict/account`. Owned by
	 * `AccountDataProvider`; ensure hooks must read from this key (via
	 * `qc.fetchQuery`) instead of calling `apiClient.getPredictAccount()`
	 * imperatively, otherwise the boot loses cache dedup.
	 */
	predictAccount: (profileId: string) =>
		["trading", "predictAccount", profileId] as const,
	/**
	 * Canonical cache key for `GET /api/dflow/account`. Matches the legacy
	 * `["dflow","account"]` key already used by `useDflowProofStatus` so the
	 * two queries dedupe through TanStack.
	 */
	dflowAccount: ["dflow", "account"] as const,
	lifiStatus: (txHash: string, tool?: string) =>
		["trading", "lifiStatus", txHash, tool ?? ""] as const,
};
