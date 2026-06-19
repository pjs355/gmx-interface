/** Single dynamic import for All Odds — shared by `lazy()` and preload. */
export function loadAllOddsPage() {
	return import("@/pages/AllOdds/AllOddsPage");
}

export function preloadAllOddsRoute(): void {
	void loadAllOddsPage();
}
