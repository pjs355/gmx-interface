import React from "react";
import "@/pages/PredictionMarket/Skeletons/Skeletons.scss";
import "./GameLinksSkeleton.scss";

const SIDEBAR_PILLS = 8;

const SkeletonPill: React.FC<{
	withDot?: boolean;
	withLogo?: boolean;
	labelWidth?: number;
}> = ({ withDot, withLogo, labelWidth = 90 }) => (
	<div className="game-link game-links-skeleton__pill" aria-hidden>
		<span className="game-link__inner">
			<span className="game-link__leading">
				{withDot ? (
					<span className="game-links-skeleton__pill-dot skeleton-shimmer" />
				) : null}
				{withLogo ? (
					<span className="game-links-skeleton__pill-logo skeleton-shimmer" />
				) : null}
				<span
					className="game-links-skeleton__pill-label skeleton-shimmer"
					style={{ width: `${labelWidth}px` }}
				/>
			</span>
			<span className="game-links-skeleton__pill-count skeleton-shimmer" />
		</span>
	</div>
);

export function GameLinksSkeleton() {
	return (
		<div className="game-links-wrapper game-links-skeleton" aria-hidden>
			<div className="game-links-underlay" aria-hidden />
			<div className="game-links-sticky">
				<nav className="game-links-bar game-links-scroll" aria-hidden>
					<SkeletonPill withDot labelWidth={42} />
					<SkeletonPill labelWidth={120} />
					{Array.from({ length: SIDEBAR_PILLS - 2 }).map((_, i) => (
						<SkeletonPill
							key={i}
							withLogo
							labelWidth={70 + ((i * 17) % 60)}
						/>
					))}
				</nav>
			</div>
		</div>
	);
}
