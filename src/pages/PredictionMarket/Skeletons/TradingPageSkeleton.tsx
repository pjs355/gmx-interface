import React from "react";
import { GameLinksSkeleton } from "@/pages/Predictions/components/GameLinksSkeleton";
import { PredictionTradeColumnShell } from "./PredictionTradeColumnShell";
import { VenueBooksChartSkeleton } from "./VenueBooksChartSkeleton";
import { TradeBoxSkeleton } from "./TradeBoxSkeleton";
import { OrderbookSkeleton } from "./OrderbookSkeleton";
import "./Skeletons.scss";

function MarketHeaderSkeleton() {
	return (
		<div className="market-header" aria-hidden>
			<div className="market-title-container">
				<span
					className="skeleton-shimmer"
					style={{
						display: "inline-block",
						width: 48,
						height: 48,
						borderRadius: 8,
						flexShrink: 0,
					}}
				/>
				<span
					className="skeleton-shimmer"
					style={{
						display: "block",
						width: "72%",
						maxWidth: 420,
						height: 28,
						marginTop: 8,
						borderRadius: 4,
					}}
				/>
			</div>
		</div>
	);
}

type TradingPageSkeletonProps = {
	isMobile: boolean;
};

export function TradingPageSkeleton({ isMobile }: TradingPageSkeletonProps) {
	if (isMobile) {
		return (
			<div
				className="prediction-market-page mobile"
				aria-busy="true"
				aria-label="Loading market"
			>
				<div className="prediction-market-content">
					<div className="mobile-layout">
						<MarketHeaderSkeleton />
						<div className="venue-books-container">
							<VenueBooksChartSkeleton />
							<OrderbookSkeleton />
							<OrderbookSkeleton />
						</div>
						<div className="mobile-trading-container">
							<TradeBoxSkeleton />
						</div>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div
			className="prediction-market-page desktop"
			aria-busy="true"
			aria-label="Loading market"
		>
			<div className="predictions-markets-body">
				<GameLinksSkeleton />
				<div className="prediction-market-content">
					<div className="desktop-layout">
						<div className="left-panel">
							<MarketHeaderSkeleton />
							<div className="venue-books-container">
								<VenueBooksChartSkeleton />
								<OrderbookSkeleton />
								<OrderbookSkeleton />
							</div>
						</div>
						<div className="right-panel">
							<PredictionTradeColumnShell>
								<TradeBoxSkeleton />
							</PredictionTradeColumnShell>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
