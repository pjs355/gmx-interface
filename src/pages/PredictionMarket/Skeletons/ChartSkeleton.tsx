import "./Skeletons.scss";

export const ChartSkeleton = () => {
	return (
		<div className="chart-skeleton">
			<div className="chart-skeleton-header">
				<div className="chart-skeleton-titles">
					<div className="skeleton-shimmer chart-skeleton-market-line" />
					<div className="skeleton-shimmer chart-skeleton-market-line chart-skeleton-market-line--secondary" />
				</div>
				<div className="skeleton-shimmer chart-skeleton-logo" />
			</div>

			<div className="chart-skeleton-main">
				<div className="chart-skeleton-plot-wrap">
					<div className="skeleton-shimmer chart-skeleton-chart-area" />
					<div className="chart-skeleton-time-range" aria-hidden="true">
						<div className="skeleton-shimmer chart-skeleton-time-pill" />
						<div className="skeleton-shimmer chart-skeleton-time-pill" />
					</div>
				</div>
				<div className="chart-skeleton-venues">
					<div className="skeleton-shimmer chart-skeleton-venue-chip" />
					<div className="skeleton-shimmer chart-skeleton-venue-chip" />
					<div className="skeleton-shimmer chart-skeleton-venue-chip" />
					<div className="skeleton-shimmer chart-skeleton-venue-chip" />
				</div>
			</div>
		</div>
	);
};
