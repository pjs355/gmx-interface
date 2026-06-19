import { useEffect, useState } from "react";
import { AllOddsMatrixTable } from "@/features/all-odds/AllOddsMatrixTable";
import { AllOddsSkeleton } from "@/features/all-odds/AllOddsSkeleton";
import { useAllOddsFeed } from "@/features/all-odds/useAllOddsFeed";
import type { AllOddsSportFilter } from "@/features/markets/queries/matchedMarketsQuery";
import "./AllOdds.scss";

export default function AllOddsPage() {
	const [page, setPage] = useState(0);
	const [sport, setSport] = useState<AllOddsSportFilter>("all");
	const [search, setSearch] = useState("");

	useEffect(() => {
		setPage(0);
	}, [search, sport]);

	const { groups, markets, error, loading, isFetching, totalPages } = useAllOddsFeed({
		page,
		sport,
		q: search,
	});

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
				<AllOddsMatrixTable
					groups={groups}
					markets={markets}
					loading={loading || isFetching}
					error={error}
					page={page}
					totalPages={totalPages}
					onPageChange={setPage}
					search={search}
					onSearchChange={setSearch}
					sport={sport}
					onSportChange={setSport}
				/>
			)}
		</div>
	);
}
