export const LIMITLESS_QUERY_ROOT = ["trading", "limitless"] as const;

export const limitlessQueryKeys = {
	root: LIMITLESS_QUERY_ROOT,
	positionsVenue: [...LIMITLESS_QUERY_ROOT, "positionsVenue"] as const,
	openOrders: [...LIMITLESS_QUERY_ROOT, "openOrders"] as const,
	portfolioHistory: [...LIMITLESS_QUERY_ROOT, "portfolioHistory"] as const,
};
