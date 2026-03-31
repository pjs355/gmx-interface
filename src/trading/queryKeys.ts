export const tradingQueryKeys = {
	all: ["trading"] as const,
	profileMe: ["trading", "profileMe"] as const,
	accountOverview: (profileId: string) =>
		["trading", "accountOverview", profileId] as const,
	polymarketAccount: ["trading", "polymarketAccount"] as const,
	lifiStatus: (txHash: string, tool?: string) =>
		["trading", "lifiStatus", txHash, tool ?? ""] as const,
};
