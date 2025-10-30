import "./Skeletons.scss";

export const TradeBoxSkeleton = () => {
	return (
		<div className="tradebox-skeleton">
			<div className="tradebox-skeleton-header">
				<div className="skeleton-shimmer skeleton-title-small" />
			</div>
			<div className="tradebox-skeleton-tabs">
				<div className="skeleton-shimmer skeleton-tab-large" />
				<div className="skeleton-shimmer skeleton-tab-large" />
			</div>
			<div className="tradebox-skeleton-body">
				<div className="tradebox-skeleton-row">
					<div className="skeleton-shimmer skeleton-label" />
					<div className="skeleton-shimmer skeleton-value" />
				</div>
				<div className="tradebox-skeleton-row">
					<div className="skeleton-shimmer skeleton-label" />
					<div className="skeleton-shimmer skeleton-value" />
				</div>
				<div className="tradebox-skeleton-input">
					<div className="skeleton-shimmer skeleton-input-field" />
				</div>
				<div className="tradebox-skeleton-row">
					<div className="skeleton-shimmer skeleton-label" />
					<div className="skeleton-shimmer skeleton-value" />
				</div>
				<div className="skeleton-shimmer skeleton-button" />
			</div>
		</div>
	);
};
