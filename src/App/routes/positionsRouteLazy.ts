/** Single dynamic import for the Positions route — shared by `lazy()` and preload. */
export function loadPositionsPage() {
	return import("@/pages/Positions/Positions");
}

export function preloadPositionsRoute(): void {
	void loadPositionsPage();
}
