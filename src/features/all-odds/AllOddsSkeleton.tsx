import "@/pages/PredictionMarket/Skeletons/Skeletons.scss";
import "./AllOddsSkeleton.scss";

const VENUE_COLS = 8;
const GROUP_ROWS = 4;

function SkeletonGroupCard() {
	return (
		<div className="all-odds-skeleton__group" aria-hidden>
			<div className="all-odds-skeleton__group-header">
				<span className="all-odds-skeleton__logo skeleton-shimmer" />
				<span className="all-odds-skeleton__title skeleton-shimmer" />
			</div>
			<div className="all-odds-skeleton__table">
				<div className="all-odds-skeleton__row all-odds-skeleton__row--head">
					<span className="all-odds-skeleton__cell skeleton-shimmer" />
					{Array.from({ length: VENUE_COLS }).map((_, i) => (
						<span key={i} className="all-odds-skeleton__cell skeleton-shimmer" />
					))}
				</div>
				{Array.from({ length: GROUP_ROWS }).map((_, row) => (
					<div className="all-odds-skeleton__row" key={row}>
						<span className="all-odds-skeleton__cell skeleton-shimmer" />
						{Array.from({ length: VENUE_COLS }).map((_, col) => (
							<span key={col} className="all-odds-skeleton__cell skeleton-shimmer" />
						))}
					</div>
				))}
			</div>
		</div>
	);
}

export function AllOddsSkeleton() {
	return (
		<div className="all-odds-skeleton" aria-busy aria-label="Loading All Odds">
			<SkeletonGroupCard />
			<SkeletonGroupCard />
		</div>
	);
}
