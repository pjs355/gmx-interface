/**
 * Bounds for prices shown on prediction-market Recharts (matches live BBO gating).
 * Values outside this range are treated as bad ticks — not plotted or tooltipped.
 */
export const CHART_MIN_IMPLIED_PROB = 0.005;
export const CHART_MAX_IMPLIED_PROB = 0.995;

export const CHART_MIN_DISPLAY_PCT = CHART_MIN_IMPLIED_PROB * 100;
export const CHART_MAX_DISPLAY_PCT = CHART_MAX_IMPLIED_PROB * 100;

export function isValidChartImpliedProb(price: number): boolean {
	return (
		Number.isFinite(price) && price >= CHART_MIN_IMPLIED_PROB && price <= CHART_MAX_IMPLIED_PROB
	);
}

export function isValidChartDisplayPct(pct: number): boolean {
	return Number.isFinite(pct) && pct >= CHART_MIN_DISPLAY_PCT && pct <= CHART_MAX_DISPLAY_PCT;
}

export function impliedProbToChartDisplayPct(price: number): number | null {
	if (!isValidChartImpliedProb(price)) return null;
	return price * 100;
}

export function sanitizeChartDisplayPct(pct: number): number | null {
	if (!isValidChartDisplayPct(pct)) return null;
	return pct;
}
