import "./PageSkeleton.scss";

/**
 * Suspense fallback for lazy routes + generic page loading state.
 *
 * Fills the whole page with a tasteful, layout-neutral skeleton (title, hero
 * panel, a few list rows) instead of a lone shimmer bar — so any content page
 * (Profile, Transfers, About, Blog, Copy, …) reads as "loading" rather than
 * "broken/empty" on both mobile and desktop.
 */
export function PageSkeleton() {
	return (
		<div className="page-skeleton" aria-busy aria-label="Loading page">
			<div className="page-skeleton__head">
				<div className="page-skeleton__title page-skeleton__shimmer" />
				<div className="page-skeleton__subtitle page-skeleton__shimmer" />
			</div>

			<div className="page-skeleton__hero page-skeleton__shimmer" />

			<div className="page-skeleton__rows">
				{Array.from({ length: 4 }).map((_, i) => (
					<div className="page-skeleton__row" key={i}>
						<div className="page-skeleton__row-media page-skeleton__shimmer" />
						<div className="page-skeleton__row-body">
							<div
								className="page-skeleton__row-line page-skeleton__shimmer"
								style={{ width: i % 2 === 0 ? "72%" : "58%" }}
							/>
							<div className="page-skeleton__row-line page-skeleton__row-line--short page-skeleton__shimmer" />
						</div>
						<div className="page-skeleton__row-trailing page-skeleton__shimmer" />
					</div>
				))}
			</div>
		</div>
	);
}
