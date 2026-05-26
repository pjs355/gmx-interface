export const LEVELUP_QUERY_ROOT = ["levelup"] as const;

export const levelUpQueryKeys = {
	root: LEVELUP_QUERY_ROOT,
	orders: (wallet: string) => [...LEVELUP_QUERY_ROOT, "orders", wallet.toLowerCase()] as const,
	positions: (wallet: string) =>
		[...LEVELUP_QUERY_ROOT, "positions", wallet.toLowerCase()] as const,
	approvals: (wallet: string) =>
		[...LEVELUP_QUERY_ROOT, "approvals", wallet.toLowerCase()] as const,
};
