import { useMedia } from "react-use";
import { ChartSkeleton } from "./ChartSkeleton";
import { TradeBoxSkeleton } from "./TradeBoxSkeleton";
import "./Skeletons.scss";

/**
 * Full-page loading state for the umbrella trading page. Mirrors the real
 * layout instead of a lone bar: desktop = chart + odds on the left, trade rail
 * on the right; mobile = back chip, title, chart, tab switch, odds card.
 */
const OddsCardSkeleton = () => (
	<div className="pm-skeleton__odds">
		<div className="skeleton-shimmer pm-skeleton__section-label" />
		<div className="pm-skeleton__odds-card">
			{[0, 1, 2].map((i) => (
				<div className="pm-skeleton__odds-row" key={i}>
					<div className="skeleton-shimmer pm-skeleton__odds-venue" />
					<div className="skeleton-shimmer pm-skeleton__odds-cell" />
					<div className="skeleton-shimmer pm-skeleton__odds-cell" />
				</div>
			))}
		</div>
	</div>
);

export const PredictionMarketSkeleton = () => {
	const isDesktop = useMedia("(min-width: 1101px)");

	if (isDesktop) {
		return (
			<div className="pm-skeleton pm-skeleton--desktop" aria-busy aria-label="Loading market">
				<div className="pm-skeleton__main">
					<div className="skeleton-shimmer pm-skeleton__title" />
					<ChartSkeleton />
					<OddsCardSkeleton />
				</div>
				<div className="pm-skeleton__rail">
					<TradeBoxSkeleton />
				</div>
			</div>
		);
	}

	return (
		<div className="pm-skeleton pm-skeleton--mobile" aria-busy aria-label="Loading market">
			<div className="skeleton-shimmer pm-skeleton__back" />
			<div className="skeleton-shimmer pm-skeleton__title" />
			<div className="skeleton-shimmer pm-skeleton__title pm-skeleton__title--line2" />
			<ChartSkeleton />
			<div className="pm-skeleton__tabs">
				<div className="skeleton-shimmer pm-skeleton__tab" />
				<div className="skeleton-shimmer pm-skeleton__tab" />
			</div>
			<OddsCardSkeleton />
		</div>
	);
};
