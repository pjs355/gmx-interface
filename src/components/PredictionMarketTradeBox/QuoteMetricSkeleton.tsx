/**
 * Placeholder for numeric quote cells — scoped to value / subtitle slots only.
 * Prefer setting `aria-busy` on the interactive parent (e.g. value button).
 */
export type QuoteMetricSkeletonVariant = "smart-value" | "smart-sub" | "tradebox-value";

export default function QuoteMetricSkeleton({ variant }: { variant: QuoteMetricSkeletonVariant }) {
	return <span className={`quote-metric-skeleton quote-metric-skeleton--${variant}`} aria-hidden />;
}
