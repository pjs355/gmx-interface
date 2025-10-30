import "./Skeletons.scss";

export const ChartSkeleton = () => {
	return (
		<div className="chart-skeleton">
			<div className="chart-skeleton-header">
				<div className="skeleton-shimmer skeleton-title" />
				<div className="chart-skeleton-tabs">
					<div className="skeleton-shimmer skeleton-tab" />
					<div className="skeleton-shimmer skeleton-tab" />
					<div className="skeleton-shimmer skeleton-tab" />
					<div className="skeleton-shimmer skeleton-tab" />
				</div>
			</div>
			<div className="chart-skeleton-body">
				<div className="skeleton-shimmer skeleton-chart-area" />
			</div>
		</div>
	);
};
