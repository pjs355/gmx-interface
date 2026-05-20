import { ChartSkeleton } from "./ChartSkeleton";

export function VenueBooksChartSkeleton() {
	return (
		<div
			className="ExchangeChart venue-books-chart venue-books-chart-skeleton"
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: 300,
			}}
		>
			<div
				className="prediction-market-chart-shell flex grow flex-col overflow-visible rounded-4 bg-black"
				style={{ minHeight: 300 }}
			>
				<ChartSkeleton />
			</div>
		</div>
	);
}
