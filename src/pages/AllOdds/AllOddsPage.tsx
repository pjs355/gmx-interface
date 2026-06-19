import { AllOddsMatrixTable } from "@/features/all-odds/AllOddsMatrixTable";
import { AllOddsSkeleton } from "@/features/all-odds/AllOddsSkeleton";
import { useAllOddsFeed } from "@/features/all-odds/useAllOddsFeed";
import "./AllOdds.scss";

export default function AllOddsPage() {
	const { markets, error, loading } = useAllOddsFeed();

	return (
		<div className="all-odds-page">
			<header className="all-odds-page-header">
				<h1>All Odds</h1>
				<p>
					Cross-venue line shopping across ClutchComet for display purposes only. Tradable
					markets on ClutchComet are found on the markets page.
				</p>
			</header>

			{loading && markets.length === 0 ? (
				<AllOddsSkeleton />
			) : (
				<AllOddsMatrixTable markets={markets} loading={loading} error={error} />
			)}
		</div>
	);
}
