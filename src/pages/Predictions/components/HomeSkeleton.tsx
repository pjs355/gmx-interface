import React from "react";
import { useMedia } from "react-use";
import { TradeBoxSkeleton } from "@/pages/PredictionMarket/Skeletons/TradeBoxSkeleton";
import "@/pages/PredictionMarket/Skeletons/Skeletons.scss";
import "./HomeSkeleton.scss";

interface HomeSkeletonProps {
	filterType: "all" | "esports" | "games";
}

/** Mobile: horizontal chip strip. Desktop: vertical filter rows in the sidebar. */
const MOBILE_PILL_WIDTHS = [58, 66, 122, 92, 78, 104, 70];
const DESKTOP_ROW_WIDTHS = [55, 70, 46, 62, 50, 66, 44, 58];

const MobilePill: React.FC<{ width: number }> = ({ width }) => (
	<span className="skeleton-shimmer home-skeleton__pill" style={{ width }} aria-hidden />
);

const DesktopFilterRow: React.FC<{ labelWidth: number }> = ({ labelWidth }) => (
	<div className="home-skeleton__filter-row" aria-hidden>
		<span className="skeleton-shimmer home-skeleton__filter-logo" />
		<span className="skeleton-shimmer home-skeleton__filter-label" style={{ width: `${labelWidth}%` }} />
		<span className="skeleton-shimmer home-skeleton__filter-count" />
	</div>
);

/**
 * One market card skeleton. Reuses the REAL card containers
 * (`prediction-card`, `prediction-card-outcome-row`, `prediction-card-outcome-logo`,
 * …) so it inherits the exact insets, 40px team logos, hairline separators and
 * price-button geometry — the shimmer blocks just sit where content lands.
 */
const SkeletonCard: React.FC<{ rows?: number }> = ({ rows = 2 }) => (
	<div className="prediction-card prediction-card--compact home-skeleton__card" aria-hidden>
		<div className="prediction-card__top prediction-card__top--split">
			<div className="prediction-card__top-status">
				<span className="skeleton-shimmer home-skeleton__starts" />
			</div>
			<div className="prediction-card__top-headline">
				<span className="skeleton-shimmer home-skeleton__game" />
			</div>
		</div>
		<div className="prediction-actions">
			<div className="single-market-actions single-market-actions--compact">
				<div className="prediction-card-outcome-rows">
					{Array.from({ length: rows }).map((_, i) => (
						<div className="prediction-card-outcome-row" key={i}>
							<div className="prediction-card-outcome-logo">
								<span className="skeleton-shimmer home-skeleton__logo" />
							</div>
							<div className="prediction-card-outcome-middle">
								<span
									className="skeleton-shimmer home-skeleton__team"
									style={{ width: i % 2 === 0 ? "56%" : "42%" }}
								/>
								<div className="home-skeleton__bar" aria-hidden>
									<span
										className="skeleton-shimmer home-skeleton__bar-fill"
										style={{ width: i % 2 === 0 ? "64%" : "38%" }}
									/>
								</div>
							</div>
							<span className="skeleton-shimmer home-skeleton__price" />
						</div>
					))}
				</div>
			</div>
		</div>
		<div className="prediction-card__meta prediction-card__top--split">
			<div className="prediction-card__top-status">
				<span className="skeleton-shimmer home-skeleton__vol" />
			</div>
			<div className="prediction-card__top-headline" aria-hidden="true" />
		</div>
	</div>
);

const SkeletonSection: React.FC<{
	primaryWidth: number;
	secondaryWidth: number;
	rowCounts: number[];
	withOddsPicker?: boolean;
}> = ({ primaryWidth, secondaryWidth, rowCounts, withOddsPicker }) => (
	<section className="prediction-calendar-day home-skeleton__section">
		<header className="prediction-calendar-header">
			<div className="prediction-calendar-title">
				<span className="skeleton-shimmer home-skeleton__day" style={{ width: primaryWidth }} />
				<span
					className="skeleton-shimmer home-skeleton__day-sub"
					style={{ width: secondaryWidth }}
				/>
			</div>
			{withOddsPicker ? <span className="skeleton-shimmer home-skeleton__odds-picker" /> : null}
		</header>
		<div className="predictions-grid prediction-calendar-grid">
			{rowCounts.map((r, i) => (
				<SkeletonCard key={i} rows={r} />
			))}
		</div>
	</section>
);

export const HomeSkeleton: React.FC<HomeSkeletonProps> = ({ filterType }) => {
	const showTradeDock = filterType === "all";
	const isDesktop = useMedia("(min-width: 1101px)");

	return (
		<div
			className="predictions-page predictions-page--market-bg page-layout home-skeleton"
			aria-busy="true"
			aria-label="Loading markets"
		>
			<div className="predictions-page__body predictions-markets-body">
				<aside className="game-links-wrapper home-skeleton__sidebar">
					<div className="game-links-underlay" aria-hidden />
					<div className="game-links-sticky">
						<nav className="game-links-bar game-links-scroll" aria-hidden>
							{isDesktop
								? DESKTOP_ROW_WIDTHS.map((w, i) => <DesktopFilterRow key={i} labelWidth={w} />)
								: MOBILE_PILL_WIDTHS.map((w, i) => <MobilePill key={i} width={w} />)}
						</nav>
					</div>
				</aside>
				<div
					className={
						showTradeDock
							? "predictions-page__home-trade-grid home-skeleton__grid"
							: "predictions-page__home-trade-grid home-skeleton__grid home-skeleton__grid--no-dock"
					}
				>
					<div className="predictions-page__home-trade-main">
						<div className="predictions-page__main">
							<div className="prediction-calendar">
								<header className="prediction-calendar-page-heading">
									<div className="prediction-calendar-page-heading__title-row">
										<span className="skeleton-shimmer home-skeleton__page-title" />
									</div>
								</header>
								<SkeletonSection
									primaryWidth={62}
									secondaryWidth={92}
									rowCounts={[2, 2, 3]}
									withOddsPicker
								/>
								<SkeletonSection primaryWidth={96} secondaryWidth={110} rowCounts={[2, 2]} />
							</div>
						</div>
					</div>
					{showTradeDock && isDesktop ? (
						<div className="right-panel predictions-page__home-trade-panel home-skeleton__trade-panel">
							<TradeBoxSkeleton />
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
};
