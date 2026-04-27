import "./PageSkeleton.scss";

/**
 * Suspense fallback for lazy routes: keeps the main column from collapsing to zero
 * height (which pulled the footer up). No visible bars/cards — avoids the old
 * low-contrast white placeholders that read as a random oval flash.
 */
export function PageSkeleton() {
	return <div className="page-skeleton" aria-hidden />;
}
