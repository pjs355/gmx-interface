import "./PageSkeleton.scss";

export function PageSkeleton() {
	return (
		<div className="page-skeleton">
			<div className="page-skeleton__bar page-skeleton__bar--wide" />
			<div className="page-skeleton__row">
				<div className="page-skeleton__card" />
				<div className="page-skeleton__card" />
				<div className="page-skeleton__card" />
			</div>
		</div>
	);
}
