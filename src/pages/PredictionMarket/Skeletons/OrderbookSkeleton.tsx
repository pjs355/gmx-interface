import "./Skeletons.scss";

export const OrderbookSkeleton = () => {
	return (
		<div className="orderbook-skeleton">
			<div className="orderbook-skeleton-header">
				<div className="skeleton-shimmer skeleton-title-small" />
				<div className="skeleton-shimmer skeleton-icon" />
			</div>
			<div className="orderbook-skeleton-body">
				{[...Array(8)].map((_, i) => (
					<div key={i} className="orderbook-skeleton-row">
						<div className="skeleton-shimmer skeleton-price" />
						<div className="skeleton-shimmer skeleton-amount" />
					</div>
				))}
			</div>
		</div>
	);
};
