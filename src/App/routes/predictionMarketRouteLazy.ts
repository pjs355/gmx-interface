/** Single dynamic import for the umbrella trading route — shared by `lazy()` and preload. */
export function loadPredictionMarketPage() {
	return import("@/pages/PredictionMarket/PredictionMarket");
}

export function preloadPredictionMarketRoute(): void {
	void loadPredictionMarketPage();
}
