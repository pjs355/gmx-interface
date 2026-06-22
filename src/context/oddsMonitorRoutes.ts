/** Routes where the venue-prices WebSocket and matched-markets feed are active. */
export function routeNeedsOddsMonitor(pathname: string): boolean {
	if (pathname === "/") return true;
	if (pathname.startsWith("/predictions/umbrella/")) return true;
	if (pathname.startsWith("/positions")) return true;
	return false;
}

/** Full GET /matched-markets catalog — all trading routes, not /all-odds. */
export function routeNeedsFullMatchedMarketsCatalog(pathname: string): boolean {
	return routeNeedsOddsMonitor(pathname);
}
