import "./PageSkeleton.scss";

/**
 * Suspense fallback for lazy routes: keeps the main column from collapsing to zero
 * height while showing a subtle loading pulse.
 */
export function PageSkeleton() {
	return (
		<div className="page-skeleton" aria-busy aria-label="Loading page">
			<div className="page-skeleton__pulse" />
		</div>
	);
}
