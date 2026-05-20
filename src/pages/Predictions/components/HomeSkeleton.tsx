import React from "react";
import { useMedia } from "react-use";
import { PREDICTIONS_TRADE_PANEL_DESKTOP_MEDIA } from "@/pages/Predictions/utils/gameLinkFilters";
import {
	PredictionTradeColumnShell,
	TradeBoxSkeleton,
} from "@/pages/PredictionMarket/Skeletons";
import { GameLinksSkeleton } from "./GameLinksSkeleton";
import "@/pages/PredictionMarket/Skeletons/Skeletons.scss";
import "./HomeSkeleton.scss";

interface HomeSkeletonProps {
	filterType: "all" | "esports" | "games";
}

const SkeletonCard: React.FC<{ rows?: number }> = ({ rows = 2 }) => (
	<div
		className="prediction-card prediction-card--compact home-skeleton__card"
		aria-hidden
	>
		<div className="prediction-card__top prediction-card__top--split">
			<div className="prediction-card__top-status">
				<span className="home-skeleton__chip skeleton-shimmer" />
			</div>
			<div className="prediction-card__top-headline">
				<span className="home-skeleton__headline skeleton-shimmer" />
			</div>
		</div>
		<div className="prediction-actions">
			<div className="home-skeleton__rows">
				{Array.from({ length: rows }).map((_, i) => (
					<div className="home-skeleton__row" key={i}>
						<span className="home-skeleton__row-logo skeleton-shimmer" />
						<span className="home-skeleton__row-middle">
							<span
								className="home-skeleton__row-label skeleton-shimmer"
								style={{ width: i % 2 === 0 ? "62%" : "48%" }}
							/>
							<span className="home-skeleton__row-bar skeleton-shimmer" />
						</span>
						<span className="home-skeleton__row-button skeleton-shimmer" />
					</div>
				))}
			</div>
		</div>
		<div className="prediction-card__meta prediction-card__top--split">
			<div className="prediction-card__top-status">
				<span className="home-skeleton__chip skeleton-shimmer" />
			</div>
			<div className="prediction-card__top-headline" aria-hidden="true" />
		</div>
	</div>
);

const SkeletonCalendarSection: React.FC<{
	primaryWidth: number;
	secondaryWidth: number;
	rowCounts: number[];
}> = ({ primaryWidth, secondaryWidth, rowCounts }) => (
	<section className="prediction-calendar-day home-skeleton__section">
		<header className="prediction-calendar-header">
			<div className="prediction-calendar-title">
				<span
					className="home-skeleton__heading skeleton-shimmer"
					style={{ width: `${primaryWidth}px` }}
				/>
				<span
					className="home-skeleton__heading-sub skeleton-shimmer"
					style={{ width: `${secondaryWidth}px` }}
				/>
			</div>
		</header>
		<div className="predictions-grid prediction-calendar-grid">
			{rowCounts.map((rows, i) => (
				<SkeletonCard key={i} rows={rows} />
			))}
		</div>
	</section>
);

export const HomeSkeleton: React.FC<HomeSkeletonProps> = ({ filterType }) => {
	const useCalendar = filterType !== "games";
	const showTradeDock = filterType === "all";
	const isDesktop = useMedia(PREDICTIONS_TRADE_PANEL_DESKTOP_MEDIA);

	let middle: React.ReactNode;
	if (useCalendar) {
		middle = (
			<div className="prediction-calendar">
				<SkeletonCalendarSection
					primaryWidth={70}
					secondaryWidth={120}
					rowCounts={[2, 3, 2]}
				/>
				<SkeletonCalendarSection
					primaryWidth={110}
					secondaryWidth={130}
					rowCounts={[2, 2]}
				/>
			</div>
		);
	} else {
		middle = (
			<div className="predictions-grid">
				{[2, 3, 2, 2, 3, 2].map((rows, i) => (
					<SkeletonCard key={i} rows={rows} />
				))}
			</div>
		);
	}

	return (
		<div
			className="predictions-page predictions-page--market-bg page-layout home-skeleton"
			aria-busy="true"
			aria-label="Loading markets"
		>
			<div className="predictions-page__market-background" aria-hidden />
			<div className="predictions-page__body predictions-markets-body">
				<GameLinksSkeleton />
				<div
					className={
						showTradeDock
							? "predictions-page__home-trade-grid home-skeleton__grid"
							: "predictions-page__home-trade-grid home-skeleton__grid home-skeleton__grid--no-dock"
					}
				>
					<div className="predictions-page__home-trade-main">
						<div className="predictions-page__main">{middle}</div>
					</div>
					{showTradeDock && isDesktop ? (
						<div className="right-panel predictions-page__home-trade-panel">
							<PredictionTradeColumnShell>
								<TradeBoxSkeleton />
							</PredictionTradeColumnShell>
						</div>
					) : null}
				</div>
			</div>
		</div>
	);
};
